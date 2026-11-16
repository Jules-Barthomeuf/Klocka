// Le tableau « Agences » de Twenty CRM (16 nov. 2026, Jules) : voir server/crm/agences-twenty.js.
//   1. l'objet Agences et ses champs (une option de ville par liste de la Prospection) ;
//   2. fermé au rôle Mandataire K Partners (outil de l'équipe Klocka) ;
//   3. rangé dans le dossier Klocka de la barre de gauche ;
//   4. les colonnes de la vue principale, puis une vue par ville (filtre Ville, tri par nom) ;
//   5. les agences des listes, une ligne chacune.
// Rejouable : rien n'est créé deux fois, une ligne mise à la corbeille dans Twenty n'est pas recréée.
//   node --env-file=.env scripts/crm/agences-twenty.mjs        (montre ce qui serait fait)
//   node --env-file=.env scripts/crm/agences-twenty.mjs --go   (le fait)
import { twentyConfigure, objetsTwenty, creerObjet, creerChamp, modifierChamp, requeteTwenty } from '../../server/twenty.js';
import { lireRoles, lireMenu, rangerAussiDans, gql } from '../../server/crm/acces.js';
import { SINGULIER, PLURIEL, CHAMPS, optionVille, synchroniser } from '../../server/crm/agences-twenty.js';
import { valeurOption } from '../../server/crm/correspondance.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const go = process.argv.includes('--go');
const dire = (x) => console.log(`${go ? '' : '(à faire) '}${x}`);
const IA = await import('../../server/prospection/agent-ia.js');
const villes = [...new Set(IA.listes().map((l) => l.ville).filter((v) => v && v !== 'Essai'))];
console.log(`Villes : ${villes.join(', ')}`);

// 1. L'objet et ses champs.
let objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
if (!objet) {
  dire('+ objet Agences');
  if (!go) { console.log('(le reste se fera une fois l’objet créé)'); process.exit(0); }
  await creerObjet({ nameSingular: SINGULIER, namePlural: PLURIEL, labelSingular: 'Agence', labelPlural: 'Agences', icon: 'IconBuildingStore', description: 'Les agences et mandataires des listes de la Prospection Klocka, une vue par ville (server/crm/agences-twenty.js)' });
  objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
}
for (const c of CHAMPS) {
  const deja = (objet.fields || []).find((f) => f.name === c.name);
  const options = c.name === 'ville' ? villes.map((v, i) => optionVille(v, i)) : c.options;
  if (deja) {
    const manquantes = (options || []).filter((o) => !(deja.options || []).some((x) => x.value === o.value));
    if (manquantes.length) {
      dire(`+ ${c.label} : ${manquantes.map((o) => o.label).join(', ')}`);
      if (go) await modifierChamp(deja.id, { options: [...deja.options, ...manquantes.map((o, i) => ({ ...o, position: deja.options.length + i }))] });
    }
    continue;
  }
  dire(`+ champ ${c.label} (${c.type})`);
  if (go) await creerChamp({ objectMetadataId: objet.id, name: c.name, label: c.label, type: c.type, icon: c.icon, description: c.description, ...(options ? { options } : {}) });
}
objet = (await objetsTwenty()).find((o) => o.nameSingular === SINGULIER);
const champ = (nom) => (objet.fields || []).find((f) => f.name === nom);

