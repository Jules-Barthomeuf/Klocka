// Le rôle « Mandataire K Partners » de Twenty CRM (30 oct. 2026, Jules) : un mandataire ne voit que ses fiches.
//
//   1. Sur chaque objet K Partners, un champ texte « E-mail du mandataire » (mandataireEmail). Klocka le remplit à chaque
//      écriture (server/crm/monday-sur-twenty.js, depuis « Ajouté par le mandataire … depuis Klocka ») ; ce script le
//      rattrape sur les prospects déjà là.
//   2. Le rôle : aucun accès par défaut ; lecture, modification et corbeille sur les objets K Partners, mais seulement
//      les fiches dont « E-mail du mandataire » est l'adresse de la personne connectée (règle par ligne de Twenty 2.51) ;
//      Propriétés Klocka en lecture pour tous (partagée) ; les petites tables des membres en lecture (les avatars).
//   3. Rien n'est envoyé aux mandataires : les inviter avec ce rôle reste un geste de Jules (Paramètres › Membres de
//      Twenty, ou sendInvitations avec le roleId affiché).
//
//   node scripts/crm/role-mandataire.mjs            montre ce qui serait fait
//   node scripts/crm/role-mandataire.mjs --ecrire   le fait (rejouable : ce qui existe est gardé)
import 'dotenv/config';

const ECRIRE = process.argv.includes('--ecrire');
const URL_TWENTY = String(process.env.TWENTY_URL || '').replace(/\/+$/, '');
const CLE = process.env.TWENTY_API_KEY;
if (!URL_TWENTY || !CLE) { console.error('TWENTY_URL / TWENTY_API_KEY manquants'); process.exit(1); }
const T = await import('../../server/twenty.js');
const { mandataireDuTexte } = await import('../../server/crm/monday-sur-twenty.js');

const ROLE = 'Mandataire K Partners';
const OBJETS_KP = ['kpProspects', 'kpClients', 'kpTransactionsVentes', 'kpTransactionsLocatives', 'kpPartenaires', 'kpProprietesKpartners'];
const PARTAGES = ['proprietesKlocka'];

