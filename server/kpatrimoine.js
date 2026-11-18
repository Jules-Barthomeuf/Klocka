// K-Patrimoine : d'un bien en vente à la société qui en possède les murs, puis à tout ce qu'elle possède ailleurs
// (Jules, 17 nov. 2026 : « remonter depuis le bien vers les SCI pour voir les autres biens qu'ils ont, c'est ça qui
// va nous permettre de prendre les mandats sur les autres biens directement »).
//
// Le chemin, sans clé ni crédit :
//   1. l'adresse, résolue par la Base Adresse Nationale ;
//   2. les personnes morales propriétaires d'un local à cette adresse : le fichier des locaux des personnes morales
//      (DGFiP, licence ouverte, situation au 1er janvier), lu dans l'archive nationale déjà gardée par ALX
//      (data/personnes-morales/national-AAAA.zip), département seul ;
//   3. pour chaque société : sa fiche (annuaire des entreprises, RNE), ses annonces BODACC, ses comptes déposés, et
//      les autres sociétés de ses dirigeants (même nom, mêmes prénoms, même mois de naissance ; une société gérante
//      par son SIREN dans la liste des dirigeants) ;
//   4. le patrimoine de toutes ces sociétés, dans toute la France : un seul passage sur l'archive nationale (onze
//      secondes en local), filtré par `grep -F` sur les SIREN, hors du fil de Node.
//
// Ce que la source ne dit pas, on ne le devine pas : les particuliers n'y sont jamais, la nature du local (commerce,
// logement) n'y est pas (le niveau « 00 », le rez-de-chaussée, est le seul indice d'un commerce), et la photographie
// est celle du 1er janvier du millésime, pas d'aujourd'hui. La fiche d'un bien complète au clic : les commerces
// ouverts à l'adresse (SIRENE), la dernière vente (DVF), la contenance (cadastre), les autres sociétés de la parcelle.

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { DATA_DIR, Records } from './db.js';
import { resoudreAdresse } from './adresse-ban.js';
import { FORMES } from './kzoning-societe.js';

const ENTITE = 'PatrimoineBien';
const CACHE_PARCELLE = 'CachePatrimoineParcelle';
const DOSSIER = path.join(DATA_DIR, 'personnes-morales');
const ANNUAIRE = 'https://recherche-entreprises.api.gouv.fr/search';
const CADASTRE = 'https://apicarto.ign.fr/api/cadastre/parcelle';
const UA = 'Klocka/1.0';
/** Les propriétaires d'une adresse qu'on suit jusqu'au bout (une copropriété en compte parfois des dizaines). */
const PROPRIETAIRES_MAX = 6;
/** Les sociétés liées gardées par dirigeant : au-delà, c'est un groupe, et la liste se lit sur l'annuaire. */
const LIEES_PAR_DIRIGEANT = 40;
/** Les biens gardés par société : une banque en a des milliers, on garde le compte exact et les premiers. */
const BIENS_MAX = 400;

// --- Pur : les lignes du fichier --------------------------------------------------------------------------------

/** Pure : un texte en capitales sans accents ni ponctuation, comme le fichier écrit ses voies. */
export const normal = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

// Les natures de voie du fichier, abrégées, et leur mot entier tel que la BAN l'écrit.
const NATURES = {
  AV: 'AVENUE', BD: 'BOULEVARD', PL: 'PLACE', CRS: 'COURS', IMP: 'IMPASSE', ALL: 'ALLEE', CHE: 'CHEMIN', RTE: 'ROUTE',
  PASS: 'PASSAGE', SQ: 'SQUARE', FG: 'FAUBOURG', PROM: 'PROMENADE', RLE: 'RUELLE', ESP: 'ESPLANADE', PRV: 'PARVIS',
  TRA: 'TRAVERSE', MTE: 'MONTEE', RES: 'RESIDENCE', LOT: 'LOTISSEMENT', HAM: 'HAMEAU', CAR: 'CARREFOUR', RPT: 'ROND POINT',
  QUA: 'QUARTIER', SEN: 'SENTIER', VLA: 'VILLA', GAL: 'GALERIE', CHS: 'CHAUSSEE', PTE: 'PORTE', PONT: 'PONT', QUAI: 'QUAI', RUE: 'RUE',
};
const MOTS_DE_VOIE = new Set(Object.values(NATURES).flatMap((v) => v.split(' ')).concat(['CITE', 'ROND', 'POINT', 'GRANDE']));

