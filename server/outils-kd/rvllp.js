// K-Data, le niveau de loyer par les paramètres fiscaux des locaux professionnels (9 nov. 2026, Jules : remplacer
// Data-B, « commençons par la valeur locative de marché »).
//
// La révision des valeurs locatives des locaux professionnels (RVLLP, DGFiP) publie pour chaque département, sur
// impots.gouv.fr/revision-des-valeurs-locatives : la sectorisation (chaque section cadastrale a un secteur locatif),
// la grille tarifaire (€/m² par catégorie de local et par secteur, actualisée chaque année d'après les loyers
// déclarés par les occupants) et les coefficients de localisation (à la section ou à la parcelle ; absente, une
// parcelle vaut 1). MAG1 est la catégorie des boutiques.
//
// Mesuré contre les valeurs de ville de Data-B le 9 nov. 2026 (`npm run kdata:valeur-ville`) : le tarif MAG1 du
// meilleur secteur de la commune, brut, sans aucun réglage sur Data-B, tombe à 16 % d'écart médian. Médiane des
// secteurs, loyers d'habitation, DVF, population n'ont rien ajouté en validation croisée. Les tarifs sont en surface
// pondérée, hors taxes et hors charges. Aucun modèle de langage ; téléchargé une fois, puis lu sur disque.

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import JSZip from 'jszip';
import { DATA_DIR } from '../db.js';
import { lignesDeFeuille } from '../insee.js';

// La grille de l'année : à monter quand la DGFiP publie la suivante.
export const ANNEE_TARIFS = 2026;
const RACINE = 'https://www.impots.gouv.fr/sites/default/files/media/rvllp';
const CADASTRE = 'https://cadastre.data.gouv.fr/data/etalab-cadastre/latest/geojson/communes';
const DOSSIER = path.join(DATA_DIR, 'rvllp');
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const COMMUNES_EN_MEMOIRE = 40;

const decode = (t) => String(t).replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const nombre = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : null; };

/** Pure : les lignes d'une feuille ODS (content.xml) en tableaux de chaînes, lignes vides retirées. */
export function lignesOds(xml) {
  const lignes = [];
  for (const r of String(xml).matchAll(/<table:table-row(?:\s[^>]*?)?(?<!\/)>([\s\S]*?)<\/table:table-row>/g)) {
    const cases = [];
    for (const c of r[1].matchAll(/<table:(?:covered-)?table-cell([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-)?table-cell>)/g)) {
      const repete = Number(/number-columns-repeated="(\d+)"/.exec(c[1])?.[1]) || 1;
      const valeur = /office:value="([^"]*)"/.exec(c[1])?.[1] ?? decode([...(c[2] || '').matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((p) => p[1].replace(/<[^>]+>/g, '')).join(''));
      // Une feuille finit par des milliers de colonnes vides répétées : on n'en garde pas.
      for (let i = 0; i < Math.min(repete, 40); i += 1) cases.push(valeur);
    }
    while (cases.length && cases[cases.length - 1] === '') cases.pop();
    if (cases.length) lignes.push(cases);
  }
  return lignes;
}

/** Pure : la grille tarifaire (lignes de `lignesDeFeuille`) → { MAG1: { 1: 120.4, 2: 180 }, … }. */
export function lireTarifs(lignes) {
  const colonnes = {};
  for (const l of lignes) {
    for (const [col, v] of Object.entries(l)) {
      const m = /^secteur\s*(\d+)$/i.exec(String(v).trim());
      if (m) colonnes[col] = Number(m[1]);
    }
    if (Object.keys(colonnes).length) break;
  }
  const tarifs = {};
  for (const l of lignes) {
    if (!/^[A-Z]{3}\d$/.test(String(l.A || ''))) continue;
    tarifs[l.A] = {};
    for (const [col, s] of Object.entries(colonnes)) { const t = nombre(l[col]); if (t) tarifs[l.A][s] = t; }
  }
  return tarifs;
}

const troisChiffres = (v) => String(v).split('.')[0].padStart(3, '0');
const cleSection = (prefixe, section) => `${String(prefixe || '').replace(/^0+$/, '')}|${String(section || '').trim()}`;

/** Pure : la sectorisation (lignes ODS) → { '088': { nom, sections: { '|AB': 3 } } }. Section vide : toute la commune. */
export function lireSecteurs(lignes) {
  const communes = {};
  for (const l of lignes.slice(1)) {
    const secteur = nombre(l[4]);
    if (!secteur) continue;
    const c = troisChiffres(l[0]);
    if (!communes[c]) communes[c] = { nom: l[1], sections: {} };
    communes[c].sections[cleSection(l[2], l[3])] = secteur;
  }
  return communes;
}

