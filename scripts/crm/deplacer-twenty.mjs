// « Déplacer vers un autre tableau » dans Twenty (28 oct. 2026, Jules), comme dans Monday. Twenty ne sait pas changer
// le tableau d'une fiche ; on lui ajoute :
//   1. dans chaque tableau, un champ à choix « Déplacer vers » (les autres tableaux) : on le remplit sur une fiche, ou
//      sur plusieurs lignes cochées par « Déplacer / modifier » ;
//   2. un objet « Déplacements », le journal de ce qui a été déplacé ;
//   3. un webhook « <tableau>.updated » vers Klocka (POST /api/crm/webhook, signé par CRM_DEPLACER_SECRET), qui fait le
//      déplacement (server/crm/deplacer.js).
//   node scripts/crm/deplacer-twenty.mjs [adresse de Klocka, https://klocka-unus.onrender.com par défaut]
// Rejouable. Le secret est tiré au premier passage et écrit dans .env ; il doit aussi être sur Render.
import 'dotenv/config';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { twentyConfigure, objetsTwenty, creerObjet, creerChamp, modifierChamp } from '../../server/twenty.js';
import { optionsDe, valeurOption } from '../../server/crm/correspondance.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env');
  process.exit(1);
}
const KLOCKA = (process.argv[2] || 'https://klocka-unus.onrender.com').replace(/\/+$/, '');

let secret = String(process.env.CRM_DEPLACER_SECRET || '');
if (secret.length < 24) {
  secret = crypto.randomBytes(32).toString('hex');
  fs.appendFileSync('.env', `\n# Twenty → Klocka : secret du webhook « Déplacer vers » (scripts/crm/deplacer-twenty.mjs)\nCRM_DEPLACER_SECRET=${secret}\n`);
  console.log('CRM_DEPLACER_SECRET tiré et écrit dans .env (à mettre aussi sur Render)');
}

async function gql(query, variables) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fetch(`${String(process.env.TWENTY_URL).replace(/\/+$/, '')}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 300));
  return d.data;
}

const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
let meta = await objetsTwenty();
const tous = objets.map((o) => o.labelPlural);
const memes = (a, b) => JSON.stringify((a || []).map((o) => o.value).sort()) === JSON.stringify((b || []).map((o) => o.value).sort());

// 1. Le champ « Déplacer vers » de chaque tableau : tous les autres tableaux.
for (const o of objets) {
  const m = meta.find((x) => x.nameSingular === o.nameSingular);
  const options = optionsDe(tous.filter((l) => l !== o.labelPlural));
  const champ = (m.fields || []).find((f) => f.name === 'deplacerVers');
  if (!champ) {
    await creerChamp({ objectMetadataId: m.id, name: 'deplacerVers', label: 'Déplacer vers', type: 'SELECT', icon: 'IconArrowsExchange', description: 'Choisir un tableau : la fiche y est déplacée (notes, tâches et fichiers compris), l\'ancienne va dans Fiches supprimées.', options });
    console.log(`+ Déplacer vers · ${o.labelPlural}`);
  } else if (!memes(champ.options, options)) {
    await modifierChamp(champ.id, { options });
    console.log(`~ Déplacer vers · ${o.labelPlural} (choix mis à jour)`);
  }
}

// 2. Le journal.
meta = await objetsTwenty();
let journal = meta.find((x) => x.nameSingular === 'deplacement');
if (!journal) {
  await creerObjet({ nameSingular: 'deplacement', namePlural: 'deplacements', labelSingular: 'Déplacement', labelPlural: 'Déplacements', icon: 'IconArrowsExchange', description: 'Le journal des fiches déplacées d\'un tableau à un autre (Klocka, server/crm/deplacer.js)' });
  meta = await objetsTwenty();
  journal = meta.find((x) => x.nameSingular === 'deplacement');
  console.log('+ objet Déplacements');
}
const CHAMPS_JOURNAL = [
  { name: 'depuis', label: 'Depuis', type: 'TEXT', icon: 'IconArrowLeft' },
  { name: 'vers', label: 'Vers', type: 'SELECT', icon: 'IconArrowRight', options: optionsDe(tous) },
  { name: 'fiches', label: 'Fiches', type: 'NUMBER', icon: 'IconHash' },
  { name: 'detail', label: 'Détail', type: 'TEXT', icon: 'IconList' },
];
for (const c of CHAMPS_JOURNAL) {
  if ((journal.fields || []).some((f) => f.name === c.name)) continue;
  await creerChamp({ objectMetadataId: journal.id, ...c });
  console.log(`+ Déplacements · ${c.label}`);
}

// 3. Le webhook vers Klocka.
const cible = `${KLOCKA}/api/crm/webhook`;
// Créations et suppressions aussi : la synchronisation Twenty → Monday (server/crm/synchro.js, CRM=double) les suit.
const operations = objets.flatMap((o) => [`${o.nameSingular}.created`, `${o.nameSingular}.updated`, `${o.nameSingular}.deleted`]);
const { webhooks } = await gql('{ webhooks { id targetUrl operations } }');
const existant = webhooks.find((w) => w.targetUrl === cible);
if (!existant) {
  await gql('mutation($i: CreateWebhookInput!) { createWebhook(input: $i) { id } }', { i: { targetUrl: cible, operations, secret, description: 'Klocka : Déplacer vers (scripts/crm/deplacer-twenty.mjs)' } });
  console.log(`+ webhook ${cible}`);
} else {
  await gql('mutation($i: UpdateWebhookInput!) { updateWebhook(input: $i) { id } }', { i: { id: existant.id, update: { operations, secret } } });
  console.log(`~ webhook ${cible} (opérations et secret remis)`);
}
console.log(`Options : ${tous.map(valeurOption).length} tableaux. Fait.`);