/** Pure : la voie de la BAN sans son type en tête (« Rue Saint-Aubin » → « SAINT AUBIN »). */
export function voieSansType(rue) {
  const m = normal(rue).split(' ');
  if (m.length > 1 && MOTS_DE_VOIE.has(m[0]) && m[0] !== 'GRANDE') return m.slice(m[0] === 'ROND' ? 2 : 1).join(' ');
  return m.join(' ');
}

/** Pure : la voie d'une ligne du fichier est-elle celle de la BAN ? Type compris quand les deux le disent. */
export function voieCorrespond(nature, voie, rueBan) {
  const v = normal(voie);
  const ban = normal(rueBan);
  if (!v || !ban) return false;
  const n = NATURES[normal(nature)] || normal(nature);
  if (n && `${n} ${v}` === ban) return true;
  if (v === ban) return true;
  // « En Fournirue » chez la BAN, « RUE » + « EN FOURNIRUE » au fichier : la voie sans type suffit, si le type de la BAN
  // n'en contredit pas un autre (« Boulevard Gambetta » n'est pas la « RUE GAMBETTA »).
  if (v === voieSansType(rueBan)) {
    const typeBan = ban.split(' ')[0];
    return !MOTS_DE_VOIE.has(typeBan) || !n || n.split(' ')[0] === typeBan;
  }
  return false;
}

/** Pure : le rang des colonnes du fichier des locaux (millésime 2026, vingt-quatre colonnes). */
const C = { dep: 0, com: 2, nomCommune: 3, prefixe: 4, section: 5, plan: 6, batiment: 7, entree: 8, niveau: 9, porte: 10, numero: 11, indice: 12, nature: 15, voie: 16, droit: 17, siren: 19, groupe: 20, formeCode: 21, forme: 22, nom: 23 };

/** Pure : une ligne du fichier en local, ou null. */
export function lireLigne(ligne) {
  const c = String(ligne || '').replace(/\r$/, '').split(';').map((x) => x.trim());
  if (c.length < 24 || !/^\d{9}$/.test(c[C.siren])) return null;
  const dep = c[C.dep];
  const com = c[C.com].padStart(3, '0');
  const section = c[C.section].padStart(2, '0');
  const plan = c[C.plan].padStart(4, '0');
  if (!dep || !section.trim() || !plan) return null;
  const numero = c[C.numero] && Number(c[C.numero]) ? String(Number(c[C.numero])) : null;
  const indice = c[C.indice] || null;
  // Outre-mer : le département a trois chiffres (« 971 ») et la commune deux dans le code INSEE (« 97101 »).
  const insee = dep.length === 3 ? `${dep}${com.slice(-2)}` : `${dep}${com}`;
  return {
    insee,
    commune: c[C.nomCommune] || null,
    idu: `${insee}${(c[C.prefixe] || '000').padStart(3, '0')}${section}${plan}`,
    section,
    plan,
    batiment: c[C.batiment] || null,
    entree: c[C.entree] || null,
    niveau: c[C.niveau] || null,
    porte: c[C.porte] || null,
    numero,
    indice,
    nature: c[C.nature] || null,
    voie: c[C.voie] || null,
    droit: c[C.droit] || null,
    siren: c[C.siren],
    groupe: c[C.groupe] || null,
    forme_code: c[C.formeCode] || null,
    forme: c[C.forme] || null,
    nom: c[C.nom] || null,
  };
}

/** Pure : l'adresse lisible d'un local (« 18 RUE GAMBETTA »). */
export const adresseDe = (l) => [l.numero, l.indice, NATURES[normal(l.nature)] || l.nature, l.voie].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim() || null;

const rdc = (niveau) => /^0*$/.test(String(niveau ?? '').trim()) && String(niveau ?? '').trim() !== '';

/**
 * Pure : les locaux d'une société regroupés en biens, un par parcelle et par adresse.
 * @returns {{cle, idu, insee, commune, adresse, section, plan, rdc, droits, locaux}[]}
 */
