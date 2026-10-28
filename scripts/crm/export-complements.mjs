// Ce que l'export de base n'a pas pu lire dans Monday (27 oct. 2026) : les liens entre tableaux, les miroirs et les
// formules (l'API ne rend leur contenu que demandé type par type), les sous-éléments, et les fichiers joints.
//   node scripts/crm/export-complements.mjs [idTableau]
// Lecture seule dans Monday. Écrit, dans le dernier export : complements/<tableau>.json (par élément : liens
// { colonne: [ids] }, textes { colonne: texte affiché }, sous-éléments) et fichiers/<élément>/<nom> (téléchargés aussitôt :
// le lien public de Monday ne vaut qu'une heure).
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = (process.env.MONDAY_TOKEN || '').trim();
if (!TOKEN) {
  console.error('MONDAY_TOKEN manquant');
  process.exit(1);
}
const VERSION = process.env.MONDAY_COMPLEMENTS_VERSION || '2025-04';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}, essai = 0) {
  try {
    const r = await fetch('https://api.monday.com/v2', {
      method: 'POST',
      headers: { Authorization: TOKEN, 'Content-Type': 'application/json', 'API-Version': VERSION },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.errors?.length) {
      const e = new Error(d.errors?.[0]?.message || d.error_message || `Monday ${r.status}`);
      e.status = r.status;
      throw e;
    }
    return d.data;
  } catch (e) {
    if (essai < 8 && /complexity|rate|budget|429|timeout|aborted|fetch failed|ECONN|5\d\d/i.test(`${e.message} ${e.status || ''} ${e.cause?.code || ''}`)) {
      console.warn(`  pause (${String(e.message).slice(0, 60)})`);
      await attendre(/fetch|ECONN/.test(e.message) ? 15_000 : 60_000);
      return gql(query, variables, essai + 1);
    }
    throw e;
  }
}

const dernier = fs.readdirSync('exports-prives').filter((d) => /^monday-\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const dossier = path.resolve('exports-prives', dernier);
const schema = JSON.parse(fs.readFileSync(path.join(dossier, 'schema.json'), 'utf8'));
const choix = JSON.parse(fs.readFileSync('crm/tableaux.json', 'utf8')).tableaux.map((t) => t.id);
const seul = process.argv[2] || null;
fs.mkdirSync(path.join(dossier, 'complements'), { recursive: true });

const VALEURS = `id type text
  ... on BoardRelationValue { linked_item_ids display_value }
  ... on MirrorValue { display_value }
  ... on FormulaValue { display_value }
  ... on PeopleValue { persons_and_teams { id kind } }`;
const CHAMPS = `id name
  column_values(types: [board_relation, mirror, formula, people]) { ${VALEURS} }
  assets { id name public_url file_extension file_size created_at }
  subitems { id name created_at state column_values { id text type value } }`;

const propre = (s) => [...String(s || 'fichier')].map((ch) => (ch.charCodeAt(0) < 32 || '/\\:*?"<>|'.includes(ch) ? '_' : ch)).join('').slice(0, 150);

for (const id of choix.filter((x) => !seul || x === seul)) {
  const t = schema.tableaux.find((x) => String(x.id) === id);
  process.stdout.write(`- ${t?.name || id} … `);
  const elements = {};
  let d = await gql(`query ($b: ID!) { boards(ids: [$b]) { items_page(limit: 100) { cursor items { ${CHAMPS} } } } }`, { b: id });
  let page = d?.boards?.[0]?.items_page;
  let fichiers = 0;
  let sous = 0;
  while (page) {
    for (const it of page.items || []) {
      const liens = {};
      const textes = {};
      for (const c of it.column_values || []) {
        if (c.type === 'board_relation' && c.linked_item_ids?.length) liens[c.id] = c.linked_item_ids.map(String);
        const affiche = c.display_value ?? c.text;
        if (affiche && String(affiche).trim()) textes[c.id] = String(affiche).trim();
      }
      // Les fichiers : téléchargés maintenant, le lien public expire dans l'heure.
      const joints = [];
      for (const a of it.assets || []) {
        if (!a.public_url) continue;
        const rep = path.join(dossier, 'fichiers', String(it.id));
        fs.mkdirSync(rep, { recursive: true });
        const nom = `${a.id}-${propre(a.name)}`;
        const cible = path.join(rep, nom);
        if (!fs.existsSync(cible)) {
          try {
            const r = await fetch(a.public_url, { signal: AbortSignal.timeout(120_000) });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            fs.writeFileSync(cible, Buffer.from(await r.arrayBuffer()));
          } catch (e) {
            joints.push({ id: a.id, nom: a.name, erreur: e.message });
            continue;
          }
        }
        joints.push({ id: a.id, nom: a.name, fichier: path.relative(dossier, cible), extension: a.file_extension, taille: a.file_size });
        fichiers++;
      }
      const sousElements = (it.subitems || []).filter((s) => s.state !== 'deleted').map((s) => ({ id: s.id, nom: s.name, cree_le: s.created_at, colonnes: Object.fromEntries((s.column_values || []).filter((c) => String(c.text || '').trim()).map((c) => [c.id, { text: c.text, type: c.type, value: c.value }])) }));
      sous += sousElements.length;
      if (Object.keys(liens).length || Object.keys(textes).length || joints.length || sousElements.length) elements[it.id] = { liens, textes, fichiers: joints, sous_elements: sousElements };
    }
    if (!page.cursor || !page.items?.length) break;
    d = await gql(`query ($c: String!) { next_items_page(cursor: $c, limit: 100) { cursor items { ${CHAMPS} } } }`, { c: page.cursor });
    page = d?.next_items_page;
  }
  fs.writeFileSync(path.join(dossier, 'complements', `${id}.json`), JSON.stringify(elements, null, 2));
  const nLiens = Object.values(elements).reduce((n, e) => n + Object.keys(e.liens).length, 0);
  console.log(`${Object.keys(elements).length} élément(s) complétés : ${nLiens} lien(s), ${fichiers} fichier(s), ${sous} sous-élément(s)`);
}
