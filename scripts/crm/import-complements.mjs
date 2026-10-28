// Ce que l'import de base n'avait pas, rattrapé dans Twenty (27 oct. 2026), depuis scripts/crm/export-complements.mjs :
//   1. les textes : noms des fiches liées, personnes, miroirs et formules (valeur du jour, figée) ;
//   2. les relations : un lien entre tableaux devient un vrai champ relation quand chaque fiche pointe au plus vers une
//      seule autre, dans un seul objet ; sinon les noms restent en texte ;
//   3. les fichiers joints, envoyés dans Twenty et attachés à leur fiche ;
//   4. les sous-éléments, devenus des tâches rattachées à leur fiche.
//   node scripts/crm/import-complements.mjs [nomDObjet]
// Rejouable : ce qui est fait est noté dans <export>/correspondance.json (fichiers, tâches) ou se voit dans Twenty.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { twentyConfigure, objetsTwenty, lister, modifier, creerChamp, creer } from '../../server/twenty.js';
import { camel } from '../../server/crm/correspondance.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const U = String(process.env.TWENTY_URL).replace(/\/+$/, '');
const K = process.env.TWENTY_API_KEY;
const seul = process.argv[2] || null;

const dernier = fs.readdirSync('exports-prives').filter((d) => /^monday-\d{4}-\d{2}-\d{2}$/.test(d)).sort().pop();
const dossier = path.resolve('exports-prives', dernier);
const exportSchema = JSON.parse(fs.readFileSync(path.join(dossier, 'schema.json'), 'utf8'));
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const fichierCorr = path.join(dossier, 'correspondance.json');
const corr = JSON.parse(fs.readFileSync(fichierCorr, 'utf8'));
corr.fichiers ||= {};
corr.taches ||= {};
const garder = () => fs.writeFileSync(fichierCorr, JSON.stringify(corr, null, 2));

// Un id Monday → { objet, id Twenty }, tous objets confondus.
const ouEst = new Map();
for (const [nom, ids] of Object.entries(corr.objets)) for (const [m, t] of Object.entries(ids)) ouEst.set(String(m), { nom, id: t });

