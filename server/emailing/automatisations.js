// Les automatisations du module Emailing (8 nov. 2026, Jules) : un ou plusieurs déclencheurs, des étapes en colonne
// avec des branches, des sorties. « diffusion » part seule par Resend une fois l'automatisation activée ; « prospection »
// part de la boîte Gmail de la personne, et chaque mail attend d'être validé (règle du 25 sept. 2026).

import { randomBytes } from 'crypto';
import db, { Records } from '../db.js';
import { maintenant } from './journal.js';

export const AUTO = 'EmailingAutomatisation';
export const FENETRE_DEFAUT = { jours: [1, 2, 3, 4, 5], debut: 9, fin: 18 };
export const SORTIES_PROSPECTION = ['reponse', 'fiche_recue', 'call_pris', 'appel_annule'];

export const DECLENCHEURS = [
  { cle: 'appel_abouti', libelle: 'Un appel a abouti', filtre: 'issue', options: [['pas_de_murs', 'Pas de bien pour l\'instant'], ['a_des_murs', 'A un bien'], ['interesse', 'Intéressé'], ['a_rappeler', 'À rappeler'], ['veut_mail', 'Veut d\'abord un mail']] },
  { cle: 'lead_magnet_pris', libelle: 'Un lead magnet est pris', filtre: 'formulaire' },
  { cle: 'webinaire_inscrit', libelle: 'Inscription à un webinaire', filtre: 'webinaire_id' },
  { cle: 'webinaire_present', libelle: 'Présent au webinaire', filtre: 'webinaire_id' },
  { cle: 'webinaire_absent', libelle: 'Absent au webinaire', filtre: 'webinaire_id' },
  { cle: 'devenu_mql', libelle: 'Le contact devient MQL' },
  { cle: 'devenu_sql', libelle: 'Le contact devient SQL' },
  { cle: 'clic_call', libelle: 'Clic pour un call' },
  { cle: 'simulateur', libelle: 'Le simulateur est utilisé' },
];

export const EVENEMENTS_SORTIE = [
  ['reponse', 'Il répond'], ['fiche_recue', 'La fiche arrive'], ['call_pris', 'Le call est pris'], ['devenu_sql', 'Il devient SQL'], ['appel_annule', 'L\'appel est annulé'],
];

const TYPES = new Set(['attendre', 'avant_date', 'mail', 'condition', 'tache', 'tag', 'sortir']);
const idEtape = () => `n${randomBytes(4).toString('hex')}`;

/** Pure : des étapes propres, chacune avec son identifiant. */
export function normaliser(etapes, profondeur = 0) {
  if (!Array.isArray(etapes) || profondeur > 3) return [];
  return etapes.filter((e) => TYPES.has(e?.type)).map((e) => ({
    ...e, id: e.id || idEtape(),
    ...(e.type === 'condition' ? { oui: normaliser(e.oui, profondeur + 1), non: normaliser(e.non, profondeur + 1) } : {}),
  }));
}

/** Pure : chaque étape, et où l'on va après elle. */
export function aplatir(etapes, suite = null, carte = new Map()) {
  (etapes || []).forEach((e, i) => {
    const apres = etapes[i + 1]?.id ?? suite;
    if (e.type === 'condition') {
      carte.set(e.id, { e, suivant: apres, oui: e.oui?.[0]?.id ?? apres, non: e.non?.[0]?.id ?? apres });
      aplatir(e.oui, apres, carte);
      aplatir(e.non, apres, carte);
    } else carte.set(e.id, { e, suivant: apres });
  });
  return carte;
}

/** Pure : ce qui empêche d'activer. */
export function manques(a) {
  const liste = [];
  if (!a.declencheurs?.length) liste.push('Choisissez au moins un déclencheur, ou inscrivez les contacts à la main.');
  const toutes = [...aplatir(a.etapes).values()].map((x) => x.e);
  const mails = toutes.filter((e) => e.type === 'mail');
  if (!mails.length) liste.push('Ajoutez au moins un mail.');
  for (const m of mails) if (!String(m.objet || '').trim() && !m.meme_fil) liste.push(`Un mail n'a pas d'objet.`);
  for (const m of mails) if (!String(m.texte || '').trim() && !m.template_id && !m.design) liste.push(`« ${m.objet || 'Un mail'} » est vide.`);
  if (a.nature === 'prospection' && !(a.sorties || []).includes('reponse')) liste.push('Une séquence de prospection doit s\'arrêter à la réponse.');
  return liste;
}

const lesActives = () => Records.list(AUTO).filter((a) => a.statut === 'active');
export { lesActives as actives };

export function creer({ nom = '', nature = 'diffusion', declencheurs = [], sorties = null, etapes = [], ...reste } = {}, user = null) {
  const n = nature === 'prospection' ? 'prospection' : 'diffusion';
  return { ok: true, automatisation: Records.create(AUTO, {
    nom: String(nom || '').trim().slice(0, 120) || 'Nouvelle automatisation', nature: n, statut: 'brouillon', declencheurs, etapes: normaliser(etapes),
    sorties: sorties || (n === 'prospection' ? SORTIES_PROSPECTION : ['call_pris']), fenetre: FENETRE_DEFAUT, rejouable: false, cree_par: user?.email || null, cree_le: maintenant(), ...reste,
  }) };
}

