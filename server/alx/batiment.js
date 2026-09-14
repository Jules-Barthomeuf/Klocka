// Le bâtiment sous un commerce : sa façade sur chaque rue, et son emprise.
//
// Jusqu'ici la surface d'un local se devinait sur une photo Street View : le
// modèle regardait une devanture et disait « huit mètres de vitrine », qu'on
// multipliait par une profondeur supposée de sept à treize mètres. Deux
// défauts, et ils se cumulent. Une photo ne voit qu'une rue : un commerce
// d'angle avec huit mètres d'un côté et vingt de l'autre était compté pour
// huit, et sa valeur divisée par trois. Et la profondeur était une constante,
// la même pour une échoppe et pour un rez-de-chaussée d'immeuble haussmannien.
//
// OpenStreetMap dessine les bâtiments. Le polygone donne, sans rien deviner :
// l'emprise au sol en mètres carrés, la longueur de chaque côté, et quelle
// rue chaque côté regarde. Un commerce d'angle se voit comme tel — deux
// façades sur deux rues nommées — et la profondeur se lit au lieu de se
// supposer.
//
// Ce que ce module ne sait pas, et le dit : le découpage intérieur. Un
// bâtiment de deux cents mètres carrés au sol peut abriter un commerce ou
// quatre. On compte les vitrines posées dans le polygone, on divise, et la
// surface sort en fourchette avec le nombre de commerces qui l'explique.

import { ErreurSource } from '../marche/erreurs.js';
import { joliNomDeRue } from './commerces.js';

const SERVEURS = ['https://overpass-api.de/api/interpreter', 'https://overpass.openstreetmap.fr/api/interpreter'];
const ENTETES = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json', 'user-agent': 'Klocka ALX (sourcing@klocka.immo)' };

/** Un côté plus loin que cela de l'axe de la rue ne la regarde pas. */
const DISTANCE_FACADE_M = 22;
/** Un côté qui n'est pas à peu près parallèle à la rue est un pignon, pas une façade. */
const ECART_ANGLE_MAX = 35;
/** En dessous, c'est un pan coupé ou un décrochement, pas une façade. */
const FACADE_MIN_M = 2.5;
/**
 * La profondeur d'un commerce de pied d'immeuble, en mètres. Le rez-de-chaussée
 * d'un immeuble n'est pas commercial sur toute son emprise : les boutiques
 * occupent une bande le long de la rue, derrière quoi viennent les halls, les
 * cages, les cours. Un bâtiment de seize cents mètres carrés au sol n'abrite
 * pas six commerces de deux cent soixante mètres carrés.
 */
export const PROFONDEUR_COMMERCE_M = [7, 13];
/** Ce qu'un commerce occupe de sa propre bande : presque tout, jamais tout. */
export const PART_COMMERCE = [0.75, 1];

/**
 * La surface d'un commerce, déduite de la géométrie du bâtiment.
 *
 * La bande commerciale, c'est la somme des façades multipliée par la
 * profondeur — moins le carré d'angle, compté deux fois quand un commerce
 * tourne le coin (huit mètres sur une rue et vingt sur l'autre ne font pas
 * vingt-huit mètres de boutique en enfilade). Elle ne peut pas dépasser
 * l'emprise au sol. On la partage ensuite : au prorata de la vitrine lue
 * quand on l'a, sinon par le nombre de vitrines du bâtiment.
 *
 * @param {{emprise_m2:number, facades:{longueur_m:number}[], commerces?:number, vitrine_m?:number|null}} b
 * @returns {{surface:[number,number], bande_m2:[number,number], part:number}|null}
 */
export function surfaceCommerciale({ emprise_m2, facades = [], commerces = 1, vitrine_m = null }) {
  const facade = facades.reduce((t, f) => t + (f.longueur_m || 0), 0);
  if (!(emprise_m2 > 0) || !(facade > 0)) return null;
  const angles = Math.max(0, facades.length - 1);
  const bande = PROFONDEUR_COMMERCE_M.map((d) => Math.min(emprise_m2, Math.max(d * d, facade * d - angles * d * d)));
  // La vitrine lue rapportée à la façade mesurée. Jamais moins d'un quart :
  // une devanture étroite peut ouvrir sur un local profond.
  const part = vitrine_m > 0 ? Math.max(0.25, Math.min(1, vitrine_m / facade)) : 1 / Math.max(1, commerces);
  return {
    surface: [Math.round(bande[0] * part * PART_COMMERCE[0]), Math.round(bande[1] * part * PART_COMMERCE[1])],
    bande_m2: [Math.round(bande[0]), Math.round(bande[1])],
    part: Math.round(part * 100) / 100,
  };
}

