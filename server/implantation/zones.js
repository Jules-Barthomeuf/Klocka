// Les zones de chalandise : cinq, dix et quinze minutes à pied.
//
// Un isochrone, pas un rayon : l'IGN calcule sur le réseau piéton de la BD
// TOPO le contour de ce qu'on atteint en cinq minutes, sans clé et en une
// seconde. Sur ce contour on pose deux lectures : Filosofi (carreaux de 200 m,
// ménages, logements, niveau de vie) et le recensement à l'IRIS (âges, CSP,
// chômage, retraités), chacune au prorata de ce qui tombe dedans.
//
// Quand l'IGN ne répond pas, un cercle prend la place et le dit : 400, 800,
// 1 200 m, la marche moyenne pour la même durée.

import { Records } from '../db.js';
import { chercherCarreaux, agreger as agregerCarreaux } from '../kzoning-insee.js';
import { contours, base as baseIris, agreger as agregerIris } from './iris.js';
import { contient, boiteDe, partDans, pasEnDegres } from './geo.js';

const ISOCHRONE = 'https://data.geopf.fr/navigation/isochrone';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const CACHE = 'CacheIsochrone';
const CACHE_JOURS = 30;

export const ZONES = [
  { cle: 'primaire', nom: 'Zone primaire', minutes: 5, marche: '5 minutes à pied', rayon_m: 400 },
  { cle: 'secondaire', nom: 'Zone secondaire', minutes: 10, marche: '10 minutes à pied', rayon_m: 800 },
  { cle: 'tertiaire', nom: 'Zone tertiaire', minutes: 15, marche: '15 minutes à pied', rayon_m: 1200 },
];

/** Un cercle en GeoJSON, quand l'isochrone manque. Pure. */
export function cercle(lat, lon, rayon_m, n = 48) {
  const { dLat, dLon } = pasEnDegres(rayon_m, lat);
  const anneau = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    anneau.push([lon + dLon * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: 'Polygon', coordinates: [anneau] };
}

/** L'isochrone piéton de l'IGN, gardé trente jours. */
export async function isochrone(lat, lon, minutes) {
  const cle = `${lat.toFixed(5)},${lon.toFixed(5)},${minutes}`;
  const garde = Records.findBy(CACHE, 'cle', cle);
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_JOURS * 86400000) return garde.geometrie;
  const p = new URLSearchParams({ point: `${lon},${lat}`, resource: 'bdtopo-valhalla', costValue: String(minutes * 60), costType: 'time', profile: 'pedestrian', direction: 'departure', geometryFormat: 'geojson' });
  const r = await fetch(`${ISOCHRONE}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`L'IGN a répondu ${r.status} pour l'isochrone.`);
  const geometrie = (await r.json()).geometry;
  if (!geometrie?.coordinates) throw new Error("L'IGN a rendu un isochrone vide.");
  const le = new Date().toISOString();
  if (garde) Records.update(CACHE, garde.id, { geometrie, le });
  else Records.create(CACHE, { cle, geometrie, le });
  return geometrie;
}

/** Le centre d'un carreau, pour savoir s'il est dedans. */
function centreDe(g) {
  const anneau = g?.type === 'MultiPolygon' ? g.coordinates?.[0]?.[0] : g?.coordinates?.[0];
  if (!anneau?.length) return null;
  return { lon: anneau.reduce((s, p) => s + p[0], 0) / anneau.length, lat: anneau.reduce((s, p) => s + p[1], 0) / anneau.length };
}

/**
 * Les parts d'IRIS qui tombent dans une géométrie. Pure sur ses entrées.
 * @returns {Array<{code, nom, part}>}
 */
export function partsIris(iris, geometrie) {
  const b = boiteDe(geometrie);
  return (iris || []).map((x) => {
    const bx = boiteDe(x.geometry);
    if (!bx || !b || bx[0] > b[2] || bx[2] < b[0] || bx[1] > b[3] || bx[3] < b[1]) return null;
    const part = partDans(x.geometry, geometrie, 40);
    return part > 0 ? { code: x.code, nom: x.nom, part: Math.round(part * 1000) / 1000 } : null;
  }).filter(Boolean);
}

/**
 * Les trois zones lues. Chaque zone porte sa géométrie, la lecture Filosofi
 * (même forme que K-Zoning) et la lecture du recensement.
 */
export async function zonesDeChalandise(lat, lon, { journal = () => {} } = {}) {
  const geometries = [];
  let approximation = null;
  for (const z of ZONES) {
    try { geometries.push(await isochrone(lat, lon, z.minutes)); } catch (e) {
      approximation = e?.message || String(e);
      geometries.push(cercle(lat, lon, z.rayon_m));
    }
  }
  // La plus grande zone décide de ce qu'on va chercher, une seule fois.
  const grande = boiteDe(geometries[2]);
  const rayonLecture = Math.round(Math.max(grande[2] - grande[0], grande[3] - grande[1]) * 111320 / 2) + 300;
  const [carreaux, iris, base] = await Promise.all([
    chercherCarreaux(lat, lon, rayonLecture).catch((e) => { journal(`Filosofi : ${e.message}`); return null; }),
    contours(grande).catch((e) => { journal(`IRIS : ${e.message}`); return null; }),
    baseIris().catch((e) => { journal(`recensement : ${e.message}`); return null; }),
  ]);
  return {
    approximation,
    zones: ZONES.map((z, i) => {
      const g = geometries[i];
      const dedans = carreaux ? carreaux.filter((f) => { const c = centreDe(f.geometry); return c && contient(g, c.lon, c.lat); }) : null;
      const parts = iris ? partsIris(iris, g) : [];
      return {
        ...z,
        approximation: approximation ? `rayon de ${z.rayon_m} m, l'IGN n'a pas rendu l'isochrone` : null,
        geometrie: g,
        insee: dedans ? agregerCarreaux(dedans, { lat, lon, rayon_m: 1e9 }) : null,
        recensement: iris && base ? agregerIris(parts, base) : null,
        iris: parts,
      };
    }),
  };
}
