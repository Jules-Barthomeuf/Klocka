// Le recensement à l'IRIS : ce que Data-B appelait « INSEE RGP 2020 ».
//
// Filosofi (kzoning-insee.js) dit les revenus, les ménages et les logements
// par carreau de 200 m, mais ni les catégories socioprofessionnelles, ni le
// chômage, ni les retraités : l'INSEE ne les publie qu'à l'IRIS, le quartier
// statistique de deux mille habitants. Deux bases suffisent, téléchargées une
// fois sur insee.fr et réduites aux colonnes utiles :
//
//   base-ic-evol-struct-pop   population, sexes, âges, CSP des 15 ans et plus
//   base-ic-activite-residents  actifs et chômeurs de 15 à 64 ans
//
// « CSP + » au sens du métier : artisans, commerçants et chefs d'entreprise,
// cadres et professions intellectuelles supérieures, professions
// intermédiaires. Retraités : la catégorie 7.
//
// Les contours des IRIS viennent du WFS de la Géoplateforme, sans clé.

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { Records, DATA_DIR } from '../db.js';

export const MILLESIME = 2021;
const DOSSIER = path.join(DATA_DIR, 'iris');
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'STATISTICALUNITS.IRIS:contours_iris';
const CACHE_CONTOURS = 'CacheContoursIris';
const CACHE_CONTOURS_JOURS = 180;

/** Les archives de l'INSEE, par millésime. L'adresse porte l'identifiant de la page. */
const ARCHIVES = {
  2021: {
    pop: 'https://www.insee.fr/fr/statistiques/fichier/8268806/base-ic-evol-struct-pop-2021_csv.zip',
    act: 'https://www.insee.fr/fr/statistiques/fichier/8268843/base-ic-activite-residents-2021_csv.zip',
  },
};

export const CSP = ['Agriculteurs', 'Artisans, commerçants, chefs d\'entreprise', 'Cadres et professions intellectuelles', 'Professions intermédiaires', 'Employés', 'Ouvriers', 'Retraités', 'Autres sans activité'];

const chemin = (annee) => path.join(DOSSIER, `rp-${annee}.json`);
export const dejaLa = (annee = MILLESIME) => fs.existsSync(chemin(annee));

/** Le contenu d'une archive, lu sans la poser dégonflée sur le disque. */
function lignesDuZip(zip) {
  return new Promise((resolve, reject) => {
    const enfant = spawn('unzip', ['-p', zip, 'base-ic-*.CSV'], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lignes = []; let reste = ''; let erreurs = '';
    enfant.stdout.on('data', (bloc) => {
      reste += bloc.toString('utf8');
      const parts = reste.split('\n');
      reste = parts.pop() || '';
      for (const l of parts) lignes.push(l.replace(/\r$/, ''));
    });
    enfant.stderr.on('data', (b) => { erreurs += b.toString(); });
    enfant.on('error', reject);
    enfant.on('close', (code) => {
      if (reste.trim()) lignes.push(reste.replace(/\r$/, ''));
      if (code !== 0 && !lignes.length) return reject(new Error(erreurs.trim() || `unzip s'est arrêté (code ${code}).`));
      resolve(lignes);
    });
  });
}

const n = (v) => { const x = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : 0; };

/**
 * Réduit les deux bases à une ligne par IRIS. Pure : testée sans réseau.
 * @param {string[]} pop lignes CSV de base-ic-evol-struct-pop
 * @param {string[]} act lignes CSV de base-ic-activite-residents
 * @returns {Object<string, object>} par code IRIS
 */
export function reduire(pop, act, annee = MILLESIME) {
  const aa = String(annee).slice(2);
  const lire = (lignes) => {
    const entete = (lignes[0] || '').split(';').map((x) => x.trim());
    const col = Object.fromEntries(entete.map((c, i) => [c, i]));
    return { col, lignes: lignes.slice(1).map((l) => l.split(';')) };
  };
  const p = lire(pop); const a = lire(act);
  const out = {};
  const c = (col, cases, nom) => n(cases[col[nom]]);
  for (const cases of p.lignes) {
    const iris = cases[p.col.IRIS];
    if (!iris) continue;
    out[iris] = {
      com: cases[p.col.COM],
      pop: c(p.col, cases, `P${aa}_POP`),
      h: c(p.col, cases, `P${aa}_POPH`),
      f: c(p.col, cases, `P${aa}_POPF`),
      enfants: c(p.col, cases, `P${aa}_POP0014`),
      jeunes: c(p.col, cases, `P${aa}_POP1529`),
      seniors: c(p.col, cases, `P${aa}_POP6074`) + c(p.col, cases, `P${aa}_POP75P`),
      pop15p: c(p.col, cases, `C${aa}_POP15P`),
      cs: [1, 2, 3, 4, 5, 6, 7, 8].map((k) => c(p.col, cases, `C${aa}_POP15P_CS${k}`)),
      act: 0, chom: 0,
    };
  }
  for (const cases of a.lignes) {
    const iris = cases[a.col.IRIS];
    if (!iris || !out[iris]) continue;
    out[iris].act = c(a.col, cases, `P${aa}_ACT1564`);
    out[iris].chom = c(a.col, cases, `P${aa}_CHOM1564`);
  }
  return out;
}

/**
 * Télécharge les deux bases d'un millésime et range la réduction. Ne refait
 * rien qui soit déjà là. Une centaine de mégaoctets dégonflés, cinq mégas
 * gardés.
 */
export async function extraire(annee = MILLESIME, { journal = () => {}, forcer = false } = {}) {
  if (!forcer && dejaLa(annee)) return { annee, du_cache: true };
  const sources = ARCHIVES[annee];
  if (!sources) throw new Error(`Aucune archive connue pour le recensement ${annee}.`);
  fs.mkdirSync(DOSSIER, { recursive: true });
  const brut = {};
  for (const [cle, url] of Object.entries(sources)) {
    const zip = path.join(DOSSIER, `${cle}-${annee}.zip`);
    if (!fs.existsSync(zip)) {
      journal(`IRIS ${annee} : téléchargement de ${cle}…`);
      const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Klocka)' }, signal: AbortSignal.timeout(900000) });
      if (!r.ok) throw new Error(`insee.fr a répondu ${r.status} pour ${url}.`);
      fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    }
    brut[cle] = await lignesDuZip(zip);
    journal(`IRIS ${annee} : ${cle}, ${brut[cle].length} lignes.`);
  }
  const iris = reduire(brut.pop, brut.act, annee);
  fs.writeFileSync(chemin(annee), JSON.stringify({ annee, iris }));
  for (const cle of Object.keys(sources)) { try { fs.unlinkSync(path.join(DOSSIER, `${cle}-${annee}.zip`)); } catch { /* déjà partie */ } }
  journal(`IRIS ${annee} : ${Object.keys(iris).length} IRIS gardés.`);
  return { annee, du_cache: false, iris: Object.keys(iris).length };
}

