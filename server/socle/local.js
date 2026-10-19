// L'identifiant de local (18 oct. 2026, lot 1 de la boîte à outils de Haka, fondation F1).
//
// Une adresse devient un identifiant unique, `L-<identifiant BAN>`, rattaché à ce dont les outils ont
// besoin : le point, la commune, la parcelle cadastrale, le tronçon de rue, l'IRIS et le carreau INSEE
// de 200 m. Le tout est gardé (entité LocalKlocka) : une adresse ne se résout qu'une fois, et les outils
// reçoivent l'identifiant, plus l'adresse brute.
//
// Sources : BAN (géocodage) ; Géoplateforme de l'IGN en WFS (data.geopf.fr) pour la parcelle
// (CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle), l'IRIS (STATISTICALUNITS.IRIS:contours_iris), le
// carreau (INSEE.FILOSOFI.INDICATORS:carreaux_200m) et le tronçon (BDTOPO_V3:troncon_de_route). Couches
// vérifiées le 18 oct. 2026 sur un point de Cannes. Chaque rattachement passe par l'interrupteur de sa
// source : coupée ou en panne, la case reste vide, le reste se résout.

import db, { Records } from '../db.js';
import { resoudreAdresse } from '../adresse-ban.js';
import { boiteDe } from '../kzoning-insee.js';
import { viaSource } from './registre-sources.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 45000;
const ENTITE = 'LocalKlocka';
const CACHE_JOURS = 90;
// Version 2 (19 oct. 2026) : la parcelle vient du fichier de l'administration quand il porte l'adresse.
const VERSION = 2;

const COUCHES = {
  parcelle: 'CADASTRALPARCELS.PARCELLAIRE_EXPRESS:parcelle',
  iris: 'STATISTICALUNITS.IRIS:contours_iris',
  carreau: 'INSEE.FILOSOFI.INDICATORS:carreaux_200m',
  troncon: 'BDTOPO_V3:troncon_de_route',
};

// --- La géométrie, pure ---------------------------------------------------------------------------

/** Pure : un point { lon, lat } dans un anneau [[lon, lat]…]. */
export function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Pure : un point dans un Polygon ou un MultiPolygon GeoJSON (trous compris). */
export function dansGeometrie(point, g) {
  const polygones = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
  return polygones.some((anneaux) => anneaux.length && dansAnneau(point.lon, point.lat, anneaux[0]) && !anneaux.slice(1).some((t) => dansAnneau(point.lon, point.lat, t)));
}

