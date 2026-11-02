// Aucun avis, aucun mandat sans fiche (2 nov. 2026, Jules : « un avis ne doit jamais exister sans fiche ; toute
// création d'avis, de bien ou de mandat commence par trouver ou créer sa fiche »). La fiche (ProprietaireMandataire)
// est celle d'un local : le commerce et ses murs, le propriétaire relié dessus ; un propriétaire de deux murs a deux
// fiches. C'est elle qui relie l'avis, le mandat, la conversation avec l'équipe, le Suivi, la Bibliothèque.
//
// Un avis ou un mandat né d'une adresse tapée dans le chat retrouve la fiche du mandataire au même local (même rue et
// même numéro, même ville quand on la connaît), sinon en crée une, sans rien demander. Ni exemple ni bien d'essai.

import { Records } from './db.js';

const sansAccents = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Pure : la rue d'une adresse, numéro compris, sans ponctuation (« 64 rue Waldeck-Rousseau, Lyon » → « 64 rue waldeck rousseau »). */
export const rueDe = (adresse) => sansAccents(String(adresse || '').split(',')[0]).replace(/\b\d{5}\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
/** Pure : la ville d'une adresse (« …, 69006 Lyon » → « lyon »), ou null. */
export const villeDe = (adresse) => {
  const reste = String(adresse || '').split(',').slice(1).join(' ');
  const v = sansAccents(reste).replace(/\b\d{5}\b/g, ' ').replace(/[^a-z\- ]+/g, ' ').trim();
  return v || null;
};

/** Pure : la fiche du même local parmi celles du mandataire, ou null. */
export function memeLocal(fiches, { adresse = null, ville = null } = {}) {
  const rue = rueDe(adresse);
  if (!rue || !/\d/.test(rue)) return null;
  const v = sansAccents(ville || villeDe(adresse) || '').trim() || null;
  return fiches.find((p) => {
    if (rueDe(p.adresse) !== rue) return false;
    const pv = sansAccents(p.ville || villeDe(p.adresse) || '').trim() || null;
    return !v || !pv || pv === v || pv.includes(v) || v.includes(pv);
  }) || null;
}

/**
 * La fiche d'un avis ou d'un mandat qui n'en a pas : celle du même local, sinon une nouvelle. Rend son id, ou null
 * (sans adresse ni nom, rien à quoi la rattacher).
 */
export async function trouverOuCreerFiche({ adresse = null, titre = null, nom = null, ville = null }, user) {
  const moi = String(user?.email || '').toLowerCase();
  if (!moi) return null;
  const miennes = Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === moi && !p.exemple && !p.essai_bien);
  const deja = memeLocal(miennes, { adresse, ville });
  // Une fiche qui reçoit un avis ou un mandat entre dans Biens (2 nov. 2026, bien-etapes.js, entrerDansBiens).
  const { entrerDansBiens } = await import('./bien-etapes.js');
  if (deja) { entrerDansBiens(deja, user, 'Avis de valeur ou mandat rattaché à la fiche'); return deja.id; }
  const commerce = String(titre || '').split('·')[0].trim() || (adresse ? String(adresse).split(',')[0].trim() : null);
  if (!commerce && !nom) return null;
  const { creerProprietaire } = await import('./mandataire-espace.js');
  const r = creerProprietaire({
    nom: nom || null, commerce: commerce || null, adresse: adresse ? String(adresse).split(',')[0].trim() : null,
    ville: ville || (villeDe(adresse) ? String(adresse).split(',').slice(1).join(',').replace(/\b\d{5}\b/, '').trim() : null),
    statut: 'en_discussion',
  }, user);
  if (!r.ok) return null;
  const cree = Records.update('ProprietaireMandataire', r.proprietaire.id, { source: 'Avis de valeur', historique: [...(r.proprietaire.historique || []), { le: new Date().toISOString(), type: 'creation', texte: "Fiche créée avec l'avis de valeur" }] });
  entrerDansBiens(cree, user, 'Fiche créée avec son avis de valeur ou son mandat');
  return r.proprietaire.id;
}

/** Rattache un avis à sa fiche s'il n'en a pas. Rend l'id de la fiche, ou null. */
export async function ficheDeLAvis(estimationId, user) {
  const e = Records.get('EstimationMandataire', estimationId);
  if (!e || e.exemple || e.essai_bien) return e?.proprietaire_id || null;
  if (e.proprietaire_id) return e.proprietaire_id;
  const adresse = e.adresse || e.questionnaire?.adresse || null;
  if (!adresse) return null;
  const pid = await trouverOuCreerFiche({ adresse, titre: e.nom_choisi ? e.bien : null, nom: e.questionnaire?.demandeur || null }, { ...user, email: e.mandataire_email });
  if (pid) Records.update('EstimationMandataire', e.id, { proprietaire_id: pid });
  return pid;
}

/** Rattache un mandat à sa fiche : celle de son avis, sinon celle du local de son adresse. Rend l'id, ou null. */
export async function ficheDuMandat(mandatId, user) {
  const m = Records.get('MandatMandataire', mandatId);
  if (!m || m.exemple || m.essai_bien) return m?.proprietaire_id || null;
  if (m.proprietaire_id) return m.proprietaire_id;
  if (m.estimation_id) {
    const pid = await ficheDeLAvis(m.estimation_id, user);
    if (pid) return pid;
  }
  const q = m.questionnaire || {};
  const adresse = q.bien_adresse || null;
  if (!adresse) return null;
  const nom = q.vendeur_societe || [q.vendeur_civilite, q.vendeur_prenom, q.vendeur_nom].filter(Boolean).join(' ') || m.vendeur || null;
  const pid = await trouverOuCreerFiche({ adresse, nom }, { ...user, email: m.mandataire_email });
  if (pid) Records.update('MandatMandataire', m.id, { proprietaire_id: pid });
  return pid;
}
