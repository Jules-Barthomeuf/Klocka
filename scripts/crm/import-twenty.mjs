// Remplit Twenty avec l'export Monday (27 oct. 2026).
//   node scripts/crm/import-twenty.mjs                          tous les objets de crm/schema.json
//   node scripts/crm/import-twenty.mjs agentImmobilier          un seul (essai)
//   node scripts/crm/import-twenty.mjs --maj exports-prives/monday-2026-10-27
//        différentiel de la bascule : crée ce qui manque, et met à jour ce qui a changé depuis cet export-là
// Rejouable sans doublon : un élément déjà importé est retrouvé par son mondayId. Lit le dernier export (ou celui
// passé en --export). Écrit la correspondance mondayId → id Twenty dans <export>/correspondance.json, et les refus
// dans <export>/refus-import.json. Les mises à jour Monday (le fil d'une fiche) deviennent des notes rattachées.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { twentyConfigure, objetsTwenty, lister, creerEnLot, creer, modifier, noter } from '../../server/twenty.js';
import { enregistrementDe } from '../../server/crm/correspondance.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants dans .env');
  process.exit(1);
}

const args = process.argv.slice(2);
const opt = (nom) => (args.includes(nom) ? args[args.indexOf(nom) + 1] : null);
const dernierExport = () => fs.readdirSync('exports-prives').filter((d) => /^monday-\d{4}-\d{2}-\d{2}$/.test(d)).sort().map((d) => path.join('exports-prives', d)).pop();
const dossier = path.resolve(opt('--export') || dernierExport());
const precedent = opt('--maj') ? path.resolve(opt('--maj')) : null;
const seul = args.find((x) => !x.startsWith('--') && x !== opt('--export') && x !== opt('--maj')) || null;

const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const fichierCorr = path.join(dossier, 'correspondance.json');
const corr = fs.existsSync(fichierCorr) ? JSON.parse(fs.readFileSync(fichierCorr, 'utf8')) : { objets: {}, notes: {} };
const refus = [];
const garder = () => {
  fs.writeFileSync(fichierCorr, JSON.stringify(corr, null, 2));
  fs.writeFileSync(path.join(dossier, 'refus-import.json'), JSON.stringify(refus, null, 2));
};

const lireTableau = (dir, id) => {
  const f = path.join(dir, 'tableaux', `${id}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { elements: [], mises_a_jour: [] };
};
const majuscule = (s) => s[0].toUpperCase() + s.slice(1);

const twenty = await objetsTwenty();
const bilan = [];
for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  const objet = twenty.find((x) => x.nameSingular === o.nameSingular);
  if (!objet) {
    console.error(`${o.nameSingular} absent de Twenty : lancer scripts/crm/schema-twenty.mjs`);
    continue;
  }
  // Le type réel du champ dans Twenty fait foi (une liste Monday sans libellé y est devenue du texte).
  const typesLa = new Map((objet.fields || []).map((f) => [f.name, f.type]));
  const champs = o.champs.filter((c) => typesLa.has(c.name)).map((c) => ({ ...c, type: typesLa.get(c.name) }));

  const { elements, mises_a_jour: misesAJour = [] } = lireTableau(dossier, o.mondayTableau);
  const avant = precedent ? new Map(lireTableau(precedent, o.mondayTableau).elements.map((e) => [String(e.id), JSON.stringify(e.column_values) + e.name])) : null;

  const deja = new Map((await lister(o.namePlural, { champs: 'id,mondayId' })).filter((x) => x.mondayId).map((x) => [String(x.mondayId), x.id]));
  const ids = (corr.objets[o.nameSingular] ||= {});
  for (const [m, t] of deja) ids[m] = t;

  const nouveaux = elements.filter((e) => !deja.has(String(e.id)));
  const changes = avant ? elements.filter((e) => deja.has(String(e.id)) && avant.get(String(e.id)) !== JSON.stringify(e.column_values) + e.name) : [];

  // Par lots de 60 ; un lot refusé est repris un par un, pour isoler la fiche fautive et importer les autres.
  let crees = 0;
  for (let i = 0; i < nouveaux.length; i += 60) {
    const lot = nouveaux.slice(i, i + 60);
    const enregistrements = lot.map((e) => enregistrementDe(e, champs));
    try {
      const r = await creerEnLot(o.namePlural, enregistrements);
      r.forEach((x) => { if (x?.mondayId) ids[String(x.mondayId)] = x.id; });
      crees += r.length;
    } catch (e) {
      console.warn(`  lot refusé (${e.message.slice(0, 160)}), reprise un par un`);
      for (const [k, enr] of enregistrements.entries()) {
        try {
          const x = await creer(o.namePlural, enr);
          ids[String(lot[k].id)] = x.id;
          crees++;
        } catch (err) {
          refus.push({ objet: o.nameSingular, mondayId: String(lot[k].id), nom: lot[k].name, erreur: err.message });
        }
      }
    }
    garder();
  }

  let misAJour = 0;
  for (const e of changes) {
    try {
      const { mondayId: _m, ...valeurs } = enregistrementDe(e, champs);
      await modifier(o.namePlural, deja.get(String(e.id)), valeurs);
      misAJour++;
    } catch (err) {
      refus.push({ objet: o.nameSingular, mondayId: String(e.id), nom: e.name, erreur: err.message });
    }
  }

  // Le fil Monday d'une fiche : une note par mise à jour, réponses comprises, une seule fois.
  let notes = 0;
  const cible = `target${majuscule(o.nameSingular)}Id`;
  for (const u of misesAJour) {
    const id = ids[String(u.item_id)];
    if (!id || corr.notes[u.id]) continue;
    const reponses = (u.replies || []).map((r) => `\n\n**${r.creator?.name || '?'}**, ${String(r.created_at).slice(0, 10)} :\n${r.text_body || ''}`).join('');
    try {
      const n = await noter(cible, id, `Monday · ${u.creator?.name || '?'} · ${String(u.created_at).slice(0, 10)}`, `${u.text_body || ''}${reponses}`);
      corr.notes[u.id] = n.id;
      notes++;
    } catch (err) {
      refus.push({ objet: o.nameSingular, mondayId: String(u.item_id), note: u.id, erreur: err.message });
    }
  }
  garder();

  const total = (await lister(o.namePlural, { champs: 'id' })).length;
  bilan.push({ objet: o.labelPlural, monday: elements.length, twenty: total, crees, misAJour, notes });
  console.log(`${o.labelPlural.padEnd(32)} Monday ${String(elements.length).padStart(5)}  Twenty ${String(total).padStart(5)}  (+${crees}${changes.length ? `, ${misAJour} mis à jour` : ''}${notes ? `, ${notes} note(s)` : ''})${total === elements.length ? '' : '  ← ÉCART'}`);
}

garder();
console.log(`\n${refus.length} refus${refus.length ? ` → ${path.join(dossier, 'refus-import.json')}` : ''}`);
fs.writeFileSync(path.join(dossier, 'bilan-import.json'), JSON.stringify(bilan, null, 2));
