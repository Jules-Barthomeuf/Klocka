// Valeur locative : la fourchette de loyer au m² d'une adresse, et la carte
// des quartiers autour, en quatre classes.
//
// La donnée vient de Data-B (module « Valeurs locatives », déjà branché dans
// data-b.js) : la rue, le quartier et la ville, chacun en fourchette basse et
// haute, en euros HT HC par m² et par an. UNE RECHERCHE CONSOMME PROBABLEMENT
// UN CRÉDIT ; data-b.js garde chaque résultat trente jours par adresse, et
// rouvrir une recherche passée ne redemande jamais rien à Data-B.
//
// La carte se colore par IRIS, les quartiers statistiques de l'INSEE, dont la
// Géoplateforme sert les contours sans clé. Quatre classes : très élevée,
// élevée, moyenne, très faible. Un quartier déjà recherché se classe par sa
// vraie fourchette, comparée à celle de la ville. Les autres se classent par
// un INDICE DE POSITION, calculé ici à partir de deux signaux ouverts qui font
// le loyer commercial : la densité de commerces (OpenStreetMap) et le niveau
// de vie des habitants (INSEE Filosofi). L'indice classe, il ne chiffre pas :
// aucun euro n'est inventé pour un quartier que Data-B n'a pas lu, et l'écran
// dit d'où vient chaque couleur.

import { Records } from './db.js';
import { valeurLocative, resoudreAdresse, dataBConfigure } from './data-b.js';
import { boiteDe, chercherCarreaux } from './kzoning-insee.js';
import { interroger } from './kzoning-commerces.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'STATISTICALUNITS.IRIS:contours_iris';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 90000;
const CACHE_IRIS = 'CacheIrisCommune';
const CACHE_INDICE = 'CacheIndiceLoyers';
// Les IRIS bougent au rythme des recensements : un cache long ne coûte rien.
const CACHE_IRIS_JOURS = 180;
const CACHE_INDICE_JOURS = 30;
const RAYON_SECTEURS = 3000;
const RAYON_INDICE_MAX = 8000;

export const NIVEAUX = ['tres_elevee', 'elevee', 'moyenne', 'tres_faible'];
export const LIBELLES_NIVEAU = {
  tres_elevee: 'Très élevée',
  elevee: 'Élevée / intermédiaire',
  moyenne: 'Moyenne / faible',
  tres_faible: 'Très faible',
};
// Les parts de chaque classe, du plus cher au moins cher : un cœur de ville
// étroit, une couronne, le gros de la commune, la périphérie.
const PARTS = { tres_elevee: 0.1, elevee: 0.2, moyenne: 0.45 };

/** Un nom sans accent, sans casse, sans ponctuation : pour comparer. */
export const normaliser = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── La géométrie, juste ce qu'il faut ───────────────────────────────────────

function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Le point est-il dans la géométrie ? Les trous comptent. */
export function contient(geometry, lon, lat) {
  const polys = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  for (const anneaux of polys) {
    if (!anneaux?.length || !dansAnneau(lon, lat, anneaux[0])) continue;
    if (anneaux.slice(1).some((trou) => dansAnneau(lon, lat, trou))) continue;
    return true;
  }
  return false;
}

/** L'aire en km², par la formule du lacet, avec la longitude ramenée en mètres. */
export function aireKm2(geometry) {
  const polys = geometry?.type === 'MultiPolygon' ? geometry.coordinates : geometry?.type === 'Polygon' ? [geometry.coordinates] : [];
  let total = 0;
  for (const anneaux of polys) {
    anneaux.forEach((anneau, k) => {
      const latMoy = anneau.reduce((s, p) => s + p[1], 0) / anneau.length;
      const kx = 111320 * Math.cos((latMoy * Math.PI) / 180); const ky = 111320;
      let a = 0;
      for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) a += anneau[j][0] * kx * anneau[i][1] * ky - anneau[i][0] * kx * anneau[j][1] * ky;
      total += (k === 0 ? 1 : -1) * Math.abs(a) / 2;
    });
  }
  return total / 1e6;
}

