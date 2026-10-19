// Le stock SIRENE des établissements (boîte à outils, 18 oct. 2026, spec de Jules : « Sirene n'a pas besoin
// de clé pour l'import en masse »).
//
// L'INSEE publie chaque mois sur data.gouv.fr le fichier StockEtablissement (licence ouverte, sans clé) :
// un zip d'environ 3 Go, un seul CSV, coordonnées Lambert 93 comprises. On le lit en flux, sans jamais le
// poser sur le disque : on décompresse au fil de l'eau, on ne garde que les établissements des départements
// chargés (06 d'abord), actifs ou fermés depuis moins de HUIT_ANS, en diffusion publique. Ils vont dans
// `entrepot_sirene`, une ligne par SIRET ; un import remplace celui d'avant pour le département.
//
// Le registre de la vacance (outils/vacance-sources.js) les lit à la place de l'API quand la commune y est :
// `versApi` rend chaque ligne dans la forme de l'API Sirene, que son parseur lit déjà.

import { Readable, Transform } from 'stream';
import readline from 'readline';
import zlib from 'zlib';
import db from '../../db.js';

const DATASET = 'https://www.data.gouv.fr/api/1/datasets/base-sirene-des-entreprises-et-de-leurs-etablissements-siren-siret/';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';
export const HUIT_ANS = 8;

db.exec(`
  CREATE TABLE IF NOT EXISTS entrepot_sirene (
    siret TEXT PRIMARY KEY, siren TEXT NOT NULL, departement TEXT NOT NULL, commune TEXT NOT NULL, code_postal TEXT,
    etat TEXT, date_debut TEXT, date_creation TEXT, siege INTEGER, naf TEXT, enseigne TEXT, denomination_usuelle TEXT,
    numero TEXT, indice TEXT, type_voie TEXT, voie TEXT, libelle_commune TEXT, x REAL, y REAL, millesime TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entrepot_sirene_commune ON entrepot_sirene(commune);
  CREATE INDEX IF NOT EXISTS idx_entrepot_sirene_siren ON entrepot_sirene(siren);
`);
// Le nom et la catégorie juridique de l'entreprise : du fichier des unités légales, en seconde passe.
for (const col of ['denomination TEXT', 'categorie_juridique TEXT']) {
  try { db.exec(`ALTER TABLE entrepot_sirene ADD COLUMN ${col}`); } catch { /* déjà là */ }
}

/** Pure : découpe une ligne CSV (guillemets doublés acceptés). */
export function lireLigneCsv(ligne) {
  const champs = [];
  let cur = '';
  let entre = false;
  for (let i = 0; i < ligne.length; i += 1) {
    const c = ligne[i];
    if (entre) {
      if (c === '"' && ligne[i + 1] === '"') { cur += '"'; i += 1; }
      else if (c === '"') entre = false;
      else cur += c;
    } else if (c === '"') entre = true;
    else if (c === ',') { champs.push(cur); cur = ''; }
    else cur += c;
  }
  champs.push(cur);
  return champs;
}

/** Pure : la ligne est-elle à garder ? Le département, la diffusion publique, actif ou fermé récemment. */
export function aGarder(l, { departements, depuis }) {
  const commune = l.codeCommuneEtablissement || '';
  if (!departements.some((d) => commune.startsWith(d))) return false;
  if (l.statutDiffusionEtablissement === 'P') return false;
  if (l.etatAdministratifEtablissement === 'A') return true;
  return l.etatAdministratifEtablissement === 'F' && (l.dateDebut || '') >= depuis;
}

/** Pure : une ligne de l'entrepôt dans la forme de l'API Sirene (celle que lit lireEtablissementVacance). */
export function versApi(r) {
  return {
    siret: r.siret,
    siren: r.siren,
    statutDiffusionEtablissement: 'O',
    dateCreationEtablissement: r.date_creation || null,
    etablissementSiege: !!r.siege,
    uniteLegale: { denominationUniteLegale: r.denomination || null, categorieJuridiqueUniteLegale: r.categorie_juridique || null },
    adresseEtablissement: {
      numeroVoieEtablissement: r.numero || null, indiceRepetitionEtablissement: r.indice || null, typeVoieEtablissement: r.type_voie || null,
      libelleVoieEtablissement: r.voie || null, codePostalEtablissement: r.code_postal || null, libelleCommuneEtablissement: r.libelle_commune || null,
      codeCommuneEtablissement: r.commune, coordonneeLambertAbscisseEtablissement: r.x ?? null, coordonneeLambertOrdonneeEtablissement: r.y ?? null,
    },
    periodesEtablissement: [{
      dateFin: null, dateDebut: r.date_debut || null, etatAdministratifEtablissement: r.etat,
      enseigne1Etablissement: r.enseigne || null, denominationUsuelleEtablissement: r.denomination_usuelle || null, activitePrincipaleEtablissement: r.naf || null,
    }],
  };
}

