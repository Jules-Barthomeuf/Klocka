// Le banc de l'agent qui rentre le projet (13 nov. 2026, Jules : « prends les dossiers en ligne, mets-les en local et
// teste-les »). L'agent tourne pour de vrai (modèle, Figaro, Marché) sur une sélection de dossiers, et le banc dit,
// dossier par dossier, ce qui est rempli, ce qui manque, ce qui ne tient pas debout, et ce que l'agent demande.
//
//   npm run projet:banc                                   les dossiers de la base locale, dans une base temporaire
//   npm run projet:banc -- --dump ~/Downloads/klocka-2026-11-13.json
//                                                         les dossiers d'une sauvegarde de l'app en ligne
//   npm run projet:banc -- --dump … --importer            les copie dans la base locale (sans rien écraser) et y crée
//                                                         les projets, pour les ouvrir dans l'app locale
//   --n 20                                                combien de dossiers (20 par défaut)
//
// Une base temporaire par défaut : le banc se rejoue autant qu'on veut sans rien laisser. Chaque rejeu coûte un appel
// au modèle par dossier (quelques centimes).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import 'dotenv/config';

const arg = (nom) => { const i = process.argv.indexOf(`--${nom}`); return i > 0 ? process.argv[i + 1] : null; };
const n = Number(arg('n')) || 20;
const dumpChemin = arg('dump') ? arg('dump').replace(/^~/, os.homedir()) : null;
const importer = process.argv.includes('--importer');
if (importer && !dumpChemin) { console.error('--importer demande --dump : les dossiers locaux sont déjà là.'); process.exit(1); }

// La base locale est lue avant de choisir où travailler : sans sauvegarde, c'est elle qui donne les dossiers.
const LOCALE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'server', 'data');
let source;
if (dumpChemin) {
  const dump = JSON.parse(fs.readFileSync(dumpChemin, 'utf8'));
  if (dump.format !== 'klocka-sauvegarde') { console.error("Ce fichier n'est pas une sauvegarde Klocka."); process.exit(1); }
  source = dump.records;
} else {
  const { default: Database } = await import('better-sqlite3');
  const base = new Database(path.join(process.env.KLOCKA_DATA_DIR || LOCALE, 'klocka.db'), { readonly: true });
  source = base.prepare("SELECT id, entity, data, created_date, updated_date, created_by FROM records WHERE entity IN ('Deal', 'LancementOutil')").all();
  base.close();
}
if (!importer) process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-banc-projet-'));

const { default: db, Records } = await import('../server/db.js');
const { UPLOAD_DIR } = await import('../server/contexte.js');
const A = await import('../server/deal/agent-projet.js');
const { secteurGarde } = await import('../server/projet-secteur.js');

// --- Le choix des dossiers : ceux qui ont de quoi faire un projet, les plus riches d'abord, une adresse chacun ------
const lire = (r) => ({ ...JSON.parse(r.data), id: r.id, created_date: r.created_date, updated_date: r.updated_date });
const deals = source.filter((r) => r.entity === 'Deal').map(lire);
const lancements = source.filter((r) => r.entity === 'LancementOutil').map(lire);
const val = (c) => (c && c.absent === false ? c.valeur : null);
const richesse = (d) => {
  const l = d.lots?.[0]?.lot || {};
  return (d.source?.texte ? 3 : 0) + (Object.keys(d.analyse_pieces?.docs || {}).length ? 3 : 0)
    + lancements.filter((x) => x.deal_id === d.deal_id && x.statut === 'fini').length / 5
    + ['prix_fai', 'loyer_annuel_ht_hc', 'surface_m2', 'locataire_nom', 'bail_echeance'].filter((k) => val(l[k])).length;
};
const vues = new Set();
const choisis = deals
  .filter((d) => !d.test && d.lots?.[0]?.lot && val(d.lots[0].lot.adresse))
  .sort((a, b) => richesse(b) - richesse(a) || String(b.updated_date).localeCompare(String(a.updated_date)))
  .filter((d) => { const a = JSON.stringify(val(d.lots[0].lot.adresse)); if (vues.has(a)) return false; vues.add(a); return true; })
  .slice(0, n);

// --- La copie : le dossier et ses lectures du Marché, sans son ancien projet. Rien d'écrasé en local. ---------------
const poser = db.prepare('INSERT OR IGNORE INTO records (id, entity, data, created_date, updated_date, created_by) VALUES (@id, @entity, @data, @created_date, @updated_date, @created_by)');
const ecrire = ({ id, created_date, updated_date, ...data }, entity, extra = {}) => poser.run({ id, entity, data: JSON.stringify({ ...data, ...extra }), created_date, updated_date, created_by: data.created_by || null });
const aTester = [];
for (const d of choisis) {
  const deja = Records.findBy('Deal', 'deal_id', d.deal_id);
  if (deja && importer) { console.log(`· ${d.nom || d.deal_id} : déjà dans la base locale, gardé tel quel`); if (!deja.projet_id) aTester.push(d.deal_id); continue; }
  const { projet_id: _ancien, ...sansProjet } = d;
  ecrire(sansProjet, 'Deal', importer ? { importe_de_la_prod_le: new Date().toISOString() } : {});
  for (const l of lancements.filter((x) => x.deal_id === d.deal_id)) ecrire(l, 'LancementOutil');
  aTester.push(d.deal_id);
}

