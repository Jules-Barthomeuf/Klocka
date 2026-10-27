// L'export complet de Monday avant le passage à Twenty (27 oct. 2026).
//   node scripts/crm/export-monday.mjs              tous les tableaux actifs des deux espaces
//   node scripts/crm/export-monday.mjs 2110793610   un seul tableau (essai)
// Lecture seule : rien n'est écrit ni supprimé dans Monday. La sortie va dans exports-prives/monday-<date>/ (ignoré par
// git, noms et numéros réels) : schema.json (espaces, tableaux, colonnes et leurs réglages), puis un fichier par tableau
// avec ses éléments (valeurs lisibles ET brutes, groupe, fichiers joints) et ses mises à jour (le fil de chaque fiche).
// C'est la sauvegarde de la bascule et la source de l'import dans Twenty (scripts/crm/import-twenty.mjs).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { mondayConfigure, requeteMonday } from '../../server/monday.js';

if (!mondayConfigure()) {
  console.error('MONDAY_TOKEN manquant dans .env');
  process.exit(1);
}

const seul = process.argv.slice(2).find((x) => /^\d+$/.test(x)) || null;
const jour = new Date().toISOString().slice(0, 10);
const dossier = path.resolve('exports-prives', `monday-${jour}`);
fs.mkdirSync(path.join(dossier, 'tableaux'), { recursive: true });

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// Monday plafonne la « complexité » par minute : sur ce refus, on attend la minute suivante au lieu d'abandonner.
async function gql(query, variables = {}, essai = 0) {
  try {
    return await requeteMonday(query, variables);
  } catch (e) {
    const msg = String(e.message || e);
    const reseau = /fetch failed|ECONN|ETIMEDOUT|UND_ERR|socket/i.test(`${msg} ${e.cause?.code || ''}`);
    if (essai < 8 && (reseau || /complexity|rate limit|budget|429|timeout|aborted|5\d\d/i.test(msg))) {
      const pause = reseau ? 15_000 : 60_000;
      console.warn(`  pause ${pause / 1000} s (${msg.slice(0, 80)})`);
      await attendre(pause);
      return gql(query, variables, essai + 1);
    }
    throw e;
  }
}

// La liste d'abord, légère (des centaines de tableaux « Dossiers (pipeline) » vides, créés en double par l'ancienne
// synchronisation, alourdissaient la requête jusqu'au refus) ; les colonnes ensuite, tableau par tableau, et seulement
// pour ceux qui ont des éléments.
async function tousLesTableaux() {
  const tableaux = [];
  for (let page = 1; page < 500; page++) {
    const d = await gql(
      `query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name type board_kind items_count workspace { id name } } }`,
      { page }
    );
    const lot = d?.boards || [];
    tableaux.push(...lot);
    if (lot.length < 100) break;
  }
  return tableaux;
}

async function detailDe(boardId) {
  const d = await gql(
    `query ($b: ID!) { boards(ids: [$b]) { id description columns { id title type settings_str description } groups { id title position } } }`,
    { b: String(boardId) }
  );
  return d?.boards?.[0] || {};
}

async function elementsDe(boardId) {
  const champs = `id name created_at updated_at state
    creator { id name email }
    group { id title }
    parent_item { id }
    column_values { id text value type }
    assets { id name url file_extension created_at }`;
  const lignes = [];
  let d = await gql(
    `query ($b: ID!) { boards(ids: [$b]) { items_page(limit: 200) { cursor items { ${champs} } } } }`,
    { b: String(boardId) }
  );
  let page = d?.boards?.[0]?.items_page;
  while (page) {
    lignes.push(...(page.items || []));
    if (!page.cursor || !page.items?.length) break;
    d = await gql(`query ($c: String!) { next_items_page(cursor: $c, limit: 200) { cursor items { ${champs} } } }`, { c: page.cursor });
    page = d?.next_items_page;
  }
  return lignes;
}

async function misesAJourDe(boardId) {
  const toutes = [];
  for (let page = 1; page < 500; page++) {
    const d = await gql(
      `query ($b: ID!, $page: Int!) { boards(ids: [$b]) { updates(limit: 100, page: $page) {
        id item_id text_body body created_at creator { id name email }
        replies { id text_body body created_at creator { id name email } }
        assets { id name url }
      } } }`,
      { b: String(boardId), page }
    );
    const lot = d?.boards?.[0]?.updates || [];
    toutes.push(...lot);
    if (lot.length < 100) break;
  }
  return toutes;
}

const debut = Date.now();
const [espaces, utilisateurs, tableauxTous] = await Promise.all([
  gql(`query { workspaces(limit: 100) { id name kind } }`).then((d) => d?.workspaces || []),
  gql(`query { users(limit: 500) { id name email enabled is_guest } }`).then((d) => d?.users || []),
  tousLesTableaux(),
]);
const vides = tableauxTous.filter((t) => !seul && !(t.items_count > 0));
const tableaux = tableauxTous.filter((t) => (seul ? String(t.id) === seul : (t.type === 'board' || t.type === 'sub_items_board') && t.items_count > 0));
for (const t of tableaux) Object.assign(t, await detailDe(t.id));

fs.writeFileSync(path.join(dossier, 'schema.json'), JSON.stringify({ exporte_le: new Date().toISOString(), espaces, utilisateurs, tableaux, vides: vides.map((t) => ({ id: t.id, nom: t.name, espace: t.workspace?.name || null })) }, null, 2));
console.log(`${tableaux.length} tableau(x) avec des éléments (${vides.length} vides laissés de côté) dans ${espaces.length} espace(s), ${utilisateurs.length} utilisateur(s).`);
if (!tableaux.length) { console.error('Aucun tableau à exporter.'); process.exit(1); }

const bilan = [];
for (const t of tableaux) {
  const nomFichier = `${t.id}.json`;
  process.stdout.write(`- ${t.workspace?.name || 'Principal'} / ${t.name} (${t.id}) … `);
  try {
    const elements = await elementsDe(t.id);
    let misesAJour = [];
    let erreurMaj = null;
    try {
      misesAJour = await misesAJourDe(t.id);
    } catch (e) {
      erreurMaj = String(e.message || e);
    }
    fs.writeFileSync(path.join(dossier, 'tableaux', nomFichier), JSON.stringify({ tableau: { id: t.id, nom: t.name, espace: t.workspace }, elements, mises_a_jour: misesAJour }, null, 2));
    bilan.push({ id: t.id, nom: t.name, espace: t.workspace?.name || null, annonce: t.items_count ?? null, exportes: elements.length, mises_a_jour: misesAJour.length, erreur_mises_a_jour: erreurMaj });
    console.log(`${elements.length} élément(s), ${misesAJour.length} mise(s) à jour${erreurMaj ? ` (fil non lu : ${erreurMaj.slice(0, 60)})` : ''}`);
  } catch (e) {
    bilan.push({ id: t.id, nom: t.name, espace: t.workspace?.name || null, erreur: String(e.message || e) });
    console.log(`ERREUR ${e.message}`);
  }
}

fs.writeFileSync(path.join(dossier, 'bilan.json'), JSON.stringify(bilan, null, 2));
const ecarts = bilan.filter((b) => b.erreur || (b.annonce != null && b.annonce !== b.exportes));
console.log(`\nTerminé en ${Math.round((Date.now() - debut) / 1000)} s → ${dossier}`);
console.log(ecarts.length ? `${ecarts.length} tableau(x) à revoir (erreur ou compte différent) : voir bilan.json` : 'Tous les comptes concordent.');
