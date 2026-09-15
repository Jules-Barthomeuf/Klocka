// Qui possédait quoi, au 1er janvier de chaque année.
//
// Data Foncier dit qui possède un immeuble aujourd'hui, contre un crédit, et
// ne sait rien d'hier. Le fichier des locaux des personnes morales, publié
// par la DGFiP, dit qui possédait chaque parcelle au 1er janvier de chaque
// millésime depuis 2019, gratuitement, avec le SIREN. C'est une photographie
// datée, et c'est exactement ce qu'il faut pour mesurer sans tricher : on lit
// l'état d'un propriétaire à une date, on regarde ce qui s'est vendu APRÈS,
// et la vente ne peut pas contaminer ce qu'on croyait savoir avant elle.
//
// Ce qu'il débloque, et que rien d'autre ne donnait :
//   - le propriétaire à T, sur des milliers de locaux au lieu des 43 dossiers
//     de l'étude des vendeurs ;
//   - son PORTEFEUILLE : toutes ses parcelles du département, donc ce qu'il a
//     vendu récemment et ce qu'il détient encore ;
//   - une détention minimale : présent au plus vieux millésime et aucune
//     mutation DVF depuis, c'est au moins tant d'années.
//
// Ses limites, dites ici parce qu'elles décident de ce qu'on peut en
// conclure : il ne couvre QUE les personnes morales — ni les particuliers,
// ni les entreprises individuelles — et il est arrêté au 1er janvier. Pour un
// backtest, cette annualité est un avantage.
//
//   node server/alx/personnes-morales.js 2022 2023        (département 06)
//   node server/alx/personnes-morales.js 2022 --dept 13
//
// Les fichiers nationaux pèsent environ cent soixante méga-octets par année ;
// on n'en garde que les départements demandés, en JSON compact.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DATA_DIR } from '../db.js';
import { ErreurSource } from '../marche/erreurs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(DATA_DIR, 'personnes-morales');
const CATALOGUE = 'https://www.data.gouv.fr/api/1/datasets/605d268f4661cf23272817c3/';
/** Le premier millésime publié. */
export const PREMIERE_ANNEE = 2019;

/**
 * Les archives disponibles, par année. L'adresse n'est pas devinée : les noms
 * changent d'un millésime à l'autre (« fichier » puis « fichiers », un espace
 * en plus), on la lit dans le catalogue.
 * @returns {Promise<Map<number, string>>}
 */