/** Pure : le nom d'une unité légale (la dénomination, sinon prénom et nom d'usage ou de naissance). */
export function nomUniteLegale(l) {
  return l.denominationUniteLegale || [l.prenomUsuelUniteLegale || l.prenom1UniteLegale, l.nomUsageUniteLegale || l.nomUniteLegale].filter(Boolean).join(' ') || null;
}

/** L'adresse et la date du dernier fichier StockEtablissement (CSV zippé) publié. */
export async function dernierStock(fichier = 'StockEtablissement') {
  const r = await fetch(DATASET, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`data.gouv.fr ${r.status}`);
  const res = ((await r.json()).resources || []).find((x) => String(x.title || '').startsWith(`Sirene : Fichier ${fichier} - `) && !/parquet/i.test(x.title || ''));
  if (!res) throw new Error(`Fichier ${fichier} introuvable sur data.gouv.fr.`);
  return { url: res.url, millesime: String(res.last_modified || '').slice(0, 10), taille: res.filesize || null };
}

/** Pure (flux) : retire l'en-tête local du zip, laisse passer les données compressées du premier fichier. */
export function sansEnteteZip() {
  let tete = Buffer.alloc(0);
  let passe = false;
  return new Transform({
    transform(morceau, _enc, fin) {
      if (passe) return fin(null, morceau);
      tete = Buffer.concat([tete, morceau]);
      if (tete.length < 30) return fin();
      if (tete.readUInt32LE(0) !== 0x04034b50) return fin(new Error("Le fichier n'est pas un zip."));
      const debut = 30 + tete.readUInt16LE(26) + tete.readUInt16LE(28);
      if (tete.length < debut) return fin();
      passe = true;
      return fin(null, tete.subarray(debut));
    },
  });
}

/**
 * Les lignes du CSV du zip, en flux, le débit réglé par les flux eux-mêmes. Après les données compressées vient
 * le répertoire du zip : le décompresseur s'arrête à la fin du fichier et l'ignore.
 */
function lignesDuZip(corps) {
  const inflate = zlib.createInflateRaw();
  const source = Readable.fromWeb(corps);
  source.on('error', (e) => inflate.destroy(e));
  source.pipe(sansEnteteZip()).on('error', (e) => inflate.destroy(e)).pipe(inflate);
  return readline.createInterface({ input: inflate, crlfDelay: Infinity });
}

/**
 * Importe le stock pour un département. Rend { lignes, millesime }. `url` force un fichier (essais).
 * `surProgres` reçoit un mot de temps en temps (lignes lues, gardées).
 */
