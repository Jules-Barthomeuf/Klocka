// Rattrapage de Monday après la bascule (28 oct. 2026, Jules) : du 27 oct. au soir au passage en CRM=double, Klocka
// n'écrivait que dans Twenty. Les fiches qu'il y a créées (sans mondayId) naissent dans Monday, dans leur tableau, avec
// leurs valeurs, puis la fiche Twenty reçoit son mondayId : la double écriture les retrouve ensuite. Seules les fiches
// créées par Klocka (API) ; une fiche faite à la main dans Twenty, ou un essai « (test) », reste où elle est.
//   node scripts/crm/rattraper-monday.mjs            (montre ce qui partirait)
//   node scripts/crm/rattraper-monday.mjs --ecrire   (écrit dans Monday puis relie dans Twenty)
// Rejouable : une fiche reliée a son mondayId et n'est plus reprise.
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, lister, modifier, objetsTwenty } from '../../server/twenty.js';
import { texteDe } from '../../server/crm/monday-sur-twenty.js';

process.env.CRM = 'monday'; // ce script écrit dans Monday seul, puis relie lui-même
const M = await import('../../server/monday.js');
if (!twentyConfigure() || !M.mondayConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY / MONDAY_TOKEN manquants');
  process.exit(1);
}
const ecrire = process.argv.includes('--ecrire');
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const meta = await objetsTwenty();

/** Une valeur Twenty au format d'une colonne Monday ; undefined : la colonne n'est pas écrite. */
async function versMonday(mondayType, f, v) {
  const t = texteDe(f.type, v, f.options || []);
  if (!t) return undefined;
  switch (mondayType) {
    case 'text': return t;
    case 'long_text': return { text: t };
    case 'numbers': return t.replace(/\s/g, '');
    case 'status': return { label: t };
    case 'dropdown': return { labels: t.split(/\s*,\s*/).filter(Boolean) };
    case 'date': return { date: t.slice(0, 10) };
    case 'email': return { email: t.split(',')[0].trim(), text: t.split(',')[0].trim() };
    case 'phone': return { phone: t.replace(/\s/g, ''), countryShortName: v?.primaryPhoneCountryCode || 'FR' };
    case 'link': return { url: t, text: t };
    case 'people': {
      const ids = [];
      for (const nom of t.split(/\s*,\s*/)) {
        const p = await M.personneMonday({ nom }).catch(() => null);
        if (p?.id) ids.push({ id: Number(p.id), kind: 'person' });
      }
      return ids.length ? { personsAndTeams: ids } : undefined;
    }
    default: return undefined; // liens entre tableaux, miroirs, formules : rien
  }
}

let total = 0;
for (const o of objets) {
  const m = meta.find((x) => x.nameSingular === o.nameSingular);
  if (!m || !o.mondayTableau) continue;
  const champs = new Map((m.fields || []).map((f) => [f.name, f]));
  const fiches = (await lister(o.namePlural, { filtre: 'mondayId[is]:NULL' }))
    .filter((r) => !r.deletedAt && r.createdBy?.source === 'API' && !/^\(test\)/i.test(r.name || ''));
  for (const r of fiches) {
    const colonnes = {};
    for (const c of o.champs) {
      const f = champs.get(c.name);
      if (!c.mondayColonne || !f) continue;
      const x = await versMonday(c.mondayType, f, r[c.name]);
      if (x !== undefined) colonnes[c.mondayColonne] = x;
    }
    total++;
    console.log(`${o.labelPlural} · ${r.name} : ${Object.keys(colonnes).length} colonne(s)${ecrire ? '' : ' (non écrit)'}`);
    if (!ecrire) continue;
    const cree = await M.creerElement(o.mondayTableau, r.name || 'Sans nom', colonnes, { labels: true });
    await modifier(o.namePlural, r.id, { mondayId: String(cree.id) });
    console.log(`   → Monday ${cree.id}, relié dans Twenty`);
  }
}
console.log(`${total} fiche(s) ${ecrire ? 'recopiée(s) dans Monday' : 'à recopier (relancer avec --ecrire)'}`);
