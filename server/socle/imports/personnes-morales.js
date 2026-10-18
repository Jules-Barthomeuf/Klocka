// Le fichier des locaux des personnes morales (DGFiP, licence ouverte, annuel), pour K-Foncier (boîte à outils,
// 18 oct. 2026). Le miroir Opendatasoft que K-Foncier lisait sert le millésime 2021 ; data.gouv.fr publie chaque
// année le fichier national (situation 2025 aujourd'hui), un zip de 200 Mo qui contient un CSV par département.
//
// On ne télécharge pas le zip : on lit son répertoire (les derniers kilo-octets), puis seulement le fichier du
// département, par une requête de plage d'octets (environ 5 Mo pour le 06). Les lignes vont dans
// `entrepot_pm` ; K-Foncier les lit à la place du miroir quand la commune y est (`lignesSection`), dans la forme
// que lit déjà `grouperProprietaires`.

import zlib from 'zlib';
import db from '../../db.js';

/** Pure : une section cadastrale sur deux caractères (« A » ou « 0A » → « 0A »). */
export const sectionNormale = (s) => String(s || '').trim().toUpperCase().padStart(2, '0');

const DATASET = 'https://www.data.gouv.fr/api/1/datasets/fichiers-des-locaux-et-des-parcelles-des-personnes-morales/';
const UA = 'Klocka/1.0 (sourcing@klocka.immo)';

db.exec(`
  CREATE TABLE IF NOT EXISTS entrepot_pm (
    departement TEXT NOT NULL, commune TEXT NOT NULL, section TEXT NOT NULL, plan TEXT NOT NULL,
    batiment TEXT, entree TEXT, niveau TEXT, porte TEXT, numero TEXT, indice TEXT, nature_voie TEXT, voie TEXT,
    droit TEXT, siren TEXT, groupe TEXT, forme TEXT, forme_abregee TEXT, denomination TEXT, millesime TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_entrepot_pm_section ON entrepot_pm(commune, section);
  CREATE INDEX IF NOT EXISTS idx_entrepot_pm_siren ON entrepot_pm(siren);
`);

/** Le dernier fichier des locaux publié : son adresse et son année de situation. */
export async function dernierFichier() {
  const r = await fetch(DATASET, { headers: { 'user-agent': UA, accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`data.gouv.fr ${r.status}`);
  const fichiers = ((await r.json()).resources || [])
    .map((x) => ({ url: x.url, annee: Number((String(x.title || '').match(/locaux\s*\(?\s*situation\s*(\d{4})/i) || [])[1]) }))
    .filter((x) => x.annee && /zip/i.test(x.url))
    .sort((a, b) => b.annee - a.annee);
  if (!fichiers.length) throw new Error('Fichier des locaux des personnes morales introuvable sur data.gouv.fr.');
  return fichiers[0];
}

/** Pure : les entrées du répertoire central d'un zip, lues dans sa fin. */
export function repertoireZip(fin) {
  const entrees = [];
  let i = 0;
  for (;;) {
    const j = fin.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]), i);
    if (j < 0 || j + 46 > fin.length) break;
    const n = fin.readUInt16LE(j + 28);
    entrees.push({ nom: fin.subarray(j + 46, j + 46 + n).toString('utf8'), compresse: fin.readUInt32LE(j + 20), taille: fin.readUInt32LE(j + 24), methode: fin.readUInt16LE(j + 10), offset: fin.readUInt32LE(j + 42) });
    i = j + 46 + n;
  }
  return entrees;
}

/** Pure : le fichier d'un département dans le zip (« PM_25_B_060.csv » pour le 06). */
export const fichierDuDepartement = (entrees, dep) => entrees.find((e) => new RegExp(`_B[_-]${dep}0\\.csv$`, 'i').test(e.nom)) || null;

/** Pure : une ligne du CSV (séparateur « ; ») en local de l'entrepôt. */
export function lireLigne(champs, entetes) {
  const l = Object.fromEntries(entetes.map((k, i) => [k, (champs[i] || '').trim()]));
  const dep = l['Département'];
  return {
    departement: dep, commune: `${dep}${l['Code Commune']}`, section: sectionNormale(l.Section), plan: l['N° plan'],
    batiment: l['Bâtiment'] || null, entree: l['Entrée'] || null, niveau: l.Niveau || null, porte: l.Porte || null,
    numero: l['N° voirie'] ? String(Number(l['N° voirie']) || l['N° voirie']) : null, indice: l['Indice de répétition'] || null,
    nature_voie: l['Nature voie'] || null, voie: l['Nom voie'] || null, droit: l['Code droit'] || null,
    siren: /^\d{9}$/.test(l['N° SIREN'] || '') ? l['N° SIREN'] : null, groupe: l['Groupe personne'] || null,
    forme: l['Forme juridique'] || null, forme_abregee: l['Forme juridique abrégée'] || null, denomination: l['Dénomination'] || null,
  };
}

