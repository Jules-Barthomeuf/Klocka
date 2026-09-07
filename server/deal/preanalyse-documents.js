// La pré-analyse sans teaser : quand le dossier a ses pièces mais que
// personne n'a collé de fiche, la fiche se compose depuis les documents.
//
// La matrice lit les pièces question par question ; ses valeurs retenues
// deviennent une fiche texte, qui passe dans le pipeline habituel
// (extraction, enrichissement, règles). Même verdict, mêmes mots — la source
// est simplement la data room au lieu de l'agent.

import { Records } from '../db.js';
import { lireMatrice, lireFiche, lancerRemplissage, etatRemplissage } from './matrice.js';
import fs from 'node:fs';
import path from 'node:path';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** La fiche texte, composée depuis les valeurs retenues de la matrice. Null si rien d'exploitable. */
export function ficheDepuisDocuments(dealId) {
  const f = lireFiche(dealId);
  if (!f || !f.nb_documents) return null;
  const champs = new Map(f.blocs.flatMap((b) => b.champs).map((c) => [c.id, c]));
  const v = (id) => champs.get(id)?.valeur || null;
  const brut = Records.filter('Deal', { deal_id: dealId })[0];
  const lignes = [
    `Fiche établie à partir des ${f.nb_documents} pièces de la data room du dossier « ${brut?.nom || dealId} ».`,
    '',
    v('adresse') && `Adresse du bien : ${v('adresse')}`,
    "Type d'actif : local commercial (murs de commerce)",
    v('surface') && `Surface : ${v('surface')}`,
    v('destination') && `Activité du locataire (destination du bail) : ${v('destination')}`,
    v('parties') && `Parties au bail : ${v('parties')}`,
    v('dates_bail') && `Dates du bail : ${v('dates_bail')}`,
    v('duree') && `Durée du bail : ${v('duree')}`,
    'Type de bail : bail commercial',
    v('loyer') && `Loyer annuel HT hors charges : ${v('loyer')}`,
    v('charges') && `Charges : ${v('charges')}`,
    v('depot') && `Dépôt de garantie : ${v('depot')}`,
    v('indexation') && `Indexation : ${v('indexation')}`,
    v('taxe_fonciere') && `Taxe foncière : ${v('taxe_fonciere')}`,
    v('charges_non_recup') && `Charges non récupérables : ${v('charges_non_recup')}`,
    'Occupation : bien loué, bail en cours.',
    v('prix') ? `Prix de vente : ${v('prix')}` : 'Prix de vente : non communiqué dans les pièces.',
    v('rendement_affiche') ? `Rendement annoncé : ${v('rendement_affiche')}` : 'Rendement annoncé : non communiqué.',
  ].filter(Boolean);
  // Sans loyer ni surface ni adresse, la fiche ne dit rien : on ne la fabrique pas.
  if (!v('loyer') && !v('surface') && !v('adresse')) return null;
  return lignes.join('\n');
}

const travaux = new Map();
export const etatPreanalyseDocuments = (dealId) => travaux.get(dealId) || null;

/** Lance la pré-analyse depuis les documents, en tâche de fond ; renvoie l'état. */
export function lancerPreanalyseDocuments(dealId, { user, uploadDir } = {}) {
  const enCours = travaux.get(dealId);
  if (enCours?.etat === 'en_cours') return enCours;
  const travail = { etat: 'en_cours', phase: 'lecture', erreur: null, demarre_le: new Date().toISOString() };
  travaux.set(dealId, travail);
  (async () => {
    const brut = Records.filter('Deal', { deal_id: dealId })[0];
    if (!brut) throw new Error('Dossier introuvable');
    if (brut.lots?.length) { travail.etat = 'pret'; travail.phase = 'deja'; return; }
    if (!(brut.documents_espace || []).length) throw new Error('Aucun document dans le dossier.');

    // 1. Les pièces sont lues si ce n'est pas déjà fait.
    const m = lireMatrice(dealId);
    if (!m.lignes.length) {
      lancerRemplissage(dealId, { uploadDir, user });
      const debut = Date.now();
      while (etatRemplissage(dealId)?.etat === 'en_cours' && Date.now() - debut < 30 * 60000) {
        const e = etatRemplissage(dealId);
        travail.fait = e.fait; travail.total = e.total; travail.document = e.document;
        await attendre(2000);
      }
      if (etatRemplissage(dealId)?.etat === 'erreur') throw new Error(etatRemplissage(dealId).erreur || 'Lecture impossible');
    }

    // 2. La fiche se compose, puis passe dans le pipeline de pré-analyse.
    travail.phase = 'analyse';
    const texte = ficheDepuisDocuments(dealId);
    if (!texte) throw new Error("Les pièces ne donnent ni adresse, ni surface, ni loyer : impossible de composer la fiche.");
    const { analyserFiche } = await import('./index.js');
    const r = await analyserFiche({ texte, filename: 'fiche-depuis-data-room.txt' }, { user, dealId, uploadDir });
    Records.update('Deal', brut.id, { preanalyse_depuis_documents: { le: new Date().toISOString(), par: user?.email || null, pieces: (brut.documents_espace || []).length } });
    travail.etat = 'pret'; travail.phase = 'fait'; travail.deal_id = r.deal_id;
  })().catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || 'Pré-analyse impossible'; });
  return travail;
}

