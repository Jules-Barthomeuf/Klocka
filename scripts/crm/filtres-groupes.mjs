// Une vue nommée comme une valeur du champ « Groupe » ne montre que ce groupe (28 oct. 2026, Jules) : Clients en cours,
// Clients signés, Clients stand by / Archivée avaient été créées sans filtre et montraient toutes les fiches.
// Pose un filtre « Groupe est <valeur> » sur chacune, sans toucher aux vues qui ont déjà un filtre. Rejouable.
//   node scripts/crm/filtres-groupes.mjs
import 'dotenv/config';

const URL_TWENTY = String(process.env.TWENTY_URL || '').replace(/\/+$/, '');
const CLE = process.env.TWENTY_API_KEY;
if (!URL_TWENTY || !CLE) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const entetes = { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' };

const r = await fetch(`${URL_TWENTY}/metadata`, {
  method: 'POST',
  headers: entetes,
  body: JSON.stringify({ query: '{ getViews { id name type objectMetadataId viewFilters { id } } objects(paging:{first:1000}) { edges { node { id labelPlural fields(paging:{first:1000}) { edges { node { id name type options } } } } } } }' }),
});
const { data, errors } = await r.json();
if (errors?.length) throw new Error(errors[0].message);

for (const { node: objet } of data.objects.edges) {
  const groupe = objet.fields.edges.map((e) => e.node).find((f) => f.name === 'groupe' && f.type === 'SELECT');
  if (!groupe) continue;
  for (const vue of data.getViews.filter((v) => v.objectMetadataId === objet.id && v.type === 'TABLE')) {
    const option = (groupe.options || []).find((o) => o.label === vue.name);
    if (!option) continue;
    if (vue.viewFilters.length) {
      console.log(`${objet.labelPlural} · ${vue.name} : déjà filtrée, laissée telle quelle`);
      continue;
    }
    const p = await fetch(`${URL_TWENTY}/rest/metadata/viewFilters`, {
      method: 'POST',
      headers: entetes,
      body: JSON.stringify({ viewId: vue.id, fieldMetadataId: groupe.id, operand: 'IS', value: JSON.stringify([option.value]) }),
    });
    if (!p.ok) throw new Error(`${vue.name} : ${p.status} ${(await p.text()).slice(0, 300)}`);
    console.log(`${objet.labelPlural} · ${vue.name} : filtre Groupe = ${option.label}`);
  }
}
