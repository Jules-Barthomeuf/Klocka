// Les groupes Monday deviennent un champ « Groupe » à choix dans Twenty (27 oct. 2026) : Clients en cours / signés,
// Annonces / VENDU ! / archivées, Transactions en cours / réalisées / avortées… De quoi regrouper une vue ou l'afficher
// en Kanban comme dans Monday. Seulement pour les tableaux qui avaient au moins deux groupes.
//   node scripts/crm/groupes-twenty.mjs [nomDObjet]
// Rejouable.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { twentyConfigure, objetsTwenty, creerChamp, lister } from '../../server/twenty.js';
import { optionsDe, valeurOption } from '../../server/crm/correspondance.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const seul = process.argv[2] || null;
const dernier = fs.readdirSync('exports-prives').filter((d) => /^monday-\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const exportSchema = JSON.parse(fs.readFileSync(path.join('exports-prives', dernier, 'schema.json'), 'utf8'));
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
let meta = await objetsTwenty();

async function gql(query, variables) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fetch(`${String(process.env.TWENTY_URL).replace(/\/+$/, '')}/graphql`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 300));
  return d.data;
}

for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  const groupes = (exportSchema.tableaux.find((t) => String(t.id) === o.mondayTableau)?.groups || [])
    .sort((a, b) => Number(a.position || 0) - Number(b.position || 0)).map((g) => g.title.trim());
  const libelles = [...new Map(groupes.map((g) => [valeurOption(g), g])).values()];
  if (libelles.length < 2) continue;
  let m = meta.find((x) => x.nameSingular === o.nameSingular);
  if (!m.fields.some((f) => f.name === 'groupe')) {
    await creerChamp({ objectMetadataId: m.id, name: 'groupe', label: 'Groupe', type: 'SELECT', icon: 'IconLayoutKanban', description: 'Le groupe du tableau Monday', options: optionsDe(libelles) });
    meta = await objetsTwenty();
    m = meta.find((x) => x.nameSingular === o.nameSingular);
  }
  // Par lots de 200 identifiants (plafond de Twenty) et par groupe : quelques requêtes au lieu d'une par fiche.
  let n = 0;
  const pluriel = o.namePlural[0].toUpperCase() + o.namePlural.slice(1);
  const Singulier = o.nameSingular[0].toUpperCase() + o.nameSingular.slice(1);
  const parGroupe = new Map();
  for (const r of await lister(o.namePlural, { champs: 'id,mondayGroupe,groupe', limite: 10000 })) {
    const v = r.mondayGroupe ? valeurOption(String(r.mondayGroupe).trim()) : null;
    if (!v || r.groupe === v || !libelles.some((l) => valeurOption(l) === v)) continue;
    parGroupe.set(v, [...(parGroupe.get(v) || []), r.id]);
  }
  for (const [v, ids] of parGroupe) {
    for (let k = 0; k < ids.length; k += 200) {
      const d = await gql(`mutation($d: ${Singulier}UpdateInput!, $f: ${Singulier}FilterInput!) { update${pluriel}(data: $d, filter: $f) { id } }`, { d: { groupe: v }, f: { id: { in: ids.slice(k, k + 200) } } });
      n += d?.[`update${pluriel}`]?.length || 0;
    }
  }
  console.log(`${o.labelPlural.padEnd(32)} ${libelles.length} groupes, ${n} fiche(s) classée(s)`);
}