export async function importerSireneStock({ departement, url = null, urlUnites = null, surProgres = null } = {}) {
  const dep = String(departement || '').trim();
  if (!/^(\d{2}|2A|2B|97\d)$/.test(dep)) throw new Error(`Département invalide : ${departement}`);
  const stock = url ? { url, millesime: new Date().toISOString().slice(0, 10) } : await dernierStock();
  const r = await fetch(stock.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(3 * 3600 * 1000) });
  if (!r.ok || !r.body) throw new Error(`Téléchargement du stock : ${r.status}`);
  const depuis = new Date(Date.now() - HUIT_ANS * 365.25 * 86400000).toISOString().slice(0, 10);
  const ins = db.prepare(`INSERT OR REPLACE INTO entrepot_sirene (siret, siren, departement, commune, code_postal, etat, date_debut, date_creation, siege, naf,
    enseigne, denomination_usuelle, numero, indice, type_voie, voie, libelle_commune, x, y, millesime) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  let entetes = null;
  let lues = 0;
  let gardees = 0;
  let lot = [];
  const vider = () => { if (!lot.length) return; const l = lot; lot = []; db.transaction(() => { for (const v of l) ins.run(...v); })(); };
  for await (const ligne of lignesDuZip(r.body)) {
    if (!entetes) { entetes = lireLigneCsv(ligne); continue; }
    if (!ligne) continue;
    lues += 1;
    // Le département se lit avant de découper la ligne entière : 99 % des lignes s'arrêtent là.
    if (!ligne.includes(`,${dep}`)) continue;
    const c = lireLigneCsv(ligne);
    const l = Object.fromEntries(entetes.map((k, i) => [k, c[i] || '']));
    if (!aGarder(l, { departements: [dep], depuis })) continue;
    gardees += 1;
    lot.push([l.siret, l.siren, dep, l.codeCommuneEtablissement, l.codePostalEtablissement || null, l.etatAdministratifEtablissement, l.dateDebut || null,
      l.dateCreationEtablissement || null, l.etablissementSiege === 'true' ? 1 : 0, l.activitePrincipaleEtablissement || null, l.enseigne1Etablissement || null,
      l.denominationUsuelleEtablissement || null, l.numeroVoieEtablissement || null, l.indiceRepetitionEtablissement || null, l.typeVoieEtablissement || null,
      l.libelleVoieEtablissement || null, l.libelleCommuneEtablissement || null, Number(l.coordonneeLambertAbscisseEtablissement) || null,
      Number(l.coordonneeLambertOrdonneeEtablissement) || null, stock.millesime]);
    if (lot.length >= 2000) vider();
    if (lues % 2000000 === 0) surProgres?.(`${(lues / 1e6).toFixed(0)} millions de lignes lues, ${gardees} gardées`);
  }
  vider();
  if (!entetes) throw new Error('Le stock est vide.');
  if (!gardees) throw new Error(`Aucun établissement gardé pour le ${dep} : le fichier a peut-être changé de forme.`);
  // Ce qui n'était plus dans ce fichier sort : un établissement fermé depuis trop longtemps, ou passé en diffusion partielle.
  db.prepare('DELETE FROM entrepot_sirene WHERE departement = ? AND millesime <> ?').run(dep, stock.millesime);

  // Seconde passe : le nom et la catégorie juridique des entreprises gardées, depuis le stock des unités légales.
  const sirens = new Set(db.prepare('SELECT DISTINCT siren FROM entrepot_sirene WHERE departement = ?').all(dep).map((x) => x.siren));
  const unites = urlUnites ? { url: urlUnites } : await dernierStock('StockUniteLegale');
  const ru = await fetch(unites.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(3 * 3600 * 1000) });
  if (!ru.ok || !ru.body) throw new Error(`Téléchargement des unités légales : ${ru.status}`);
  const maj = db.prepare('UPDATE entrepot_sirene SET denomination = ?, categorie_juridique = ? WHERE siren = ?');
  let ent = null;
  let nommees = 0;
  let paquet = [];
  const ecrire = () => { if (!paquet.length) return; const p = paquet; paquet = []; db.transaction(() => { for (const v of p) maj.run(...v); })(); };
  for await (const ligne of lignesDuZip(ru.body)) {
    if (!ent) { ent = lireLigneCsv(ligne); continue; }
    const siren = ligne.slice(0, 9);
    if (!sirens.has(siren)) continue;
    const c = lireLigneCsv(ligne);
    const l = Object.fromEntries(ent.map((k, i) => [k, c[i] || '']));
    if (l.statutDiffusionUniteLegale === 'P') continue;
    paquet.push([nomUniteLegale(l), l.categorieJuridiqueUniteLegale || null, siren]);
    nommees += 1;
    if (paquet.length >= 2000) ecrire();
  }
  ecrire();
  return { lignes: gardees, lues, entreprises: sirens.size, nommees, millesime: stock.millesime };
}

/** Lecture : les établissements d'une commune, dans la forme de l'API. */
export const etablissementsDeCommune = (commune) => db.prepare('SELECT * FROM entrepot_sirene WHERE commune = ?').all(commune);
/** La commune est-elle dans l'entrepôt ? */
export const communeChargee = (commune) => !!db.prepare('SELECT 1 FROM entrepot_sirene WHERE commune = ? LIMIT 1').get(commune);
/** Les établissements de plusieurs entreprises, depuis l'entrepôt. */
export function etablissementsDeSirens(sirens = []) {
  if (!sirens.length) return [];
  // Une requête préparée par paquet : avec plus de 500 SIREN, un seul `IN (?,?…)` de la taille de la liste recevait
  // 500 valeurs et levait « Too few parameter values » (Cannes, 19 oct. 2026).
  const out = [];
  for (let i = 0; i < sirens.length; i += 500) {
    const paquet = sirens.slice(i, i + 500);
    out.push(...db.prepare(`SELECT * FROM entrepot_sirene WHERE siren IN (${paquet.map(() => '?').join(',')})`).all(...paquet));
  }
  return out;
}
