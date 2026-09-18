// Ce que l'INSEE sait des habitants d'une zone : Filosofi, carreaux de 200 m.
//
// L'INSEE publie ses revenus localisés sur une grille de carreaux de deux cents
// mètres de côté : pour chacun, les individus, les ménages, leurs âges, leur
// logement, leur niveau de vie. La Géoplateforme de l'IGN sert cette grille en
// WFS, gratuitement et sans clé.
//
// C'est la bonne échelle pour une zone : on prend les carreaux dont le centre
// tombe dans le cercle, on additionne. Un carreau à cheval sur le bord compte
// entier ou pas du tout — sur une zone de trois cents mètres, l'imprécision est
// celle du carreau, et l'INSEE ne descend pas plus bas.
//
// Ces chiffres bougent une fois l'an : un relevé se garde trente jours.

import { Records } from './db.js';

const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'INSEE.FILOSOFI.INDICATORS:carreaux_200m';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const DELAI_MS = 90000;
const CACHE_JOURS = 30;
const CACHE = 'CacheInseeKZoning';
// Un carreau fait 200 m × 200 m : quatre hectares.
const KM2_PAR_CARREAU = 0.04;

const nb = (v) => (v === null || v === undefined || v === '' ? 0 : Number(v) || 0);

/** L'emprise d'un cercle, en degrés : la requête WFS veut une boîte. */
export function boiteDe(lat, lon, rayon_m) {
  const dLat = rayon_m / 111320;
  const dLon = rayon_m / (111320 * Math.cos((lat * Math.PI) / 180));
  return { ouest: lon - dLon, sud: lat - dLat, est: lon + dLon, nord: lat + dLat };
}