async function gql(query, variables = {}) {
  const r = await fetch(`${URL_TWENTY}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${CLE}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const { data, errors } = await r.json();
  if (errors?.length) throw new Error(errors.map((e) => e.message).join(' ; '));
  return data;
}
const dire = (t) => console.log(`${ECRIRE ? '' : '[essai] '}${t}`);

let objets = await T.objetsTwenty();
const objet = (n) => objets.find((o) => o.nameSingular === n);
const membre = objet('workspaceMember');
const emailMembre = (membre?.fields || []).find((f) => f.name === 'userEmail');
if (!emailMembre) throw new Error('workspaceMember.userEmail introuvable');

// 1. Le champ « E-mail du mandataire ».
for (const n of OBJETS_KP) {
  const o = objet(n);
  if (!o) { console.warn(`${n} : objet absent, passé`); continue; }
  if ((o.fields || []).some((f) => f.name === 'mandataireEmail')) { dire(`${n} : champ déjà là`); continue; }
  dire(`${n} : création du champ « E-mail du mandataire »`);
  if (ECRIRE) await T.creerChamp({ objectMetadataId: o.id, name: 'mandataireEmail', label: 'E-mail du mandataire', type: 'TEXT', icon: 'IconUserShield', description: 'Le mandataire K Partners de la fiche : il est seul à la voir dans Twenty CRM (rôle Mandataire K Partners). Posé par Klocka.' });
}
if (ECRIRE) objets = await T.objetsTwenty();

// 2. Le rôle.
const { getRoles } = await gql('{ getRoles { id label } }');
let role = getRoles.find((r) => r.label === ROLE);
if (role) dire(`rôle « ${ROLE} » déjà là (${role.id})`);
else {
  dire(`création du rôle « ${ROLE} »`);
  if (ECRIRE) {
    const d = await gql('mutation ($i: CreateRoleInput!) { createOneRole(createRoleInput: $i) { id label } }', { i: {
      label: ROLE, description: 'Ne voit que ses fiches K Partners (E-mail du mandataire) et les Propriétés Klocka.', icon: 'IconUserShield',
      canUpdateAllSettings: false, canAccessAllTools: false, canAccessAllAgentChatChannels: false,
      canReadAllObjectRecords: false, canUpdateAllObjectRecords: false, canSoftDeleteAllObjectRecords: false, canDestroyAllObjectRecords: false,
      canBeAssignedToUsers: true, canBeAssignedToAgents: false, canBeAssignedToApiKeys: false,
    } });
    role = d.createOneRole;
  }
}

if (role) {
  const kp = OBJETS_KP.map(objet).filter(Boolean);
  const jonctions = objets.filter((o) => /Membre$/.test(o.nameSingular) && [...OBJETS_KP, ...PARTAGES].some((n) => o.nameSingular.startsWith(n)));
  const permissions = [
    ...kp.map((o) => ({ objectMetadataId: o.id, canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: true, canDestroyObjectRecords: false })),
    ...PARTAGES.map(objet).filter(Boolean).map((o) => ({ objectMetadataId: o.id, canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })),
    ...jonctions.map((o) => ({ objectMetadataId: o.id, canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })),
  ];
  dire(`accès du rôle : ${kp.map((o) => o.nameSingular).join(', ')} (ses fiches) ; ${PARTAGES.join(', ')} en lecture ; ${jonctions.length} tables de membres en lecture`);
  if (ECRIRE) await gql('mutation ($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { __typename } }', { i: { roleId: role.id, objectPermissions: permissions } });

  // La règle par ligne : « E-mail du mandataire » est l'adresse de la personne connectée. Si Twenty la refuse (fonction
  // éteinte sur l'instance, 30 oct. 2026), le rôle perd tout accès aux objets K Partners : jamais toutes les fiches.
  try {
  for (const o of kp) {
    const champ = (o.fields || []).find((f) => f.name === 'mandataireEmail');
    if (!champ) { dire(`${o.nameSingular} : règle en attente du champ`); continue; }
    dire(`${o.nameSingular} : seules les fiches dont E-mail du mandataire = l'adresse connectée`);
    if (ECRIRE) {
      await gql('mutation ($i: UpsertRowLevelPermissionPredicatesInput!) { upsertRowLevelPermissionPredicates(input: $i) { __typename } }', { i: {
        roleId: role.id, objectMetadataId: o.id, predicateGroups: [],
        predicates: [{ fieldMetadataId: champ.id, operand: 'IS', value: null, workspaceMemberFieldMetadataId: emailMembre.id }],
      } });
    }
  }
  } catch (e) {
    console.warn(`Règle par ligne refusée par Twenty : ${e.message}. Le rôle ne voit plus les objets K Partners (Propriétés Klocka seulement).`);
    if (ECRIRE) await gql('mutation ($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { __typename } }', { i: { roleId: role.id, objectPermissions: kp.map((o) => ({ objectMetadataId: o.id, canReadObjectRecords: false, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false })) } });
  }
}

// 3. Le rattrapage des prospects déjà dans Twenty.
const prospects = await T.lister(objet('kpProspects').namePlural);
let poses = 0;
for (const p of prospects) {
  const m = mandataireDuTexte([p.criteres, p.criteres?.markdown, p.criteres?.blocknote].filter((x) => typeof x === 'string').join('\n'));
  if (!m || p.mandataireEmail === m) continue;
  poses += 1;
  if (ECRIRE) await T.modifier(objet('kpProspects').namePlural, p.id, { mandataireEmail: m });
}
dire(`${poses} prospect${poses > 1 ? 's' : ''} rattaché${poses > 1 ? 's' : ''} à leur mandataire (sur ${prospects.length})`);
if (role) console.log(`Rôle : ${role.id}. Inviter un mandataire avec ce rôle : Twenty › Paramètres › Membres.`);
process.exit(0);
