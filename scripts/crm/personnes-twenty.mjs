// Les champs Personnes de Twenty CRM en membres, avec leur photo (28 oct. 2026, Jules ; server/crm/membres.js).
// Pour chaque champ Personnes d'un tableau migré (SPOC, Personnes, Personne, Collaborateurs) :
//   1. une table de jonction « <objet><Champ>Membre » (relations « fiche » et « membre ») ;
//   2. sur la fiche, le champ « SPOC » qui la lit comme des membres (junctionTargetFieldId), l'ancien texte devient
//      « <Champ> (texte) » (créé s'il manque : tableau sans colonne Personnes dans Monday) ;
//   3. dans chaque vue, le nouveau champ est visible à la place du texte, qui est caché ;
//   4. les noms déjà là deviennent des membres, pour ceux qui ont un compte Twenty CRM.
// Rejouable : relancer après l'arrivée de nouveaux membres relie leurs fiches.
//   node scripts/crm/personnes-twenty.mjs [nomDObjet]
import 'dotenv/config';
import { twentyConfigure, objetsTwenty, creerObjet, creerChamp, modifierChamp, requeteTwenty, lister } from '../../server/twenty.js';
import { champsPersonnes, accorder, oublierMembres } from '../../server/crm/membres.js';
import fs from 'node:fs';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const seul = process.argv[2] || null;
const LIBELLE = 'SPOC';
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const U = String(process.env.TWENTY_URL).replace(/\/+$/, '');
async function gql(query, variables) {
  await new Promise((r) => setTimeout(r, 700));
  const r = await fetch(`${U}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 400));
  return d.data;
}
async function tout(chemin, cle) {
  const out = [];
  let apres = null;
  for (let i = 0; i < 50; i++) {
    const r = await requeteTwenty('GET', `${chemin}?limit=200${apres ? `&starting_after=${apres}` : ''}`);
    out.push(...(Array.isArray(r?.data) ? r.data : r?.data?.[cle] || []));
    if (!r?.pageInfo?.hasNextPage) break;
    apres = r.pageInfo.endCursor;
  }
  return out;
}
const relation = (objectMetadataId, name, label, cibleId, inverse, icon) => gql('mutation($i: CreateOneFieldMetadataInput!) { createOneField(input: $i) { id name } }', {
  i: { field: { type: 'RELATION', name, label, objectMetadataId, icon, relationCreationPayload: { type: 'MANY_TO_ONE', targetObjectMetadataId: cibleId, targetFieldLabel: inverse, targetFieldIcon: icon } } },
});

let meta = await objetsTwenty();
const parNom = (n) => meta.find((x) => x.nameSingular === n);
const membre = parNom('workspaceMember');
const navigationAvant = new Set((await gql('{ navigationMenuItems { id } }')).navigationMenuItems.map((x) => x.id));

for (const o of objets.filter((x) => !seul || x.nameSingular === seul)) {
  for (const p of champsPersonnes(o)) {
    const m = parNom(o.nameSingular);
    // 1. La table de jonction.
    if (!parNom(p.jonction.nameSingular)) {
      await creerObjet({ nameSingular: p.jonction.nameSingular, namePlural: p.jonction.namePlural, labelSingular: `Lien ${p.label} · ${o.labelPlural}`.slice(0, 60), labelPlural: `Liens ${p.label} · ${o.labelPlural}`.slice(0, 60), icon: 'IconUsers', description: `Les membres du champ ${p.label} de ${o.labelPlural} (scripts/crm/personnes-twenty.mjs)` });
      meta = await objetsTwenty();
      console.log(`+ ${o.labelPlural} · table de jonction ${p.jonction.nameSingular}`);
    }
    let j = parNom(p.jonction.nameSingular);
    // 2. Ses deux relations ; l'inverse de « fiche » est le champ « <Champ> membres » de la fiche.
    if (!j.fields.some((f) => f.name === 'fiche')) await relation(j.id, 'fiche', o.labelSingular || 'Fiche', m.id, `${p.label} membres`, 'IconUsers');
    if (!j.fields.some((f) => f.name === 'membre')) await relation(j.id, 'membre', 'Membre', membre.id, `${p.label} · ${o.labelPlural}`.slice(0, 60), 'IconUser');
    meta = await objetsTwenty();
    j = parNom(p.jonction.nameSingular);
    const fiche = parNom(o.nameSingular);
    const inverse = fiche.fields.find((f) => f.name === p.inverse);
    const cible = j.fields.find((f) => f.name === 'membre');
    let texte = fiche.fields.find((f) => f.name === p.champ);
    if (!inverse || !cible) throw new Error(`${o.nameSingular} : champ ${p.inverse} ou membre introuvable`);
    // Un tableau sans colonne Personnes dans Monday (2 nov.) : le texte que Klocka relit naît ici.
    if (!texte) {
      await creerChamp({ objectMetadataId: fiche.id, type: 'TEXT', name: p.champ, label: `${p.label} (texte)`, icon: 'IconUsers' });
      meta = await objetsTwenty();
      texte = parNom(o.nameSingular).fields.find((f) => f.name === p.champ);
      console.log(`+ ${o.labelPlural} · champ ${p.champ}`);
    }
    if (texte.label === p.label) await modifierChamp(texte.id, { label: `${p.label} (texte)` });
    // La colonne s'appelle SPOC dans tous les tableaux (2 nov., Jules : « une colonne SPOC avec les têtes »).
    if (inverse.settings?.junctionTargetFieldId !== cible.id || inverse.label !== LIBELLE) {
      await modifierChamp(inverse.id, { label: LIBELLE, icon: 'IconUsers', settings: { ...(inverse.settings || {}), junctionTargetFieldId: cible.id } });
    }
    // 3. Les vues : le champ membres visible partout, à la place du texte (sinon juste après le nom), le texte caché.
    const vues = (await tout('/metadata/views', 'views')).filter((v) => v.objectMetadataId === fiche.id);
    const colonnes = await tout('/metadata/viewFields', 'viewFields');
    for (const v of vues) {
      const deVue = colonnes.filter((c) => c.viewId === v.id);
      const ancien = deVue.find((c) => c.fieldMetadataId === texte?.id);
      const nouveau = deVue.find((c) => c.fieldMetadataId === inverse.id);
      const position = ancien ? ancien.position : 0.5;
      if (!nouveau) await requeteTwenty('POST', '/metadata/viewFields', { viewId: v.id, fieldMetadataId: inverse.id, position, isVisible: true, size: 150 });
      else if (!nouveau.isVisible) await requeteTwenty('PATCH', `/metadata/viewFields/${nouveau.id}`, { isVisible: true, position });
      if (ancien?.isVisible) await requeteTwenty('PATCH', `/metadata/viewFields/${ancien.id}`, { isVisible: false });
    }
    // 4. Les noms déjà là deviennent des membres (ceux qui ont un compte).
    oublierMembres();
    let n = 0;
    for (const r of await lister(o.namePlural, { champs: `id,${p.champ}` })) {
      if (!String(r[p.champ] || '').trim()) continue;
      n += (await accorder(o, p, r.id, r[p.champ])).length ? 1 : 0;
    }
    console.log(`${o.labelPlural.padEnd(30)} ${p.label.padEnd(16)} ${n} fiche(s) reliée(s) à des membres`);
  }
}

// La barre de gauche reste celle de l'équipe : une table de jonction n'y a pas sa place (Jules, 28 oct.).
const ajoutes = (await gql('{ navigationMenuItems { id } }')).navigationMenuItems.map((x) => x.id).filter((id) => !navigationAvant.has(id));
if (ajoutes.length) {
  await gql('mutation($ids: [UUID!]!) { deleteManyNavigationMenuItems(ids: $ids) { id } }', { ids: ajoutes });
  console.log(`${ajoutes.length} entrée(s) retirée(s) de la barre de gauche`);
}
