// Les cessions de fonds de commerce autour d'une adresse, d'après le BODACC.
//
// Ce que ça apprend sur un dossier : à quel rythme les commerces changent de
// mains dans la rue, à quels prix, et pour quelles activités. Un fonds qui se
// vend cher et souvent dit un emplacement recherché ; une rue sans cession
// depuis des années dit l'inverse. C'est le complément des loyers : le loyer
// dit ce que vaut le mur, le fonds dit ce que vaut le commerce.
//
// Data-B vendait cette lecture ; elle vient en réalité du BODACC, que la DILA
// publie en open data et que ktransactions.js lit déjà commune par commune.
// Une seule chose manquait pour retrouver un rayon : le BODACC n'a pas de
// coordonnées. La Base Adresse Nationale géocode par lot, en une requête pour
// toute une commune, et le résultat se garde une semaine avec les cessions.
//
// Tout est gratuit et public. Aucun crédit n'est dépensé.

import { Records } from './db.js';
import { resoudreAdresse } from './data-b.js';
import { cessionsDeLaCommune } from './ktransactions.js';

const BAN_LOT = 'https://api-adresse.data.gouv.fr/search/csv/';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 90000;
const CACHE_GEO = 'CacheCessionsGeo';
const CACHE_JOURS = 7;
export const RAYON_DEFAUT = 250;
const ANNEES_DEFAUT = 5;
// En deçà, la Base Adresse a deviné plus que reconnu : la cession reste sans point.
const SCORE_MINIMUM = 0.5;

// Les cessions de fonds vont de mille euros à des centaines de millions : une
// holding qui change de mains fait un maximum sans rapport avec la rue. On
// borne la fourchette aux déciles, où vivent les commerces.
export function quantile(xs, q) {
  if (!xs.length) return null;
  const t = [...xs].sort((a, b) => a - b);
  const i = (t.length - 1) * q;
  const bas = Math.floor(i);
  const haut = Math.ceil(i);
  return Math.round(bas === haut ? t[bas] : t[bas] + (t[haut] - t[bas]) * (i - bas));
}

/**
 * Une cession du BODACC, sous la forme que la carte et le journal lisent.
 * Pure : testée sans réseau.
 *
 * Le BODACC nomme l'acquéreur, pas l'enseigne : c'est lui qu'on affiche en
 * tête, avec l'activité et le vendeur à côté.
 */
export function enTransaction(c) {
  return {
    id: c?.id || null,
    enseigne: c?.acquereur || null,
    activite: c?.activite || null,
    date: c?.date || null,
    adresse: [c?.adresse, c?.code_postal, c?.ville].filter(Boolean).join(' ') || null,
    prix: c?.prix ?? null,
    detail: c?.categorie || null,
    vendeur: c?.vendeur || null,
    rue: c?.rue || null,
    siret: null,
    lat: Number.isFinite(c?.lat) ? c.lat : null,
    lon: Number.isFinite(c?.lon) ? c.lon : null,
  };
}

/**
 * Ce que les transactions disent du marché : combien, à quel prix, depuis
 * quand, et pour quelles activités. Pure : testée sans réseau.
 */
export function marcheDe(transactions) {
  const prix = transactions.map((t) => t.prix).filter((p) => p > 0);
  const dates = transactions.map((t) => t.date).filter(Boolean).sort();
  const parActivite = new Map();
  for (const t of transactions) {
    const a = (t.activite || 'Non précisée').trim();
    parActivite.set(a, (parActivite.get(a) || 0) + 1);
  }
  // Le rythme : combien de ventes par an sur la période observée.
  let parAn = null;
  if (dates.length >= 2) {
    const annees = (Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 86400000);
    if (annees > 0.25) parAn = Math.round((dates.length / annees) * 10) / 10;
  }
  return {
    nombre: transactions.length,
    avec_prix: prix.length,
    // Fourchette des huit dixièmes du milieu : le prix d'un commerce de la rue,
    // pas celui de la vente exceptionnelle qui traîne dans les données.
    prix_bas: quantile(prix, 0.1),
    prix_median: quantile(prix, 0.5),
    prix_haut: quantile(prix, 0.9),
    prix_min: prix.length ? Math.min(...prix) : null,
    prix_max: prix.length ? Math.max(...prix) : null,
    depuis: dates[0] || null,
    jusqu_a: dates[dates.length - 1] || null,
    par_an: parAn,
    activites: [...parActivite.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nom, n]) => ({ nom, n })),
  };
}

const sansAccent = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const motsRue = (s) => sansAccent(s).replace(/[^a-z0-9]+/g, ' ').replace(/\b(rue|avenue|av|boulevard|bd|place|pl|cours|quai|impasse|allee|chemin|route|du|de|des|la|le|les|l|d)\b/g, ' ').replace(/\s+/g, ' ').trim();