export function grouperBiens(lignes) {
  const out = new Map();
  for (const l of lignes || []) {
    const adresse = adresseDe(l);
    const cle = `${l.idu}|${adresse || ''}`;
    let b = out.get(cle);
    if (!b) {
      b = { cle, idu: l.idu, insee: l.insee, commune: l.commune, departement: l.insee.slice(0, 2), adresse, numero: l.numero, voie: l.voie, nature: l.nature, section: l.section, plan: l.plan, rdc: false, droits: [], locaux: [] };
      out.set(cle, b);
    }
    if (rdc(l.niveau)) b.rdc = true;
    if (l.droit && !b.droits.includes(l.droit)) b.droits.push(l.droit);
    b.locaux.push({ batiment: l.batiment, entree: l.entree, niveau: l.niveau, porte: l.porte });
  }
  return [...out.values()];
}

/** Pure : les biens dans l'ordre de lecture : la commune du bien en vente d'abord, puis le reste par département. */
export function classerBiens(biens, insee = null) {
  return [...biens].sort((a, b) =>
    (b.insee === insee) - (a.insee === insee)
    || String(a.departement).localeCompare(String(b.departement))
    || String(a.commune).localeCompare(String(b.commune))
    || b.locaux.length - a.locaux.length);
}

/**
 * Pure : les propriétaires d'une adresse, celui qui a le plus de chances de porter le commerce en tête : un local au
 * rez-de-chaussée, une société civile, puis le plus de locaux. Un organisme public ou remarquable (groupe non nul) passe
 * après une société ordinaire.
 */
export function classerProprietaires(lignes) {
  const parSiren = new Map();
  for (const l of lignes) {
    const p = parSiren.get(l.siren) || { siren: l.siren, nom: l.nom, forme: l.forme, forme_code: l.forme_code, groupe: l.groupe, droits: [], locaux: [], rdc: false };
    if (rdc(l.niveau)) p.rdc = true;
    if (l.droit && !p.droits.includes(l.droit)) p.droits.push(l.droit);
    p.locaux.push({ batiment: l.batiment, entree: l.entree, niveau: l.niveau, porte: l.porte, idu: l.idu });
    parSiren.set(l.siren, p);
  }
  const civile = (p) => String(p.forme_code || '').startsWith('65');
  const ordinaire = (p) => /^0\b/.test(String(p.groupe || '0'));
  return [...parSiren.values()].sort((a, b) =>
    b.rdc - a.rdc || ordinaire(b) - ordinaire(a) || civile(b) - civile(a) || b.locaux.length - a.locaux.length);
}

/** Pure : la fenêtre de naissance d'un dirigeant pour l'annuaire (« 1986-10 » → 1er au 31 octobre 1986). */
export function fenetreNaissance(date) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const fin = new Date(Date.UTC(Number(m[1]), Number(m[2]), 0)).getUTCDate();
  return { min: `${m[1]}-${m[2]}-01`, max: `${m[1]}-${m[2]}-${String(fin).padStart(2, '0')}` };
}

/** Pure : le département d'un code INSEE, au nommage des fichiers de la DGFiP (« 57463 » → « 57 », « 2A004 » → « 2A »). */
export const departementDe = (insee) => (String(insee).startsWith('97') ? String(insee).slice(0, 3) : String(insee).slice(0, 2));

// --- L'archive nationale ----------------------------------------------------------------------------------------

/** La plus récente archive nationale posée sur le disque, ou null. */
export function archiveLocale() {
  try {
    const z = fs.readdirSync(DOSSIER).map((f) => ({ f, annee: Number((f.match(/^national-(\d{4})\.zip$/) || [])[1]) })).filter((x) => x.annee).sort((a, b) => b.annee - a.annee)[0];
    return z ? { chemin: path.join(DOSSIER, z.f), annee: z.annee } : null;
  } catch { return null; }
}

let telechargement = null;
/** L'archive nationale : celle du disque, sinon la dernière publiée, téléchargée une fois et gardée (deux cents Mo). */
async function archive() {
  const locale = archiveLocale();
  if (locale) return locale;
  telechargement ||= (async () => {
    const { archives } = await import('./alx/personnes-morales.js');
    const toutes = await archives();
    const annee = Math.max(...toutes.keys());
    if (!Number.isFinite(annee)) throw new Error('Aucune archive des personnes morales publiée sur data.gouv.fr.');
    fs.mkdirSync(DOSSIER, { recursive: true });
    const chemin = path.join(DOSSIER, `national-${annee}.zip`);
    const r = await fetch(toutes.get(annee), { signal: AbortSignal.timeout(900000) });
    if (!r.ok) throw new Error(`Le téléchargement de l'archive a répondu ${r.status}.`);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(`${chemin}.partiel`));
    fs.renameSync(`${chemin}.partiel`, chemin);
    return { chemin, annee };
  })().finally(() => { telechargement = null; });
  return telechargement;
}