function centreDe(geometry) {
  const anneau = geometry?.type === 'MultiPolygon' ? geometry.coordinates?.[0]?.[0] : geometry?.coordinates?.[0];
  if (!anneau?.length) return null;
  return { lon: anneau.reduce((s, p) => s + p[0], 0) / anneau.length, lat: anneau.reduce((s, p) => s + p[1], 0) / anneau.length };
}

// ── Les classes ─────────────────────────────────────────────────────────────

/** La classe d'un quartier dont Data-B a donné la fourchette, comparée à celle de la ville. */
export function classerParValeur(q, ville) {
  if (!q || (q.basse == null && q.haute == null)) return null;
  const mid = ((q.basse ?? q.haute) + (q.haute ?? q.basse)) / 2;
  if (!ville || (ville.basse == null && ville.haute == null)) return 'moyenne';
  const vb = ville.basse ?? ville.haute; const vh = ville.haute ?? ville.basse;
  if (mid >= vh) return 'tres_elevee';
  if (mid >= (vb + vh) / 2) return 'elevee';
  if (mid >= vb) return 'moyenne';
  return 'tres_faible';
}

/** Les classes de tous les secteurs, par quantiles de l'indice. Pure. */
export function classerParIndice(scores) {
  const tries = [...scores].filter((s) => s.score != null).sort((a, b) => b.score - a.score);
  const n = tries.length;
  const bornes = [Math.round(n * PARTS.tres_elevee), Math.round(n * (PARTS.tres_elevee + PARTS.elevee)), Math.round(n * (PARTS.tres_elevee + PARTS.elevee + PARTS.moyenne))];
  const par = {};
  tries.forEach((s, i) => { par[s.code_iris] = i < bornes[0] ? 'tres_elevee' : i < bornes[1] ? 'elevee' : i < bornes[2] ? 'moyenne' : 'tres_faible'; });
  return par;
}

/**
 * L'indice de position de chaque IRIS : densité de commerces et niveau de
 * vie, chacun ramené à son rang, puis pondérés. Pure : testée sans réseau.
 * @param {Array} iris       features GeoJSON
 * @param {Array} commerces  points [lon, lat]
 * @param {Array} carreaux   features Filosofi, avec ind et ind_snv
 */
export function indiceDe(iris, commerces, carreaux) {
  const lignes = (iris || []).map((f) => {
    const g = f.geometry;
    const aire = aireKm2(g) || null;
    let n = 0;
    for (const [lon, lat] of commerces || []) if (contient(g, lon, lat)) n++;
    let ind = 0; let snv = 0;
    for (const c of carreaux || []) {
      const ctr = centreDe(c.geometry);
      if (!ctr || !contient(g, ctr.lon, ctr.lat)) continue;
      ind += Number(c.properties?.ind) || 0; snv += Number(c.properties?.ind_snv) || 0;
    }
    return { code_iris: f.properties?.code_iris, nom_iris: f.properties?.nom_iris, commerces: n, densite: aire ? n / aire : null, niveau_de_vie: ind > 0 ? Math.round(snv / ind) : null };
  });
  const rang = (cle) => {
    const avec = lignes.filter((l) => l[cle] != null).sort((a, b) => a[cle] - b[cle]);
    const r = new Map(); avec.forEach((l, i) => r.set(l.code_iris, avec.length > 1 ? i / (avec.length - 1) : 0.5));
    return r;
  };
  const rd = rang('densite'); const rn = rang('niveau_de_vie');
  for (const l of lignes) {
    const d = rd.get(l.code_iris); const v = rn.get(l.code_iris);
    l.score = d == null ? null : v == null ? d : Math.round((0.65 * d + 0.35 * v) * 1000) / 1000;
  }
  return lignes;
}

// ── Les lectures ────────────────────────────────────────────────────────────

