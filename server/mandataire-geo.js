// Les contours officiels pour tracer un secteur : régions, départements,
// communes. Sources publiques, sans clé :
//  - régions et départements : les contours administratifs d'Etalab,
//    simplifiés à 1 km (environ 340 Ko pour toute la France), téléchargés
//    une fois puis gardés sur le disque ;
//  - communes : l'API Géo (geo.api.gouv.fr), cherchées par nom, contour
//    compris.
// Tout sort en anneaux [[lat, lon], …] : l'ordre de Leaflet et du reste de
// l'espace mandataire (GeoJSON donne [lon, lat]).

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './db.js';

const SOURCES = {
  departement: 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2024/geojson/departements-1000m.geojson',
  region: 'https://etalab-datasets.geo.data.gouv.fr/contours-administratifs/2024/geojson/regions-1000m.geojson',
};
const API_GEO = 'https://geo.api.gouv.fr';
const DOSSIER = path.join(DATA_DIR, 'contours');
const memoire = new Map();

/** Pure : la géométrie GeoJSON (Polygon ou MultiPolygon) en anneaux extérieurs [lat, lon]. */
export function anneauxDe(geometrie) {
  if (!geometrie) return [];
  const polys = geometrie.type === 'Polygon' ? [geometrie.coordinates] : geometrie.type === 'MultiPolygon' ? geometrie.coordinates : [];
  // Seul l'anneau extérieur compte : un trou (une enclave) reste dans le secteur.
  return polys
    .map((p) => (p[0] || []).map(([lon, lat]) => [Number(lat.toFixed(5)), Number(lon.toFixed(5))]))
    .filter((a) => a.length >= 3);
}

async function charger(niveau) {
  if (memoire.has(niveau)) return memoire.get(niveau);
  const fichier = path.join(DOSSIER, `${niveau}s.json`);
  let geo = null;
  if (fs.existsSync(fichier)) {
    geo = JSON.parse(fs.readFileSync(fichier, 'utf-8'));
  } else {
    const r = await fetch(SOURCES[niveau], { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new Error(`Contours ${niveau}s : ${r.status}`);
    geo = await r.json();
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(fichier, JSON.stringify(geo));
  }
  const unites = (geo.features || []).map((f) => ({
    code: String(f.properties.code),
    nom: f.properties.nom,
    region: f.properties.region || null,
    anneaux: anneauxDe(f.geometry),
  }));
  memoire.set(niveau, unites);
  return unites;
}

/** La liste d'un niveau, sans les contours : de quoi choisir. */
export async function listerUnites(niveau) {
  if (!SOURCES[niveau]) throw new Error(`Niveau inconnu : ${niveau}`);
  return (await charger(niveau))
    .map(({ code, nom, region }) => ({ code, nom, region }))
    .sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
}

/** Les contours des unités choisies. */
export async function contoursDe(niveau, codes) {
  const voulus = new Set((codes || []).map(String));
  if (niveau === 'commune') return Promise.all([...voulus].map(contourCommune));
  if (!SOURCES[niveau]) throw new Error(`Niveau inconnu : ${niveau}`);
  return (await charger(niveau)).filter((u) => voulus.has(u.code)).map(({ code, nom, anneaux }) => ({ niveau, code, nom, anneaux }));
}

async function contourCommune(code) {
  const r = await fetch(`${API_GEO}/communes/${encodeURIComponent(code)}?fields=nom,code,contour&format=geojson&geometry=contour`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`Commune ${code} introuvable (${r.status})`);
  const f = await r.json();
  return { niveau: 'commune', code: String(f.properties.code), nom: f.properties.nom, anneaux: anneauxDe(f.geometry) };
}

/** Chercher une commune par son nom ou son code postal. */
export async function chercherCommunes(texte) {
  const q = String(texte || '').trim();
  if (q.length < 2) return [];
  const param = /^\d{5}$/.test(q) ? `codePostal=${q}` : `nom=${encodeURIComponent(q)}`;
  const r = await fetch(`${API_GEO}/communes?${param}&fields=nom,code,codeDepartement,population&boost=population&limit=8`, { signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`API Géo : ${r.status}`);
  return (await r.json()).map((c) => ({ code: c.code, nom: c.nom, departement: c.codeDepartement, population: c.population || null }));
}