/**
 * Les lignes de l'archive qui portent un des motifs, lues par `unzip -p | grep` : rien ne se décompresse sur le disque
 * et le filtre tourne hors de Node. `fichiers` : un motif d'unzip (un département), ou rien pour toute la France.
 */
function balayer(zip, { fichiers = null, fixes = [], regex = null }) {
  return new Promise((resolve, reject) => {
    const unzip = spawn('unzip', ['-p', zip, ...(fichiers ? [fichiers] : [])], { stdio: ['ignore', 'pipe', 'ignore'] });
    // Une seule expression, jamais une liste de `-F -e` : le grep de macOS met six minutes à filtrer soixante-dix
    // SIREN en motifs séparés, onze secondes en une alternance (17 nov. 2026).
    const args = ['-a', '-E', regex || `;(${fixes.join('|')});`];
    const grep = spawn('grep', args, { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' } });
    unzip.stdout.pipe(grep.stdin);
    grep.stdin.on('error', () => { /* grep fini avant unzip */ });
    const morceaux = [];
    let erreur = '';
    grep.stdout.on('data', (b) => morceaux.push(b));
    grep.stderr.on('data', (b) => { erreur += b; });
    unzip.on('error', reject);
    grep.on('error', reject);
    grep.on('close', (code) => {
      if (code > 1) return reject(new Error(erreur.trim() || `grep s'est arrêté (code ${code}).`));
      const brut = Buffer.concat(morceaux);
      // Le millésime 2025 et suivants sont en UTF-8, les précédents en latin-1.
      let texte;
      try { texte = new TextDecoder('utf-8', { fatal: true }).decode(brut); } catch { texte = brut.toString('latin1'); }
      resolve(texte.split('\n').filter(Boolean));
    });
  });
}

const fichierDuDepartement = (dep) => `*_B_${dep}0*`;

/** Les locaux des personnes morales à une adresse de la BAN. */
export async function locauxALAdresse(adresse) {
  const { chemin, annee } = await archive();
  const dep = departementDe(adresse.code_insee);
  const com = adresse.code_insee.slice(dep.length);
  const lignes = await balayer(chemin, { fichiers: fichierDuDepartement(dep), regex: `^${dep};[0-9]*;${com.padStart(3, '0')};` });
  const numero = String(Number(String(adresse.numero || '').match(/^\d+/)?.[0] || NaN));
  const locaux = lignes.map(lireLigne).filter(Boolean)
    .filter((l) => l.numero === numero && voieCorrespond(l.nature, l.voie, adresse.rue));
  return { annee, locaux };
}

/** Les locaux de plusieurs sociétés, dans toute la France, en un passage. */
async function locauxDesSirens(sirens) {
  const { chemin, annee } = await archive();
  const liste = [...new Set(sirens)].filter((s) => /^\d{9}$/.test(s));
  if (!liste.length) return { annee, parSiren: new Map() };
  const lignes = await balayer(chemin, { fixes: liste });
  const parSiren = new Map(liste.map((s) => [s, []]));
  for (const l of lignes.map(lireLigne)) if (l && parSiren.has(l.siren)) parSiren.get(l.siren).push(l);
  return { annee, parSiren };
}

// --- L'annuaire des entreprises ------------------------------------------------------------------------------------

const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));
async function annuaire(params) {
  for (let essai = 0; essai < 3; essai += 1) {
    const r = await fetch(`${ANNUAIRE}?${new URLSearchParams(params)}`, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(25000) });
    // Sept appels par seconde au plus : au-delà, l'annuaire répond 429 et se laisse attendre.
    if (r.status === 429) { await pause(1500 * (essai + 1)); continue; }
    if (!r.ok) throw new Error(`L'annuaire des entreprises a répondu ${r.status}.`);
    await pause(160);
    return r.json();
  }
  throw new Error("L'annuaire des entreprises refuse les appels : réessayez dans une minute.");
}

const forme = (code) => FORMES[Number(code)] || null;
const jour = (iso) => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : null);

/** Une société de l'annuaire, en ligne courte. */
const courte = (r) => ({
  siren: r.siren,
  nom: r.nom_complet,
  forme: forme(r.nature_juridique),
  forme_code: r.nature_juridique || null,
  active: r.etat_administratif === 'A',
  creation: jour(r.date_creation),
  siege: r.siege ? [r.siege.adresse].filter(Boolean).join(' ') : null,
  activite: r.activite_principale || null,
});

