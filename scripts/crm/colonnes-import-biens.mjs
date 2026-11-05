// Les colonnes que l'assistant d'import des biens remplit (4 nov. 2026, Jules : « oui, aux deux ») :
//   - KP · Prospects et KP · Clients : « Statut » (Contact, Visite faite, Offre, Perdu ; l'étape d'un vendeur) et
//     « Prochaine relance » (une date) ;
//   - KP · Propriétés KPartners : nos étapes au Statut, nos types au Type de propriété.
// Monday d'abord (create_column), puis crm/schema.json, puis Twenty par scripts/crm/schema-twenty.mjs.
//   node scripts/crm/colonnes-import-biens.mjs          ce qui serait fait
//   node scripts/crm/colonnes-import-biens.mjs --go     le faire
// Rejouable : une colonne qui existe déjà (même titre) est reprise, rien n'est supprimé.
import 'dotenv/config';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { optionsDe } from '../../server/crm/correspondance.js';

const GO = process.argv.includes('--go');
const TOKEN = (process.env.MONDAY_TOKEN || '').trim();
if (!TOKEN) { console.error('MONDAY_TOKEN manquant'); process.exit(1); }
const monday = async (query, variables = {}) => {
  const r = await fetch('https://api.monday.com/v2', { method: 'POST', headers: { Authorization: TOKEN, 'Content-Type': 'application/json', 'API-Version': '2024-10' }, body: JSON.stringify({ query, variables }) });
  const j = await r.json();
  if (j.errors?.length || j.error_message) throw new Error(JSON.stringify(j.errors || j.error_message).slice(0, 400));
  return j.data;
};

const STATUTS_CONTACT = ['Contact', 'Visite faite', 'Offre', 'Perdu', 'Pré-visite', 'Avis de valeur', 'Avis accepté', 'Mandat signé', 'En vente', 'Sous offre', 'Sous promesse'];
const AJOUTS = [
  { tableau: '5091573479', colonnes: [{ titre: 'Statut', type: 'status', name: 'statutContact', labels: STATUTS_CONTACT }, { titre: 'Prochaine relance', type: 'date', name: 'prochaineRelance' }] },
  { tableau: '5091576378', colonnes: [{ titre: 'Statut', type: 'status', name: 'statutContact', labels: STATUTS_CONTACT }, { titre: 'Prochaine relance', type: 'date', name: 'prochaineRelance' }] },
];
const OPTIONS = [
  { tableau: '5100528599', label: 'Statut', ajout: ['Pré-visite', 'Avis de valeur', 'Mandat signé', 'Data room', 'En vente'] },
  { tableau: '5100528599', label: 'Type de propriété', ajout: ['Murs commerciaux', 'Fonds de commerce', 'Bureaux', 'Murs et fonds'] },
];

const schema = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const objet = (t) => schema.objets.find((o) => o.mondayTableau === t);

for (const { tableau, colonnes } of AJOUTS) {
  const o = objet(tableau);
  const la = (await monday('query ($b: [ID!]) { boards(ids: $b) { name columns { id title type } } }', { b: [tableau] })).boards[0];
  for (const c of colonnes) {
    let col = la.columns.find((x) => x.title.toLowerCase() === c.titre.toLowerCase());
    if (col) console.log(`= ${la.name} · ${c.titre} existe (${col.id})`);
    else if (!GO) console.log(`+ ${la.name} · ${c.titre} (${c.type}) serait créée`);
    else {
      const defaults = c.labels ? JSON.stringify({ labels: Object.fromEntries(c.labels.map((l, i) => [String(i), l])) }) : undefined;
      col = (await monday('mutation ($b: ID!, $t: String!, $ty: ColumnType!, $d: JSON) { create_column(board_id: $b, title: $t, column_type: $ty, defaults: $d) { id title } }', { b: tableau, t: c.titre, ty: c.type, d: defaults })).create_column;
      console.log(`+ ${la.name} · ${c.titre} créée (${col.id})`);
    }
    if (col && !o.champs.some((x) => x.mondayColonne === col.id)) {
      o.champs.push(c.type === 'status'
        ? { name: c.name, label: c.titre, type: 'SELECT', mondayColonne: col.id, mondayType: 'status', options: optionsDe(c.labels) }
        : { name: c.name, label: c.titre, type: 'DATE', mondayColonne: col.id, mondayType: 'date' });
    }
  }
}
for (const { tableau, label, ajout } of OPTIONS) {
  const c = objet(tableau).champs.find((x) => x.label === label);
  const manquent = ajout.filter((l) => !(c.options || []).some((x) => x.label === l));
  if (!manquent.length) { console.log(`= ${label} : options déjà là`); continue; }
  console.log(`${GO ? '+' : '(+)'} ${label} : ${manquent.join(', ')}`);
  const nouvelles = optionsDe(manquent).map((x, i) => ({ ...x, position: (c.options || []).length + i }));
  c.options = [...(c.options || []), ...nouvelles];
}
if (!GO) { console.log('Rien n’est écrit : relancez avec --go.'); process.exit(0); }
fs.writeFileSync('crm/schema.json', `${JSON.stringify(schema, null, 2)}\n`);
console.log('crm/schema.json à jour');
if (process.env.TWENTY_URL && process.env.TWENTY_API_KEY) {
  for (const o of ['kpProspects', 'kpClients', 'kpProprietesKpartners']) execFileSync('node', ['scripts/crm/schema-twenty.mjs', o], { stdio: 'inherit' });
} else console.log('Twenty non configuré ici : lancez scripts/crm/schema-twenty.mjs là où il l’est.');