// --- Géométrie, dans un plan local ------------------------------------------

/** Le facteur de conversion des longitudes en mètres à cette latitude. */
const k = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);
/** Un point { lat, lon } dans un plan métrique local, autour d'une origine. */
const plan = (p, o) => ({ x: (p.lon - o.lon) * k(o.lat), y: (p.lat - o.lat) * 110540 });
const norme = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * L'aire d'un polygone en mètres carrés (formule du lacet, dans le plan local).
 * @param {{lat:number, lon:number}[]} anneau
 */
export function aireDuPolygone(anneau) {
  if (!Array.isArray(anneau) || anneau.length < 3) return 0;
  const o = anneau[0];
  const pts = anneau.map((p) => plan(p, o));
  // Un anneau OSM est fermé (le dernier point répète le premier) : on l'ouvre.
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();
  let deux = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    deux += a.x * b.y - b.x * a.y;
  }
  return Math.abs(deux) / 2;
}

/** Le point est-il dans le polygone ? (lancer de rayon) */
export function dansLePolygone(p, anneau) {
  if (!Array.isArray(anneau) || anneau.length < 3) return false;
  const o = anneau[0];
  const q = plan(p, o);
  const pts = anneau.map((x) => plan(x, o));
  let dedans = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    const coupe = a.y > q.y !== b.y > q.y && q.x < ((b.x - a.x) * (q.y - a.y)) / (b.y - a.y || 1e-9) + a.x;
    if (coupe) dedans = !dedans;
  }
  return dedans;
}

/** L'angle d'un segment, en degrés, ramené à [0, 180) : une droite n'a pas de sens. */
const capDuSegment = (a, b) => ((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI + 180) % 180;
/** L'écart entre deux caps, en degrés, au plus 90. */
const ecartDeCap = (a, b) => { const d = Math.abs(a - b) % 180; return d > 90 ? 180 - d : d; };

/** La distance d'un point à un segment, dans le plan local. */
function distanceAuSegmentPlan(q, a, b) {
  const bx = b.x - a.x, by = b.y - a.y;
  const l2 = bx * bx + by * by;
  const t = l2 ? Math.max(0, Math.min(1, ((q.x - a.x) * bx + (q.y - a.y) * by) / l2)) : 0;
  return Math.hypot(q.x - (a.x + t * bx), q.y - (a.y + t * by));
}

/**
 * Les façades d'un bâtiment : pour chaque rue passée, la longueur des côtés
 * du polygone qui la regardent — assez près et à peu près parallèles.
 *
 * @param {{lat:number, lon:number}[]} anneau - le contour du bâtiment
 * @param {{nom:string, trace:number[][][]}[]} rues - les rues, tracés OSM ([lat, lon])
 * @returns {{rue:string, longueur_m:number}[]} la plus longue d'abord
 */
export function facadesDe(anneau, rues) {
  if (!Array.isArray(anneau) || anneau.length < 3) return [];
  const o = anneau[0];
  const pts = anneau.map((p) => plan(p, o));
  if (pts.length > 1 && pts[0].x === pts[pts.length - 1].x && pts[0].y === pts[pts.length - 1].y) pts.pop();

  // Les segments de chaque rue, dans le même plan.
  const voies = (rues || [])
    .map((r) => ({
      nom: r.nom,
      segments: (r.trace || []).flatMap((troncon) =>
        troncon.slice(1).map((p, i) => [plan({ lat: troncon[i][0], lon: troncon[i][1] }, o), plan({ lat: p[0], lon: p[1] }, o)])
      ),
    }))
    .filter((v) => v.nom && v.segments.length);

  const par = new Map();
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const longueur = norme(a, b);
    if (longueur < FACADE_MIN_M) continue;
    const milieu = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const capCote = capDuSegment(a, b);

    // La rue la plus proche de ce côté, parmi celles qui lui sont parallèles.
    let meilleure = null;
    for (const v of voies) {
      for (const [s1, s2] of v.segments) {
        const d = distanceAuSegmentPlan(milieu, s1, s2);
        if (d > DISTANCE_FACADE_M) continue;
        if (ecartDeCap(capCote, capDuSegment(s1, s2)) > ECART_ANGLE_MAX) continue;
        if (!meilleure || d < meilleure.d) meilleure = { nom: v.nom, d };
      }
    }
    if (!meilleure) continue;
    par.set(meilleure.nom, (par.get(meilleure.nom) || 0) + longueur);
  }

  return [...par.entries()]
    .map(([rue, longueur]) => ({ rue: joliNomDeRue(rue) || rue, longueur_m: Math.round(longueur) }))
    .filter((f) => f.longueur_m >= Math.round(FACADE_MIN_M))
    .sort((a, b) => b.longueur_m - a.longueur_m);
}

