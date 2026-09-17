// Les commerces d'une zone, d'après OpenStreetMap.
//
// Pourquoi OpenStreetMap et pas le répertoire des entreprises. L'API publique
// « recherche-entreprises » répond à la question « quelles sociétés ont leur
// siège près d'ici » : dans une rue de Paris, elle rend le siège national de
// Leroy Merlin et ignore la boutique du coin. La concurrence dans une zone se
// compte en devantures, pas en sièges sociaux. OpenStreetMap recense la
// devanture, avec son point, son nom et son métier — et signale même le local
// vacant, qui intéresse autant que le commerce en activité.
//
// Overpass est un service public gratuit, sans clé, servi par des bénévoles.
// Deux règles en découlent : on s'annonce (User-Agent), et on garde ce qu'on
// a obtenu. Une même zone interrogée deux fois dans la journée ne repart pas
// sur le réseau.

import { Records } from './db.js';

const MIROIRS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 90000;
// Overpass est lent quand il est chargé, et la donnée d'un quartier ne bouge
// pas d'une heure à l'autre : une demi-journée de cache ne coûte aucune
// fraîcheur utile et épargne un service bénévole.
const CACHE_HEURES = 12;
const CACHE = 'CacheCommercesKZoning';

/**
 * Le morceau de requête d'un filtre. Un filtre dit une clé OpenStreetMap et
 * les valeurs qui l'intéressent : { cle: 'shop', valeurs: ['bakery'] }.
 */
function ligneFiltre({ cle, valeurs }, lat, lon, rayon) {
  if (!cle) return '';
  const autour = `around:${rayon},${lat},${lon}`;
  if (!valeurs || !valeurs.length) return `nwr(${autour})["${cle}"];`;
  // Une seule valeur se compare, plusieurs se passent en expression : c'est
  // la forme qu'Overpass exécute le plus vite.
  if (valeurs.length === 1) return `nwr(${autour})["${cle}"="${valeurs[0]}"];`;
  return `nwr(${autour})["${cle}"~"^(${valeurs.join('|')})$"];`;
}

/** La requête Overpass d'une zone et d'une liste de filtres. */
export function construireRequete(filtres, lat, lon, rayon_m) {
  const corps = (filtres || []).map((f) => ligneFiltre(f, lat, lon, rayon_m)).filter(Boolean).join('');
  // L'union entre parenthèses, puis une seule sortie : sans les parenthèses,
  // `out` n'imprime que le dernier jeu de résultats et tout le reste se perd.
  // `center` donne un point aux commerces cartographiés comme un bâtiment.
  return `[out:json][timeout:60];(${corps});out center tags 3000;`;
}

async function interroger(requete) {
  let derniere;
  for (const miroir of MIROIRS) {
    try {
      const r = await fetch(miroir, {
        method: 'POST',
        headers: { 'user-agent': UA, accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: requete }).toString(),
        signal: AbortSignal.timeout(DELAI_MS),
      });
      if (!r.ok) throw new Error(`Overpass a répondu ${r.status}`);
      return await r.json();
    } catch (e) {
      derniere = e;
    }
  }
  throw derniere || new Error('Overpass est injoignable.');
}

/** La distance en mètres entre deux points, pour classer du plus proche. */
function metresEntre(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/**
 * Met les objets OpenStreetMap en commerces lisibles. Un objet sans point est
 * écarté : on ne sait pas où le poser sur la carte.
 */
export function normaliser(elements, centre) {
  const vus = new Set();
  return (elements || [])
    .map((e) => {
      const t = e.tags || {};
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat == null || lon == null) return null;
      const cle = `${e.type}/${e.id}`;
      if (vus.has(cle)) return null;
      vus.add(cle);
      // `shop=vacant` : un local vide. Il n'a pas de nom et c'est normal.
      const vacant = t.shop === 'vacant' || t.disused === 'yes' || !!t['disused:shop'];
      const numero = t['addr:housenumber'];
      const rue = t['addr:street'];
      return {
        id: cle,
        nom: t.name || t.brand || t.operator || null,
        enseigne: t.brand || null,
        genre: t.shop || t.amenity || t.craft || t.office || t.leisure || t.healthcare || null,
        vacant,
        lat,
        lon,
        adresse: [numero, rue].filter(Boolean).join(' ') || null,
        distance_m: centre ? metresEntre(centre.lat, centre.lon, lat, lon) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
}

const cleCache = (lat, lon, rayon, filtres) =>
  `${lat.toFixed(5)},${lon.toFixed(5)},${rayon}|${JSON.stringify(filtres)}`;

const frais = (iso) => iso && Date.now() - new Date(iso).getTime() < CACHE_HEURES * 3600000;

/**
 * Les commerces d'une zone pour une liste de filtres.
 * @param {{lat: number, lon: number, rayon_m: number, filtres: Array, forcer?: boolean}} p
 * @returns {Promise<{ok: true, commerces: Array, garde_le: string} | {ok: false, error: string}>}
 */
export async function commercesDeLaZone({ lat, lon, rayon_m, filtres, forcer = false }) {
  // `Number.isFinite` : `isFinite(null)` vaut vrai, et une zone sans centre
  // serait partie interroger Overpass autour du point zéro.
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(rayon_m)) return { ok: false, error: 'Zone incomplète.' };
  if (!filtres || !filtres.length) return { ok: true, commerces: [], garde_le: null };

  const cle = cleCache(lat, lon, rayon_m, filtres);
  const garde = Records.findBy(CACHE, 'cle', cle);
  if (garde && frais(garde.garde_le) && !forcer) {
    return { ok: true, commerces: garde.commerces || [], garde_le: garde.garde_le, du_cache: true };
  }

  let brut;
  try {
    brut = await interroger(construireRequete(filtres, lat, lon, rayon_m));
  } catch (e) {
    // Overpass tombe parfois. Un relevé d'hier vaut mieux qu'un écran vide.
    if (garde) return { ok: true, commerces: garde.commerces || [], garde_le: garde.garde_le, du_cache: true, perime: true };
    return { ok: false, error: `OpenStreetMap n'a pas répondu : ${e?.message || e}` };
  }

  const commerces = normaliser(brut.elements, { lat, lon });
  const garde_le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { commerces, garde_le });
  else Records.create(CACHE, { cle, commerces, garde_le });
  return { ok: true, commerces, garde_le };
}
