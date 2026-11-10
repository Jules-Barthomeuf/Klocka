// Le loyer de marché par les loyers réels (10 nov. 2026, Jules : « la méthode la plus fiable qu'on peut mettre en
// place tout de suite », d'abord pour les grandes villes).
//
// La méthode, mesurée à Lyon le 9 nov. contre 22 baux datés (docs/plans/boite-a-outils-haka.md) :
//   - les références sont des loyers payés, pas demandés : les ventes de murs occupés qui affichent leur loyer
//     (l'export Equimmox que la prospection télécharge déjà chaque nuit) et les loyers des dossiers Klocka ;
//   - loyer annuel HT HC au m², ramené à la surface du local visé (un 30 m² se loue environ 1,8 fois plus cher
//     au m² qu'un 300 m² : élasticité -0,25, mesurée sur les annonces de Lyon et d'Antibes, PAS sur des baux signés :
//     choix non testé, et c'est la seule correction) ;
//   - le cercle le plus serré qui réunit 3 références : 300 m, puis 500 m, puis 1 km (à 1 km, une rue n°1 et une
//     rue secondaire se mélangent : le rayon retenu et la distance de chaque référence sont rendus) ; publiées
//     depuis moins de 3 ans ; sinon pas de chiffre ;
//   - la moyenne simple, sans pondération par source, avec le minimum et le maximum (à 3 références, une valeur
//     aberrante tire la moyenne : l'écart min-max la montre) et la liste des références ;
//   - « au-dessus » ou « en dessous » seulement au-delà de 25 % d'écart (choix non testé ; la méthode se trompe
//     d'environ 20 % à Lyon).
// Les offres de location n'entrent pas dans le calcul : un loyer demandé est un plafond.
//
// Derrière la source « murs_occupes » du registre, coupée par défaut : conditions d'Equimmox à vérifier.

import { distanceM } from './valeur-locative-comparables.js';

export const ENTITE = 'LoyerReel';
export const ELASTICITE_SURFACE = -0.25;
export const RAYONS_M = [300, 500, 1000];
export const MIN_REFERENCES = 3;
export const AGE_MAX_ANS = 3;
export const SEUIL_VERDICT = 0.25;
/** Les loyers au m² hors de ces bornes sont des erreurs de saisie (un loyer mensuel pris pour annuel, une surface en trop). */
export const BORNES_M2 = [60, 1500];

const nombre = (v) => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Pure : une date Excel (numéro de série) ou ISO, en « AAAA-MM-JJ ». */
export function dateExcel(v) {
  const s = String(v ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const n = Number(s);
  if (!Number.isFinite(n) || n < 20000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n * 86400000)).toISOString().slice(0, 10);
}

/** Pure : « 4.83611,45.76581 » ou « [4,853939,45,727687] » (virgule décimale), en { lat, lon }. */
export function pointExcel(v) {
  const s = String(v ?? '').replace(/[[\]\s]/g, '');
  let m = s.match(/^(-?\d+\.\d+),(-?\d+\.\d+)$/);
  if (!m) {
    const v2 = s.match(/^(-?\d+),(\d+),(-?\d+),(\d+)$/);
    if (v2) m = [null, `${v2[1]}.${v2[2]}`, `${v2[3]}.${v2[4]}`];
  }
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null;
}

/**
 * Pure : les loyers réels d'un export Equimmox des annonces en vente (lireXlsx) : les commerces vendus loués qui
 * affichent leur loyer, avec une position, une surface et un loyer au m² plausible.
 */
export function referencesDeLExport(lignes, { ville = null } = {}) {
  const refs = [];
  for (const l of lignes || []) {
    if (String(l['asset class'] || '').toLowerCase() !== 'commercial') continue;
    const loyer = nombre(l.rent);
    const surface = nombre(l.surface);
    const point = pointExcel(l.coordinates);
    if (!loyer || !surface || !point || !l.ID) continue;
    const loyer_m2 = loyer / surface;
    if (loyer_m2 < BORNES_M2[0] || loyer_m2 > BORNES_M2[1]) continue;
    refs.push({
      id: `equimmox:${l.ID}`, source: 'murs_occupes', point, surface, loyer_annuel: Math.round(loyer), loyer_m2: Math.round(loyer_m2),
      adresse: l.address || null, ville: l.city || ville, publie_le: dateExcel(l['publication date']), retire_le: dateExcel(l.deleted_date), url: l.url || null,
    });
  }
  return refs;
}