const majuscule = (s) => s[0].toUpperCase() + s.slice(1);
const cibleDe = (o) => `target${majuscule(o.nameSingular)}Id`;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(ep, query, variables = {}, essai = 0) {
  await attendre(700);
  const r = await fetch(`${U}/${ep}`, { method: 'POST', headers: { Authorization: `Bearer ${K}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(120_000) });
  if (r.status === 429 && essai < 6) {
    await attendre(20_000);
    return gql(ep, query, variables, essai + 1);
  }
  const d = await r.json().catch(() => ({}));
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 400));
  return d.data;
}

let meta = await objetsTwenty();
const metaDe = (nom) => meta.find((x) => x.nameSingular === nom);
const champFichier = metaDe('attachment')?.fields?.find((f) => f.name === 'file');

/** Un champ texte de plus sur un objet (miroir, formule), sans heurter un nom pris. */
async function champTexte(o, titre, base) {
  const m = metaDe(o.nameSingular);
  let nom = camel(base);
  const pris = new Set((m.fields || []).map((f) => f.name));
  const existant = (m.fields || []).find((f) => f.label === titre && f.type === 'TEXT' && f.isCustom);
  if (existant) return existant.name;
  while (pris.has(nom)) nom = `${nom}Monday`;
  await creerChamp({ objectMetadataId: m.id, name: nom, label: titre, type: 'TEXT', description: 'Valeur Monday du 27 oct. 2026, figée' });
  meta = await objetsTwenty();
  return nom;
}

/** Un champ relation (plusieurs fiches de l'objet → une fiche de la cible). Rend le nom de la colonne d'id. */
async function champRelation(o, label, nomBase, cible) {
  const m = metaDe(o.nameSingular);
  const t = metaDe(cible);
  const existant = (m.fields || []).find((f) => f.type === 'RELATION' && f.label === label);
  if (existant) return `${existant.name}Id`;
  let nom = camel(nomBase);
  const pris = new Set((m.fields || []).map((f) => f.name));
  while (pris.has(nom)) nom = `${nom}Fiche`;
  const inverse = `${o.labelPlural} · ${label}`.slice(0, 60);
  await gql('metadata', 'mutation($i: CreateOneFieldMetadataInput!) { createOneField(input: $i) { id name } }', {
    i: { field: { type: 'RELATION', name: nom, label, objectMetadataId: m.id, icon: 'IconLink', relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: t.id, targetFieldLabel: inverse, targetFieldIcon: 'IconLink' } } },
  });
  meta = await objetsTwenty();
  return `${nom}Id`;
}

/** Envoie un fichier dans Twenty et l'attache à une fiche. */
async function attacher(o, recordId, chemin, nom) {
  const taille = fs.statSync(chemin).size;
  const t = (await gql('metadata', 'mutation($f:String!,$s:Float!,$d:FileFolder!,$m:String){createFileUpload(filename:$f,size:$s,fileFolder:$d,fieldMetadataId:$m){fileId uploadUrl contentType}}', { f: nom, s: taille, d: 'FilesField', m: champFichier.id })).createFileUpload;
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'Content-Type': t.contentType || 'application/octet-stream' }, body: fs.readFileSync(chemin), signal: AbortSignal.timeout(300_000) });
  if (!put.ok) throw new Error(`envoi du fichier : HTTP ${put.status} ${(await put.text()).slice(0, 200)}`);
  const c = (await gql('metadata', 'mutation($id:String!){completeFileUpload(fileId:$id){id}}', { id: t.fileId })).completeFileUpload;
  const a = (await gql('graphql', 'mutation($d:AttachmentCreateInput!){createAttachment(data:$d){id}}', { d: { name: nom, file: [{ fileId: c.id, label: nom }], [cibleDe(o)]: recordId } })).createAttachment;
  return a.id;
}

// Les titres des colonnes des sous-éléments (leurs tableaux « Sous-éléments de … »).
const titreColonne = new Map();
for (const t of exportSchema.tableaux) for (const c of t.columns || []) if (!titreColonne.has(c.id)) titreColonne.set(c.id, c.title);

const bilan = [];
for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  const f = path.join(dossier, 'complements', `${o.mondayTableau}.json`);
  if (!fs.existsSync(f)) {
    console.warn(`${o.labelPlural} : pas de compléments (lancer export-complements.mjs)`);
    continue;
  }
  const comp = JSON.parse(fs.readFileSync(f, 'utf8'));
  const colonnesMonday = exportSchema.tableaux.find((t) => String(t.id) === o.mondayTableau)?.columns || [];
  const ids = corr.objets[o.nameSingular] || {};
  const enregistrements = new Map((await lister(o.namePlural, { limite: 10000 })).map((r) => [String(r.id), r]));
  const b = { objet: o.labelPlural, textes: 0, relations: 0, champsRelation: 0, fichiers: 0, taches: 0, erreurs: 0 };

  // 1. Les textes. Les colonnes déjà migrées (liens, personnes) se remplissent si vides ; miroirs et formules prennent un champ.
  const champParColonne = new Map(o.champs.filter((c) => c.mondayColonne).map((c) => [c.mondayColonne, c.name]));
  const nouveaux = new Map();
  for (const c of colonnesMonday.filter((x) => x.type === 'mirror' || x.type === 'formula')) nouveaux.set(c.id, await champTexte(o, c.title, c.title));

  // 2. Les relations possibles : pour chaque colonne de lien, les objets où vivent les fiches liées.
  const relations = new Map();
  for (const c of colonnesMonday.filter((x) => x.type === 'board_relation')) {
    const cibles = new Set();
    let multiple = false;
    let n = 0;
    for (const e of Object.values(comp)) {
      const l = e.liens?.[c.id] || [];
      if (l.length > 1) multiple = true;
      for (const x of l) {
        const w = ouEst.get(x);
        if (w) cibles.add(w.nom);
      }
      n += l.length;
    }
    if (n && !multiple && cibles.size === 1) {
      relations.set(c.id, await champRelation(o, `${c.title} (fiche)`, `${c.title} fiche`, [...cibles][0]));
      b.champsRelation++;
    }
  }

  for (const [mondayId, e] of Object.entries(comp)) {
    const id = ids[mondayId];
    if (!id) continue;
    const r = enregistrements.get(String(id)) || {};
    const v = {};
    for (const [col, texte] of Object.entries(e.textes || {})) {
      const nom = nouveaux.get(col) || champParColonne.get(col);
      if (nom && (nouveaux.has(col) || !String(r[nom] ?? '').trim())) v[nom] = String(texte).slice(0, 5000);
    }
    for (const [col, joinCol] of relations) {
      const lie = (e.liens?.[col] || [])[0];
      const w = lie && ouEst.get(lie);
      if (w && r[joinCol] !== w.id) v[joinCol] = w.id;
    }
    if (Object.keys(v).length) {
      try {
        await modifier(o.namePlural, id, v);
        b.textes += Object.keys(v).filter((k) => !k.endsWith('Id')).length;
        b.relations += Object.keys(v).filter((k) => [...relations.values()].includes(k)).length;
      } catch (err) {
        b.erreurs++;
        console.warn(`  ! ${o.nameSingular} ${mondayId} : ${err.message.slice(0, 200)}`);
      }
    }

    // 3. Les fichiers.
    for (const j of e.fichiers || []) {
      if (!j.fichier || corr.fichiers[j.id]) continue;
      try {
        corr.fichiers[j.id] = await attacher(o, id, path.join(dossier, j.fichier), j.nom);
        b.fichiers++;
        garder();
      } catch (err) {
        b.erreurs++;
        console.warn(`  ! fichier ${j.nom} : ${err.message.slice(0, 200)}`);
      }
    }

    // 4. Les sous-éléments, en tâches.
    for (const s of e.sous_elements || []) {
      if (corr.taches[s.id]) continue;
      const lignes = Object.entries(s.colonnes || {}).map(([col, x]) => `- **${titreColonne.get(col) || col}** : ${x.text}`);
      const statut = Object.values(s.colonnes || {}).find((x) => x.type === 'status')?.text || '';
      const echeance = Object.values(s.colonnes || {}).find((x) => x.type === 'date')?.text || null;
      try {
        const t = await creer('tasks', {
          title: String(s.nom || 'Sous-élément').slice(0, 200),
          bodyV2: { markdown: lignes.join('\n') || '' },
          status: /fait|termin|done|ok/i.test(statut) ? 'DONE' : /cours|working/i.test(statut) ? 'IN_PROGRESS' : 'TODO',
          ...(echeance && /^\d{4}-\d{2}-\d{2}/.test(echeance) ? { dueAt: `${echeance.slice(0, 10)}T09:00:00.000Z` } : {}),
        });
        await creer('taskTargets', { taskId: t.id, [cibleDe(o)]: id });
        corr.taches[s.id] = t.id;
        b.taches++;
        garder();
      } catch (err) {
        b.erreurs++;
        console.warn(`  ! sous-élément ${s.nom} : ${err.message.slice(0, 200)}`);
      }
    }
  }
  garder();
  bilan.push(b);
  console.log(`${o.labelPlural.padEnd(30)} textes ${b.textes}, relations ${b.relations} (${b.champsRelation} champ(s)), fichiers ${b.fichiers}, tâches ${b.taches}${b.erreurs ? `, ${b.erreurs} ERREUR(S)` : ''}`);
}
fs.writeFileSync(path.join(dossier, 'bilan-complements.json'), JSON.stringify(bilan, null, 2));
