// Le cadastre : de quel bout de terrain une vitrine fait-elle partie ?
//
// Tout le reste du pipeline parle en PARCELLES — DVF vend des parcelles, le
// fichier des personnes morales possède des parcelles. Les vitrines, elles,
// sont des points : une latitude, une longitude, une enseigne relevée sur
// OpenStreetMap. Ce module fait le pont : les contours de parcelles publiés
// par Etalab (cadastre.data.gouv.fr), un index spatial grossier par carreaux,
// et un point-dans-polygone pour trancher.
//
// C'est la clé de voûte de l'univers « adresse » : sans lui, le dataset
// d'apprentissage ne connaît que les locaux déjà vendus (la chambre d'écho
// DVF) ; avec lui, la population de départ est TOUS les commerces d'une
// ville, vendus ou pas — et le taux de base redevient celui du marché.
//
// Le fichier d'une commune pèse quelques méga-octets compressés ; on garde
// un extrait par commune (id + contour), et l'index se reconstruit en
// mémoire à la demande.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { DATA_DIR } from '../db.js';
import { ErreurSource } from '../marche/erreurs.js';

const CACHE = path.join(DATA_DIR, 'cadastre');
const SOURCE = (insee) => `https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes/${insee.slice(0, 2)}/${insee}/cadastre-${insee}-parcelles.json.gz`;

/** Le pas de la grille spatiale, en degrés (~110 m) : assez fin pour trier vite. */
const PAS = 0.001;

/**
 * Télécharge et range les parcelles d'une commune : id, contour extérieur.
 * Ne refait rien si l'extrait est déjà là.
 */
export async function chargerParcelles(insee, { journal = () => {} } = {}) {
  fs.mkdirSync(CACHE, { recursive: true });
  const fichier = path.join(CACHE, `${insee}.json`);
  if (fs.existsSync(fichier)) return JSON.parse(fs.readFileSync(fichier, 'utf-8'));

  const r = await fetch(SOURCE(insee), { signal: AbortSignal.timeout(180000) });
  if (!r.ok) throw new ErreurSource(`Le cadastre a répondu ${r.status} pour ${insee}.`, { service: 'cadastre.data.gouv.fr', statut: r.status });
  const geo = JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf-8'));

  const parcelles = [];
  for (const f of geo.features || []) {
    const id = f.properties?.id;
    const g = f.geometry;
    if (!id || !g) continue;
    // Un MultiPolygon garde son plus grand anneau : un commerce n'est pas sur
    // l'îlot secondaire d'une parcelle en deux morceaux.
    const anneaux = g.type === 'Polygon' ? [g.coordinates[0]] : g.type === 'MultiPolygon' ? g.coordinates.map((p) => p[0]) : [];
    const contour = anneaux.sort((a, b) => b.length - a.length)[0];
    if (!contour || contour.length < 4) continue;
    // GeoJSON écrit [lon, lat] ; quatre décimales suffisent (~10 m de trait).
    parcelles.push({ id, c: contour.map(([lon, lat]) => [Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5]) });
  }
  fs.writeFileSync(fichier, JSON.stringify(parcelles));
  journal(`${insee} : ${parcelles.length} parcelles cadastrales rangées.`);
  return parcelles;
}

/** Un point est-il dans l'anneau [lat, lon][] ? (lancer de rayon) */
function dedans(lat, lon, anneau) {
  let interieur = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [ay, ax] = anneau[i];
    const [by, bx] = anneau[j];
    if (ay > lat !== by > lat && lon < ((bx - ax) * (lat - ay)) / (by - ay || 1e-12) + ax) interieur = !interieur;
  }
  return interieur;
}

/**
 * Un index point → parcelle : les parcelles rangées par carreau de grille,
 * la recherche ne teste que celles du carreau du point.
 */
export function indexerParcelles(parcelles) {
  const grille = new Map();
  for (const p of parcelles) {
    const lats = p.c.map((x) => x[0]);
    const lons = p.c.map((x) => x[1]);
    p.boite = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    for (let gy = Math.floor(p.boite[0] / PAS); gy <= Math.floor(p.boite[1] / PAS); gy += 1) {
      for (let gx = Math.floor(p.boite[2] / PAS); gx <= Math.floor(p.boite[3] / PAS); gx += 1) {
        const cle = `${gy}|${gx}`;
        if (!grille.has(cle)) grille.set(cle, []);
        grille.get(cle).push(p);
      }
    }
  }
  return {
    /** L'identifiant de la parcelle qui contient le point, ou null. */
    parcelleDe(lat, lon) {
      const candidates = grille.get(`${Math.floor(lat / PAS)}|${Math.floor(lon / PAS)}`) || [];
      for (const p of candidates) {
        if (lat < p.boite[0] || lat > p.boite[1] || lon < p.boite[2] || lon > p.boite[3]) continue;
        if (dedans(lat, lon, p.c)) return p.id;
      }
      return null;
    },
    /**
     * Comme parcelleDe, mais tolère une vitrine posée sur le trottoir : le
     * point est sondé tel quel, puis décalé de dix mètres aux quatre vents.
     */
    parcelleProche(lat, lon) {
      const direct = this.parcelleDe(lat, lon);
      if (direct) return direct;
      const dLat = 10 / 110540;
      const dLon = 10 / (111320 * Math.cos((lat * Math.PI) / 180));
      for (const [a, o] of [[dLat, 0], [-dLat, 0], [0, dLon], [0, -dLon]]) {
        const p = this.parcelleDe(lat + a, lon + o);
        if (p) return p;
      }
      return null;
    },
    taille: parcelles.length,
  };
}