/** Pure : les coefficients (lignes ODS) → { '069': { '|CL': { section: 0.85, parcelles: { '109': 0.85 } } } }. */
export function lireCoefficients(lignes) {
  const communes = {};
  for (const l of lignes) {
    const coef = nombre(l[6]);
    if (!coef || !/^\d/.test(String(l[1]))) continue;
    const c = troisChiffres(l[1]);
    const k = cleSection(l[3], l[4]);
    if (!communes[c]) communes[c] = {};
    if (!communes[c][k]) communes[c][k] = { section: null, parcelles: {} };
    if (String(l[5] ?? '').trim()) communes[c][k].parcelles[String(Number(l[5]))] = coef;
    else communes[c][k].section = coef;
  }
  return communes;
}

/** Pure : le secteur d'une section cadastrale ; l'écriture de la section varie (0A / A, préfixe vide ou 000). */
export function secteurDeSection(commune, { prefixe, code }) {
  if (!commune) return null;
  const court = String(code || '').replace(/^0+/, '') || String(code || '');
  for (const k of [cleSection(prefixe, code), cleSection('', code), cleSection(prefixe, court), cleSection('', court), '|']) {
    if (commune.sections[k] != null) return commune.sections[k];
  }
  return null;
}

/** Pure : le coefficient de localisation d'une parcelle (1 si elle n'est pas listée). */
export function coefficientDe(communeCoefs, { prefixe, section, parcelle }) {
  const e = communeCoefs?.[cleSection(prefixe, section)] || communeCoefs?.[cleSection('', section)];
  if (!e) return 1;
  return e.parcelles[String(Number(parcelle))] ?? e.section ?? 1;
}

function dansAnneau(x, y, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i, i += 1) {
    const [xi, yi] = anneau[i]; const [xj, yj] = anneau[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Pure : un point dans un Polygon ou un MultiPolygon GeoJSON (anneaux extérieurs). */
export function pointDans(lon, lat, geometrie) {
  if (geometrie?.type === 'Polygon') return dansAnneau(lon, lat, geometrie.coordinates[0]);
  if (geometrie?.type === 'MultiPolygon') return geometrie.coordinates.some((p) => dansAnneau(lon, lat, p[0]));
  return false;
}

/** Pure : le centre et la fourchette au format Data-B (centre ± 20 %, donc haut = 1,5 × bas). */
export const fourchetteDataB = (centre) => ({ centre: Math.round(centre), basse: Math.round(centre * 0.8), haute: Math.round(centre * 1.2) });

/**
 * Pure : la valeur de ville d'après les secteurs de ses sections : le tarif du meilleur secteur.
 * @returns {{ centre, basse, haute, secteur_max, tarif_median, sections } | null}
 */
export function valeurDesSections(secteurs, tarifsCategorie) {
  const t = secteurs.map((s) => ({ s, t: tarifsCategorie?.[s] })).filter((x) => x.t).sort((a, b) => a.t - b.t);
  if (!t.length) return null;
  const max = t[t.length - 1];
  return { ...fourchetteDataB(max.t), secteur_max: max.s, tarif_median: t[Math.floor(t.length / 2)].t, sections: t.length };
}

// ── Lecture des fichiers ──────────────────────────────────────────────────────────

// « 06088 » → 06, « 97411 » → 974, « 2A004 » → 20a (l'écriture des fichiers de la DGFiP).
export function departementDeCommune(code) {
  const c = String(code || '').toUpperCase();
  if (c.startsWith('97')) return c.slice(0, 3);
  if (c.startsWith('2A')) return '20a';
  if (c.startsWith('2B')) return '20b';
  return c.slice(0, 2);
}
const communeDansDepartement = (code) => String(code).slice(2);

async function binaire(url) {
  let dernier = null;
  for (let essai = 0; essai < 3; essai += 1) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(60000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      dernier = new Error(`${new URL(url).host} ${r.status}`);
      if (r.status === 404) break;
    } catch (e) { dernier = e; }
    await new Promise((ok) => { setTimeout(ok, 2000 * (essai + 1)); });
  }
  throw dernier;
}

const ods = async (url) => lignesOds(await (await JSZip.loadAsync(await binaire(url))).file('content.xml').async('string'));

async function xlsx(url) {
  const z = await JSZip.loadAsync(await binaire(url));
  const chaines = z.file('xl/sharedStrings.xml');
  return lignesDeFeuille(await z.file('xl/worksheets/sheet1.xml').async('string'), chaines ? await chaines.async('string') : '');
}

const departements = new Map();

/** Les paramètres d'un département, lus sur disque si on les a déjà, sinon téléchargés puis gardés. */
export async function chargerDepartement(dep) {
  if (departements.has(dep)) return departements.get(dep);
  const f = path.join(DOSSIER, `${dep}-${ANNEE_TARIFS}.json`);
  let d;
  if (fs.existsSync(f)) d = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    const [secteurs, tarifs, coefficients] = [
      await ods(`${RACINE}/secteur/secteur-${dep}.ods`),
      await xlsx(`${RACINE}/tarif/${ANNEE_TARIFS}/tarif-${dep}.xlsx`),
      await ods(`${RACINE}/coef-loc/${ANNEE_TARIFS}/coef-loc-${dep}.ods`),
    ];
    d = { secteurs: lireSecteurs(secteurs), tarifs: lireTarifs(tarifs), coefficients: lireCoefficients(coefficients), annee: ANNEE_TARIFS };
    fs.mkdirSync(DOSSIER, { recursive: true });
    fs.writeFileSync(f, JSON.stringify(d));
  }
  departements.set(dep, d);
  return d;
}