/** La fiche brute d'une société (dirigeants avec leur mois de naissance, finances, TVA), ou null. */
async function ficheBrute(siren) {
  const d = await annuaire({ q: siren, per_page: '1' });
  return (d.results || []).find((r) => r.siren === siren) || null;
}

/** Les autres sociétés d'un dirigeant. */
async function societesDuDirigeant(d, siren) {
  if (d.type_dirigeant === 'personne morale') {
    if (!/^\d{9}$/.test(String(d.siren || ''))) return [];
    const r = await annuaire({ q: d.denomination || d.siren, per_page: '25' });
    const gerees = (r.results || []).filter((x) => x.siren !== siren && (x.siren === d.siren || (x.dirigeants || []).some((y) => y.siren === d.siren)));
    return gerees.slice(0, LIEES_PAR_DIRIGEANT).map(courte);
  }
  const nom = String(d.nom || '').trim();
  const prenom = String(d.prenoms || '').trim().split(/\s+/)[0];
  if (!nom || !prenom) return [];
  const params = { nom_personne: nom, prenoms_personne: prenom, type_personne: 'dirigeant', per_page: '25' };
  const f = fenetreNaissance(d.date_de_naissance);
  if (f) Object.assign(params, { date_naissance_personne_min: f.min, date_naissance_personne_max: f.max });
  // Sans mois de naissance, deux homonymes se confondraient : on ne cherche pas.
  else return [];
  const out = [];
  for (let page = 1; page <= 2 && out.length < LIEES_PAR_DIRIGEANT; page += 1) {
    const r = await annuaire({ ...params, page: String(page) });
    out.push(...(r.results || []).filter((x) => x.siren !== siren).map(courte));
    if ((r.results || []).length < 25) break;
  }
  return out.slice(0, LIEES_PAR_DIRIGEANT);
}

/** Pure : un dirigeant de l'annuaire, lisible. */
export function dirigeantDe(d) {
  if (d.type_dirigeant === 'personne morale') return { morale: true, nom: d.denomination || null, siren: d.siren || null, qualite: d.qualite || null };
  return {
    morale: false,
    nom: [d.prenoms, d.nom].filter(Boolean).join(' ') || null,
    prenom: String(d.prenoms || '').split(/\s+/)[0] || null,
    nom_famille: d.nom || null,
    qualite: d.qualite || null,
    naissance: d.date_de_naissance ? d.date_de_naissance.split('-').reverse().join('/') : d.annee_de_naissance || null,
    nationalite: d.nationalite || null,
  };
}

/** Tout ce qu'on sait d'une société, au plus détaillé. */
async function ficheComplete(siren, proprietaire) {
  const brute = await ficheBrute(siren).catch(() => null);
  const [detail, bodacc] = await Promise.all([
    (async () => { try { const { societe } = await import('./kzoning-societe.js'); const r = await societe({ siret: siren }); return r.ok ? r.societe : null; } catch { return null; } })(),
    (async () => { try { return await (await import('./bodacc.js')).evenementsSociete(siren, { mois: 120 }); } catch { return null; } })(),
  ]);
  const dirigeantsBruts = brute?.dirigeants || [];
  const finances = brute?.finances ? Object.entries(brute.finances).map(([annee, f]) => ({ annee, ca: f?.ca ?? null, resultat_net: f?.resultat_net ?? null })).sort((a, b) => b.annee.localeCompare(a.annee)) : [];
  return {
    siren,
    nom: brute?.nom_complet || detail?.nom || proprietaire?.nom || null,
    raison_sociale: brute?.nom_raison_sociale || null,
    sigle: brute?.sigle || null,
    forme: forme(brute?.nature_juridique) || proprietaire?.forme || null,
    forme_code: brute?.nature_juridique || proprietaire?.forme_code || null,
    active: brute ? brute.etat_administratif === 'A' : null,
    creation: jour(brute?.date_creation),
    fermeture: jour(brute?.date_fermeture),
    activite: brute?.activite_principale || null,
    categorie: brute?.categorie_entreprise || null,
    effectif: brute?.tranche_effectif_salarie || null,
    tva: brute?.tva?.tva_intra || brute?.tva || null,
    mise_a_jour_rne: jour(brute?.date_mise_a_jour_rne),
    diffusion_restreinte: brute?.statut_diffusion === 'P' || null,
    opposition_prospection: brute?.opposition_diffusion_commerciale ?? null,
    siege: brute?.siege ? {
      adresse: brute.siege.adresse || null,
      code_postal: brute.siege.code_postal || null,
      commune: brute.siege.libelle_commune || null,
      lat: brute.siege.latitude ? Number(brute.siege.latitude) : null,
      lon: brute.siege.longitude ? Number(brute.siege.longitude) : null,
      depuis: jour(brute.siege.date_creation),
    } : null,
    groupe_dgfip: proprietaire?.groupe || null,
    dirigeants: dirigeantsBruts.map(dirigeantDe),
    etablissements: detail?.etablissements || [],
    comptes: detail?.comptes || [],
    finances,
    bodacc: bodacc || [],
    bodacc_lu: bodacc != null,
    _dirigeants_bruts: dirigeantsBruts,
  };
}

