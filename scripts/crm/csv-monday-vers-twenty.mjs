// Les derniers exports Monday (CSV) contre Twenty (25 nov. 2026, Jules : « on va définitivement migrer sur Twenty,
// voici tous les exports Monday les plus récents, mets bien à jour ce qui n'est pas encore dans le CRM ; normalement il
// n'y a que certains clients et prospects qui n'y sont pas »).
//   node scripts/crm/csv-monday-vers-twenty.mjs <clients.csv> <prospects.csv>            compare, n'écrit rien
//   node scripts/crm/csv-monday-vers-twenty.mjs <clients.csv> <prospects.csv> --ecrire   crée ce qui manque
// Une personne est déjà dans Twenty si son mail, son téléphone (9 derniers chiffres) ou son nom (sans accents, dans
// n'importe quel ordre) y est déjà, dans le même tableau. Rien n'est modifié ni supprimé : seules les absentes sont
// créées, dans le groupe de leur section du CSV (« Clients en cours », « Prospect OUT »…), par les verbes de
// server/crm/monday-sur-twenty.js (mêmes colonnes que Monday, listes complétées comme avant).
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, lister, objetsTwenty } from '../../server/twenty.js';

if (!twentyConfigure()) { console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env'); process.exit(1); }
const args = process.argv.slice(2);
const ECRIRE = args.includes('--ecrire');
const [fClients, fProspects] = args.filter((x) => !x.startsWith('--'));
if (!fClients || !fProspects) { console.error('usage : <clients.csv> <prospects.csv> [--ecrire]'); process.exit(1); }

/** Pure : un CSV (guillemets, retours à la ligne dans une case) en lignes de cases. */
export function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let cas = '';
  let entre = false;
  const t = String(texte).replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (entre) {
      if (c === '"' && t[i + 1] === '"') { cas += '"'; i += 1; } else if (c === '"') entre = false; else cas += c;
    } else if (c === '"') entre = true;
    else if (c === ',') { ligne.push(cas); cas = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i += 1;
      ligne.push(cas); lignes.push(ligne); ligne = []; cas = '';
    } else cas += c;
  }
  if (cas || ligne.length) { ligne.push(cas); lignes.push(ligne); }
  return lignes;
}

/** Les fiches d'un export Monday : chaque section (titre seul sur sa ligne, puis l'en-tête) donne son groupe. */
function fichesDe(fichier, enTete) {
  const lignes = lireCsv(fs.readFileSync(fichier, 'utf8'));
  const fiches = [];
  let groupe = null;
  let colonnes = null;
  for (let i = 0; i < lignes.length; i += 1) {
    const l = lignes[i].map((x) => x.trim());
    const pleines = l.filter(Boolean);
    if (l[0] === enTete) { colonnes = lignes[i].map((x) => x.trim()); continue; }
    // Un titre de section : une seule case remplie, suivie de l'en-tête.
    if (pleines.length === 1 && l[0] && lignes[i + 1]?.[0]?.trim() === enTete) { groupe = l[0]; continue; }
    if (!colonnes || !l[0]) continue;
    const f = { groupe };
    colonnes.forEach((c, j) => { if (c && f[c] === undefined) f[c] = (lignes[i][j] || '').trim(); });
    // Le CSV des prospects a deux colonnes « Source » : la seconde (MDI, WEBI…) est la liste « Source » à une valeur.
    const sources = colonnes.map((c, j) => [c, j]).filter(([c]) => c === 'Source').map(([, j]) => (lignes[i][j] || '').trim());
    if (sources.length > 1) { f.Source = sources[0]; f.Source2 = sources[1]; }
    fiches.push(f);
  }
  return fiches;
}

const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const cleNom = (s) => sansAccents(s).replace(/^pro\s*-\s*/, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const cleMail = (s) => (String(s || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/) || [])[0] || null;
const cleTel = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length >= 9 ? d.slice(-9) : null; };

/**
 * Pure : un numéro de l'export Monday, qui perd le « + » (« 33618838107 », « 786371889 ») : au format international.
 * Neuf chiffres : un numéro français sans son 0 ; « 33 » et onze chiffres : la France ; plus long : son indicatif.
 */