// --- Le banc ---------------------------------------------------------------------------------------------------------
const CASES = [
  ['adresse_complete', 'adresse'], ['nom_locataire', 'locataire'], ['activite_locataire', 'activité'], ['sim_prix_bien_fai', 'prix'],
  ['sim_loyer_initial_ht', 'loyer'], ['sim_surface', 'surface'], ['type_bail', 'type de bail'], ['bail_date_debut', 'début du bail'],
  ['bail_date_echeance', 'échéance'], ['locataire_depuis', 'en place depuis'], ['rendement_locatif', 'rendement'],
  ['sim_taxe_fonciere', 'taxe foncière'], ['bail_depot_garantie', 'dépôt'], ['ville_habitants', 'habitants'],
];
const plein = (v) => v != null && v !== '' && v !== 0 && !(Array.isArray(v) && !v.length);
const lignes = [];
const totaux = Object.fromEntries(CASES.map(([k]) => [k, 0]));
let finis = 0;
console.log(`\n${aTester.length} dossier(s) au banc${importer ? ', dans la base locale' : ', dans une base temporaire'}.\n`);
for (const dealId of aTester) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  const t0 = Date.now();
  const r = A.lancerAgentProjet(dealId, 0, { user: { email: 'banc-projet@klocka.local' }, uploadDir: UPLOAD_DIR });
  if (!r.ok) { console.log(`✗ ${deal.nom || dealId} : ${r.error}`); continue; }
  await r.travail;
  const a = Records.get('AgentProjet', r.agent.id);
  const p = a.project_id ? Records.get('Project', a.project_id) : null;
  const s = p ? secteurGarde(p.id) : null;
  const vide = CASES.filter(([k]) => !plein(k === 'ville_habitants' ? (p?.ville_habitants_agglo || p?.ville_habitants) : p?.[k])).map(([, mot]) => mot);
  for (const [k] of CASES) if (p && plein(k === 'ville_habitants' ? (p.ville_habitants_agglo || p.ville_habitants) : p[k])) totaux[k] += 1;
  if (a.etat === 'fini') finis += 1;
  const echecs = (a.etapes || []).filter((e) => e.etat === 'echec').map((e) => `${e.texte} : ${(e.lignes || []).join(' ; ')}`);
  const verif = (a.etapes || []).find((e) => /tiennent debout/.test(e.texte));
  const ligne = {
    dossier: deal.nom || dealId, deal_id: dealId, adresse: p?.adresse_complete || null, etat: a.etat, erreur: a.erreur || null,
    secondes: Math.round((Date.now() - t0) / 1000), projet_id: p?.id || null,
    vides: vide, echecs, incoherences: verif?.etat === 'fait' ? verif.lignes : [], questions: a.questions || [],
    residentiel: Number(p?.marche_rue_prix_m2) || s?.residentiel?.prix_m2 || null, loyer_autour: s?.rue?.loyer_m2_an || null, loyer_autour_du_marche: !!s?.rue?.du_marche,
    photos: (p?.photos || []).length,
  };
  lignes.push(ligne);
  console.log(`${a.etat === 'fini' ? '✓' : '✗'} ${ligne.dossier} · ${ligne.adresse || 'sans adresse'} · ${ligne.secondes} s`);
  if (ligne.erreur) console.log(`    erreur : ${ligne.erreur}`);
  console.log(`    vides : ${vide.join(', ') || 'aucune'}`);
  console.log(`    marché : résidentiel ${ligne.residentiel ?? '∅'} €/m² · loyer autour ${ligne.loyer_autour ?? '∅'} €/m²/an${ligne.loyer_autour_du_marche ? ' (partie Marché)' : ''} · ${ligne.photos} photo(s)`);
  for (const x of echecs) console.log(`    échec : ${x}`);
  for (const x of ligne.incoherences) console.log(`    incohérence : ${x}`);
  for (const q of ligne.questions) console.log(`    question : ${q}`);
}

const nb = lignes.length || 1;
console.log(`\n${finis}/${lignes.length} projets prêts. Cases remplies :`);
for (const [k, mot] of CASES) console.log(`  ${mot.padEnd(16)} ${String(totaux[k]).padStart(3)}/${lignes.length}  ${Math.round((totaux[k] / nb) * 100)} %`);
const rapport = path.join(os.tmpdir(), `banc-projet-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`);
fs.writeFileSync(rapport, JSON.stringify({ le: new Date().toISOString(), source: dumpChemin || 'base locale', importe: importer, dossiers: lignes, totaux }, null, 2));
console.log(`\nRapport : ${rapport}`);
process.exit(0);
