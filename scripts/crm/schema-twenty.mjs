// Crée dans Twenty les objets et les champs de crm/schema.json (27 oct. 2026).
//   node scripts/crm/schema-twenty.mjs                   tous les objets
//   node scripts/crm/schema-twenty.mjs agentImmobilier   un seul (essai)
// Rejouable : un objet ou un champ qui existe déjà est laissé tel quel ; une option manquante est ajoutée.
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, objetsTwenty, creerObjet, creerChamp, modifierChamp } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env');
  process.exit(1);
}
const seul = process.argv[2] || null;
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const ICONES = { klocka: 'IconBuildingSkyscraper', kpartners: 'IconUsersGroup', partage: 'IconHome' };

let existants = await objetsTwenty();
let erreurs = 0;
let renommes = 0;
for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  let objet = existants.find((x) => x.nameSingular === o.nameSingular);
  if (!objet) {
    objet = await creerObjet({ nameSingular: o.nameSingular, namePlural: o.namePlural, labelSingular: o.labelSingular, labelPlural: o.labelPlural, icon: ICONES[o.role] || 'IconTable', description: `Monday : ${o.espace} / ${o.mondayNom} (${o.mondayTableau})` });
    existants = await objetsTwenty();
    objet = existants.find((x) => x.nameSingular === o.nameSingular) || objet;
    console.log(`+ objet ${o.labelPlural}`);
  }
  const champsLa = new Map((objet.fields || []).map((f) => [f.name, f]));
  let crees = 0;
  for (const c of o.champs) {
    const deja = champsLa.get(c.name);
    const options = c.options?.length ? c.options : undefined;
    if (deja) {
      const manquantes = (options || []).filter((op) => !(deja.options || []).some((x) => x.value === op.value));
      if (manquantes.length) await modifierChamp(deja.id, { options: [...deja.options, ...manquantes.map((op, i) => ({ ...op, position: deja.options.length + i }))] });
      continue;
    }
    // Une liste sans aucun libellé : Twenty refuse un SELECT vide, on garde le texte.
    const corps = (c.type === 'SELECT' || c.type === 'MULTI_SELECT') && !options
      ? { objectMetadataId: objet.id, name: c.name, label: c.label, type: 'TEXT', description: c.description }
      : { objectMetadataId: objet.id, name: c.name, label: c.label, type: c.type, description: c.description, ...(options ? { options } : {}) };
    try {
      try {
        await creerChamp(corps);
      } catch (e) {
        // Un nom réservé par Twenty (« type »…) : le champ prend le suffixe Monday, et le schéma le retient.
        if (!/reserved/i.test(JSON.stringify(e.details || ''))) throw e;
        c.name = `${c.name}Monday`;
        if (!champsLa.has(c.name)) await creerChamp({ ...corps, name: c.name });
        renommes++;
      }
      crees++;
    } catch (e) {
      erreurs++;
      console.warn(`  ! ${o.nameSingular}.${c.name} (${c.type}, « ${c.label} ») : ${JSON.stringify(e.details || e.message).slice(0, 600)}`);
    }
  }
  console.log(`  ${o.labelPlural} : ${crees} champ(s) créé(s), ${o.champs.length - crees} déjà là`);
}
if (renommes) fs.writeFileSync('crm/schema.json', `${JSON.stringify({ ...JSON.parse(fs.readFileSync('crm/schema.json', 'utf8')), objets }, null, 2)}\n`);
if (erreurs) { console.error(`${erreurs} champ(s) refusé(s)`); process.exitCode = 1; }