// --- OpenStreetMap ----------------------------------------------------------

const requete = (lat, lon, rayon) => `[out:json][timeout:60];
(
  way(around:${rayon},${lat},${lon})["building"];
  relation(around:${rayon},${lat},${lon})["building"];
)->.bati;
.bati out geom qt;
way(around:${Math.max(rayon, 60)},${lat},${lon})["highway"]["name"]->.voies;
.voies out geom qt;
(
  nwr(around:${rayon},${lat},${lon})["shop"];
  nwr(around:${rayon},${lat},${lon})["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|pharmacy|bank|bureau_de_change)$"];
)->.vitrines;
.vitrines out center qt;`;

// Le même travail pour toute une rue : Overpass accepte une polyligne dans
// `around`, on lui donne le tracé et il rend d'un coup les bâtiments, les
// voies et les vitrines du linéaire. Une requête par rue au lieu d'une par
// commerce — cinquante fois moins, et le serveur public y survit.
const requeteRue = (points, rayon) => {
  const liste = points.map((p) => `${p.lat.toFixed(6)},${p.lon.toFixed(6)}`).join(',');
  return `[out:json][timeout:120];
(
  way(around:${rayon},${liste})["building"];
  relation(around:${rayon},${liste})["building"];
)->.bati;
.bati out geom qt;
way(around:${Math.max(rayon, 60)},${liste})["highway"]["name"]->.voies;
.voies out geom qt;
(
  nwr(around:${rayon},${liste})["shop"];
  nwr(around:${rayon},${liste})["amenity"~"^(restaurant|cafe|bar|pub|fast_food|ice_cream|pharmacy|bank|bureau_de_change)$"];
)->.vitrines;
.vitrines out center qt;`;
};

/** Interroge Overpass, un serveur après l'autre. */
async function interroger(corps) {
  let derniere = null;
  for (const url of SERVEURS) {
    try {
      const r = await fetch(url, { method: 'POST', body: `data=${encodeURIComponent(corps)}`, headers: ENTETES, signal: AbortSignal.timeout(60000) });
      const texte = await r.text();
      if (!r.ok || texte.startsWith('<')) { derniere = new Error(`Overpass a répondu ${r.status}.`); continue; }
      return JSON.parse(texte).elements || [];
    } catch (e) {
      derniere = e;
    }
  }
  throw new ErreurSource(`OpenStreetMap n'a pas répondu (${derniere?.message || 'sans détail'}).`, { service: 'OpenStreetMap', classe: 'passagere' });
}

/** Le contour d'un élément Overpass, en { lat, lon }, ou null. */
const contourDe = (e) => {
  if (Array.isArray(e.geometry) && e.geometry.length >= 3) return e.geometry.map((p) => ({ lat: p.lat, lon: p.lon }));
  // Une relation : le plus grand anneau extérieur.
  const exts = (e.members || []).filter((m) => m.role === 'outer' && Array.isArray(m.geometry) && m.geometry.length >= 3);
  if (!exts.length) return null;
  const grand = exts.sort((a, b) => b.geometry.length - a.geometry.length)[0];
  return grand.geometry.map((p) => ({ lat: p.lat, lon: p.lon }));
};

const centreDe = (e) => (e.center ? { lat: e.center.lat, lon: e.center.lon } : e.lat != null ? { lat: e.lat, lon: e.lon } : null);

/**
 * Trie les éléments Overpass en bâtiments, rues et vitrines.
 * Séparé de l'appel réseau pour se tester sans lui.
 */