export function telInternational(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (!d) return '';
  if (/^0\d{9}$/.test(d)) return `+33${d.slice(1)}`;
  if (/^[1-9]\d{8}$/.test(d)) return `+33${d}`;
  if (/^33\d{9}$/.test(d)) return `+${d}`;
  return d.length >= 10 ? `+${d}` : d;
}
// Un numéro que Twenty refuse : la fiche s'écrit sans lui, il est noté.
const sansTel = [];
async function ecrireAvecRepli(ecrire, colonnes, nom) {
  try { return await ecrire(colonnes); } catch (e) {
    if (!/phone number is invalid/i.test(e?.message || '')) throw e;
    const tel = Object.entries(colonnes).find(([k]) => /^phone/.test(k));
    const reste = Object.fromEntries(Object.entries(colonnes).filter(([k]) => !/^phone/.test(k)));
    sansTel.push(`${nom} : ${tel?.[1] || '?'}`);
    console.log(`   numéro refusé par Twenty, écrit sans lui : ${nom} (${tel?.[1]})`);
    return ecrire(reste);
  }
}

const TABLEAUX = [
  { objet: 'clientsListe', singulier: 'clients', fichier: fClients, enTete: 'Nom', nom: 'Nom', mail: 'E-mail', tel: 'Téléphone' },
  { objet: 'prospectsListe', singulier: 'prospects', fichier: fProspects, enTete: 'Name', nom: 'Name', mail: 'Email', tel: 'Numéro' },
];

