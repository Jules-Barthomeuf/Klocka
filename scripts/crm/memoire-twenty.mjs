// La Mémoire Klocka dans Twenty CRM (30 oct. 2026, Jules) :
//   1. l'option « Mémoire » sur le statut de « Propriétés » : les biens vus, hors pipeline ;
//   2. une vraie relation Propriété → Agent immobilier (champ `agent`, plusieurs propriétés pour un agent) ; jusqu'ici
//      « Agent immobilier » n'était qu'un texte figé de Monday ;
//   3. sur « Agent immobilier », les chiffres de la Mémoire : fiches reçues, villes, loyers, prix, dernier envoi,
//      part de biens retenus.
// Rejouable : rien n'est créé deux fois.
//   node scripts/crm/memoire-twenty.mjs
import 'dotenv/config';
import { twentyConfigure, objetsTwenty, creerChamp, modifierChamp } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const U = String(process.env.TWENTY_URL).replace(/\/+$/, '');
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables = {}, essai = 0) {
  await attendre(700);
  const r = await fetch(`${U}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(120_000) });
  if (r.status === 429 && essai < 6) { await attendre(20_000); return gql(query, variables, essai + 1); }
  const d = await r.json().catch(() => ({}));
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 400));
  return d.data;
}

let meta = await objetsTwenty();
const metaDe = (nom) => meta.find((x) => x.nameSingular === nom);
const proprietes = metaDe('proprietes');
const agents = metaDe('agentImmobilier');
if (!proprietes || !agents) throw new Error('Objets « Propriétés » ou « Agent immobilier » introuvables : lancer schema-twenty.mjs d’abord.');

// 1. Le statut « Mémoire ».
const statut = (proprietes.fields || []).find((f) => f.name === 'statut');
if (!statut) throw new Error('Propriétés sans champ statut');
if (!(statut.options || []).some((o) => o.value === 'MEMOIRE')) {
  await modifierChamp(statut.id, { options: [...statut.options, { value: 'MEMOIRE', label: 'Mémoire', color: 'gray', position: statut.options.length }] });
  console.log('+ Propriétés · statut « Mémoire »');
} else console.log('= Propriétés · statut « Mémoire » déjà là');

// 2. La relation Propriété → Agent immobilier.
const relation = (proprietes.fields || []).find((f) => f.type === 'RELATION' && f.name === 'agent');
if (!relation) {
  await gql('mutation($i: CreateOneFieldMetadataInput!) { createOneField(input: $i) { id name } }', {
    i: { field: { type: 'RELATION', name: 'agent', label: 'Agent', objectMetadataId: proprietes.id, icon: 'IconUser', description: 'L’agent qui a transmis le bien (relation, posée par Klocka)', relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: agents.id, targetFieldLabel: 'Propriétés transmises', targetFieldIcon: 'IconBuildingStore' } } },
  });
  console.log('+ Propriétés · relation « Agent » → Agent immobilier');
} else console.log('= Propriétés · relation « Agent » déjà là');

// 3. Les chiffres de la Mémoire sur l'agent.
const CHAMPS = [
  { name: 'fichesRecues', label: 'Fiches reçues', type: 'NUMBER', icon: 'IconFiles', description: 'Fiches de biens reçues de cet agent (Mémoire Klocka)' },
  { name: 'villesFiches', label: 'Villes des fiches', type: 'TEXT', icon: 'IconMapPin' },
  { name: 'loyersFiches', label: 'Loyers des fiches', type: 'TEXT', icon: 'IconCoin', description: 'min · médiane · max, en € par an' },
  { name: 'prixFiches', label: 'Prix des fiches', type: 'TEXT', icon: 'IconCash', description: 'min · médiane · max' },
  { name: 'dernierEnvoi', label: 'Dernier envoi', type: 'DATE', icon: 'IconCalendar' },
  { name: 'tauxRetenu', label: 'Part retenue (%)', type: 'NUMBER', icon: 'IconPercentage', description: 'Part des fiches devenues un dossier Klocka' },
];
meta = await objetsTwenty();
const agentsMaj = metaDe('agentImmobilier');
for (const c of CHAMPS) {
  if ((agentsMaj.fields || []).some((f) => f.name === c.name)) { console.log(`= Agent immobilier · ${c.label}`); continue; }
  await creerChamp({ objectMetadataId: agentsMaj.id, ...c });
  console.log(`+ Agent immobilier · ${c.label}`);
}
console.log('Fait.');