export function trier(elements) {
  const batiments = [];
  const rues = new Map();
  const vitrines = [];
  for (const e of elements || []) {
    const t = e.tags || {};
    if (t.building && (e.type === 'way' || e.type === 'relation')) {
      const anneau = contourDe(e);
      if (anneau) batiments.push({ id: `${e.type}/${e.id}`, anneau, tags: t });
      continue;
    }
    if (t.highway && t.name && Array.isArray(e.geometry)) {
      const trace = rues.get(t.name) || [];
      trace.push(e.geometry.map((p) => [p.lat, p.lon]));
      rues.set(t.name, trace);
      continue;
    }
    if (t.shop || t.amenity) {
      const c = centreDe(e);
      if (c) vitrines.push({ ...c, nom: t.name || null, type: t.shop || t.amenity });
    }
  }
  return { batiments, rues: [...rues].map(([nom, trace]) => ({ nom, trace })), vitrines };
}

/**
 * Les éléments OSM le long d'une rue, en une seule requête : à passer ensuite
 * à `mesurerBatiment` pour chaque commerce, sans autre appel réseau.
 *
 * @param {number[][][]} trace - les tronçons de la rue, en [lat, lon]
 * @param {{rayon?:number, pas_max?:number}} [opts]
 */
export async function elementsDeLaRue(trace, { rayon = 25, pas_max = 300 } = {}) {
  const points = (trace || []).flat().map(([lat, lon]) => ({ lat, lon }));
  if (!points.length) return [];
  // Une avenue peut avoir mille points : on en garde assez pour couvrir le
  // linéaire, pas assez pour faire une requête d'un mégaoctet.
  const pas = Math.max(1, Math.ceil(points.length / pas_max));
  return interroger(requeteRue(points.filter((_, i) => i % pas === 0), rayon));
}

/**
 * Le bâtiment qui porte un point, mesuré : son emprise, ses façades, le
 * nombre de vitrines qu'il abrite, et la surface qu'on peut en déduire.
 *
 * @param {{lat:number, lon:number}} point
 * @param {{rayon?:number, elements?:object[]}} [opts] - `elements` remplace l'appel réseau (tests)
 * @returns {Promise<object|null>} null si aucun bâtiment ne porte ni n'entoure le point
 */
export async function mesurerBatiment(point, { rayon = 25, elements = null } = {}) {
  if (!(Number(point?.lat) && Number(point?.lon))) return null;
  const bruts = elements || (await interroger(requete(point.lat, point.lon, rayon)));
  const { batiments, rues, vitrines } = trier(bruts);
  if (!batiments.length) return null;

  // Celui qui contient le point ; sinon le plus proche par son centre, ce qui
  // arrive quand la vitrine est posée sur le trottoir.
  const dedans = batiments.find((b) => dansLePolygone(point, b.anneau));
  const choisi = dedans || batiments
    .map((b) => {
      const o = b.anneau[0];
      const q = plan(point, o);
      const c = b.anneau.reduce((acc, p) => { const m = plan(p, o); return { x: acc.x + m.x / b.anneau.length, y: acc.y + m.y / b.anneau.length }; }, { x: 0, y: 0 });
      return { b, d: Math.hypot(q.x - c.x, q.y - c.y) };
    })
    .sort((a, b) => a.d - b.d)[0]?.b;
  if (!choisi) return null;

  const aire = Math.round(aireDuPolygone(choisi.anneau));
  const facades = facadesDe(choisi.anneau, rues);
  const dans = vitrines.filter((v) => dansLePolygone(v, choisi.anneau));
  // Au moins celle qu'on regarde, même si OSM ne l'a pas encore posée.
  const commerces = Math.max(1, dans.length);
  const niveaux = Number(choisi.tags['building:levels']) || null;

  const part = surfaceCommerciale({ emprise_m2: aire, facades, commerces });

  return {
    source: 'OpenStreetMap',
    batiment_id: choisi.id,
    contient_le_point: !!dedans,
    emprise_m2: aire,
    niveaux,
    facades,
    facade_totale_m: facades.reduce((t, f) => t + f.longueur_m, 0),
    angle: facades.length > 1,
    commerces_dans_le_batiment: commerces,
    vitrines_relevees: dans.length,
    bande_commerciale_m2: part?.bande_m2 || null,
    surface_estimee: part?.surface || null,
    lu_le: new Date().toISOString(),
  };
}
