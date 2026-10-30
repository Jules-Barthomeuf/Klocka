// Les rôles de Twenty CRM (30 oct. 2026, Jules) : crm/roles.json dit qui est admin, qui est de l'équipe Klocka.
//   1. trois rôles : « Équipe Klocka », « Mandataire K Partners », « Accès à attribuer » (rien, le rôle des nouveaux) ;
//      les deux premiers voient tout sauf les tableaux de l'autre côté (crm/schema.json, espace), tables des
//      personnes comprises ; Propriétés Klocka (partagé) en lecture pour les mandataires, comme les modèles de mail ;
//      les mails envoyés de Klocka leur sont fermés. Jamais de suppression définitive (corbeille seulement).
//   2. les admins (crm/roles.json) prennent le rôle Admin de Twenty : réglages, rôles et membres ;
//   3. les membres listés prennent leur rôle ; les autres ne bougent pas (une exception faite dans Twenty reste).
// Rejouable : les trois rôles sont remis à leur définition, les autres rôles ne sont pas touchés.
//   node scripts/crm/roles-twenty.mjs          (montre ce qui serait fait)
//   node scripts/crm/roles-twenty.mjs --go     (le fait)
import 'dotenv/config';
import fs from 'node:fs';
import { twentyConfigure, objetsTwenty } from '../../server/twenty.js';