async function plage(url, debut, fin) {
  const r = await fetch(url, { headers: { 'user-agent': UA, range: `bytes=${debut}-${fin}` }, signal: AbortSignal.timeout(120000) });
  if (r.status !== 206 && r.status !== 200) throw new Error(`Lecture du zip : ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

/** Importe le fichier d'un département. Rend { lignes, millesime }. */
export async function importerPersonnesMorales({ departement, fichier = null } = {}) {
  const dep = String(departement || '').trim();
  if (!/^\d{2}$/.test(dep)) throw new Error(`Département invalide : ${departement}`);
  const f = fichier || await dernierFichier();
  const tete = await fetch(f.url, { method: 'HEAD', headers: { 'user-agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(30000) });
  const taille = Number(tete.headers.get('content-length'));
  if (!taille) throw new Error('Taille du zip inconnue.');
  const entrees = repertoireZip(await plage(f.url, Math.max(0, taille - 262144), taille - 1));
  const e = fichierDuDepartement(entrees, dep);
  if (!e) throw new Error(`Le département ${dep} n'est pas dans le fichier ${f.annee}.`);
  const brut = await plage(f.url, e.offset, e.offset + 30 + 1024 + e.compresse);
  const debut = 30 + brut.readUInt16LE(26) + brut.readUInt16LE(28);
  const donnees = brut.subarray(debut, debut + e.compresse);
  const texte = (e.methode === 8 ? zlib.inflateRawSync(donnees) : donnees).toString('utf8');
  const lignes = texte.split(/\r?\n/).filter(Boolean);
  const entetes = lignes.shift().split(';').map((x) => x.trim());
  if (!entetes.includes('N° SIREN') || !entetes.includes('Section')) throw new Error('Le fichier a changé de forme : colonnes attendues absentes.');
  const millesime = String(f.annee);
  const ins = db.prepare(`INSERT INTO entrepot_pm (departement, commune, section, plan, batiment, entree, niveau, porte, numero, indice, nature_voie, voie, droit, siren, groupe, forme, forme_abregee, denomination, millesime)
    VALUES (@departement, @commune, @section, @plan, @batiment, @entree, @niveau, @porte, @numero, @indice, @nature_voie, @voie, @droit, @siren, @groupe, @forme, @forme_abregee, @denomination, @millesime)`);
  let n = 0;
  db.transaction(() => {
    db.prepare('DELETE FROM entrepot_pm WHERE departement = ?').run(dep);
    for (const l of lignes) { const x = lireLigne(l.split(';'), entetes); if (x.section && x.plan) { ins.run({ ...x, millesime }); n += 1; } }
  })();
  return { lignes: n, millesime };
}

/** Lecture : les locaux d'une section, dans la forme du miroir que lit grouperProprietaires (null si absente). */
export function lignesSection(codeInsee, section) {
  const rows = db.prepare('SELECT * FROM entrepot_pm WHERE commune = ? AND section = ?').all(codeInsee, sectionNormale(section));
  if (!rows.length) {
    const chargee = db.prepare('SELECT 1 FROM entrepot_pm WHERE commune = ? LIMIT 1').get(codeInsee);
    return chargee ? { annee: db.prepare('SELECT millesime FROM entrepot_pm WHERE commune = ? LIMIT 1').get(codeInsee).millesime, lignes: [] } : null;
  }
  return {
    annee: rows[0].millesime,
    lignes: rows.map((r) => ({
      num_plan: r.plan, bat_local: r.batiment, entree_local: r.entree, niveau_local: r.niveau, porte_local: r.porte,
      siren_proprietaire: r.siren, denomination_proprietaire: r.denomination, label_forme_juridique_proprietaire: r.forme_abregee,
      label_code_droit: r.droit, adresse: [r.numero, r.indice, r.nature_voie, r.voie].filter(Boolean).join(' ') || null,
    })),
  };
}