/** Pure : la distance en mètres d'un point à un segment (approximation plane, juste à quelques centaines de mètres). */
function distanceSegment(p, a, b) {
  const kx = 111320 * Math.cos((p.lat * Math.PI) / 180);
  const ky = 110540;
  const ax = (a[0] - p.lon) * kx; const ay = (a[1] - p.lat) * ky;
  const bx = (b[0] - p.lon) * kx; const by = (b[1] - p.lat) * ky;
  const dx = bx - ax; const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/** Pure : la distance d'un point à une ligne GeoJSON (LineString ou MultiLineString). */
export function distanceLigne(point, g) {
  const lignes = g?.type === 'MultiLineString' ? g.coordinates : g?.type === 'LineString' ? [g.coordinates] : [];
  let min = Infinity;
  for (const l of lignes) for (let i = 1; i < l.length; i++) min = Math.min(min, distanceSegment(point, l[i - 1], l[i]));
  return Number.isFinite(min) ? Math.round(min) : null;
}

const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Les types de voie, en toutes lettres ou abrégés comme dans la BD TOPO (« R D'ANTIBES », « AV JEAN MEDECIN »).
const TYPES_VOIE = new Set(['r', 'rue', 'av', 'ave', 'avenue', 'bd', 'bld', 'boulevard', 'pl', 'place', 'crs', 'cours', 'qu', 'quai', 'all', 'allee', 'ch', 'chemin', 'imp', 'impasse', 'rte', 'route', 'sq', 'square', 'pas', 'passage', 'esp', 'esplanade', 'prom', 'promenade', 'mte', 'montee', 'tra', 'traverse', 'car', 'carrefour', 'rle', 'ruelle', 'fg', 'faubourg']);
const ARTICLES = new Set(['d', 'de', 'du', 'des', 'la', 'le', 'les', 'l']);

/** Pure : le nom propre d'une voie, sans numéro, type ni article : « 45 rue d'Antibes » et « R D'ANTIBES » donnent « antibes ». */
export function nomDeVoie(rue) {
  const mots = sansAccent(rue).split(' ').filter(Boolean);
  while (mots.length && /^\d+$|^(bis|ter|quater)$/.test(mots[0])) mots.shift();
  while (mots.length > 1 && TYPES_VOIE.has(mots[0])) mots.shift();
  return mots.filter((m) => !ARTICLES.has(m)).join(' ');
}

/** Pure : la distance d'un point au bord d'un polygone GeoJSON (0 s'il est dedans). */
export function distancePolygone(point, g) {
  if (dansGeometrie(point, g)) return 0;
  const polygones = g?.type === 'MultiPolygon' ? g.coordinates : g?.type === 'Polygon' ? [g.coordinates] : [];
  const bords = polygones.map((anneaux) => anneaux[0]).filter(Boolean);
  return distanceLigne(point, { type: 'MultiLineString', coordinates: bords });
}

/**
 * Pure : la parcelle de l'adresse. Celle qui contient le point (la plus petite, si plusieurs se
 * recouvrent) ; sinon la plus proche à 25 m au plus : le point de la BAN tombe souvent sur la chaussée.
 */
export function choisirParcelle(features, point) {
  const x = features
    .map((f) => ({ f, d: distancePolygone(point, f.geometry) }))
    .filter((c) => c.d != null && c.d <= 25)
    .sort((a, b) => a.d - b.d || (a.f.properties?.contenance ?? Infinity) - (b.f.properties?.contenance ?? Infinity))[0];
  if (!x) return null;
  const q = x.f.properties || {};
  return { idu: q.idu, section: q.section, numero: q.numero, contenance: q.contenance ?? null, code_insee: q.code_insee || null, distance_m: x.d };
}

/** Pure : l'IRIS qui contient le point. */
export function choisirIris(features, point) {
  const f = features.find((x) => dansGeometrie(point, x.geometry));
  const q = f?.properties;
  return q ? { code_iris: q.code_iris, nom_iris: q.nom_iris || null, type_iris: q.type_iris || null } : null;
}

/** Pure : le carreau de 200 m qui contient le point, avec ses deux chiffres de tête. */
export function choisirCarreau(features, point) {
  const f = features.find((x) => dansGeometrie(point, x.geometry)) || null;
  const q = f?.properties;
  return q ? { id: q.id_inspire, individus: q.ind ?? null, menages: q.men ?? null } : null;
}

/**
 * Pure : le tronçon de rue de l'adresse. Le plus proche parmi ceux qui portent le nom de la rue ; à
 * défaut, le plus proche, à 60 m au plus. Les tronçons fictifs ne comptent pas.
 */
export function choisirTroncon(features, point, rue = '') {
  const nom = nomDeVoie(rue);
  const candidats = features
    .filter((f) => !f.properties?.fictif)
    .map((f) => {
      const q = f.properties || {};
      const noms = [q.nom_collaboratif_gauche, q.nom_collaboratif_droite].filter(Boolean);
      return { f, q, noms, d: distanceLigne(point, f.geometry), memeRue: !!nom && noms.some((n) => nomDeVoie(n) === nom) };
    })
    .filter((c) => c.d != null)
    .sort((a, b) => Number(b.memeRue) - Number(a.memeRue) || a.d - b.d);
  const c = candidats[0];
  if (!c || (!c.memeRue && c.d > 60)) return null;
  return { cleabs: c.q.cleabs, nom: c.noms[0] || null, importance: c.q.importance ?? null, distance_m: c.d, meme_rue: c.memeRue };
}

/** Pure : l'identifiant d'un local à partir de l'adresse résolue (BAN), ou de la parcelle à défaut. */
export function identifiantLocal(adresse, parcelle = null) {
  if (adresse?.ban_id) return `L-${adresse.ban_id}`;
  if (parcelle?.idu) return `L-P${parcelle.idu}`;
  return null;
}

// --- La parcelle de l'adresse, par le fichier de l'administration (19 oct. 2026) --------------------------------
// Le point de la BAN tombe souvent sur la parcelle voisine : sur 60 adresses comparées à Data-B Foncier, 16 sur
// 18 écarts venaient de là (« 211 Promenade des Anglais » : NE 0175 au lieu de NE 0174). Le fichier des locaux des
// personnes morales (entrepot_pm) porte l'adresse de chaque local : le numéro et le nom de la voie y désignent la
// parcelle sans passer par un point.

/** Pure : le numéro et son indice, d'après le numéro d'adresse de la BAN (« 211 », « 211 bis »). */
export function numeroEtIndice(numero) {
  const m = String(numero || '').toLowerCase().replace(/\s+/g, '').match(/^(\d{1,4})(bis|ter|quater|[a-z])?$/);
  return m ? { numero: m[1], indice: m[2] ? ({ bis: 'B', ter: 'T', quater: 'Q' }[m[2]] || m[2].toUpperCase()) : null } : null;
}

/**
 * Pure : la parcelle qui porte l'adresse, parmi les lignes du fichier (commune, numéro) déjà lues. Le nom de la voie
 * départage ; à égalité, la parcelle qui compte le plus de locaux à ce numéro, puis celle du point si elle en fait partie.
 * @param {Array<{section, plan, voie, indice, n}>} lignes
 */
export function parcelleDesLignes(lignes, rue, { indice = null, parcelleDuPoint = null } = {}) {
  const nom = nomDeVoie(rue);
  const memeVoie = (lignes || []).filter((l) => nom && nomDeVoie(l.voie) === nom);
  if (!memeVoie.length) return null;
  const parParcelle = new Map();
  for (const l of memeVoie) {
    const k = `${l.section}${l.plan}`;
    const e = parParcelle.get(k) || { section: l.section, plan: l.plan, n: 0, indice: false };
    e.n += l.n || 1;
    if (indice && String(l.indice || '').toUpperCase() === indice) e.indice = true;
    parParcelle.set(k, e);
  }
  const classees = [...parParcelle.values()].sort((a, b) => Number(b.indice) - Number(a.indice) || b.n - a.n);
  const duPoint = parcelleDuPoint ? classees.find((c) => `${c.section}${c.plan}` === `${parcelleDuPoint.section}${parcelleDuPoint.numero}`) : null;
  // Si la parcelle du point fait partie des candidates à égalité de locaux, on la garde ; sinon la mieux fournie.
  const meilleure = duPoint && duPoint.n >= classees[0].n && Number(duPoint.indice) >= Number(classees[0].indice) ? duPoint : classees[0];
  return { section: meilleure.section, plan: meilleure.plan, locaux: meilleure.n, autres: classees.filter((c) => c !== meilleure).slice(0, 3).map((c) => ({ section: c.section, plan: c.plan, locaux: c.n })) };
}

/** Lit entrepot_pm (si le jeu est importé pour cette commune) et rend la parcelle de l'adresse, ou null. */
export function parcelleParAdresseDgfip({ code_insee, numero, rue }, parcelleDuPoint = null) {
  const ni = numeroEtIndice(numero);
  if (!ni || !code_insee || !rue) return null;
  try {
    const lignes = db.prepare('SELECT section, plan, voie, indice, count(*) AS n FROM entrepot_pm WHERE commune = ? AND numero = ? GROUP BY section, plan, voie, indice').all(code_insee, ni.numero);
    const r = parcelleDesLignes(lignes, rue, { indice: ni.indice, parcelleDuPoint });
    return r ? { ...r, idu: `${code_insee}000${r.section}${r.plan}` } : null;
  } catch { return null; }
}

// --- Le réseau ------------------------------------------------------------------------------------

async function wfs(couche, point, rayon_m) {
  const b = boiteDe(point.lat, point.lon, rayon_m);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: couche,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '200',
    BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`Géoplateforme ${r.status}`);
  return (await r.json()).features || [];
}

const cleAdresse = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Le local d'une adresse : résolu une fois, gardé ensuite. `forcer` relit tout (une adresse corrigée).
 * @returns {Promise<{ok: true, local: object, du_cache?: boolean} | {ok: false, error: string}>}
 */
export async function resoudreLocal(texte, { forcer = false } = {}) {
  const cle = cleAdresse(texte);
  if (!cle) return { ok: false, error: 'Adresse vide.' };
  if (!forcer) {
    const garde = Records.filter(ENTITE, { cle_adresse: cle })[0];
    if (garde && garde.version === VERSION && Date.now() - Date.parse(garde.resolu_le) < CACHE_JOURS * 86400000) return { ok: true, local: garde, du_cache: true };
  }
  const ban = await viaSource('ban', () => resoudreAdresse(texte));
  const adresse = ban.valeur;
  if (!adresse) return { ok: false, error: ban.coupee ? 'La Base Adresse Nationale est coupée.' : `Adresse introuvable dans la Base Adresse Nationale : « ${String(texte).slice(0, 80)} ».` };
  const point = { lat: adresse.lat, lon: adresse.lon };

  const [parcelle, iris, carreau, troncon] = await Promise.all([
    viaSource('cadastre_ign', async () => choisirParcelle(await wfs(COUCHES.parcelle, point, 40), point)),
    viaSource('iris_ign', async () => choisirIris(await wfs(COUCHES.iris, point, 30), point)),
    viaSource('insee_filosofi', async () => choisirCarreau(await wfs(COUCHES.carreau, point, 30), point)),
    viaSource('bdtopo', async () => choisirTroncon(await wfs(COUCHES.troncon, point, 80), point, adresse.rue)),
  ]);

  // La parcelle de l'adresse : celle du fichier de l'administration quand il la donne, le point de la BAN sinon.
  const dgfip = parcelleParAdresseDgfip({ code_insee: adresse.code_insee, numero: adresse.numero, rue: adresse.rue }, parcelle.valeur);
  if (dgfip && dgfip.idu !== parcelle.valeur?.idu) {
    parcelle.valeur = { idu: dgfip.idu, section: dgfip.section, numero: dgfip.plan, contenance: null, code_insee: adresse.code_insee, origine: 'adresse_dgfip', locaux: dgfip.locaux, autres: dgfip.autres, du_point: parcelle.valeur ? { idu: parcelle.valeur.idu } : null };
  } else if (parcelle.valeur) {
    parcelle.valeur = { ...parcelle.valeur, origine: dgfip ? 'adresse_dgfip' : 'point_ban' };
  }
  const id_local = identifiantLocal(adresse, parcelle.valeur);
  const manques = [['parcelle', parcelle], ['iris', iris], ['carreau', carreau], ['troncon', troncon]]
    .filter(([, r]) => !r.valeur).map(([k, r]) => ({ cle: k, raison: r.coupee ? 'source coupée' : r.panne || 'rien à cet endroit' }));
  const local = {
    id_local,
    cle_adresse: cle,
    adresse: { label: adresse.label, numero: adresse.numero || null, rue: adresse.rue || null, code_postal: adresse.code_postal || null, ville: adresse.ville || null, code_insee: adresse.code_insee || null, departement: String(adresse.code_postal || '').slice(0, 2) || null, ban_id: adresse.ban_id || null, precision: adresse.type || null },
    point,
    parcelle: parcelle.valeur,
    iris: iris.valeur,
    carreau: carreau.valeur,
    troncon: troncon.valeur,
    manques,
    version: VERSION,
    resolu_le: new Date().toISOString(),
  };
  // Le même local sous une autre écriture de l'adresse : on le met à jour plutôt que de le doubler.
  const meme = id_local ? Records.filter(ENTITE, { id_local })[0] : null;
  const record = meme ? Records.update(ENTITE, meme.id, local) : Records.create(ENTITE, local);
  return { ok: true, local: record };
}

/** Un local déjà résolu, par son identifiant. */
export const localParId = (id_local) => Records.filter(ENTITE, { id_local })[0] || null;