// --- L'analyse d'un bien en vente ----------------------------------------------------------------------------------

/** Pure : un résumé chiffré du patrimoine d'une société. */
export function resumePatrimoine(biens, total = biens.length) {
  return {
    biens: total,
    locaux: biens.reduce((t, b) => t + b.locaux.length, 0),
    rdc: biens.filter((b) => b.rdc).length,
    communes: new Set(biens.map((b) => b.insee)).size,
    departements: [...new Set(biens.map((b) => b.departement))].sort(),
  };
}

async function analyserBien(id) {
  const rec = Records.get(ENTITE, id);
  if (!rec) return;
  const etape = (texte) => Records.update(ENTITE, id, { etat: 'en_cours', etape: texte });
  try {
    etape("L'adresse dans la Base Adresse Nationale");
    const adresse = await resoudreAdresse(rec.adresse);
    if (!adresse) throw new Error(`Adresse introuvable dans la Base Adresse Nationale : « ${rec.adresse} ».`);
    const point = { label: adresse.label, code_insee: adresse.code_insee, numero: adresse.numero, rue: adresse.rue, ville: adresse.ville, code_postal: adresse.code_postal, lat: adresse.lat, lon: adresse.lon };

    etape('Les sociétés propriétaires à cette adresse (fichier de la DGFiP)');
    const { annee, locaux } = await locauxALAdresse(adresse);
    const proprietaires = classerProprietaires(locaux).slice(0, PROPRIETAIRES_MAX);
    if (!proprietaires.length) {
      Records.update(ENTITE, id, { etat: 'fait', etape: null, point, millesime: annee, proprietaires: [], societes: {}, constat: "Aucune société propriétaire d'un local à cette adresse au fichier de la DGFiP : les murs sont probablement à un particulier, que la loi ne publie pas. Le propriétaire se demande alors au service de publicité foncière.", analyse_le: new Date().toISOString(), erreur: null });
      return;
    }

    etape('Les fiches des sociétés et de leurs dirigeants');
    const societes = {};
    for (const p of proprietaires) {
      const f = await ficheComplete(p.siren, p);
      // Les sociétés des dirigeants : seulement pour une société ordinaire, civile, SARL ou SAS. Une banque, une SA, une
      // commune ont un conseil entier de dirigeants, et leurs autres mandats ne disent rien des murs (essai du 17 nov.
      // sur le 18 rue Gambetta, Metz : la Banque Populaire rendait les SCI personnelles de ses administrateurs).
      const liees = new Map();
      if (/^0\b/.test(String(p.groupe || '0')) && /^(65|54|57)/.test(String(f.forme_code || p.forme_code || ''))) {
        for (const d of f._dirigeants_bruts.slice(0, 10)) {
          let autres = [];
          try { autres = await societesDuDirigeant(d, p.siren); } catch { autres = []; }
          const via = dirigeantDe(d);
          for (const s of autres) {
            const l = liees.get(s.siren) || { ...s, via: [] };
            if (!l.via.some((v) => v.nom === via.nom)) l.via.push({ nom: via.nom, qualite: via.qualite, morale: via.morale });
            liees.set(s.siren, l);
          }
        }
      }
      delete f._dirigeants_bruts;
      f.liees = [...liees.values()];
      societes[p.siren] = f;
    }

    etape('Le patrimoine de ces sociétés dans toute la France');
    const tous = [...proprietaires.map((p) => p.siren), ...Object.values(societes).flatMap((s) => s.liees.map((l) => l.siren))];
    const { parSiren } = await locauxDesSirens(tous);
    const patrimoine = {};
    for (const [siren, lignes] of parSiren) {
      if (!lignes.length) continue;
      const biens = classerBiens(grouperBiens(lignes), adresse.code_insee);
      patrimoine[siren] = { resume: resumePatrimoine(biens), biens: biens.slice(0, BIENS_MAX), tronque: biens.length > BIENS_MAX };
    }
    for (const s of Object.values(societes)) {
      for (const l of s.liees) l.biens = patrimoine[l.siren]?.resume.biens || 0;
      s.liees.sort((a, b) => b.biens - a.biens || (b.active - a.active));
    }

    Records.update(ENTITE, id, {
      etat: 'fait', etape: null, erreur: null, point, millesime: annee,
      proprietaires: proprietaires.map(({ locaux: l, ...p }) => ({ ...p, locaux: l })),
      principal: rec.principal && proprietaires.some((p) => p.siren === rec.principal) ? rec.principal : proprietaires[0].siren,
      societes, patrimoine, constat: null, analyse_le: new Date().toISOString(),
    });
  } catch (e) {
    Records.update(ENTITE, id, { etat: 'erreur', etape: null, erreur: e?.message || String(e) });
  }
}

