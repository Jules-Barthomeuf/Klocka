// Qui voit quoi dans Twenty CRM (1er nov. 2026, Jules : « un module pour moi, pour savoir qui voit quoi dans son
// CRM »). Lit les rôles de Twenty, leurs membres, et pour chaque tableau de la barre de gauche ce que chaque rôle en
// fait (plein accès, lecture, fermé) et les champs qu'il ne voit pas ; l'admin les change d'ici.
//
// Ce que la clé API ne peut pas faire (Twenty 2.51, constaté le 30 oct.) : donner un rôle à une personne. La page le
// dit, avec le lien vers Réglages, Membres de Twenty.
//
// Prudence : un envoi de permissions renvoie à Twenty la liste complète du rôle, la ligne changée comprise, jamais
// une ligne seule (rien ne garantit qu'un envoi partiel garde les autres).

import { objetsTwenty, twentyConfigure } from '../twenty.js';

const URL_ = () => String(process.env.TWENTY_URL || '').replace(/\/+$/, '');

async function gql(query, variables) {
  const r = await fetch(`${URL_()}/metadata`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.TWENTY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const d = await r.json();
  if (d.errors?.length) throw new Error(String(d.errors[0]?.message || 'Twenty a refusé').slice(0, 300));
  return d.data;
}

/** Les rôles que Klocka règle d'ici (crm/roles.json) ; Admin et Member se lisent seulement. */
export const ROLES_REGLABLES = ['Équipe Klocka', 'Mandataire K Partners', 'Accès à attribuer'];
const ROLES_MONTRES = ['Admin', 'Member', ...ROLES_REGLABLES];

const NIVEAUX = {
  plein: { canReadObjectRecords: true, canUpdateObjectRecords: true, canSoftDeleteObjectRecords: true, canDestroyObjectRecords: false },
  lecture: { canReadObjectRecords: true, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false },
  ferme: { canReadObjectRecords: false, canUpdateObjectRecords: false, canSoftDeleteObjectRecords: false, canDestroyObjectRecords: false },
};

/** Pure : le niveau d'un rôle sur un objet, son réglage propre d'abord, sinon le réglage général du rôle. */
export function niveauDe(role, objetId) {
  const p = (role.objectPermissions || []).find((x) => x.objectMetadataId === objetId);
  const lire = p?.canReadObjectRecords ?? role.canReadAllObjectRecords;
  const ecrire = p?.canUpdateObjectRecords ?? role.canUpdateAllObjectRecords;
  return !lire ? 'ferme' : ecrire ? 'plein' : 'lecture';
}

/** Pure : un champ est-il caché à ce rôle ? */
export const champCache = (role, champId) => (role.fieldPermissions || []).some((f) => f.fieldMetadataId === champId && f.canReadFieldValue === false);

const ROLE = 'id label isEditable canReadAllObjectRecords canUpdateAllObjectRecords workspaceMembers { id userEmail name { firstName lastName } } objectPermissions { objectMetadataId canReadObjectRecords canUpdateObjectRecords canSoftDeleteObjectRecords canDestroyObjectRecords } fieldPermissions { objectMetadataId fieldMetadataId canReadFieldValue canUpdateFieldValue }';
const lireRoles = async () => (await gql(`{ getRoles { ${ROLE} } }`)).getRoles;
const lireMenu = async () => (await gql('{ navigationMenuItems { id name type position folderId targetObjectMetadataId userWorkspaceId } }')).navigationMenuItems;

/**
 * Pure : la vue de la page. Les tableaux dans l'ordre de la barre de gauche de Twenty (dossier par dossier) ; un même
 * tableau peut être dans deux dossiers (Propriétés Klocka dans Klocka et dans KPartners : c'est le même tableau).
 */
export function composerAcces({ roles, objets, menu }) {
  const montres = ROLES_MONTRES.map((l) => roles.find((r) => r.label === l)).filter(Boolean);
  const parId = new Map(objets.map((o) => [o.id, o]));
  const dossiers = menu.filter((x) => x.type === 'FOLDER' && !x.userWorkspaceId).sort((a, b) => a.position - b.position);
  const ligneObjet = (o) => ({
    id: o.id, nom: o.labelPlural, nom_technique: o.nameSingular,
    acces: Object.fromEntries(montres.map((r) => [r.id, niveauDe(r, o.id)])),
    champs: (o.fields || []).filter((f) => !f.isSystem && f.type !== 'RELATION' && f.name !== 'name' && !/^monday|^deplacerVers$/.test(f.name))
      .map((f) => ({ id: f.id, nom: f.label, caches: Object.fromEntries(montres.map((r) => [r.id, champCache(r, f.id)])) })),
  });
  const entrees = (dossierId) => menu.filter((x) => x.type === 'OBJECT' && !x.userWorkspaceId && (x.folderId || null) === dossierId)
    .sort((a, b) => a.position - b.position).map((x) => parId.get(x.targetObjectMetadataId)).filter(Boolean).map(ligneObjet);
  return {
    roles: montres.map((r) => ({
      id: r.id, nom: r.label, reglable: ROLES_REGLABLES.includes(r.label) && r.isEditable !== false,
      membres: (r.workspaceMembers || []).map((m) => ({ email: m.userEmail, nom: [m.name?.firstName, m.name?.lastName].filter(Boolean).join(' ') || null })),
    })),
    dossiers: [...dossiers.map((d) => ({ id: d.id, nom: d.name, objets: entrees(d.id) })), { id: null, nom: 'Hors dossier', objets: entrees(null) }].filter((d) => d.objets.length),
    reglages_membres: `${URL_()}/settings/members`,
  };
}

export async function lireAcces() {
  if (!twentyConfigure()) return { ok: false, error: "Twenty CRM n'est pas branché ici (TWENTY_URL, TWENTY_API_KEY)." };
  const [roles, objets, menu] = await Promise.all([lireRoles(), objetsTwenty(), lireMenu()]);
  return { ok: true, ...composerAcces({ roles, objets, menu }) };
}

const roleReglable = async (roleId) => {
  const role = (await lireRoles()).find((r) => r.id === roleId);
  if (!role) throw new Error('Rôle introuvable.');
  if (!ROLES_REGLABLES.includes(role.label)) throw new Error(`« ${role.label} » se règle dans Twenty, pas d'ici.`);
  return role;
};
const sansTypename = ({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords }) =>
  ({ objectMetadataId, canReadObjectRecords, canUpdateObjectRecords, canSoftDeleteObjectRecords, canDestroyObjectRecords });

/** Le niveau d'un rôle sur un tableau : plein, lecture ou fermé. */
export async function poserNiveau(roleId, objetId, niveau) {
  if (!NIVEAUX[niveau]) return { ok: false, error: 'Niveau inconnu.' };
  const role = await roleReglable(roleId);
  const liste = (role.objectPermissions || []).filter((p) => p.objectMetadataId !== objetId).map(sansTypename);
  liste.push({ objectMetadataId: objetId, ...NIVEAUX[niveau] });
  await gql('mutation($i: UpsertObjectPermissionsInput!) { upsertObjectPermissions(upsertObjectPermissionsInput: $i) { objectMetadataId } }', { i: { roleId, objectPermissions: liste } });
  return { ok: true };
}

/** Cacher (ou rendre) un champ à un rôle : il ne le lit plus, ne l'écrit plus. */
export async function cacherChamp(roleId, objetId, champId, cache) {
  const role = await roleReglable(roleId);
  const liste = (role.fieldPermissions || []).filter((f) => f.fieldMetadataId !== champId)
    .map(({ objectMetadataId, fieldMetadataId, canReadFieldValue, canUpdateFieldValue }) => ({ objectMetadataId, fieldMetadataId, canReadFieldValue, canUpdateFieldValue }));
  liste.push({ objectMetadataId: objetId, fieldMetadataId: champId, canReadFieldValue: cache ? false : null, canUpdateFieldValue: cache ? false : null });
  await gql('mutation($i: UpsertFieldPermissionsInput!) { upsertFieldPermissions(upsertFieldPermissionsInput: $i) { id } }', { i: { roleId, fieldPermissions: liste } });
  return { ok: true };
}

/** Un tableau rangé aussi dans un dossier de la barre de gauche (le même tableau, pas une copie). */
export async function rangerAussiDans(objetId, dossierId) {
  const menu = await lireMenu();
  if (menu.some((x) => x.type === 'OBJECT' && !x.userWorkspaceId && x.targetObjectMetadataId === objetId && x.folderId === dossierId)) return { ok: true, deja: true };
  const position = Math.max(-1, ...menu.filter((x) => x.folderId === dossierId).map((x) => x.position)) + 1;
  await gql('mutation($i: CreateNavigationMenuItemInput!) { createNavigationMenuItem(input: $i) { id } }', { i: { type: 'OBJECT', targetObjectMetadataId: objetId, folderId: dossierId, position } });
  return { ok: true };
}
