// Deux domaines pour une plateforme (12 nov. 2026, Jules) : app.klocka.immo pour l'équipe et les clients,
// app.kpartners.immo pour l'espace mandataire. Un seul serveur derrière ; le domaine dit l'espace.
//
// Une connexion ne passe pas d'un domaine à l'autre (un cookie appartient à son domaine). On passe donc par un jeton
// de passage : valable une fois, soixante secondes, il ouvre une session sur l'autre domaine et y mène à la page voulue.
//
// Tant que URL_KPARTNERS n'est pas posée sur Render, rien ne change en ligne : personne n'est envoyé vers un domaine
// qui ne répond pas encore. En local, kpartners.localhost tient lieu d'app.kpartners.immo.

import { randomBytes } from 'crypto';
import { Records } from './db.js';
import { URL_CANONIQUE } from './contexte.js';

export const ENTITE = 'PassageDomaine';
const DUREE_MS = 60 * 1000;
export const HOTES_KPARTNERS = new Set(
  (process.env.HOTES_KPARTNERS || 'app.kpartners.immo,kpartners.localhost').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
);

const sansPort = (hote) => String(hote || '').toLowerCase().replace(/:\d+$/, '');
const estLocal = (hote) => /(^|\.)localhost$|^127\.0\.0\.1$/.test(sansPort(hote));

/** Pure : l'espace d'un domaine. */
export const espaceDeHote = (hote) => (HOTES_KPARTNERS.has(sansPort(hote)) ? 'kpartners' : 'klocka');

/**
 * Pure : l'adresse de chaque espace vue depuis ce domaine. En local, le même port, kpartners.localhost et localhost ;
 * en ligne, URL_KPARTNERS (vide : l'espace K Partners n'a pas encore son domaine) et app.klocka.immo.
 */
export function adressesDesEspaces(hote, proto = 'https', { urlKpartners = process.env.URL_KPARTNERS || '', urlKlocka = URL_CANONIQUE } = {}) {
  if (estLocal(hote)) {
    const port = String(hote).match(/:(\d+)$/)?.[1];
    const p = port ? `:${port}` : '';
    return { klocka: `${proto}://localhost${p}`, kpartners: `${proto}://kpartners.localhost${p}` };
  }
  return { klocka: urlKlocka.replace(/\/$/, ''), kpartners: urlKpartners.replace(/\/$/, '') || null };
}

/** Pure : une suite de passage sûre, toujours un chemin de la plateforme (jamais un autre site). */
export function suiteSure(suite) {
  const s = String(suite || '/');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/';
}

/** Un jeton de passage pour cette personne. */
export function creerPassage(email) {
  const jeton = randomBytes(32).toString('hex');
  Records.create(ENTITE, { jeton, email: String(email).toLowerCase(), expire_le: new Date(Date.now() + DUREE_MS).toISOString() });
  return jeton;
}

/** Le jeton consommé : l'adresse de la personne, ou null (inconnu, déjà servi, expiré). */
export function consommerPassage(jeton) {
  const p = jeton ? Records.findBy(ENTITE, 'jeton', String(jeton)) : null;
  if (!p) return null;
  Records.delete(ENTITE, p.id);
  return Date.parse(p.expire_le) > Date.now() ? p.email : null;
}
