// Les versions d'un projet (14 oct. 2026, Jules : « des enregistrements réguliers,
// mais qu'on puisse enregistrer par nous-même aussi ; voir les historiques des
// versions qu'on a créées »). L'éditeur enregistre seul, champ par champ ; le
// bouton Enregistrer pose en plus une version : la fiche entière à cet instant,
// qu'on peut restaurer. Une restauration garde d'abord l'état qu'elle remplace.

import { Records } from './db.js';

const ENTITE = 'ProjetVersion';
// Ce qui n'est pas la fiche : l'identité de l'enregistrement et le journal des changements.
const HORS_FICHE = new Set(['id', 'created_date', 'updated_date', 'created_by', 'journal_champs']);
const LIMITE = 60;

/** Pure : la fiche d'un projet, sans ce qui n'en fait pas partie. */
export function ficheDe(projet) {
  return Object.fromEntries(Object.entries(projet || {}).filter(([k]) => !HORS_FICHE.has(k)));
}

/** Les versions d'un projet, la plus récente d'abord, sans leur contenu. */
export function versionsDu(projetId) {
  // À la même milliseconde, la dernière créée d'abord (la liste les rend dans l'ordre de création).
  return Records.list(ENTITE)
    .filter((v) => v.projet_id === projetId)
    .reverse()
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map(({ id, le, par, nom, auto }) => ({ id, le, par, nom: nom || null, auto: !!auto }));
}

/** Pose une version : la fiche entière du projet à cet instant. Les plus anciennes au-delà de 60 s'effacent. */
export function creerVersion(projetId, { par = null, nom = null, auto = false } = {}) {
  const projet = Records.get('Project', projetId);
  if (!projet) return { ok: false, error: 'Projet introuvable.' };
  const v = Records.create(ENTITE, { projet_id: projetId, le: new Date().toISOString(), par, nom: nom ? String(nom).slice(0, 80) : null, auto, donnees: ficheDe(projet) });
  const toutes = Records.list(ENTITE).filter((x) => x.projet_id === projetId).reverse().sort((a, b) => String(b.le).localeCompare(String(a.le)));
  for (const vieille of toutes.slice(LIMITE)) Records.delete(ENTITE, vieille.id);
  return { ok: true, version: { id: v.id, le: v.le, par, nom: v.nom, auto } };
}

/**
 * Remet le projet dans l'état d'une version. Un champ apparu depuis est vidé :
 * la fiche redevient exactement celle de la version. L'état remplacé est gardé
 * avant, en version « Avant restauration ».
 */
export function restaurerVersion(projetId, versionId, { par = null } = {}) {
  const v = Records.get(ENTITE, versionId);
  if (!v || v.projet_id !== projetId) return { ok: false, error: 'Version introuvable.' };
  const projet = Records.get('Project', projetId);
  if (!projet) return { ok: false, error: 'Projet introuvable.' };
  creerVersion(projetId, { par, nom: 'Avant restauration', auto: true });
  const actuelle = ficheDe(projet);
  const maj = { ...Object.fromEntries(Object.keys(actuelle).filter((k) => !(k in v.donnees)).map((k) => [k, null])), ...v.donnees };
  Records.update('Project', projetId, maj);
  return { ok: true, projet: Records.get('Project', projetId) };
}