let memo = null;
/** La base réduite, en mémoire ; l'extrait s'il manque. */
export async function base(annee = MILLESIME, { journal = () => {} } = {}) {
  if (memo?.annee === annee) return memo.iris;
  if (!dejaLa(annee)) await extraire(annee, { journal });
  memo = JSON.parse(fs.readFileSync(chemin(annee), 'utf-8'));
  return memo.iris;
}

/**
 * Additionne des IRIS, chacun pour la part qui tombe dans la zone. Pure :
 * testée sans réseau.
 * @param {Array<{code:string, part:number}>} parts
 * @param {Object<string, object>} iris la base réduite
 */
export function agreger(parts, iris) {
  const s = { pop: 0, h: 0, f: 0, enfants: 0, jeunes: 0, seniors: 0, pop15p: 0, cs: [0, 0, 0, 0, 0, 0, 0, 0], act: 0, chom: 0 };
  let couverts = 0;
  for (const { code, part } of parts || []) {
    const l = iris?.[code];
    if (!l || !(part > 0)) continue;
    couverts += 1;
    for (const k of ['pop', 'h', 'f', 'enfants', 'jeunes', 'seniors', 'pop15p', 'act', 'chom']) s[k] += l[k] * part;
    l.cs.forEach((v, i) => { s.cs[i] += v * part; });
  }
  const r = (x) => Math.round(x);
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
  const cspPlus = s.cs[1] + s.cs[2] + s.cs[3];
  const majoritaire = s.cs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0])[0];
  return {
    iris: couverts,
    population: r(s.pop),
    hommes: r(s.h), femmes: r(s.f),
    part_hommes: pct(s.h, s.pop), part_femmes: pct(s.f, s.pop),
    enfants: r(s.enfants), jeunes: r(s.jeunes), seniors: r(s.seniors),
    csp_plus: r(cspPlus),
    part_csp_plus: pct(cspPlus, s.pop15p),
    csp_majoritaire: majoritaire && majoritaire[0] > 0 ? CSP[majoritaire[1]] : null,
    csp: CSP.map((nom, i) => ({ nom, n: r(s.cs[i]), part: pct(s.cs[i], s.pop15p) })),
    retraites: r(s.cs[6]),
    actifs: r(s.act), chomeurs: r(s.chom),
    taux_chomage: pct(s.chom, s.act),
  };
}

// --- Les contours ------------------------------------------------------------

/**
 * Les IRIS qui touchent une boîte [ouest, sud, est, nord], avec leur contour.
 * Toutes communes confondues : une zone de chalandise ne s'arrête pas à la
 * limite communale.
 */
export async function contours(boite) {
  const cle = boite.map((x) => x.toFixed(3)).join(',');
  const garde = Records.findBy(CACHE_CONTOURS, 'cle', cle);
  if (garde && Date.now() - Date.parse(garde.le) < CACHE_CONTOURS_JOURS * 86400000) return garde.iris;
  const p = new URLSearchParams({
    SERVICE: 'WFS', VERSION: '2.0.0', REQUEST: 'GetFeature', TYPENAMES: COUCHE,
    OUTPUTFORMAT: 'application/json', SRSNAME: 'EPSG:4326', COUNT: '1000',
    // Longitude puis latitude, comme pour les carreaux Filosofi : vérifié.
    BBOX: `${boite[0]},${boite[1]},${boite[2]},${boite[3]},EPSG:4326`,
  });
  const r = await fetch(`${WFS}?${p}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new Error(`La Géoplateforme a répondu ${r.status} pour les contours IRIS.`);
  const iris = ((await r.json()).features || []).map((f) => ({ code: f.properties?.code_iris, nom: f.properties?.nom_iris, commune: f.properties?.code_insee, geometry: f.geometry })).filter((x) => x.code && x.geometry);
  const le = new Date().toISOString();
  if (garde) Records.update(CACHE_CONTOURS, garde.id, { iris, le });
  else Records.create(CACHE_CONTOURS, { cle, iris, le });
  return iris;
}
