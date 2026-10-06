// Le modèle de l'emailing (v2, 6 oct. 2026), et sa migration depuis la v1.
//
//   EmailingContact     une adresse (unique), ses champs, ses tags, ses listes
//                       (identifiants), son statut : abonne, desinscrit,
//                       bounce, plainte. Seul « abonne » reçoit du marketing.
//   EmailingChamp       un champ personnalisé (type d'investisseur, budget…),
//                       utilisable comme variable {{cle}}.
//   EmailingListe       une liste statique.
//   EmailingSegment     un segment dynamique : des règles sur les champs, les
//                       tags, les listes et le statut, recalculé à chaque usage.
//   EmailingTemplate    un template marketing enregistré, ou un mail de la
//                       plateforme (categorie « plateforme », par sa clé).
//   EmailingCampagne    un envoi ponctuel à une audience (étape 3).
//   EmailingSequence    des emails espacés, un déclencheur, une heure d'envoi.
//   EmailingInscription un contact dans une séquence (une seule par couple).
//   EmailingEnvoi       un email à un contact, sous une clé unique : un même
//                       email ne part jamais deux fois.
//   EmailingEvenement   ce que Resend dit d'un envoi (webhook, étape 5).
//
// La migration est rejouable : elle ne fait rien une fois passée (Meta
// « emailing:schema »), et chacune de ses étapes ne touche que ce qui est
// encore à l'ancien format.

import { Records, Meta } from '../db.js';

export const E = {
  CONTACT: 'EmailingContact', CHAMP: 'EmailingChamp', LISTE: 'EmailingListe', SEGMENT: 'EmailingSegment',
  TEMPLATE: 'EmailingTemplate', CAMPAGNE: 'EmailingCampagne', SEQUENCE: 'EmailingSequence',
  INSCRIPTION: 'EmailingInscription', ENVOI: 'EmailingEnvoi', EVENEMENT: 'EmailingEvenement',
  MODELE_V1: 'EmailingModele',
};
export const VERSION = '2';
export const STATUTS_CONTACT = ['abonne', 'desinscrit', 'bounce', 'plainte'];
export const HEURE_PAR_DEFAUT = 9;

/** La clé d'un envoi : ce qui le rend unique. */
export const cleEnvoi = {
  campagne: (campagneId, contactId) => `campagne:${campagneId}:${contactId}`,
  sequence: (sequenceId, etapeId, contactId) => `sequence:${sequenceId}:${etapeId}:${contactId}`,
};

/** La liste d'un nom, créée au besoin. */
export function listeDuNom(nom, par = null) {
  const n = String(nom || '').trim();
  if (!n) return null;
  return Records.list(E.LISTE).find((l) => l.nom === n) || Records.create(E.LISTE, { nom: n, cree_le: new Date().toISOString(), cree_par: par });
}

/**
 * Passe les données de la v1 à la v2, sans rien perdre. Rend un compte rendu
 * de ce qui a été migré.
 */