async function irisDeLaCommune(codeInsee, lat, lon) {
  const garde = Records.filter(CACHE_IRIS, { code_insee: codeInsee })[0];
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_IRIS_JOURS * 86400000) return garde.iris;
  const b = boiteDe(lat, lon, RAYON_SECTEURS);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '1000',
    // Longitude puis latitude, comme pour les carreaux : vérifié.
    BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`La Géoplateforme a répondu ${r.status}`);
  const iris = ((await r.json()).features || [])
    .filter((f) => f.properties?.code_insee === codeInsee)
    .map((f) => ({ properties: f.properties, geometry: f.geometry }));
  if (garde) Records.update(CACHE_IRIS, garde.id, { iris, le: new Date().toISOString() });
  else Records.create(CACHE_IRIS, { code_insee: codeInsee, iris, le: new Date().toISOString() });
  return iris;
}

/** Le rayon qui couvre tous les IRIS lus, depuis le point. */
function rayonPour(iris, lat, lon) {
  let r = 1000;
  for (const f of iris) {
    const c = centreDe(f.geometry);
    if (!c) continue;
    const d = Math.hypot((c.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180), (c.lat - lat) * 111320);
    r = Math.max(r, d + 600);
  }
  return Math.min(RAYON_INDICE_MAX, Math.round(r));
}

async function indiceCommune(codeInsee, iris, lat, lon) {
  const garde = Records.filter(CACHE_INDICE, { code_insee: codeInsee })[0];
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_INDICE_JOURS * 86400000) return garde.indice;
  const rayon = rayonPour(iris, lat, lon);
  // Les commerces et ce qui vit avec eux, sans leurs étiquettes : seul le
  // point compte, et une grande ville en a des dizaines de milliers.
  const requete = `[out:json][timeout:120];(nwr(around:${rayon},${lat},${lon})["shop"];nwr(around:${rayon},${lat},${lon})["amenity"~"^(restaurant|cafe|bar|fast_food|bank|pharmacy)$"];);out center 40000;`;
  const [brut, carreaux] = await Promise.all([interroger(requete), chercherCarreaux(lat, lon, rayon)]);
  const commerces = (brut.elements || []).map((e) => [e.lon ?? e.center?.lon, e.lat ?? e.center?.lat]).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const indice = { rayon_m: rayon, commerces: commerces.length, carreaux: carreaux.length, secteurs: indiceDe(iris, commerces, carreaux), le: new Date().toISOString() };
  if (garde) Records.update(CACHE_INDICE, garde.id, { indice, le: indice.le });
  else Records.create(CACHE_INDICE, { code_insee: codeInsee, indice, le: indice.le });
  return indice;
}

/**
 * Attribue une classe à chaque IRIS. Pure : testée sans réseau.
 * @param {Array} iris        features GeoJSON de la commune
 * @param {Array} recherches  résultats Data-B déjà en base pour cette commune
 * @param {string|null} quartierIci le quartier de la recherche en cours
 * @param {object|null} indice l'indice de position de la commune
 */
export function colorerSecteurs(iris, recherches, quartierIci = null, indice = null) {
  const parQuartier = new Map();
  let ville = null;
  for (const r of recherches || []) {
    const q = r?.quartier;
    if (q?.nom && (q.basse != null || q.haute != null) && !parQuartier.has(normaliser(q.nom))) parQuartier.set(normaliser(q.nom), q);
    if (!ville && r?.ville && (r.ville.basse != null || r.ville.haute != null)) ville = r.ville;
  }
  const classes = classerParIndice(indice?.secteurs || []);
  const details = new Map((indice?.secteurs || []).map((s) => [s.code_iris, s]));
  const ici = normaliser(quartierIci);
  return (iris || []).map((f) => {
    const p = f.properties || {};
    const nom = p.nom_iris || '';
    const q = parQuartier.get(normaliser(nom));
    const d = details.get(p.code_iris);
    return {
      code_iris: p.code_iris,
      nom_iris: nom,
      basse: q?.basse ?? null,
      haute: q?.haute ?? null,
      niveau: q ? classerParValeur(q, ville) : classes[p.code_iris] || null,
      origine: q ? 'quartier' : classes[p.code_iris] ? 'indice' : null,
      commerces: d?.commerces ?? null,
      niveau_de_vie: d?.niveau_de_vie ?? null,
      ici: !!ici && normaliser(nom) === ici,
      geometry: f.geometry,
    };
  });
}