/** La distance à vol d'oiseau, en mètres, ou rien si un point manque. Pure. */
export function distanceM(a, t) {
  if (![a?.lat, a?.lon, t?.lat, t?.lon].every((x) => Number.isFinite(x))) return null;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(t.lat - a.lat);
  const dLon = rad(t.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(t.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(h)));
}

/**
 * Situer chaque cession par rapport au bien : dans la même rue, au même
 * numéro, et à quelle distance. Pure : testée sans réseau.
 *
 * La rue se reconnaît au nom, pas au point : une cession sans coordonnées
 * reste une cession de la rue. Le numéro se lit en tête de l'adresse.
 */
export function situer(transactions, adresse) {
  const rue = motsRue(adresse.rue);
  const numero = String(adresse.numero || '').trim();
  return transactions.map((t) => {
    const dansLaRue = !!rue && motsRue(t.adresse).includes(rue);
    const surPlace = dansLaRue && !!numero && new RegExp(`^${numero}\\b`).test(String(t.adresse || '').trim());
    return { ...t, dans_la_rue: dansLaRue, sur_place: surPlace, distance_m: distanceM(adresse, t) };
  });
}

// --- Le géocodage par lot ------------------------------------------------------

/** Une cellule CSV, entre guillemets si elle en a besoin. */
const cellule = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Le CSV envoyé à la Base Adresse : un identifiant, l'adresse, la ville. Pure. */
export function csvPour(cessions) {
  const lignes = ['id,adresse,cp,ville'];
  for (const c of cessions) {
    if (!c?.id || !c?.adresse) continue;
    lignes.push([c.id, c.adresse, c.code_postal || '', c.ville || ''].map(cellule).join(','));
  }
  return lignes.join('\n') + '\n';
}

/** Une ligne CSV découpée, guillemets compris. */
function decouper(ligne) {
  const cases = []; let courant = ''; let entre = false;
  for (let i = 0; i < ligne.length; i++) {
    const ch = ligne[i];
    if (entre) {
      if (ch === '"' && ligne[i + 1] === '"') { courant += '"'; i++; } else if (ch === '"') entre = false; else courant += ch;
    } else if (ch === '"') entre = true;
    else if (ch === ',') { cases.push(courant); courant = ''; } else courant += ch;
  }
  cases.push(courant);
  return cases;
}

/**
 * Les points rendus par la Base Adresse, par identifiant. Pure : testée sans
 * réseau. Une ligne en erreur ou trop peu sûre ne rend pas de point.
 */
export function lireGeocodage(csv) {
  const lignes = String(csv || '').split(/\r?\n/).filter((l) => l.trim());
  if (!lignes.length) return new Map();
  const entete = decouper(lignes[0]);
  const col = (nom) => entete.indexOf(nom);
  const iId = col('id'); const iLon = col('longitude'); const iLat = col('latitude'); const iScore = col('result_score');
  const points = new Map();
  for (const l of lignes.slice(1)) {
    const c = decouper(l);
    const lat = Number(c[iLat]); const lon = Number(c[iLon]); const score = Number(c[iScore]);
    if (!c[iId] || !Number.isFinite(lat) || !Number.isFinite(lon) || !(score >= SCORE_MINIMUM)) continue;
    points.set(c[iId], { lat, lon, score: Math.round(score * 100) / 100 });
  }
  return points;
}