export async function archives() {
  const r = await fetch(CATALOGUE, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new ErreurSource(`data.gouv.fr a répondu ${r.status}.`, { service: 'data.gouv.fr', statut: r.status });
  const out = new Map();
  for (const res of (await r.json()).resources || []) {
    if (res.format !== 'zip' || !/locaux/i.test(res.title || '')) continue;
    const annee = Number((res.title.match(/(20\d\d)/) || [])[1]);
    if (annee) out.set(annee, res.url);
  }
  return out;
}

/** `PM_21_B_060-1.txt` : le département 06, direction 0. */
const motifDeFichier = (dept) => `*_B_${String(dept).padStart(2, '0')}0*`;

/**
 * Les colonnes du fichier, par leur position. Le CSV est en latin-1, séparé
 * par des points-virgules, et son en-tête est verbeux ; on se fie au rang,
 * vérifié à chaque lecture contre l'en-tête.
 */
const COLONNES = { departement: 0, commune: 2, prefixe: 4, section: 5, plan: 6, niveau: 9, droit: 17, siren: 19, forme: 22, nom: 23 };
const ENTETES_ATTENDUES = { 0: /D.partement/i, 2: /Code Commune/i, 6: /plan/i, 19: /SIREN/i, 23: /nomination/i };

const propre = (v) => String(v ?? '').replace(/^"|"$/g, '').trim();

/**
 * L'identifiant de parcelle au format DVF : commune (5), préfixe (3),
 * section (2), plan (4). « 06 » + « 004 » + «    » + « AH » + « 0020 »
 * donne « 06004000AH0020 », qui est exactement ce que DVF écrit.
 */
export function parcelleDe(cases) {
  const dept = propre(cases[COLONNES.departement]).padStart(2, '0');
  const commune = propre(cases[COLONNES.commune]).padStart(3, '0');
  const prefixe = (propre(cases[COLONNES.prefixe]) || '000').padStart(3, '0');
  const section = propre(cases[COLONNES.section]).padStart(2, '0');
  const plan = propre(cases[COLONNES.plan]).padStart(4, '0');
  if (!commune || !section || !plan) return null;
  return `${dept}${commune}${prefixe}${section}${plan}`;
}

/**
 * Regroupe les lignes du fichier en un enregistrement par couple
 * (parcelle, propriétaire) : le fichier en pose une par local, et une
 * copropriété en compte des dizaines pour le même propriétaire.
 *
 * @param {Iterable<string>} lignes - les lignes du CSV, en-tête comprise
 * @returns {{parcelle, commune, siren, nom, forme, droit, locaux, rez_de_chaussee}[]}
 */
export function grouper(lignes) {
  const out = new Map();
  let entete = true;
  // Le millésime 2025 est publié en UTF-8, les précédents en latin-1 : lu en
  // latin-1, « Département » devient « DÃ©partement ». L'en-tête le trahit,
  // et chaque ligne est alors relue dans le bon encodage.
  const utf8 = (lignes.find((l) => l && l.trim()) || '').includes('Ã');
  for (const brute of lignes) {
    const ligne = utf8 && brute ? Buffer.from(brute, 'latin1').toString('utf8') : brute;
    if (!ligne || !ligne.trim()) continue;
    const cases = ligne.split(';');
    if (entete) {
      entete = false;
      for (const [rang, motif] of Object.entries(ENTETES_ATTENDUES)) {
        if (!motif.test(propre(cases[rang]) || '')) {
          throw new Error(`Le fichier des personnes morales a changé de colonnes : le rang ${rang} devrait parler de ${motif.source}, il dit « ${propre(cases[rang])} ».`);
        }
      }
      continue;
    }
    // Un département en deux fichiers (060-1, 060-2) a deux en-têtes : la
    // seconde arrivait ici en donnée, avec « N° SIREN » pour SIREN.
    if (/^"?D.partement/i.test(cases[0] || '')) continue;
    const parcelle = parcelleDe(cases);
    const siren = propre(cases[COLONNES.siren]);
    if (!parcelle || !siren) continue;
    const cle = `${parcelle}|${siren}`;
    const e = out.get(cle) || {
      parcelle,
      commune: parcelle.slice(0, 5),
      siren,
      nom: propre(cases[COLONNES.nom]),
      forme: propre(cases[COLONNES.forme]),
      droit: propre(cases[COLONNES.droit]),
      locaux: 0,
      rez_de_chaussee: false,
    };
    e.locaux += 1;
    // Un commerce est au rez-de-chaussée : le niveau « 00 » dit lesquelles de
    // ces parcelles peuvent en porter un.
    if (/^0*$/.test(propre(cases[COLONNES.niveau]))) e.rez_de_chaussee = true;
    out.set(cle, e);
  }
  return [...out.values()];
}

// --- Le cache -----------------------------------------------------------------

const chemin = (annee, dept) => path.join(CACHE, `${dept}-${annee}.json`);

/** Le millésime est-il déjà extrait pour ce département ? */
export const dejaLa = (annee, dept) => fs.existsSync(chemin(annee, dept));

/** Les propriétaires d'un département à une date, depuis le cache. */
export function lire(annee, dept = '06') {
  try {
    // Le code droit s'écrit « P » jusqu'en 2023, « P - Propriétaire » en
    // 2025 : les variables comparent au code, on le ramène à sa lettre.
    return JSON.parse(fs.readFileSync(chemin(annee, dept), 'utf-8')).map((g) => ({ ...g, droit: codeDroit(g.droit) }));
  } catch {
    return null;
  }
}

/** « P - Propriétaire » → « P » ; un code déjà court reste tel quel. */
export const codeDroit = (droit) => String(droit || '').split(/\s+-\s+/)[0].trim();

/** Les lignes du département, tirées de l'archive nationale sans la dégonfler entière. */
function lignesDuDepartement(zip, dept) {
  return new Promise((resolve, reject) => {
    // `unzip -p` écrit le contenu sur la sortie standard : on ne pose jamais
    // les cent méga-octets décompressés sur le disque.
    const enfant = spawn('unzip', ['-p', zip, motifDeFichier(dept)], { stdio: ['ignore', 'pipe', 'pipe'] });
    const lignes = [];
    let reste = '';
    let erreurs = '';
    enfant.stdout.on('data', (bloc) => {
      // Le fichier est en latin-1 : le lire en UTF-8 casserait les accents des
      // dénominations, et c'est par elles qu'on reconnaît une SCI familiale.
      reste += bloc.toString('latin1');
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

/**
 * Télécharge un millésime et en extrait les départements demandés.
 * Ne retélécharge rien qui soit déjà là.
 *
 * @param {number} annee
 * @param {{departements?: string[], journal?: Function, forcer?: boolean}} [opts]
 */
export async function extraire(annee, { departements = ['06'], journal = () => {}, forcer = false, garderArchive = false } = {}) {
  const manquants = departements.filter((d) => forcer || !dejaLa(annee, d));
  if (!manquants.length) {
    journal(`${annee} : déjà extrait (${departements.join(', ')}).`);
    return departements.map((d) => ({ annee, dept: d, lignes: lire(annee, d)?.length || 0, du_cache: true }));
  }

  fs.mkdirSync(CACHE, { recursive: true });
  const zip = path.join(CACHE, `national-${annee}.zip`);
  if (!fs.existsSync(zip)) {
    const url = (await archives()).get(annee);
    if (!url) throw new Error(`Aucune archive publiée pour ${annee}.`);
    journal(`${annee} : téléchargement de l'archive nationale…`);
    const r = await fetch(url, { signal: AbortSignal.timeout(900000) });
    if (!r.ok) throw new ErreurSource(`Le téléchargement a répondu ${r.status}.`, { service: 'data.economie.gouv.fr', statut: r.status });
    fs.writeFileSync(zip, Buffer.from(await r.arrayBuffer()));
    journal(`${annee} : archive de ${Math.round(fs.statSync(zip).size / 1e6)} Mo.`);
  }

  const faits = [];
  for (const dept of manquants) {
    const lignes = await lignesDuDepartement(zip, dept);
    const groupes = grouper(lignes);
    fs.writeFileSync(chemin(annee, dept), JSON.stringify(groupes));
    journal(`${annee} · ${dept} : ${lignes.length} lignes, ${groupes.length} couples parcelle-propriétaire, ${new Set(groupes.map((g) => g.siren)).size} sociétés.`);
    faits.push({ annee, dept, lignes: groupes.length, du_cache: false });
  }
  // L'archive nationale ne sert qu'à l'extraction : on la retire, les
  // départements gardés pèsent mille fois moins.
  // Gardée quand ALX télécharge à la demande : le département suivant
  // s'extrait de la même archive sans deux cents mégas de plus.
  if (!garderArchive) { try { fs.unlinkSync(zip); } catch { /* déjà partie */ } }
  return faits;
}

// --- Ce qu'on en tire ----------------------------------------------------------

/** Le propriétaire de chaque parcelle, à cette date. Une parcelle en a parfois plusieurs. */
export function parParcelle(groupes) {
  const out = new Map();
  for (const g of groupes || []) {
    const liste = out.get(g.parcelle) || [];
    liste.push(g);
    out.set(g.parcelle, liste);
  }
  return out;
}

/** Le portefeuille de chaque société : toutes ses parcelles du département. */
export function parSiren(groupes) {
  const out = new Map();
  for (const g of groupes || []) {
    const liste = out.get(g.siren) || [];
    liste.push(g);
    out.set(g.siren, liste);
  }
  return out;
}

/**
 * Depuis quand une société détient une parcelle, au moins : le plus vieux
 * millésime où on l'y trouve, sans interruption jusqu'au plus récent.
 * Rend null si elle n'apparaît pas au plus vieux millésime lu — on ne sait
 * alors pas si elle détenait avant.
 *
 * @param {Map<number, Map<string, object[]>>} parAnnee - millésime → index par parcelle
 */
export function detentionMinimale(parAnnee, parcelle, siren) {
  const annees = [...parAnnee.keys()].sort((a, b) => a - b);
  if (!annees.length) return null;
  let depuis = null;
  for (const a of annees) {
    const la = (parAnnee.get(a).get(parcelle) || []).some((g) => g.siren === siren);
    if (la && depuis == null) depuis = a;
    if (!la) depuis = null;
  }
  return depuis === annees[0] ? { depuis, annees_min: annees[annees.length - 1] - annees[0] + 1, complet: false } : depuis != null ? { depuis, annees_min: annees[annees.length - 1] - depuis, complet: true } : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--dept');
  const departements = i >= 0 ? args[i + 1].split(',') : ['06'];
  const annees = args.filter((a) => /^20\d\d$/.test(a)).map(Number);
  if (!annees.length) {
    console.log('Usage : node server/alx/personnes-morales.js <année> [<année>…] [--dept 06,13]');
    process.exit(1);
  }
  for (const a of annees) await extraire(a, { departements, journal: console.log });
}