/** Les résultats déjà en base pour une commune, du plus récent au plus ancien. */
function recherchesDe(nomVille) {
  const v = normaliser(nomVille);
  return Records.list('DataBRecherche')
    .filter((x) => normaliser(x.resultat?.ville?.nom) === v)
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .map((x) => x.resultat);
}

async function carteAutour(adresse, resultat) {
  let iris = [];
  let indice = null;
  const erreurs = [];
  try { iris = await irisDeLaCommune(adresse.code_insee, adresse.lat, adresse.lon); }
  catch (e) { erreurs.push(`contours : ${e?.message || e}`); }
  if (iris.length) {
    try { indice = await indiceCommune(adresse.code_insee, iris, adresse.lat, adresse.lon); }
    catch (e) { erreurs.push(`indice : ${e?.message || e}`); }
  }
  const secteurs = colorerSecteurs(iris, recherchesDe(resultat?.ville?.nom || adresse.ville), resultat?.quartier?.nom, indice);
  return { secteurs, indice: indice ? { rayon_m: indice.rayon_m, commerces: indice.commerces, le: indice.le } : null, erreur_secteurs: erreurs.join(' ; ') || null };
}

/** Les dernières recherches, une par adresse. */
export function listerRecherches(limite = 40) {
  const vues = new Set();
  const liste = [];
  for (const x of Records.list('DataBRecherche').sort((a, b) => String(b.le).localeCompare(String(a.le)))) {
    if (!x.resultat?.rue && !x.resultat?.quartier) continue;
    if (vues.has(x.cle)) continue;
    vues.add(x.cle);
    liste.push({ id: x.id, adresse: x.adresse, le: x.le, par: x.par, rue: x.resultat.rue || null, quartier: x.resultat.quartier || null, ville: x.resultat.ville || null });
    if (liste.length >= limite) break;
  }
  return liste;
}

/** Une recherche : Data-B (ou son cache), puis la carte. */
export async function rechercher(texte, { forcer = false, user = null } = {}) {
  if (!dataBConfigure()) return { ok: false, error: 'Data-B n\'est pas configuré : DATAB_EMAIL et DATAB_MOT_DE_PASSE manquent dans .env.' };
  let adresse;
  try { adresse = await resoudreAdresse(texte); }
  catch (e) { return { ok: false, error: e.message }; }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte || '').slice(0, 80)} ».` };
  const r = await valeurLocative(texte, { forcer, user });
  if (!r.ok) return r;
  const carte = await carteAutour(adresse, r.resultat);
  const record = Records.list('DataBRecherche').filter((x) => x.adresse === adresse.label).sort((a, b) => String(b.le).localeCompare(String(a.le)))[0];
  return { ok: true, id: record?.id || null, resultat: r.resultat, point: { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, ville: adresse.ville }, ...carte };
}

/** Rouvre une recherche passée : jamais d'appel à Data-B, seulement la carte. */
export async function ouvrir(id) {
  const x = Records.get('DataBRecherche', id);
  if (!x?.resultat) return { ok: false, error: 'Cette recherche n\'existe plus.' };
  let adresse = null;
  try { adresse = await resoudreAdresse(x.adresse); } catch { /* la BAN ne répond pas : la carte se passe de point */ }
  const point = adresse ? { lat: adresse.lat, lon: adresse.lon, label: adresse.label, code_insee: adresse.code_insee, ville: adresse.ville } : null;
  const carte = adresse ? await carteAutour(adresse, x.resultat) : { secteurs: [], indice: null, erreur_secteurs: 'adresse non localisée' };
  return { ok: true, id, resultat: { ...x.resultat, du_cache: true }, point, ...carte };
}