/**
 * Relance la pré-analyse depuis sa source (le teaser gardé sur le dossier, le
 * fichier d'origine, ou les pièces), puis relit la data room pour les étapes
 * déjà atteintes. Tâche de fond ; l'état se suit avec etatPreanalyseDocuments.
 */
export function relancerPreanalyse(dealId, { user, uploadDir } = {}) {
  const enCours = travaux.get(dealId);
  if (enCours?.etat === 'en_cours') return enCours;
  const travail = { etat: 'en_cours', phase: 'preanalyse', erreur: null, demarre_le: new Date().toISOString(), relance: true };
  travaux.set(dealId, travail);
  (async () => {
    const brut = Records.filter('Deal', { deal_id: dealId })[0];
    if (!brut) throw new Error('Dossier introuvable');
    const { analyserFiche } = await import('./index.js');
    const { lancerEtape, ETAPES } = await import('./etapes-analyse.js');

    // 1. La source de la pré-analyse.
    let entree = null;
    if (brut.source?.texte) entree = { texte: brut.source.texte, filename: brut.source.nom_fichier || 'teaser.txt' };
    else if (brut.source?.url && uploadDir && brut.source.url.startsWith('/uploads/')) {
      const chemin = path.join(uploadDir, brut.source.url.replace('/uploads/', ''));
      if (chemin.startsWith(uploadDir) && fs.existsSync(chemin)) entree = { buffer: fs.readFileSync(chemin), filename: brut.source.nom_fichier || path.basename(chemin), sourceUrl: brut.source.url };
    }
    if (!entree) {
      const texte = ficheDepuisDocuments(dealId);
      if (!texte) throw new Error('Ni teaser conservé, ni pièces exploitables : rien pour relancer la pré-analyse.');
      entree = { texte, filename: 'fiche-depuis-data-room.txt' };
    }
    await analyserFiche(entree, { user, dealId, uploadDir });

    // 2. L'analyse repart, étape par étape, jusqu'à celle qui était atteinte.
    const max = Math.max(Number(brut.analyse_etape_max) || 1, Number(brut.analyse_etape) || 1);
    for (const e of ETAPES.filter((x) => x.n <= Math.min(max, 2))) {
      travail.phase = `etape${e.n}`;
      const r = lancerEtape(dealId, e.n, { user, uploadDir, relire: true });
      if (r.rien_a_lire) continue;
      const debut = Date.now();
      while (etatRemplissage(dealId)?.etat === 'en_cours' && Date.now() - debut < 40 * 60000) {
        const et = etatRemplissage(dealId);
        travail.fait = et.fait; travail.total = et.total; travail.document = et.document;
        await attendre(2000);
      }
    }
    // L'étape affichée revient à celle qui était atteinte.
    const apres = Records.filter('Deal', { deal_id: dealId })[0];
    Records.update('Deal', apres.id, { analyse_etape: max });
    travail.etat = 'pret'; travail.phase = 'fait';
  })().catch((e) => { travail.etat = 'erreur'; travail.erreur = e?.message || 'Relance impossible'; });
  return travail;
}
