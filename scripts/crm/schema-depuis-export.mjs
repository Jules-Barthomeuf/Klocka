// Le schéma Twenty tiré de l'export Monday (27 oct. 2026), sans réseau.
//   node scripts/crm/schema-depuis-export.mjs [exports-prives/monday-2026-10-27]
// Lit schema.json et les tableaux de l'export, garde ceux de crm/tableaux.json, et écrit crm/schema.json : un objet par
// tableau, ses champs, les options de chaque liste (celles de Monday plus les anciens libellés trouvés dans les
// données). crm/schema.json ne contient que des noms de colonnes et de statuts : il est versionné.
import fs from 'node:fs';
import path from 'node:path';
import { objetDe, champsDe, libellesManquants, optionsDe } from '../../server/crm/correspondance.js';

const dossier = path.resolve(process.argv[2] || fs.readdirSync('exports-prives').filter((d) => d.startsWith('monday-')).sort().map((d) => path.join('exports-prives', d)).pop());
const export_ = JSON.parse(fs.readFileSync(path.join(dossier, 'schema.json'), 'utf8'));
const choix = JSON.parse(fs.readFileSync('crm/tableaux.json', 'utf8')).tableaux;

const pris = new Set();
const objets = [];
for (const c of choix) {
  const t = export_.tableaux.find((x) => String(x.id) === c.id);
  if (!t) {
    console.warn(`Tableau ${c.id} absent de l'export`);
    continue;
  }
  const { elements } = JSON.parse(fs.readFileSync(path.join(dossier, 'tableaux', `${c.id}.json`), 'utf8'));
  const objet = objetDe(c.sansPrefixe ? { ...t, workspace: null } : t, pris);
  const champs = champsDe(t.columns).map((champ) => {
    const manquants = libellesManquants(elements, champ);
    return manquants.length ? { ...champ, options: optionsDe([...champ.options.map((o) => o.label), ...manquants]) } : champ;
  });
  objets.push({ mondayTableau: c.id, mondayNom: t.name, espace: t.workspace?.name || null, role: c.role, elements: elements.length, ...objet, champs });
  console.log(`${objet.labelPlural.padEnd(36)} ${objet.nameSingular.padEnd(32)} ${String(champs.length).padStart(3)} champs  ${elements.length} éléments`);
}

fs.writeFileSync('crm/schema.json', `${JSON.stringify({ depuis: path.basename(dossier), objets }, null, 2)}\n`);
console.log(`\n${objets.length} objets → crm/schema.json`);