export function modifier(id, patch) {
  const a = Records.get(AUTO, id);
  if (!a) return null;
  const champs = {};
  if (patch.nom !== undefined) champs.nom = String(patch.nom || '').trim().slice(0, 120) || a.nom;
  if (Array.isArray(patch.declencheurs)) champs.declencheurs = patch.declencheurs.filter((d) => d?.evenement);
  if (Array.isArray(patch.sorties)) champs.sorties = patch.sorties.filter(Boolean);
  if (Array.isArray(patch.etapes)) champs.etapes = normaliser(patch.etapes);
  if (patch.fenetre) champs.fenetre = { ...FENETRE_DEFAUT, ...patch.fenetre };
  for (const k of ['expediteur', 'expediteur_nom', 'repondre_a']) if (patch[k] !== undefined) champs[k] = String(patch[k] || '').trim() || null;
  if (patch.rejouable !== undefined) champs.rejouable = !!patch.rejouable;
  champs.modifie_le = maintenant();
  return { ok: true, automatisation: Records.update(AUTO, id, champs) };
}

export function changerStatut(id, statut) {
  const a = Records.get(AUTO, id);
  if (!a) return null;
  if (!['active', 'pause', 'brouillon'].includes(statut)) return { ok: false, error: 'Statut inconnu.' };
  if (statut === 'active') {
    const m = manques(a);
    if (m.length) return { ok: false, error: m.join(' ') };
  }
  return { ok: true, automatisation: Records.update(AUTO, id, { statut, statut_le: maintenant() }) };
}

export function dupliquer(id, user) {
  const a = Records.get(AUTO, id);
  if (!a) return null;
  const { id: _i, created_date: _c, updated_date: _u, created_by: _b, statut: _s, repris_de: _r, modele: _m, ...reste } = a;
  return creer({ ...reste, nom: `${a.nom} (copie)` }, user);
}

/** Supprime une automatisation qui n'a fait entrer personne ; sinon elle se met en pause, ses résultats restent. */
export function supprimer(id) {
  const a = Records.get(AUTO, id);
  if (!a) return null;
  if (db.prepare('SELECT 1 FROM mail_parcours WHERE automatisation_id = ? LIMIT 1').get(id)) return { ok: false, error: 'Des contacts sont passés par cette automatisation. Mettez-la en pause : ses résultats restent lisibles.' };
  Records.delete(AUTO, id);
  return { ok: true };
}

const RESULTATS = ['fiche_recue', 'call_pris'];

/** Les chiffres de chaque automatisation, en une lecture par table. */
function chiffres() {
  const c = new Map();
  const de = (id) => { if (!c.has(id)) c.set(id, { en_cours: 0, entres: 0, envoyes: 0, a_valider: 0, reponses: 0, resultats: 0, ouverts: 0, cliques: 0 }); return c.get(id); };
  for (const l of db.prepare('SELECT automatisation_id a, statut, raison, COUNT(*) n FROM mail_parcours GROUP BY 1, 2, 3').all()) {
    const x = de(l.a);
    x.entres += l.n;
    if (l.statut === 'en_cours' || l.statut === 'attente_envoi') x.en_cours += l.n;
    if (RESULTATS.includes(l.raison)) x.resultats += l.n;
  }
  for (const l of db.prepare(`SELECT automatisation_id a, etat, COUNT(*) n, COUNT(repondu_le) r, COUNT(ouvert_le) o, COUNT(clique_le) k FROM mail_file WHERE automatisation_id IS NOT NULL GROUP BY 1, 2`).all()) {
    const x = de(l.a);
    if (['envoye', 'redirige', 'simule'].includes(l.etat)) { x.envoyes += l.n; x.reponses += l.r; x.ouverts += l.o; x.cliques += l.k; }
    if (l.etat === 'a_valider') x.a_valider += l.n;
  }
  return (id) => c.get(id) || de(id);
}

export function liste({ nature = null } = {}) {
  const de = chiffres();
  return Records.list(AUTO).filter((a) => !nature || a.nature === nature)
    .map((a) => ({ ...a, chiffres: de(a.id) }))
    .sort((x, y) => String(y.modifie_le || y.cree_le).localeCompare(String(x.modifie_le || x.cree_le)));
}

export function une(id) {
  const a = Records.get(AUTO, id);
  if (!a) return null;
  // Combien de personnes attendent à chaque étape : la colonne le montre.
  const parEtape = Object.fromEntries(db.prepare(`SELECT noeud_id n, COUNT(*) c FROM mail_parcours WHERE automatisation_id = ? AND statut IN ('en_cours', 'attente_envoi') GROUP BY 1`).all(id).map((l) => [l.n, l.c]));
  return { ...a, chiffres: chiffres()(id), par_etape: parEtape, manques: manques(a) };
}