function metresEntre(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Le centre d'un carreau : la moyenne de ses sommets. */
function centreDe(geometrie) {
  const anneau = geometrie?.type === 'MultiPolygon' ? geometrie.coordinates?.[0]?.[0] : geometrie?.coordinates?.[0];
  if (!anneau?.length) return null;
  const pts = anneau.slice(0, -1).length >= 3 ? anneau.slice(0, -1) : anneau;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return { lat, lon };
}

async function chercherCarreaux(lat, lon, rayon_m) {
  const b = boiteDe(lat, lon, rayon_m);
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '5000',
    // En EPSG:4326 sur ce service, la boîte se donne longitude puis latitude :
    // vérifié, l'ordre inverse rend zéro carreau.
    BBOX: `${b.ouest},${b.sud},${b.est},${b.nord},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(DELAI_MS) });
  if (!r.ok) throw new Error(`La Géoplateforme a répondu ${r.status}`);
  return (await r.json()).features || [];
}

/**
 * Additionne les carreaux d'une zone et en tire des chiffres lisibles.
 * Pure : testée sans réseau.
 * @param {Array} carreaux features GeoJSON
 * @param {{lat: number, lon: number, rayon_m: number}} zone
 */
export function agreger(carreaux, { lat, lon, rayon_m }) {
  const dedans = carreaux.filter((f) => {
    const c = centreDe(f.geometry);
    return c && metresEntre(lat, lon, c.lat, c.lon) <= rayon_m;
  });
  const s = {};
  const cles = [
    'ind', 'men', 'ind_0_3', 'ind_4_5', 'ind_6_10', 'ind_11_17', 'ind_18_24', 'ind_25_39', 'ind_40_54',
    'ind_55_64', 'ind_65_79', 'ind_80p', 'men_1ind', 'men_5ind', 'men_prop', 'men_fmp', 'men_pauv',
    'men_surf', 'men_coll', 'men_mais', 'log_soc', 'log_av45', 'log_45_70', 'log_70_90', 'log_ap90', 'ind_snv',
  ];
  for (const k of cles) s[k] = dedans.reduce((t, f) => t + nb(f.properties?.[k]), 0);
  const estimes = dedans.filter((f) => nb(f.properties?.i_car_est) === 1).length;
  const communes = [...new Set(dedans.map((f) => f.properties?.nom_com).filter(Boolean))];

  const ind = s.ind;
  const men = s.men;
  // Les 18-24 ans manquent parfois de la grille : ils se déduisent du reste.
  const autresAges = s.ind_0_3 + s.ind_4_5 + s.ind_6_10 + s.ind_11_17 + s.ind_25_39 + s.ind_40_54 + s.ind_55_64 + s.ind_65_79 + s.ind_80p;
  const ind_18_24 = s.ind_18_24 || Math.max(0, ind - autresAges);
  const part = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const arrondi = (x) => Math.round(x);

  return {
    carreaux: dedans.length,
    carreaux_estimes: estimes,
    communes,
    population: {
      habitants: arrondi(ind),
      densite_km2: dedans.length ? arrondi(ind / (dedans.length * KM2_PAR_CARREAU)) : null,
      ages: {
        '0-17 ans': part(s.ind_0_3 + s.ind_4_5 + s.ind_6_10 + s.ind_11_17, ind),
        '18-24 ans': part(ind_18_24, ind),
        '25-39 ans': part(s.ind_25_39, ind),
        '40-54 ans': part(s.ind_40_54, ind),
        '55-64 ans': part(s.ind_55_64, ind),
        '65-79 ans': part(s.ind_65_79, ind),
        '80 ans et plus': part(s.ind_80p, ind),
      },
      part_moins_18: part(s.ind_0_3 + s.ind_4_5 + s.ind_6_10 + s.ind_11_17, ind),
      part_65_plus: part(s.ind_65_79 + s.ind_80p, ind),
    },
    menages: {
      menages: arrondi(men),
      taille_moyenne: men > 0 ? Math.round((ind / men) * 100) / 100 : null,
      part_une_personne: part(s.men_1ind, men),
      part_cinq_et_plus: part(s.men_5ind, men),
      part_monoparentales: part(s.men_fmp, men),
      part_proprietaires: part(s.men_prop, men),
    },
    revenus: {
      // ind_snv est la somme des niveaux de vie : divisée par les individus,
      // c'est le niveau de vie moyen par personne et par an.
      niveau_de_vie_moyen: ind > 0 ? arrondi(s.ind_snv / ind) : null,
      taux_pauvrete: part(s.men_pauv, men),
      menages_pauvres: arrondi(s.men_pauv),
    },
    logement: {
      part_collectif: part(s.men_coll, men),
      part_maisons: part(s.men_mais, men),
      part_social: part(s.log_soc, men),
      surface_moyenne_m2: men > 0 ? arrondi(s.men_surf / men) : null,
      construction: {
        'avant 1945': part(s.log_av45, men),
        '1945-1970': part(s.log_45_70, men),
        '1970-1990': part(s.log_70_90, men),
        'après 1990': part(s.log_ap90, men),
      },
    },
  };
}

const frais = (iso) => iso && Date.now() - new Date(iso).getTime() < CACHE_JOURS * 86400000;

/**
 * Les habitants d'une zone. Gardé trente jours par zone.
 * @param {{lat: number, lon: number, rayon_m: number, forcer?: boolean}} zone
 */
export async function habitantsDeLaZone({ lat, lon, rayon_m, forcer = false }) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(rayon_m)) return { ok: false, error: 'Zone incomplète.' };
  const cle = `${lat.toFixed(5)},${lon.toFixed(5)},${rayon_m}`;
  const garde = Records.findBy(CACHE, 'cle', cle);
  if (garde && frais(garde.garde_le) && !forcer) return { ok: true, insee: garde.insee, garde_le: garde.garde_le, du_cache: true };

  let carreaux;
  try {
    carreaux = await chercherCarreaux(lat, lon, rayon_m);
  } catch (e) {
    if (garde) return { ok: true, insee: garde.insee, garde_le: garde.garde_le, du_cache: true, perime: true };
    return { ok: false, error: `L'INSEE n'a pas répondu : ${e?.message || e}` };
  }
  const insee = agreger(carreaux, { lat, lon, rayon_m });
  const garde_le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { insee, garde_le });
  else Records.create(CACHE, { cle, insee, garde_le });
  return { ok: true, insee, garde_le };
}