const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const metas = await objetsTwenty();
const bilan = {};
for (const t of TABLEAUX) {
  const schema = objets.find((o) => o.nameSingular === t.singulier);
  const meta = metas.find((o) => o.nameSingular === t.singulier);
  const champs = new Map(schema.champs.map((c) => [c.name, c]));
  const fMail = schema.champs.find((c) => c.type === 'EMAILS')?.name;
  const fTel = schema.champs.find((c) => c.type === 'PHONES')?.name;
  const existants = await lister(t.objet);
  const noms = new Set(existants.map((r) => cleNom(r.name)).filter(Boolean));
  const mails = new Set(existants.flatMap((r) => [r[fMail]?.primaryEmail, ...(r[fMail]?.additionalEmails || [])]).map(cleMail).filter(Boolean));
  const tels = new Set(existants.map((r) => cleTel(`${r[fTel]?.primaryPhoneCallingCode || ''}${r[fTel]?.primaryPhoneNumber || ''}`)).filter(Boolean));
  const groupeChamp = (meta.fields || []).find((f) => f.name === 'groupe' && f.type === 'SELECT');
  const fiches = fichesDe(t.fichier, t.enTete);
  const manquent = [];
  const deja = [];
  for (const f of fiches) {
    const n = cleNom(f[t.nom]);
    const m = cleMail(f[t.mail]);
    const p = cleTel(f[t.tel]);
    const par = (m && mails.has(m) && 'mail') || (p && tels.has(p) && 'téléphone') || (n && noms.has(n) && 'nom') || null;
    const qui = par ? existants.find((r) => (m && cleMail(r[fMail]?.primaryEmail) === m) || (p && cleTel(`${r[fTel]?.primaryPhoneCallingCode || ''}${r[fTel]?.primaryPhoneNumber || ''}`) === p) || (n && cleNom(r.name) === n)) : null;
    (par ? deja : manquent).push({ f, par, r: qui });
    // Deux fois la même personne dans le CSV : une seule création.
    if (!par) { if (n) noms.add(n); if (m) mails.add(m); if (p) tels.add(p); }
  }
  bilan[t.singulier] = { csv: fiches.length, twenty: existants.length, deja: deja.length, manquent: manquent.map(({ f }) => `${f[t.nom]} (${f.groupe})`) };
  console.log(`\n== ${schema.labelPlural} : ${fiches.length} dans le CSV, ${existants.length} dans Twenty, ${deja.length} déjà là, ${manquent.length} à créer`);
  console.log(`   groupes Twenty : ${(groupeChamp?.options || []).map((o) => o.label).join(' · ') || 'aucun champ groupe'}`);
  for (const { f } of manquent) console.log(`   + ${f[t.nom]} · ${f.groupe}`);

  // Les fiches déjà là : ce que le CSV dit et que Twenty n'a pas (case vide), et ce qui diffère (rien n'est écrasé).
  const { texteDe } = await import('../../server/crm/monday-sur-twenty.js');
  const parNomMeta = new Map((meta.fields || []).map((x) => [x.name, x]));
  const aCompleter = [];
  const differents = [];
  const egal = (a, b) => sansAccents(a).replace(/[^a-z0-9]/g, '') === sansAccents(b).replace(/[^a-z0-9]/g, '');
  for (const { f, r } of deja) {
    if (!r) continue;
    const vides = {};
    for (const c of schema.champs) {
      if (!c.mondayColonne || /relation|link_to|multiple_person/.test(c.mondayColonne)) continue;
      const v = t.singulier === 'prospects' && c.name === 'source9' ? f.Source2 : t.singulier === 'prospects' && c.name === 'source' ? f.Source : f[c.label];
      if (!v) continue;
      const fm = parNomMeta.get(c.name);
      const la = fm ? texteDe(fm.type, r[c.name], fm.options) : '';
      if (!String(la).trim()) vides[c.mondayColonne] = c.type === 'ADDRESS' ? { address: v } : c.type === 'PHONES' ? telInternational(v) : v;
      // Une adresse que Twenty écrit avec sa ville en plus (« Paris, France, Paris ») est la même.
      else if (c.type === 'ADDRESS' && sansAccents(la).startsWith(sansAccents(v))) continue;
      else if (c.type === 'NUMBER' ? Number(la) !== Number(v) : c.type === 'PHONES' ? cleTel(la) !== cleTel(v) : c.type === 'EMAILS' ? cleMail(la) !== cleMail(v) : !egal(la, v)) differents.push(`${f[t.nom]} · ${c.label} : Twenty « ${String(la).slice(0, 60)} », CSV « ${String(v).slice(0, 60)} »`);
    }
    if (Object.keys(vides).length) aCompleter.push({ r, nom: f[t.nom], vides });
  }
  bilan[t.singulier].a_completer = aCompleter.map((x) => ({ nom: x.nom, champs: Object.keys(x.vides) }));
  bilan[t.singulier].differents = differents;
  console.log(`   déjà là, cases vides dans Twenty que le CSV remplit : ${aCompleter.length} fiches (${aCompleter.reduce((n, x) => n + Object.keys(x.vides).length, 0)} cases)`);
  console.log(`   déjà là, valeurs différentes (non touchées) : ${differents.length}`);
  for (const d of differents) console.log(`     ≠ ${d}`);

  if (ECRIRE && aCompleter.length) {
    const S = await import('../../server/crm/monday-sur-twenty.js');
    for (const x of aCompleter) { await ecrireAvecRepli((col) => S.majElement(schema.mondayTableau, x.r.id, col), x.vides, x.nom); console.log(`   complété : ${x.nom} (${Object.keys(x.vides).length} cases)`); }
    bilan[t.singulier].completees = aCompleter.length;
  }
  if (!ECRIRE || !manquent.length) continue;
  const S = await import('../../server/crm/monday-sur-twenty.js');
  const colonneDe = (nomChamp) => champs.get(nomChamp)?.mondayColonne;
  const parLibelle = new Map(schema.champs.map((c) => [c.label, c]));
  let crees = 0;
  for (const { f } of manquent) {
    const colonnes = {};
    for (const [libelle, valeur] of Object.entries(f)) {
      if (!valeur || ['groupe', t.nom, 'Sous-éléments', 'Subitems', 'Source2'].includes(libelle)) continue;
      // « Source » des prospects : la liste à plusieurs choix (Webinaire) d'abord ; la seconde colonne va dans source9.
      const c = t.singulier === 'prospects' && libelle === 'Source' ? champs.get('source') : parLibelle.get(libelle);
      if (!c?.mondayColonne || c.type === 'TEXT' && /relation|link/i.test(c.mondayColonne)) continue;
      colonnes[c.mondayColonne] = c.type === 'ADDRESS' ? { address: valeur } : c.type === 'PHONES' ? telInternational(valeur) : valeur;
    }
    if (t.singulier === 'prospects' && f.Source2) colonnes[colonneDe('source9')] = f.Source2;
    const r = await ecrireAvecRepli((col) => S.creerElement(schema.mondayTableau, f[t.nom], col), colonnes, f[t.nom]);
    // Le groupe de sa section du CSV, quand Twenty en a un du même nom.
    const g = (groupeChamp?.options || []).find((o) => sansAccents(o.label) === sansAccents(f.groupe));
    const { modifier } = await import('../../server/twenty.js');
    if (g) await modifier(t.objet, r.id, { groupe: g.value });
    crees += 1;
    console.log(`   créé : ${f[t.nom]} (${r.id})${g ? ` dans « ${g.label} »` : ''}`);
  }
  bilan[t.singulier].crees = crees;
}
bilan.numeros_refuses = sansTel;
fs.mkdirSync('exports-prives', { recursive: true });
fs.writeFileSync(`exports-prives/csv-monday-vers-twenty-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(bilan, null, 2));
