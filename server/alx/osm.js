// Les rues d'un centre-ville et leurs vitrines, par OpenStreetMap.
//
// Une seule requête Overpass rend, autour du centre de la commune, toutes les
// rues nommées avec leur tracé, et tous les commerces que les contributeurs
// ont posés (shop=*, bars, restaurants, pharmacies, banques). C'est ce qui
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

const requete = (lat, lon, rayonM) => `[out:json][timeout:60];
way(around:${rayonM},${lat},${lon})["highway"~"^(${VOIES})$"]["name"]->.rues;
.rues out geom qt;
(
  nwr(around:${rayonM},${lat},${lon})["shop"];
  nwr(around:${rayonM},${lat},${lon})["amenity"~"^(${AMENITES})$"];
)->.vitrines;
.vitrines out center tags qt;`;

/** Interroge Overpass, un serveur après l'autre. */
export async function interroger(lat, lon, rayonM) {
  let derniere = null;
  for (const url of SERVEURS) {
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(requete(lat, lon, rayonM))}`, headers: ENTETES, signal: AbortSignal.timeout(90000) });
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

/** La longueur d'un tracé, en mètres. */
export function longueurDuTrace(trace) {
  let l = 0;
  for (const troncon of trace) {
    for (let i = 1; i < troncon.length; i += 1) l += metres({ lat: troncon[i - 1][0], lon: troncon[i - 1][1] }, { lat: troncon[i][0], lon: troncon[i][1] });
  }
  return Math.round(l);
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
    const r = rues.get(cle) || { cle, nom: joliNomDeRue(e.tags.name), trace: [], vitrines: 0, enseignes: [] };
    r.trace.push(e.geometry.map((p) => [p.lat, p.lon]));
    rues.set(cle, r);
  }
  for (const r of rues.values()) {
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
 * Les rues d'un centre-ville avec leurs vitrines, par OpenStreetMap.
 * @param {{lat:number, lon:number, rayon_km?:number}} o
 * @returns {Promise<{rues: object[], vitrines_total: number, sans_rue: number}>}
 */
export async function ruesEtVitrines({ lat, lon, rayon_km = 1.5 }) {
  const elements = await interroger(lat, lon, Math.round(rayon_km * 1000));
  return rattacherVitrines(elements, grouperVoies(elements));
}
