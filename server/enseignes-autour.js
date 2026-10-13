// Les enseignes nationales autour d'un local (13 oct. 2026, Jules : « la partie
// enseignes nationales est fausse, passe par une autre méthode »).
//
// Avant : les marques notées dans OpenStreetMap à 400 m, souvent périmées
// (magasins fermés, marques régionales prises pour nationales). Maintenant :
//  1. Google Maps (Places, recherche autour d'un point) : les commerces OUVERTS
//     aujourd'hui à moins de 300 m, les plus proches d'abord ;
//  2. le name-suggestion-index d'OpenStreetMap (server/marques-fr.json,
//     régénéré par scripts/marques-fr.mjs) : seul un nom qui est celui d'une
//     marque présente en France, en Europe ou partout, est retenu ;
//  3. Wikidata pour le logo (presentation-projet.js), d'après la marque.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const AUTOUR = 'https://places.googleapis.com/v1/places:searchNearby';
const CHAMPS = 'places.id,places.displayName,places.primaryType,places.primaryTypeDisplayName,places.businessStatus,places.location,places.googleMapsUri';
// Google rend vingt lieux au plus par recherche, les plus proches : en centre-ville,
// une seule recherche s'arrête à quarante mètres. Sept groupes de types, vingt lieux
// chacun, pour couvrir les 300 m.
const TYPES = [
  ['clothing_store'],
  ['shoe_store', 'jewelry_store', 'department_store', 'electronics_store', 'cell_phone_store', 'sporting_goods_store'],
  ['home_goods_store', 'furniture_store', 'hardware_store', 'book_store', 'pet_store', 'florist', 'supermarket', 'grocery_store', 'convenience_store'],
  ['bank', 'insurance_agency', 'real_estate_agency', 'travel_agency'],
  ['pharmacy', 'drugstore', 'beauty_salon', 'hair_salon', 'gym'],
  ['bakery', 'cafe', 'restaurant', 'fast_food_restaurant'],
  ['store'],
];
export const COUT_RECHERCHE_USD = 0.032;

/** Pure : un nom réduit à ses mots, sans accents ni ponctuation. */
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' et ').replace(/[^a-z0-9]+/g, ' ').trim();

let INDEX = null;
/** L'index des marques : nom réduit → marque. Chargé une fois. */
export function indexDesMarques(liste = null) {
  if (!liste && INDEX) return INDEX;
  const marques = liste || JSON.parse(fs.readFileSync(path.join(ICI, 'marques-fr.json'), 'utf8')).marques;
  const index = new Map();
  for (const m of marques) {
    // Sans fiche Wikidata, un nom de la liste est souvent générique (« L'Atelier ») : écarté.
    if (!m.w) continue;
    for (const nom of [m.n, ...(m.m || [])]) {
      const k = norm(nom);
      if (k && !index.has(k)) index.set(k, m);
    }
  }
  if (!liste) INDEX = index;
  return index;
}

/**
 * Pure : la marque d'un nom Google (« Yves Rocher Libourne » → Yves Rocher), ou
 * null. Le nom exact d'abord ; sinon la plus longue marque qui en est un mot
 * entier, au début (« Orange Libourne ») ou ailleurs pour une marque de plus de
 * cinq lettres (« Pharmacie Lafayette du Centre »).
 */
export function marqueDe(nomGoogle, index = indexDesMarques()) {
  const g = norm(nomGoogle);
  if (!g) return null;
  if (index.has(g)) return index.get(g);
  let meilleure = null;
  for (const [k, m] of index) {
    if (k.length < 3 || (meilleure && k.length <= norm(meilleure.n).length)) continue;
    const debut = g.startsWith(`${k} `) && k.length >= 3;
    const dedans = k.length > 5 && ` ${g} `.includes(` ${k} `);
    if (debut || dedans) meilleure = m;
  }
  return meilleure;
}

// Une agence ou une banque porte souvent le nom d'autre chose (« Habitat Conseil »,
// agence immobilière, n'est pas Habitat le meuble) : pour ces types Google, la
// marque doit être du même métier.
const METIERS = {
  real_estate_agency: /^office\/estate_agent/,
  bank: /^(amenity\/bank|office\/financial)/,
  insurance_agency: /^(office\/insurance|amenity\/bank|office\/financial)/,
};
/** Pure : la marque est-elle du métier que Google donne au lieu ? */
export function memeMetier(typeGoogle, categorie) {
  const attendu = METIERS[typeGoogle];
  return !attendu || attendu.test(categorie || '');
}

/** Pure : la distance en mètres entre deux points. */
export function distanceM(a, b) {
  const r = 6371000;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * r * Math.asin(Math.sqrt(h)));
}

/**
 * Les enseignes nationales ouvertes autour d'un point, les plus proches d'abord, une par marque.
 * @returns {Promise<{ ok: boolean, enseignes?: Array, error?: string, recherches?: number }>}
 */
export async function enseignesAutour(point, { rayon = 300, cle = (process.env.GOOGLE_MAPS_SERVEUR || '').trim(), lire = fetch, index = indexDesMarques() } = {}) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) return { ok: false, error: 'Adresse non géolocalisée.' };
  if (!cle) return { ok: false, error: 'Google Maps n\'est pas configuré (GOOGLE_MAPS_SERVEUR).' };
  const lieux = [];
  let recherches = 0;
  let reussies = 0;
  let erreur = null;
  for (const types of TYPES) {
    const r = await lire(AUTOUR, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': cle, 'X-Goog-FieldMask': CHAMPS },
      body: JSON.stringify({ includedTypes: types, maxResultCount: 20, rankPreference: 'DISTANCE', languageCode: 'fr', regionCode: 'FR', locationRestriction: { circle: { center: { latitude: point.lat, longitude: point.lon }, radius: rayon } } }),
      signal: AbortSignal.timeout(12000),
    }).catch((e) => ({ ok: false, statusText: e?.message }));
    recherches += 1;
    // Un groupe en échec n'arrête pas les autres ; seul l'échec de tous est une erreur.
    if (!r.ok) { erreur = `Google Maps : ${r.status || ''} ${r.statusText || ''}`.trim(); continue; }
    lieux.push(...((await r.json()).places || []));
    reussies += 1;
  }
  if (!reussies) return { ok: false, error: erreur, recherches };
  const vues = new Set();
  const enseignes = [];
  for (const p of lieux) {
    if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
    const m = marqueDe(p.displayName?.text, index);
    if (!m || vues.has(m.n) || !memeMetier(p.primaryType, m.c)) continue;
    vues.add(m.n);
    const lat = p.location?.latitude;
    const lon = p.location?.longitude;
    enseignes.push({
      nom: m.n, wikidata: m.w || null, nom_google: p.displayName?.text || null,
      secteur: p.primaryTypeDisplayName?.text ? p.primaryTypeDisplayName.text.charAt(0).toUpperCase() + p.primaryTypeDisplayName.text.slice(1) : null,
      distance_m: Number.isFinite(lat) && Number.isFinite(lon) ? distanceM(point, { lat, lon }) : null,
      place_id: p.id || null, maps: p.googleMapsUri || null,
    });
  }
  enseignes.sort((a, b) => (a.distance_m ?? 1e9) - (b.distance_m ?? 1e9));
  return { ok: true, enseignes, recherches };
}