// Une analyse à la fois : chacune lit l'archive nationale entière, deux en même temps se disputeraient le disque.
let file = Promise.resolve();
const enFile = (id) => { file = file.then(() => analyserBien(id)).catch(() => {}); return file; };

/** Les biens en vente suivis, sans leur patrimoine (la liste de gauche). */
export function listerBiens() {
  return Records.list(ENTITE, { sort: 'created_date' }).map((r) => ({
    id: r.id, titre: r.titre, adresse: r.adresse, prix: r.prix ?? null, loyer: r.loyer ?? null, etat: r.etat, etape: r.etape || null, erreur: r.erreur || null,
    label: r.point?.label || null,
    principal: r.principal ? { siren: r.principal, nom: r.societes?.[r.principal]?.nom || r.proprietaires?.find((p) => p.siren === r.principal)?.nom || null, biens: r.patrimoine?.[r.principal]?.resume.biens || 0 } : null,
    proprietaires: (r.proprietaires || []).length,
  }));
}

/** Un bien en vente avec tout : propriétaires, fiches, patrimoine, et les biens qu'il partage avec d'autres de la liste. */
export function lireBien(id) {
  const r = Records.get(ENTITE, id);
  if (!r) return null;
  // Les autres biens en vente de la liste : un patrimoine qui en contient un le dit (« aussi dans votre liste »).
  const autres = Records.list(ENTITE).filter((x) => x.id !== id && x.proprietaires?.length);
  const enVente = {};
  // Par parcelle ET numéro : le 42 et le 44 En Fournirue (Metz) partagent une parcelle, seul le 44 est en vente.
  for (const x of autres) for (const p of x.proprietaires) for (const l of p.locaux || []) if (l.idu) enVente[`${l.idu}|${String(Number(String(x.point?.numero || '').match(/^\d+/)?.[0] || NaN))}`] = { id: x.id, titre: x.titre };
  return { ...r, en_vente_ailleurs: enVente };
}

export function ajouterBien({ titre, adresse, prix = null, loyer = null, note = null }, user = null) {
  const t = String(titre || '').trim();
  const a = String(adresse || '').trim();
  if (!t && !a) return { ok: false, error: 'Un titre ou une adresse.' };
  const rec = Records.create(ENTITE, { titre: t || a, adresse: a || null, prix: prix ? Number(prix) : null, loyer: loyer ? Number(loyer) : null, note, etat: a ? 'en_file' : 'adresse_manquante' }, user?.email);
  if (a) enFile(rec.id);
  return { ok: true, id: rec.id };
}

export function modifierBien(id, patch) {
  const r = Records.get(ENTITE, id);
  if (!r) return { ok: false, error: 'Bien introuvable.' };
  const champs = {};
  for (const k of ['titre', 'adresse', 'note']) if (patch[k] !== undefined) champs[k] = String(patch[k] || '').trim() || null;
  for (const k of ['prix', 'loyer']) if (patch[k] !== undefined) champs[k] = patch[k] === '' || patch[k] == null ? null : Number(patch[k]);
  if (patch.principal && r.proprietaires?.some((p) => p.siren === patch.principal)) champs.principal = patch.principal;
  const adresseChangee = champs.adresse !== undefined && champs.adresse !== r.adresse;
  Records.update(ENTITE, id, { ...champs, ...(adresseChangee ? { etat: champs.adresse ? 'en_file' : 'adresse_manquante', point: null, proprietaires: [], societes: {}, patrimoine: {} } : {}) });
  if (adresseChangee && champs.adresse) enFile(id);
  return { ok: true };
}