const sectionsEnMemoire = new Map();

/** Les sections cadastrales d'une commune (contours Etalab), gardées sur disque. */
export async function sectionsDeCommune(code) {
  if (sectionsEnMemoire.has(code)) return sectionsEnMemoire.get(code);
  const f = path.join(DOSSIER, 'sections', `${code}.json`);
  let sections;
  if (fs.existsSync(f)) sections = JSON.parse(fs.readFileSync(f, 'utf8'));
  else {
    const dep = String(code).startsWith('97') ? String(code).slice(0, 3) : String(code).slice(0, 2);
    const brut = zlib.gunzipSync(await binaire(`${CADASTRE}/${dep}/${code}/cadastre-${code}-sections.json.gz`));
    sections = (JSON.parse(brut.toString('utf8')).features || []).map((s) => ({ prefixe: s.properties?.prefixe || '', code: s.properties?.code || '', geometrie: s.geometry }));
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(sections));
  }
  if (sectionsEnMemoire.size >= COMMUNES_EN_MEMOIRE) sectionsEnMemoire.delete(sectionsEnMemoire.keys().next().value);
  sectionsEnMemoire.set(code, sections);
  return sections;
}

const sourceDe = (categorie) => `DGFiP · paramètres des locaux professionnels ${ANNEE_TARIFS}, catégorie ${categorie}`;

/**
 * La valeur de ville K-Data d'une commune (code INSEE ; Paris, Lyon et Marseille par arrondissement).
 * @returns {Promise<{ centre, basse, haute, secteur_max, tarif_median, sections, categorie, annee, source } | null>}
 */
export async function valeurDeVille(code, { categorie = 'MAG1' } = {}) {
  const d = await chargerDepartement(departementDeCommune(code));
  const commune = d.secteurs[communeDansDepartement(code)];
  if (!commune) return null;
  const sections = await sectionsDeCommune(code);
  const secteurs = sections.map((s) => secteurDeSection(commune, s)).filter(Boolean);
  const v = valeurDesSections(secteurs, d.tarifs[categorie]);
  return v && { ...v, categorie, annee: d.annee, source: sourceDe(categorie) };
}

/**
 * Le tarif au point : section cadastrale, secteur locatif, tarif de la catégorie, et le coefficient de localisation
 * quand la parcelle est donnée ou que toute la section en porte un.
 * @returns {Promise<{ section, secteur, tarif, coefficient, valeur, categorie, annee, source } | null>}
 */
export async function tarifAuPoint(code, { lat, lon, parcelle = null, categorie = 'MAG1' }) {
  const d = await chargerDepartement(departementDeCommune(code));
  const cc = communeDansDepartement(code);
  const commune = d.secteurs[cc];
  if (!commune) return null;
  const section = (await sectionsDeCommune(code)).find((s) => pointDans(lon, lat, s.geometrie));
  if (!section) return null;
  const secteur = secteurDeSection(commune, section);
  const tarif = secteur ? d.tarifs[categorie]?.[secteur] : null;
  if (!tarif) return null;
  const coefficient = coefficientDe(d.coefficients[cc], { prefixe: section.prefixe, section: section.code, parcelle });
  return { section: `${section.prefixe || ''}${section.code}`, secteur, tarif, coefficient, valeur: Math.round(tarif * coefficient), categorie, annee: d.annee, source: sourceDe(categorie) };
}