export function migrer({ forcer = false } = {}) {
  if (!forcer && Meta.get('emailing:schema') === VERSION) return { deja: true };
  const bilan = { contacts: 0, listes: 0, sequences: 0, envois: 0, templates: 0 };
  const listesAvant = Records.list(E.LISTE).length;

  // 1. Les contacts : les noms de liste deviennent des listes, « actif » devient « abonne ».
  const ids = new Set(Records.list(E.LISTE).map((l) => l.id));
  for (const c of Records.list(E.CONTACT)) {
    const listes = (c.listes || []).map((x) => (ids.has(x) ? x : listeDuNom(x)?.id)).filter(Boolean);
    for (const id of listes) ids.add(id);
    const statut = c.statut === 'actif' || !c.statut ? 'abonne' : c.statut;
    const patch = {};
    if (JSON.stringify(listes) !== JSON.stringify(c.listes || [])) patch.listes = listes;
    if (statut !== c.statut) patch.statut = statut;
    if (!Array.isArray(c.tags)) patch.tags = [];
    if (!c.champs || typeof c.champs !== 'object') patch.champs = {};
    if (Object.keys(patch).length) { Records.update(E.CONTACT, c.id, patch); bilan.contacts += 1; }
  }

  // 2. Les séquences : leur liste devient leur déclencheur ; 9 h, Paris.
  for (const s of Records.list(E.SEQUENCE)) {
    if (s.declencheur) continue;
    const l = s.liste ? listeDuNom(s.liste) : null;
    Records.update(E.SEQUENCE, s.id, {
      declencheur: l ? { type: 'liste', ref: l.id } : { type: 'manuel' },
      heure_envoi: s.heure_envoi ?? HEURE_PAR_DEFAUT,
      sortie: s.sortie || { si_reponse: false },
    });
    bilan.sequences += 1;
  }

  // 3. Les envois : leur clé, pour qu'aucun ne reparte.
  for (const e of Records.list(E.ENVOI)) {
    if (e.cle_envoi) continue;
    const cle = e.type === 'sequence' && e.sequence_id && e.etape_id && e.contact_id
      ? cleEnvoi.sequence(e.sequence_id, e.etape_id, e.contact_id)
      : `${e.type || 'envoi'}:${e.cle || ''}:${e.email || ''}:${e.le || e.id}`;
    Records.update(E.ENVOI, e.id, { cle_envoi: cle });
    bilan.envois += 1;
  }

  // 4. Le mail de la plateforme retouché devient un template « plateforme ».
  for (const m of Records.list(E.MODELE_V1)) {
    if (Records.list(E.TEMPLATE).some((t) => t.categorie === 'plateforme' && t.cle === m.cle)) continue;
    Records.create(E.TEMPLATE, { categorie: 'plateforme', cle: m.cle, objet: m.objet, apercu: m.apercu, design: m.design, modifie_le: m.modifie_le || null, modifie_par: m.modifie_par || null, migre_de: m.id });
    bilan.templates += 1;
  }

  bilan.listes = Records.list(E.LISTE).length - listesAvant;
  Meta.set('emailing:schema', VERSION);
  return bilan;
}

// --- Les audiences : listes et segments ---------------------------------------------

const valeurDe = (c, champ) => {
  if (champ.startsWith('champs.')) return c.champs?.[champ.slice(7)];
  return c[champ];
};
const texte = (v) => String(v ?? '').trim().toLowerCase();

/**
 * Pure : un contact répond-il à une condition ? Opérateurs : egal, different,
 * contient, vide, non_vide (sur un champ), a_tag, sans_tag, dans_liste,
 * hors_liste.
 */
export function remplit(c, cond) {
  const v = cond.valeur;
  switch (cond.operateur) {
    case 'a_tag': return (c.tags || []).includes(v);
    case 'sans_tag': return !(c.tags || []).includes(v);
    case 'dans_liste': return (c.listes || []).includes(v);
    case 'hors_liste': return !(c.listes || []).includes(v);
    case 'vide': return !texte(valeurDe(c, cond.champ));
    case 'non_vide': return !!texte(valeurDe(c, cond.champ));
    case 'contient': return texte(valeurDe(c, cond.champ)).includes(texte(v));
    case 'different': return texte(valeurDe(c, cond.champ)) !== texte(v);
    default: return texte(valeurDe(c, cond.champ)) === texte(v);
  }
}

/** Pure : un contact entre-t-il dans un segment (toutes les règles, ou l'une d'elles) ? */
export function dansSegment(c, segment) {
  const regles = segment?.regles?.conditions || [];
  if (!regles.length) return false;
  return segment.regles.combinaison === 'ou' ? regles.some((r) => remplit(c, r)) : regles.every((r) => remplit(c, r));
}

/** Un contact peut-il recevoir un email marketing ? */
export const envoyable = (c) => !!c && c.statut === 'abonne';

/**
 * Les contacts d'une audience : l'union des listes et des segments donnés,
 * sans doublon. `tous` : y compris les non envoyables (pour compter).
 */
export function audience({ listes = [], segments = [], tags = [] } = {}, { tous = false } = {}) {
  const segs = segments.map((id) => Records.get(E.SEGMENT, id)).filter(Boolean);
  return Records.list(E.CONTACT).filter((c) => (tous || envoyable(c)) && (
    listes.some((l) => (c.listes || []).includes(l))
    || tags.some((t) => (c.tags || []).includes(t))
    || segs.some((s) => dansSegment(c, s))
  ));
}