export function relancerBien(id) {
  const r = Records.get(ENTITE, id);
  if (!r || !r.adresse) return { ok: false, error: 'Pas d\'adresse à analyser.' };
  Records.update(ENTITE, id, { etat: 'en_file', erreur: null });
  enFile(id);
  return { ok: true };
}

export const supprimerBien = (id) => Records.delete(ENTITE, id);

/** Au démarrage : une analyse coupée par un redémarrage reprend. */
export function reprendreAnalyses() {
  for (const r of Records.list(ENTITE)) if (['en_file', 'en_cours'].includes(r.etat) && r.adresse) enFile(r.id);
}

// --- La fiche d'un bien, au clic -------------------------------------------------------------------------------------

/**
 * Ce qu'il y a à une adresse du patrimoine : où elle est, ce qui y est ouvert, sa dernière vente, sa parcelle et ses
 * autres sociétés propriétaires. Chaque source manque seule, sans faire tomber les autres.
 */
export async function ficheBien({ idu, adresse, commune }) {
  if (!/^[0-9AB]{5}\d{3}[0-9A-Z]{2}\d{4}$/.test(String(idu || ''))) return { ok: false, error: 'Parcelle invalide.' };
  const garde = Records.findBy(CACHE_PARCELLE, 'cle', `${idu}|${adresse || ''}`);
  if (garde && Date.now() - Date.parse(garde.le) < 7 * 86400000) return { ok: true, ...garde.fiche };
  const insee = idu.slice(0, 5);
  const section = idu.slice(8, 10);
  const plan = idu.slice(10, 14);
  const texte = [adresse, commune].filter(Boolean).join(' ');

  const [point, parcelle, mutations, coproprietaires] = await Promise.all([
    texte ? resoudreAdresse(texte).catch(() => null) : null,
    (async () => {
      try {
        const r = await fetch(`${CADASTRE}?${new URLSearchParams({ code_insee: insee, section, numero: plan })}`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
        if (!r.ok) return null;
        const f = ((await r.json()).features || [])[0];
        return f ? { contenance: f.properties?.contenance ?? null, geometrie: f.geometry || null } : null;
      } catch { return null; }
    })(),
    (async () => { try { const { mutationsDeLaParcelle } = await import('./dvf.js'); return await mutationsDeLaParcelle(insee, idu); } catch { return null; } })(),
    (async () => {
      try {
        const { chemin } = await archive();
        const dep = departementDe(insee);
        const lignes = await balayer(chemin, { fichiers: fichierDuDepartement(dep), regex: `^${dep};[0-9]*;${insee.slice(dep.length).padStart(3, '0')};[^;]*;[^;]*;[0 ]?${section.replace(/^0/, '')};0*${String(Number(plan))};` });
        return classerProprietaires(lignes.map(lireLigne).filter((l) => l && l.idu === idu)).map(({ siren, nom, forme: f, droits, locaux, rdc: r }) => ({ siren, nom, forme: f, droits, locaux: locaux.length, rdc: r }));
      } catch { return null; }
    })(),
  ]);

  let commerces = null;
  if (point?.numero && point?.rue) {
    try {
      const { etablissementsALAdresse, sireneConfigure } = await import('./insee-sirene.js');
      if (sireneConfigure()) commerces = await etablissementsALAdresse(point.code_insee || insee, point.numero, voieSansType(point.rue));
    } catch { commerces = null; }
  }

  const fiche = {
    point: point ? { label: point.label, lat: point.lat, lon: point.lon, code_postal: point.code_postal, ville: point.ville } : null,
    contenance: parcelle?.contenance ?? null,
    geometrie: parcelle?.geometrie ?? null,
    mutations: mutations ? mutations.slice(0, 6) : null,
    commerces,
    coproprietaires,
  };
  if (garde) Records.update(CACHE_PARCELLE, garde.id, { fiche, le: new Date().toISOString() });
  else Records.create(CACHE_PARCELLE, { cle: `${idu}|${adresse || ''}`, fiche, le: new Date().toISOString() });
  return { ok: true, ...fiche };
}