async function geocoderParLot(cessions) {
  const corps = new FormData();
  corps.append('data', new Blob([csvPour(cessions)], { type: 'text/csv' }), 'cessions.csv');
  corps.append('columns', 'adresse');
  corps.append('columns', 'ville');
  corps.append('postcode', 'cp');
  const r = await fetch(BAN_LOT, { method: 'POST', body: corps, headers: { 'user-agent': UA }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`La Base Adresse Nationale a répondu ${r.status} au géocodage par lot.`);
  return lireGeocodage(await r.text());
}

/** Les cessions d'une commune, avec leur point quand la Base Adresse le connaît. */
async function cessionsSituees(codePostal, ville, annees, forcer) {
  const lot = await cessionsDeLaCommune(codePostal, ville, { annees, forcer });
  if (!lot.ok) return lot;
  const cle = `${codePostal}|${annees}`;
  const garde = Records.filter(CACHE_GEO, { cle })[0];
  let points = null;
  if (garde && !forcer && Date.now() - Date.parse(garde.le) < CACHE_JOURS * 86400000) points = new Map(Object.entries(garde.points || {}));
  if (!points) {
    try {
      points = await geocoderParLot(lot.cessions);
    } catch (e) {
      // Sans point on garde la rue, qui se reconnaît au nom, et on le dit.
      if (garde) points = new Map(Object.entries(garde.points || {}));
      else return { ok: true, cessions: lot.cessions, geocodage: `Points indisponibles : ${e?.message || e}` };
    }
    const le = new Date().toISOString();
    const objet = Object.fromEntries(points);
    if (garde) Records.update(CACHE_GEO, garde.id, { points: objet, le });
    else Records.create(CACHE_GEO, { cle, points: objet, le });
  }
  return { ok: true, cessions: lot.cessions.map((c) => ({ ...c, ...(points.get(c.id) || {}) })), du_cache: lot.du_cache, geocodage: null };
}

const libelleRayon = (r) => (r >= 1000 ? `${r / 1000} km` : `${r} m`);

/**
 * Les cessions de fonds autour d'une adresse.
 * @param {string} texteAdresse
 * @param {{rayon?: number, annees?: number, forcer?: boolean, user?: object, garder?: number}} opts
 * @returns {Promise<{ok: true, resultat: object} | {ok: false, error: string}>}
 */
export async function cessionsAutour(texteAdresse, { rayon = RAYON_DEFAUT, annees = ANNEES_DEFAUT, forcer = false, user = null, garder = 200 } = {}) {
  let adresse;
  try {
    adresse = await resoudreAdresse(texteAdresse);
  } catch (e) {
    // La Base Adresse Nationale en panne est une panne, pas une adresse
    // inconnue : le statut voyage pour que le réessai ait lieu.
    return { ok: false, error: e.message, statut: e.statut ?? null, classe: e.classe ?? null };
  }
  if (!adresse) return { ok: false, error: `Adresse introuvable dans la Base Adresse Nationale : « ${String(texteAdresse || '').slice(0, 80)} ».` };

  const lot = await cessionsSituees(adresse.code_postal, adresse.ville, annees, forcer);
  if (!lot.ok) return { ok: false, error: lot.error };

  const toutes = situer(lot.cessions.map(enTransaction), adresse);
  if (!toutes.length) return { ok: false, error: `Aucune cession de fonds publiée au BODACC pour ${adresse.code_postal} ${adresse.ville} sur ${annees} ans.` };

  // Le rayon se lit sur les cessions qui ont un point ; la rue se lit sur le
  // nom, avec ou sans point. Les deux se rejoignent dans la liste.
  const dansLeRayon = toutes.filter((t) => t.distance_m != null && t.distance_m <= rayon);
  const dansLaRue = toutes.filter((t) => t.dans_la_rue);
  const surPlace = toutes.filter((t) => t.sur_place);
  const retenuesIds = new Set([...dansLeRayon, ...dansLaRue].map((t) => t.id));
  const autour = toutes.filter((t) => retenuesIds.has(t.id));

  // Ce qui touche le bien, puis la même rue, puis le reste du rayon — et dans
  // chaque cercle, les plus proches d'abord, les plus récentes à distance
  // égale. C'est l'ordre dans lequel l'équipe les lisait à la main.
  const parProximite = (a, b) => {
    const da = a.distance_m ?? Infinity; const db = b.distance_m ?? Infinity;
    if (da !== db) return da - db;
    return String(b.date).localeCompare(String(a.date));
  };
  const retenues = [
    ...surPlace.sort(parProximite),
    ...dansLaRue.filter((t) => !t.sur_place).sort(parProximite),
    ...autour.filter((t) => !t.dans_la_rue).sort(parProximite),
  ].slice(0, garder);

  const r = Math.round(rayon);
  const resultat = {
    source: 'BODACC · Annonces commerciales',
    adresse: adresse.label,
    lat: adresse.lat,
    lon: adresse.lon,
    rayon: libelleRayon(r),
    annees,
    total: autour.length,
    // Le marché du rayon, et la rue à part : c'est elle qu'on compare au dossier.
    marche: marcheDe(autour),
    rue: dansLaRue.length ? { nom: adresse.rue, ...marcheDe(dansLaRue) } : null,
    commune: { nombre: toutes.length, avec_point: toutes.filter((t) => t.lat != null).length },
    sur_place: surPlace.length,
    pertinentes: retenues.slice(0, 10),
    transactions: retenues,
    geocodage: lot.geocodage || null,
    lien: `https://bodacc-datadila.opendatasoft.com/explore/dataset/annonces-commerciales/table/?refine.familleavis=vente&refine.cp=${encodeURIComponent(adresse.code_postal)}&sort=dateparution`,
    le: new Date().toISOString(),
    par: user?.email || null,
    du_cache: !!lot.du_cache,
  };
  console.log(`[bodacc] ${autour.length} cessions de fonds autour de « ${adresse.label} » (${resultat.rayon}, ${dansLaRue.length} dans la rue)${user?.email ? ` — ${user.email}` : ''}`);
  return { ok: true, resultat };
}
