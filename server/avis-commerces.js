// Le pouce sur un commerce de la Prospection (6 nov. 2026, Jules : « une résidence étudiante dans les commerces, on
// clique sur un pouce et ça enregistre que ce n'est pas bien ; le système va apprendre quoi faire »).
//  - Pouce en bas : le commerce sort tout de suite de la prospection de celui qui l'a jugé.
//  - Ce qu'on apprend : une activité écartée assez souvent (SEUIL_ACTIVITE pouces en bas, et plus de deux pour un pouce
//    en haut) sort de la prospection de tous les mandataires.
//  - Pouce en haut : « bonne cible », il retient une activité qui serait écartée à tort.
// Un avis par personne et par commerce ; le reprendre l'efface.

import { Records } from './db.js';
import { activiteVue } from './off-market/simple.js';

export const AVIS_COMMERCE = 'AvisCommerce';
export const SEUIL_ACTIVITE = 3;

const emailDe = (user) => String(user?.email || '').toLowerCase();
const cleActivite = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** L'avis de la personne sur un commerce : « oui », « non » ou null. */
export function monAvis(commerceId, user) {
  const moi = emailDe(user);
  return Records.list(AVIS_COMMERCE).find((a) => a.commerce_id === commerceId && a.mandataire_email === moi)?.avis || null;
}

/** Pure : les activités que les pouces écartent pour tous (clés sans accents, en minuscules). */
export function activitesEcarteesDe(avis = [], { seuil = SEUIL_ACTIVITE } = {}) {
  const compte = new Map();
  for (const a of avis) {
    const k = cleActivite(a.activite);
    if (!k) continue;
    const n = compte.get(k) || { oui: 0, non: 0 };
    n[a.avis === 'oui' ? 'oui' : 'non'] += 1;
    compte.set(k, n);
  }
  return new Set([...compte].filter(([, n]) => n.non >= seuil && n.non > 2 * n.oui).map(([k]) => k));
}

let gardees = { sig: null, valeur: new Set() };
export function activitesEcartees() {
  const sig = Records.signature(AVIS_COMMERCE);
  if (gardees.sig !== sig) gardees = { sig, valeur: activitesEcarteesDe(Records.list(AVIS_COMMERCE)) };
  return gardees.valeur;
}

/**
 * Le filtre de la Prospection d'une personne : garde un commerce qu'elle n'a pas écarté, dont l'activité n'est pas
 * écartée par les pouces de tous. Un commerce qu'elle a jugé bonne cible reste, même si son activité est écartée.
 */
export function filtreDesAvis(user) {
  const moi = emailDe(user);
  const miens = new Map(Records.list(AVIS_COMMERCE).filter((a) => a.mandataire_email === moi).map((a) => [a.commerce_id, a.avis]));
  const ecartees = activitesEcartees();
  return (c) => {
    const a = miens.get(c.id);
    if (a === 'non') return false;
    if (a === 'oui' || !ecartees.size) return true;
    return !ecartees.has(cleActivite(activiteVue(c)));
  };
}

/** Pose, change ou efface (avis null) l'avis de la personne sur un commerce. */
export function noterAvisCommerce(commerceId, avis, user) {
  const moi = emailDe(user);
  if (!moi) return { ok: false, error: 'Connexion requise.' };
  if (![null, 'oui', 'non'].includes(avis)) return { ok: false, error: 'Avis inconnu.' };
  const c = Records.get('CommerceSimple', commerceId);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const deja = Records.list(AVIS_COMMERCE).find((a) => a.commerce_id === commerceId && a.mandataire_email === moi);
  if (avis === null) {
    if (deja) Records.delete(AVIS_COMMERCE, deja.id);
    return { ok: true, avis: null };
  }
  const activite = activiteVue(c) || null;
  const champs = { commerce_id: commerceId, avis, activite, classe: c.classe || 'commerce', ville_id: c.ville_id || null, nom: c.nom || c.exploitant?.nom || null, mandataire_email: moi, le: new Date().toISOString() };
  if (deja) Records.update(AVIS_COMMERCE, deja.id, champs);
  else Records.create(AVIS_COMMERCE, champs);
  return { ok: true, avis, activite, activite_ecartee: !!activite && activitesEcartees().has(cleActivite(activite)) };
}