/** Pure : un loyer au m² ramené d'une surface à une autre. */
export const ramenerSurface = (loyer_m2, de, vers) => (de && vers ? loyer_m2 * (vers / de) ** ELASTICITE_SURFACE : loyer_m2);

/** Pure : le même local publié deux fois (à 60 m, surface à 3 m², loyer à 3 %) ne compte qu'une fois. */
export function sansDoublons(refs) {
  const gardees = [];
  for (const r of refs) {
    const double = gardees.some((g) => distanceM(g.point, r.point) <= 60 && Math.abs(g.surface - r.surface) <= 3 && Math.abs(g.loyer_m2 - r.loyer_m2) <= 0.03 * r.loyer_m2);
    if (!double) gardees.push(r);
  }
  return gardees;
}

/** Pure : le verdict d'un loyer au m² face à la valeur de marché. */
export function verdict(loyer_m2, valeur, seuil = SEUIL_VERDICT) {
  if (!loyer_m2 || !valeur) return null;
  const ecart = loyer_m2 / valeur - 1;
  return { ecart_pct: Math.round(ecart * 100), verdict: ecart > seuil ? 'au-dessus' : ecart < -seuil ? 'en dessous' : 'dans la moyenne' };
}

/**
 * Pure : le loyer de marché d'un local.
 * @param {{lat, lon, surface?, loyer_m2?}} cible  le local (sa surface ramène les références ; son loyer donne le verdict)
 * @param {Array<{point, surface, loyer_m2, publie_le?, le?, source}>} refs
 * @returns {{ valeur: number|null, min, max, n, rayon_m, references, verdict, raison? }}
 */
export function loyerDeMarche(cible, refs, { maintenant = Date.now(), rayons = RAYONS_M, min = MIN_REFERENCES } = {}) {
  const limite = maintenant - AGE_MAX_ANS * 365.25 * 86400000;
  const toutes = sansDoublons((refs || [])
    .filter((r) => r.loyer_m2 > 0 && r.point && (!r.surface || r.surface > 0))
    .filter((r) => { const le = r.publie_le || r.le; return !le || Date.parse(le) >= limite; })
    .map((r) => ({ ...r, distance_m: distanceM(cible, r.point) }))
    .filter((r) => r.distance_m != null))
    .sort((a, b) => a.distance_m - b.distance_m);
  // Le cercle le plus serré qui en réunit assez ; à défaut, le plus large.
  const rayon = rayons.find((x) => toutes.filter((r) => r.distance_m <= x).length >= min) ?? rayons[rayons.length - 1];
  const proches = toutes.filter((r) => r.distance_m <= rayon);
  const references = proches.map((r) => ({
    source: r.source, adresse: r.adresse?.ligne ?? r.adresse ?? null, surface: r.surface || null, loyer_m2: Math.round(r.loyer_m2),
    loyer_m2_ramene: Math.round(ramenerSurface(r.loyer_m2, r.surface, cible.surface)), distance_m: r.distance_m, le: r.publie_le || r.le || null, url: r.url || null,
  }));
  if (references.length < min) {
    return { valeur: null, min: null, max: null, n: references.length, rayon_m: rayon, references, verdict: null, raison: `${references.length} loyer${references.length > 1 ? 's' : ''} réel${references.length > 1 ? 's' : ''} à moins de ${rayon / 1000} km, il en faut ${min}` };
  }
  const ramenes = references.map((r) => r.loyer_m2_ramene);
  const valeur = Math.round(ramenes.reduce((s, x) => s + x, 0) / ramenes.length);
  return { valeur, min: Math.min(...ramenes), max: Math.max(...ramenes), n: references.length, rayon_m: rayon, references, verdict: verdict(cible.loyer_m2, valeur) };
}

// --- La base ----------------------------------------------------------------------------------------

/** Garde les loyers réels d'un export (une ligne par annonce, revue à chaque nuit). Rend le nombre gardé. */
export async function garderLoyersReels(refs) {
  const { Records } = await import('./db.js');
  const deja = new Map(Records.list(ENTITE).map((r) => [r.cle, r]));
  const vu_le = new Date().toISOString();
  for (const r of refs) {
    const { id, ...reste } = r;
    const ancien = deja.get(id);
    if (ancien) Records.update(ENTITE, ancien.id, { ...reste, vu_le });
    else Records.create(ENTITE, { cle: id, ...reste, vu_le });
  }
  return refs.length;
}

/** Les loyers réels gardés (les murs occupés seulement ; les loyers Klocka s'ajoutent à l'appel). */
export async function loyersReelsGardes() {
  const { Records } = await import('./db.js');
  return Records.list(ENTITE);
}