if (!twentyConfigure()) {
  console.error('TWENTY_URL / TWENTY_API_KEY manquants');
  process.exit(1);
}
const go = process.argv.includes('--go');
const U = String(process.env.TWENTY_URL).replace(/\/+$/, '');
async function gql(query, variables) {
  const r = await fetch(`${U}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(JSON.stringify(d.errors[0]).slice(0, 400));
  return d.data;
}
const dire = (x) => console.log(`${go ? '' : '(à faire) '}${x}`);

const config = JSON.parse(fs.readFileSync('crm/roles.json', 'utf8'));
const { objets } = JSON.parse(fs.readFileSync('crm/schema.json', 'utf8'));
const meta = await objetsTwenty();

// Le côté de chaque objet : un tableau migré, ou une table des personnes (« <tableau>…Membre », préfixe le plus long).
const cote = new Map(objets.map((o) => [o.nameSingular, o.nameSingular === 'proprietesKlocka' ? 'partage' : o.espace === 'KPARTNERS' ? 'kpartners' : 'klocka']));
const tableaux = [...cote.keys()].sort((a, b) => b.length - a.length);
function coteDe(nom) {
  if (cote.has(nom)) return cote.get(nom);
  const t = /Membre$/.test(nom) && tableaux.find((x) => nom.startsWith(x));
  return t ? cote.get(t) : null;
}

const FERME = { canReadObjectRecords: false, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
const LECTURE = { canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false };
const PLEIN = { canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: true, canDestroyObjectRecords: false };
const TOUT = { canReadAllObjectRecords: true, canUpdateAllObjectRecords: true, canSoftDeleteAllObjectRecords: true, canDestroyAllObjectRecords: false };
const RIEN = { canReadAllObjectRecords: false, canUpdateAllObjectRecords: false, canSoftDeleteAllObjectRecords: false, canDestroyAllObjectRecords: false };

const ROLES = {
  klocka: {
    label: 'Équipe Klocka', icon: 'IconBuilding', description: 'Les tableaux de Klocka, rien de K Partners (crm/roles.json)', ...TOUT, canAccessAllTools: true,
    objet: (nom) => ({ kpartners: FERME, partage: PLEIN }[coteDe(nom)] || null),
  },
  kpartners: {
    label: 'Mandataire K Partners', icon: 'IconUsers', description: 'Les tableaux de K Partners, Propriétés Klocka en lecture, rien de Klocka (crm/roles.json)', ...TOUT, canAccessAllTools: true,
    objet: (nom) => ({ klocka: FERME, partage: LECTURE }[coteDe(nom)] || { modeleMail: LECTURE, envoiMail: FERME }[nom] || null),
  },
  attente: {
    label: 'Accès à attribuer', icon: 'IconLock', description: 'Le rôle des nouveaux invités : rien tant qu’un admin ne leur a pas donné un rôle (crm/roles.json)', ...RIEN, canAccessAllTools: false,
    objet: () => null,
  },
};

const ROLE = 'id label workspaceMembers { id userEmail }';
let { getRoles: roles } = await gql(`{ getRoles { ${ROLE} } }`);
const ids = {};
for (const [cle, r] of Object.entries(ROLES)) {
  const { objet, ...champs } = r;
  const permissions = meta.map((o) => ({ o, p: objet(o.nameSingular) })).filter((x) => x.p);
  let role = roles.find((x) => x.label === r.label);
  dire(`${role ? 'mis à jour' : 'créé'} : ${r.label} (${permissions.length} objet(s) réglés à part)`);
  if (!go) continue;
  role = role
    ? (await gql(`mutation($i: UpdateRoleInput!) { updateOneRole(updateRoleInput: $i) { id } }`, { i: { id: role.id, update: { ...champs, canUpdateAllSettings: false, canBeAssignedToUsers: true } } })).updateOneRole
    : (await gql(`mutation($i: CreateRoleInput!) { createOneRole(createRoleInput: $i) { id } }`, { i: { ...champs, canUpdateAllSettings: false, canBeAssignedToUsers: true } })).createOneRole;
  ids[cle] = role.id;
  if (permissions.length) {
    await gql(`mutation($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { objectMetadataId } }`, {
      i: { roleId: role.id, objectPermissions: permissions.map(({ o, p }) => ({ objectMetadataId: o.id, ...p })) },
    });
  }
}
if (go) ({ getRoles: roles } = await gql(`{ getRoles { ${ROLE} } }`));

// Le rôle des nouveaux invités.
dire('rôle par défaut des nouveaux invités : Accès à attribuer');
// Twenty le refuse à une clé API (« token bound to a user workspace ») : un admin le choisit alors dans Réglages, Rôles.
if (go) {
  const { currentWorkspace } = await gql('{ currentWorkspace { defaultRole { id } } }');
  if (currentWorkspace.defaultRole?.id !== ids.attente) {
    await gql(`mutation($d: UpdateWorkspaceInput!) { updateWorkspace(data: $d) { id } }`, { d: { defaultRoleId: ids.attente } })
      .catch(() => console.warn('  refusé à la clé API : choisir « Accès à attribuer » comme rôle par défaut dans Réglages, Rôles'));
  }
}

// Les admins et les membres listés.
const admin = roles.find((x) => x.label === 'Admin');
const membres = roles.flatMap((r) => r.workspaceMembers.map((m) => ({ ...m, role: r.label })));
const voulu = (email) => (config.admins.includes(email) ? admin.label : ROLES[config.membres[email]]?.label || null);
for (const m of membres) {
  const label = voulu(String(m.userEmail).toLowerCase());
  if (!label || label === m.role) continue;
  dire(`${m.userEmail} : ${m.role} → ${label}`);
  // Refusé aussi à une clé API : un admin le fait dans Réglages, Membres (ou Rôles, Attribuer).
  if (go) await gql(`mutation($m: UUID!, $r: UUID!) { updateWorkspaceMemberRole(workspaceMemberId: $m, roleId: $r) { id } }`, { m: m.id, r: roles.find((x) => x.label === label).id })
    .catch(() => console.warn(`  refusé à la clé API : donner « ${label} » à ${m.userEmail} dans Réglages, Membres`));
}
const absents = [...config.admins, ...Object.keys(config.membres)].filter((e) => !membres.some((m) => String(m.userEmail).toLowerCase() === e));
if (absents.length) console.log(`Pas encore dans Twenty (à relancer après leur arrivée) : ${absents.join(', ')}`);
