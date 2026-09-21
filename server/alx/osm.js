// Les rues d'un centre-ville et leurs vitrines, par OpenStreetMap.
//
// Une seule requête Overpass rend, sur toute la commune (son contour vient de
// geo.api.gouv.fr ; à défaut un cercle autour du centre), toutes les rues
// nommées avec leur tracé, et tous les commerces que les contributeurs ont
// posés (shop=*, bars, restaurants, pharmacies, banques). C'est ce qui
// remplace le balayage de l'annuaire des entreprises : l'annuaire mettait
// treize minutes pour Antibes et n'a jamais fini Nice ; OSM répond en une
// seconde et donne en plus le dessin des rues, pour la carte et la balade.
//
// L'annuaire garde son rôle ensuite, rue par rue : il donne le SIRET et
// l'exploitant de chaque vitrine retenue.

import { ErreurSource } from '../marche/erreurs.js';
import { cleRue, joliNomDeRue } from './commerces.js';

// Le serveur public d'abord, le miroir français ensuite : l'un ou l'autre
// tombe parfois en 504 sous la charge.
const SERVEURS = ['https://overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];
const ENTETES = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': 'Klocka ALX (sourcing@klocka.immo)' };

// Les voies où l'on trouve des vitrines. Pas les autoroutes, pas les chemins.
const VOIES = 'primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|pedestrian|living_street|unclassified';
// Ce qui, hors shop=*, est une vitrine.
const AMENITES = 'restaurant|cafe|bar|pub|fast_food|ice_cream|pharmacy|bank|bureau_de_change';
// Un shop=vacant est un local vide : pas une vitrine qui fait vivre la rue.
const SHOPS_HORS = new Set(['vacant', 'no', 'yes']);

const VOIE = new RegExp(`^(${VOIES})$`);
const AMENITE = new RegExp(`^(${AMENITES})$`);

const DISTANCE_RATTACHEMENT_M = 30;

// `zone` est un filtre Overpass : `poly:"lat lon lat lon…"` pour le contour
// d'une commune, `around:R,lat,lon` pour un cercle.
const requete = (zone) => `[out:json][timeout:120];
way(${zone})["highway"~"^(${VOIES})$"]["name"]->.rues;
.rues out geom qt;
(
  nwr(${zone})["shop"];
  nwr(${zone})["amenity"~"^(${AMENITES})$"];
)->.vitrines;
.vitrines out center tags qt;`;

/**
 * Le contour d'une commune (geo.api.gouv.fr), réduit à 150 points au plus :
 * Overpass n'a pas besoin de mieux, et la requête reste courte. Rend le filtre
 * `poly:` prêt à l'emploi, ou null si la commune est inconnue.
 */
export async function contourDe(codeInsee) {
  if (!codeInsee) return null;
  try {
    const r = await fetch(`https://geo.api.gouv.fr/communes/${encodeURIComponent(codeInsee)}?fields=contour&format=json`, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const g = (await r.json()).contour;
    if (!g) return null;
    // Un MultiPolygon (commune avec des îles) : on garde le plus grand anneau.
    const anneau = g.type === 'Polygon' ? g.coordinates[0] : [...g.coordinates].sort((a, b) => b[0].length - a[0].length)[0][0];
    const pas = Math.max(1, Math.ceil(anneau.length / 150));
    return `poly:"${anneau.filter((_, i) => i % pas === 0).map(([lon, lat]) => `${lat.toFixed(5)} ${lon.toFixed(5)}`).join(' ')}"`;
  } catch {
    return null;
  }
}

/** Interroge Overpass, un serveur après l'autre. */
export async function interroger(zone) {
  let derniere = null;
  for (const url of SERVEURS) {
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(requete(zone))}`, headers: ENTETES, signal: AbortSignal.timeout(180000) });
      const texte = await r.text();
      if (!r.ok || texte.startsWith('<')) {
        derniere = new Error(`Overpass a répondu ${r.status}${texte.startsWith('<') ? ' (page d\'erreur)' : ''}.`);
        continue;
      }
      return JSON.parse(texte).elements || [];
    } catch (e) {
      derniere = e;
    }
  }
  throw new ErreurSource(`OpenStreetMap n'a pas répondu (${derniere?.message || 'sans détail'}).`, { service: 'OpenStreetMap', classe: 'passagere' });
}

// --- Géométrie -----------------------------------------------------------------------------

const metres = (a, b) => Math.hypot((b.lat - a.lat) * 111000, (b.lon - a.lon) * 111000 * Math.cos((a.lat * Math.PI) / 180));

/** La distance d'un point à un segment, en mètres, dans un plan local. */
export function distanceAuSegment(p, a, b) {
  const k = 111000 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lon - a.lon) * k, py = (p.lat - a.lat) * 111000;
  const bx = (b.lon - a.lon) * k, by = (b.lat - a.lat) * 111000;
  const l2 = bx * bx + by * by;
  const t = l2 ? Math.max(0, Math.min(1, (px * bx + py * by) / l2)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}

/** La distance d'un point au tracé d'une rue (plusieurs tronçons). */
export function distanceAuTrace(p, trace) {
  let min = Infinity;
  for (const troncon of trace) {
    for (let i = 1; i < troncon.length; i += 1) {
      const d = distanceAuSegment(p, { lat: troncon[i - 1][0], lon: troncon[i - 1][1] }, { lat: troncon[i][0], lon: troncon[i][1] });
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * La longueur d'une rue, en mètres : la plus grande distance entre deux bouts
 * de ses tronçons. Pas la somme des tronçons : une avenue à deux chaussées et
 * une voie de tram compterait trois fois.
 */
export function longueurDuTrace(trace) {
  const bouts = [];
  for (const t of trace) {
    if (!t.length) continue;
    bouts.push({ lat: t[0][0], lon: t[0][1] });
    if (t.length > 1) bouts.push({ lat: t[t.length - 1][0], lon: t[t.length - 1][1] });
  }
  let max = 0;
  for (let i = 0; i < bouts.length; i += 1) {
    for (let j = i + 1; j < bouts.length; j += 1) max = Math.max(max, metres(bouts[i], bouts[j]));
  }
  return Math.round(max);
}

/**
 * Des points tous les `pas` mètres le long d'un tracé : là où la balade
 * s'arrête pour regarder autour d'elle.
 */
export function pointsLeLongDe(trace, pas = 40) {
  const out = [];
  for (const troncon of trace) {
    if (!troncon.length) continue;
    let reste = 0;
    out.push({ lat: troncon[0][0], lon: troncon[0][1] });
    for (let i = 1; i < troncon.length; i += 1) {
      const a = { lat: troncon[i - 1][0], lon: troncon[i - 1][1] };
      const b = { lat: troncon[i][0], lon: troncon[i][1] };
      const d = metres(a, b);
      let parcouru = pas - reste;
      while (parcouru <= d) {
        const t = parcouru / d;
        out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
        parcouru += pas;
      }
      reste = d - (parcouru - pas);
    }
  }
  return out;
}

// --- Lecture de la réponse -------------------------------------------------------------------

/**
 * Regroupe les tronçons OSM par nom de rue : une rue = un nom, plusieurs
 * tronçons, un tracé. Pure.
 */
export function grouperVoies(elements) {
  const rues = new Map();
  for (const e of elements) {
    if (e.type !== 'way' || !VOIE.test(e.tags?.highway || '') || !e.tags?.name || !Array.isArray(e.geometry)) continue;
    const cle = cleRue(e.tags.name);
    if (!cle) continue;
    const r = rues.get(cle) || { cle, nom: joliNomDeRue(e.tags.name), trace: [], vitrines: 0, enseignes: [], types: {} };
    r.trace.push(e.geometry.map((p) => [p.lat, p.lon]));
    r.types[e.tags.highway] = (r.types[e.tags.highway] || 0) + e.geometry.length;
    rues.set(cle, r);
  }
  for (const r of rues.values()) {
    // Le type de voie qui porte le plus de points : c'est lui qui dit si l'on
    // est sur un boulevard ou dans une rue piétonne.
    r.type = Object.entries(r.types).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    delete r.types;
    r.longueur_m = longueurDuTrace(r.trace);
    const pts = r.trace.flat();
    r.centre = pts.length ? { lat: pts.reduce((a, p) => a + p[0], 0) / pts.length, lon: pts.reduce((a, p) => a + p[1], 0) / pts.length } : null;
  }
  return [...rues.values()];
}

/** Un élément OSM est-il une vitrine ? Rend le point et l'enseigne, ou null. */
export function vitrineDe(e) {
  const t = e.tags || {};
  const shop = t.shop && !SHOPS_HORS.has(t.shop);
  const amenite = t.amenity && AMENITE.test(t.amenity);
  if (!shop && !amenite) return null;
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (lat == null || lon == null) return null;
  return { lat, lon, enseigne: t.name || t.brand || null, rue: t['addr:street'] || null, type: t.shop || t.amenity };
}

/**
 * Rattache chaque vitrine à sa rue : par l'adresse quand elle est renseignée,
 * sinon par la rue la plus proche du point, à moins de trente mètres. Pure.
 * Rend les rues, comptées, les plus vivantes d'abord.
 */
export function rattacherVitrines(elements, rues) {
  const parCle = new Map(rues.map((r) => [r.cle, r]));
  let total = 0;
  let sansRue = 0;
  for (const e of elements) {
    const v = vitrineDe(e);
    if (!v) continue;
    total += 1;
    let rue = v.rue ? parCle.get(cleRue(v.rue)) : null;
    if (!rue) {
      let min = DISTANCE_RATTACHEMENT_M;
      for (const r of rues) {
        if (r.centre && metres(v, r.centre) > r.longueur_m / 2 + DISTANCE_RATTACHEMENT_M) continue;
        const d = distanceAuTrace(v, r.trace);
        if (d < min) { min = d; rue = r; }
      }
    }
    if (!rue) { sansRue += 1; continue; }
    rue.vitrines += 1;
    if (v.enseigne && rue.enseignes.length < 12 && !rue.enseignes.includes(v.enseigne)) rue.enseignes.push(v.enseigne);
  }
  return { rues: [...rues].sort((a, b) => b.vitrines - a.vitrines), vitrines_total: total, sans_rue: sansRue };
}

/**
 * Une estimation du flux d'une rue, de 1 à 5, sans rien demander à personne :
 * la densité de vitrines par cent mètres dit le passage à pied, le type de
 * voie dit le passage en voiture. L'étude d'implantation, sur demande, remplace
 * cette estimation par sa mesure.
 */
export function fluxEstime(rue) {
  const densite = rue.longueur_m ? rue.vitrines / (Math.max(rue.longueur_m, 50) / 100) : 0;
  const parDensite = densite >= 8 ? 5 : densite >= 5 ? 4 : densite >= 3 ? 3 : densite >= 1.5 ? 2 : 1;
  // Une rue piétonne ou un grand axe commerçant attire plus de pas qu'une rue de quartier.
  const pieton = Math.min(5, parDensite + (rue.type === 'pedestrian' ? 1 : 0));
  const voiture = { primary: 5, primary_link: 4, secondary: 4, secondary_link: 3, tertiary: 3, tertiary_link: 2, unclassified: 2, residential: 2, living_street: 1, pedestrian: 1 }[rue.type] ?? 2;
  return { pieton, voiture, note: Math.round(((pieton + voiture) / 2) * 2) / 2 };
}

/**
 * Les rues d'une commune avec leurs vitrines, par OpenStreetMap : toute la
 * commune quand son contour est connu, un cercle autour du centre sinon.
 * @param {{code_insee?:string, lat:number, lon:number, rayon_km?:number}} o
 * @returns {Promise<{rues: object[], vitrines_total: number, sans_rue: number, zone: 'commune'|'cercle'}>}
 */
export async function ruesEtVitrines({ code_insee = null, lat, lon, rayon_km = 1.5 }) {
  const contour = await contourDe(code_insee);
  const zone = contour || `around:${Math.round(rayon_km * 1000)},${lat},${lon}`;
  const elements = await interroger(zone);
  const r = rattacherVitrines(elements, grouperVoies(elements));
  for (const x of r.rues) x.flux_estime = fluxEstime(x);
  return { ...r, zone: contour ? 'commune' : 'cercle' };
}
