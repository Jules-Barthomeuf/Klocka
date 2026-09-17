// K-Zoning : les zones d'étude et leurs dossiers.
//
// Une zone est un périmètre posé sur la carte, autour d'une adresse. Elle ne
// contient aucune donnée : elle dit seulement où regarder. Ce qu'on y lit —
// la population, les commerces concurrents — se calcule à la demande, depuis
// les sources, et n'est pas gelé dans la zone : une zone vaut aussi longtemps
// que le lieu qu'elle décrit, les chiffres non.
//
// Les dossiers ne sont qu'un rangement : une zone sans dossier reste une zone
// entière, et supprimer un dossier ne supprime pas ce qu'il contenait.

import { Records } from './db.js';

const ZONE = 'ZoneKData';
const DOSSIER = 'DossierKData';

// Un rayon en mètres. En dessous de cinquante, la zone ne contient rien ; au
// delà de dix kilomètres, ce n'est plus une zone de chalandise mais un
// département, et les sources refusent de répondre.
const RAYON_MIN = 50;
const RAYON_MAX = 10000;

const nombre = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/** Les zones, la plus récente d'abord, avec le nom de leur dossier. */
export function listerZones() {
  const dossiers = new Map(Records.list(DOSSIER).map((d) => [d.id, d.nom]));
  return Records.list(ZONE)
    .map((z) => ({ ...z, dossier_nom: z.dossier_id ? dossiers.get(z.dossier_id) || null : null }))
    .sort((a, b) => String(b.created_date || '').localeCompare(String(a.created_date || '')));
}

export function listerDossiers() {
  const zones = Records.list(ZONE);
  return Records.list(DOSSIER)
    .map((d) => ({ ...d, zones: zones.filter((z) => z.dossier_id === d.id).length }))
    .sort((a, b) => String(a.nom || '').localeCompare(String(b.nom || ''), 'fr'));
}

/**
 * Crée une zone en cercle : un point, un rayon.
 * @param {{nom?: string, adresse?: string, lat: number, lon: number, rayon_m: number, dossier_id?: string|null}} p
 * @param {object} [user]
 */
export function creerZoneCercle({ nom, adresse, lat, lon, rayon_m, dossier_id = null }, user = null) {
  const y = nombre(lat);
  const x = nombre(lon);
  // `Number.isFinite` et non `isFinite` : le second convertit son argument, et
  // `isFinite(null)` vaut vrai — une zone sans coordonnées se créait, avec un
  // centre vide que la carte ne savait pas poser.
  if (!Number.isFinite(y) || !Number.isFinite(x)) return { ok: false, error: 'Il manque le point de départ de la zone.' };
  // La France métropolitaine et l'outre-mer tiennent dans ces bornes ; un
  // point hors de là vient d'une adresse mal résolue, pas d'un choix.
  if (y < -60 || y > 60 || x < -180 || x > 180) return { ok: false, error: 'Ce point ne ressemble pas à un lieu.' };

  const r = Math.round(nombre(rayon_m) || 0);
  if (!Number.isFinite(r) || r < RAYON_MIN || r > RAYON_MAX) {
    return { ok: false, error: `Le rayon doit tenir entre ${RAYON_MIN} m et ${RAYON_MAX / 1000} km.` };
  }
  if (dossier_id && !Records.get(DOSSIER, dossier_id)) return { ok: false, error: 'Ce dossier n\'existe plus.' };

  const libelle = String(nom || adresse || '').trim();
  if (!libelle) return { ok: false, error: 'Une zone porte le nom de son adresse : elle manque.' };

  const zone = Records.create(ZONE, {
    nom: libelle,
    adresse: String(adresse || '').trim() || null,
    forme: 'cercle',
    centre_lat: y,
    centre_lon: x,
    rayon_m: r,
    dossier_id: dossier_id || null,
  }, user?.email);
  return { ok: true, zone };
}

export function renommerZone(id, nom) {
  const zone = Records.get(ZONE, id);
  if (!zone) return { ok: false, error: 'Cette zone n\'existe plus.' };
  const libelle = String(nom || '').trim();
  if (!libelle) return { ok: false, error: 'Une zone sans nom ne se retrouve pas.' };
  return { ok: true, zone: Records.update(ZONE, id, { nom: libelle }) };
}

/** Ranger une zone dans un dossier, ou l'en sortir (`dossier_id` nul). */
export function deplacerZone(id, dossier_id) {
  const zone = Records.get(ZONE, id);
  if (!zone) return { ok: false, error: 'Cette zone n\'existe plus.' };
  if (dossier_id && !Records.get(DOSSIER, dossier_id)) return { ok: false, error: 'Ce dossier n\'existe plus.' };
  return { ok: true, zone: Records.update(ZONE, id, { dossier_id: dossier_id || null }) };
}

export function supprimerZone(id) {
  if (!Records.get(ZONE, id)) return { ok: false, error: 'Cette zone n\'existe plus.' };
  Records.delete(ZONE, id);
  return { ok: true };
}

export function creerDossier(nom, user = null) {
  const libelle = String(nom || '').trim();
  if (!libelle) return { ok: false, error: 'Un dossier porte un nom.' };
  return { ok: true, dossier: Records.create(DOSSIER, { nom: libelle }, user?.email) };
}

export function renommerDossier(id, nom) {
  const d = Records.get(DOSSIER, id);
  if (!d) return { ok: false, error: 'Ce dossier n\'existe plus.' };
  const libelle = String(nom || '').trim();
  if (!libelle) return { ok: false, error: 'Un dossier porte un nom.' };
  return { ok: true, dossier: Records.update(DOSSIER, id, { nom: libelle }) };
}

/**
 * Supprime un dossier. Les zones qu'il portait ne disparaissent pas avec lui :
 * elles ressortent sans dossier. Un rangement qui emporte son contenu est un
 * piège, pas un rangement.
 */
export function supprimerDossier(id) {
  if (!Records.get(DOSSIER, id)) return { ok: false, error: 'Ce dossier n\'existe plus.' };
  for (const z of Records.filter(ZONE, { dossier_id: id })) Records.update(ZONE, z.id, { dossier_id: null });
  Records.delete(DOSSIER, id);
  return { ok: true };
}