// 2. Fermé aux mandataires (la liste complète du rôle est renvoyée, la ligne d'Agences comprise).
const mandataire = (await lireRoles()).find((r) => r.label === 'Mandataire K Partners');
const ferme = { canReadObjectRecords: false, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
if (mandataire && (mandataire.objectPermissions || []).find((p) => p.objectMetadataId === objet.id)?.canReadObjectRecords !== false) {
  dire('Agences fermé au rôle Mandataire K Partners');
  if (go) {
    const liste = (mandataire.objectPermissions || []).filter((p) => p.objectMetadataId !== objet.id)
      .map(({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords }) => ({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords }));
    await gql('mutation($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { objectMetadataId } }', { i: { roleId: mandataire.id, objectPermissions: [...liste, { objectMetadataId: objet.id, ...ferme }] } });
  }
}

// 3. Dans le dossier Klocka de la barre de gauche.
const menu = await lireMenu();
const dossier = menu.filter((x) => x.type === 'FOLDER' && !x.userWorkspaceId).find((d) => /klocka/i.test(d.name || '') && !/partners/i.test(d.name || ''));
// Twenty pose un objet neuf hors dossier, en bas de la barre : on l'y range plutôt que d'en ajouter une seconde entrée.
const entree = menu.find((x) => x.type === 'OBJECT' && !x.userWorkspaceId && x.targetObjectMetadataId === objet.id);
if (!dossier) console.warn('! dossier Klocka introuvable dans la barre de Twenty');
else if (!entree) {
  dire(`Agences rangé dans le dossier « ${dossier.name} »`);
  if (go) await rangerAussiDans(objet.id, dossier.id);
} else if (entree.folderId !== dossier.id) {
  dire(`Agences déplacé dans le dossier « ${dossier.name} »`);
  const position = Math.max(-1, ...menu.filter((x) => x.folderId === dossier.id).map((x) => x.position)) + 1;
  if (go) await gql('mutation($i: UpdateOneNavigationMenuItemInput!) { updateNavigationMenuItem(input: $i) { id } }', { i: { id: entree.id, update: { folderId: dossier.id, position } } });
}

// 4. Les vues.
const liste = (r, cle) => (Array.isArray(r?.data) ? r.data : r?.data?.[cle] || []);
async function tout(chemin, cle) {
  const out = [];
  let apres = null;
  for (let i = 0; i < 200; i++) {
    const r = await requeteTwenty('GET', `${chemin}?limit=200${apres ? `&starting_after=${apres}` : ''}`);
    out.push(...liste(r, cle));
    if (!r?.pageInfo?.hasNextPage) break;
    apres = r.pageInfo.endCursor;
  }
  return out;
}
const meta = (m, c, corps) => requeteTwenty(m, `/metadata/${c}`, corps);
const idCree = (r) => r?.id || r?.data?.id || Object.values(r?.data || {})[0]?.id;
const COLONNES = ['name', ...CHAMPS.filter((c) => !c.cache).map((c) => c.name)];
const CACHES = new Set(['klockaId', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy']);
async function colonnes(vueId, existants) {
  for (const f of objet.fields || []) {
    if (f.isSystem && f.name !== 'name' && !CACHES.has(f.name)) continue;
    const pos = COLONNES.indexOf(f.name);
    const vf = existants.find((x) => x.fieldMetadataId === f.id);
    const isVisible = pos >= 0;
    if (vf) {
      if (vf.isVisible !== isVisible || (isVisible && vf.position !== pos)) await meta('PATCH', `viewFields/${vf.id}`, { isVisible, position: isVisible ? pos : vf.position });
    } else if (isVisible) await meta('POST', 'viewFields', { viewId: vueId, fieldMetadataId: f.id, isVisible: true, position: pos, size: f.name === 'interlocuteurs' ? 280 : 180 });
  }
}
const vues = (await tout('/metadata/views', 'views')).filter((v) => v.objectMetadataId === objet.id);
const champsDeVue = await tout('/metadata/viewFields', 'viewFields');
const principale = vues.find((v) => v.key === 'INDEX');
if (principale) {
  dire('colonnes de la vue principale');
  if (go) await colonnes(principale.id, champsDeVue.filter((x) => x.viewId === principale.id));
}
for (const [i, ville] of villes.entries()) {
  if (vues.some((v) => v.name === ville)) continue;
  dire(`+ vue ${ville}`);
  if (!go) continue;
  const vueId = idCree(await meta('POST', 'views', { name: ville, objectMetadataId: objet.id, type: 'TABLE', icon: 'IconMapPin', visibility: 'WORKSPACE', position: i + 1 }));
  await colonnes(vueId, []);
  await meta('POST', 'viewFilters', { viewId: vueId, fieldMetadataId: champ('ville').id, operand: 'IS', value: JSON.stringify([valeurOption(ville)]) });
  await meta('POST', 'viewSorts', { viewId: vueId, fieldMetadataId: champ('name').id, direction: 'ASC' });
}

// 5. Les lignes.
const r = await synchroniser({ go, journal: console.log });
dire(`lignes : ${r.nouvelles} nouvelle(s), ${r.majs} mise(s) à jour, ${r.inchangees} inchangée(s), ${r.corbeille} à la corbeille de Twenty (pas recréées)`);
