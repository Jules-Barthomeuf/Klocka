// Les informations du bien, obligatoires pour passer aux étapes suivantes (30 oct. 2026, Jules) : l'adresse, la surface,
// le loyer et le prix. Elles viennent de la fiche du bien déposée dans la Data Room ; ce qu'elle ne dit pas se remplit dans
// la boîte « Fiche du bien » (seulement les champs manquants si une fiche est là, tous les champs sinon).

import path from 'path';
import fs from 'fs';
import { Records } from '../db.js';
import { lotVide, extraire, CHAMPS } from './extract.js';

export const OBLIGATOIRES = [
  { id: 'adresse', libelle: 'Adresse', type: 'adresse', exemple: '14 rue du Marché, 74000 Annecy' },
  { id: 'surface_m2', libelle: 'Surface (m²)', type: 'nombre', exemple: '85' },
  { id: 'loyer_annuel_ht_hc', libelle: 'Loyer annuel HT HC (€)', type: 'nombre', exemple: '24000' },
  { id: 'prix_fai', libelle: 'Prix affiché (€)', type: 'nombre', exemple: '400000' },
];

const ligne = (a) => (a && typeof a === 'object' ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : String(a || '').trim());

/** Pure : la valeur lisible d'un champ du lot, ou null s'il manque. */
export function valeurDuChamp(lot, id) {
  const c = lot?.[id];
  if (!c || c.absent) return null;
  if (id === 'adresse') return ligne(c.valeur) || null;
  const n = Number(c.valeur);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Pure : ce que la fiche du bien dit déjà de l'adresse (autres lots, aperçu entendu à l'appel, dossier du mandataire). */
export function adresseConnue(deal, dossiersMandataire = []) {
  for (const l of deal?.lots || []) {
    const t = valeurDuChamp(l?.lot, 'adresse');
    if (t) return { texte: t, origine: 'la fiche du bien' };
  }
  const ap = deal?.apercu;
  if (ap?.rue || ap?.ville) return { texte: [ap.rue, ap.ville].filter(Boolean).join(', '), origine: 'ce qui a été entendu à l’appel' };
  const d = dossiersMandataire.find((x) => x.deal_id === deal?.deal_id && x.adresse);
  if (d) return { texte: String(d.adresse).trim(), origine: 'le dossier du mandataire' };
  return null;
}

const fichesDe = (deal) => (deal?.documents_espace || []).filter((d) => /fiche/i.test(d.categorie || '') || deal?.analyse_pieces?.docs?.[d.id]?.type === 'fiche');

/** L'état des informations : chaque champ (valeur ou manque), la présence d'une fiche, et si tout est là. */
export function infosDuBien(dealId) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return null;
  const lot = deal.lots?.[0]?.lot;
  const champs = OBLIGATOIRES.map((c) => { const v = valeurDuChamp(lot, c.id); return { ...c, valeur: v, manque: v == null }; });
  return { fiche: fichesDe(deal).length, champs, complet: champs.every((c) => !c.manque), manquants: champs.filter((c) => c.manque).map((c) => c.libelle) };
}

const champSaisi = (valeur) => ({ valeur, absent: false, confiance: 1, citation: 'Saisi à la main.', saisi_a_la_main: true });

function ecrireLot(deal, fabrique) {
  const lots = [...(deal.lots || [])];
  const entree = lots[0] || { lot: lotVide() };
  lots[0] = { ...entree, lot: fabrique({ ...lotVide(), ...(entree.lot || {}) }) };
  Records.update('Deal', deal.id, { lots });
}

/** Pose les champs écrits à la main (adresse, surface, loyer, prix). Le lot est créé au besoin, sans lecture ni évaluation. */
export function poserInfos(dealId, champs = {}, lireAdresse) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { error: 'Dossier introuvable' };
  const pose = {};
  for (const c of OBLIGATOIRES) {
    const brut = champs[c.id];
    if (brut == null || String(brut).trim() === '') continue;
    if (c.id === 'adresse') { pose.adresse = champSaisi(lireAdresse(String(brut).trim())); continue; }
    const n = Number(String(brut).replace(/[^\d.,]/g, '').replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return { error: `${c.libelle} : un nombre est attendu.` };
    pose[c.id] = champSaisi(Math.round(n * 100) / 100);
  }
  if (!Object.keys(pose).length) return { error: 'Rien à enregistrer.' };
  ecrireLot(deal, (lot) => ({ ...lot, ...pose }));
  return { ok: true, ...infosDuBien(dealId) };
}

/**
 * Cherche ce qui manque sans rien demander : l'adresse connue du dossier, puis la fiche du bien de la Data Room (lue une
 * fois, un modèle). Ce que la fiche ne dit pas reste à remplir à la main.
 */
export async function chercherInfos(dealId, { uploadDir, lireAdresse }) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) return { error: 'Dossier introuvable' };
  let etat = infosDuBien(dealId);
  if (etat.complet) return { ok: true, ...etat };

  // 1. Une fiche déposée dans la Data Room et pas encore lue.
  const deja = new Set(deal.fiche_lue || []);
  const aLire = fichesDe(deal).filter((d) => !deja.has(d.id) && d.url?.startsWith('/uploads/'));
  if (aLire.length) {
    const { ingerer } = await import('./ingest.js');
    const lus = [];
    for (const d of aLire) {
      try {
        const chemin = path.join(uploadDir, d.url.replace('/uploads/', ''));
        if (!chemin.startsWith(uploadDir) || !fs.existsSync(chemin)) continue;
        const { texte } = await ingerer({ buffer: fs.readFileSync(chemin), filename: d.nom, mimetype: d.mime });
        if (!texte) continue;
        const { lots } = await extraire(texte);
        const lu = lots?.[0]?.lot;
        if (lu) {
          const frais = Records.findBy('Deal', 'deal_id', dealId);
          ecrireLot(frais, (lot) => { const sortie = { ...lot }; for (const c of CHAMPS) if (lot[c]?.absent !== false && lu[c] && lu[c].absent === false) sortie[c] = lu[c]; return sortie; });
        }
        lus.push(d.id);
      } catch (e) { console.warn(`[infos-du-bien] fiche illisible : ${e?.message || e}`); }
    }
    Records.update('Deal', Records.findBy('Deal', 'deal_id', dealId).id, { fiche_lue: [...deja, ...lus] });
    etat = infosDuBien(dealId);
  }
  // 2. L'adresse connue ailleurs dans le dossier.
  if (etat.champs.find((c) => c.id === 'adresse')?.manque) {
    const trouvee = adresseConnue(Records.findBy('Deal', 'deal_id', dealId), Records.list('DossierMandataire'));
    if (trouvee) poserInfos(dealId, { adresse: trouvee.texte }, lireAdresse);
  }
  return { ok: true, ...infosDuBien(dealId) };
}
