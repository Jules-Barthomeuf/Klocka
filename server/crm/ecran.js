// Twenty CRM dans Klocka (5 nov. 2026, Jules : « recrée Twenty et mets-le dans notre plateforme », puis « finis tout
// pour que ce soit le plus proche de ce qu'on a sur Twenty »). Twenty reste la base : Klocka lit et écrit ses fiches
// par l'API, sans page dehors. Ce qu'une personne voit suit son rôle dans Twenty (Réglages, Membres ; Administration,
// Accès CRM) : les tableaux fermés n'apparaissent pas, un tableau en lecture ne se modifie pas, un champ caché à son
// rôle ne quitte pas le serveur. Sans rôle dans Twenty, rien.
//
// Comme dans Twenty : la barre de gauche et ses dossiers, les vues de chaque tableau en onglets (colonnes, tri et
// filtres de la vue), les filtres, la recherche, la fiche et ses liens (une Propriété et son Agent), ses notes, ses
// tâches, ses pièces jointes, les actions en lot (Supprimer, Dupliquer, Déplacer vers) et l'envoi d'un mail.

import fs from 'node:fs';
import { creer, lire, lister, modifier, noter, objetsTwenty, requeteTwenty, supprimer, twentyConfigure } from '../twenty.js';
import { champCache, gql, lireMenu, lireRoles, niveauDe } from './acces.js';

// Les champs qui ne servent qu'à la machine (synchro Monday, relais de déplacement, anciens liens Monday).
const MACHINE = /^(monday|deplacerVers$|linkTo|position$|searchVector$|createdBy$|updatedBy$|deletedAt$)/;
// Ce que l'écran sait montrer, et ce qu'il sait modifier.
const MONTRES = new Set(['TEXT', 'NUMBER', 'DATE', 'DATE_TIME', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'EMAILS', 'PHONES', 'LINKS', 'CURRENCY', 'FULL_NAME', 'RICH_TEXT', 'RICH_TEXT_V2', 'RATING', 'ADDRESS']);
// Les adresses aussi (8 nov. 2026, Jules : « on doit pouvoir tout modifier, partout »).
const MODIFIABLES = new Set(['TEXT', 'NUMBER', 'DATE', 'DATE_TIME', 'SELECT', 'MULTI_SELECT', 'BOOLEAN', 'EMAILS', 'PHONES', 'LINKS', 'CURRENCY', 'FULL_NAME', 'RELATION', 'ADDRESS']);
// Les relations vers les objets de Twenty lui-même (notes, tâches, fichiers, historique) : la fiche les montre à part.
const CIBLES_SYSTEME = new Set(['attachment', 'noteTarget', 'taskTarget', 'timelineActivity', 'agentChatThreadTarget', 'favorite', 'messageParticipant', 'calendarEventParticipant']);
// 50 par page, « Voir plus » pour la suite (6 nov. 2026, Jules) ; Twenty accepte 200 au plus.
const PAR_PAGE = 50;
// Les libellés standard de Twenty, restés en anglais.
const EN_FRANCAIS = { Name: 'Nom', 'Creation date': 'Créée le', 'Last update': 'Modifiée le', Title: 'Titre', Status: 'Statut', 'Due Date': 'Échéance', Assignee: 'Assignée à', Body: 'Texte', Tasks: 'Tâches', Task: 'Tâche', Notes: 'Notes', Note: 'Note', 'By Status': 'Par statut', 'Assigned to Me': 'Mes tâches', 'By Stage': 'Par étape' };
// Les choix standard de Twenty (tâches), restés en anglais.
const OPTIONS_FR = { 'To do': 'À faire', 'In progress': 'En cours', Done: 'Faite' };
const erreur = (status, message) => Object.assign(new Error(message), { status });

/** Pure : un champ que l'écran montre. */
export const champMontre = (f) => f.isActive !== false && (!f.isSystem || ['createdAt', 'updatedAt'].includes(f.name))
  && (MONTRES.has(f.type) || (f.type === 'RELATION' && f.settings?.relationType === 'MANY_TO_ONE')) && !MACHINE.test(f.name) && f.name !== 'id';

/** Pure : le nom lisible d'une fiche, quel que soit son objet. */
export const nomDe = (r) => (!r ? '' : typeof r.name === 'string' ? r.name : r.name ? [r.name.firstName, r.name.lastName].filter(Boolean).join(' ') : r.title || r.nom || '');

/** Pure : la valeur à envoyer à Twenty pour un champ, depuis ce que l'écran a saisi. */
export function valeurPourTwenty(type, saisie, actuelle = null) {
  const t = saisie == null || Array.isArray(saisie) ? '' : String(saisie).trim();
  switch (type) {
    case 'NUMBER': { if (!t) return null; const n = Number(t.replace(/\s/g, '').replace(',', '.')); if (!Number.isFinite(n)) throw erreur(400, 'Un nombre est attendu.'); return n; }
    case 'BOOLEAN': return saisie === true || t === 'true';
    case 'DATE': return t ? t.slice(0, 10) : null;
    case 'DATE_TIME': return t ? new Date(t).toISOString() : null;
    case 'SELECT': case 'RELATION': return t || null;
    case 'MULTI_SELECT': return Array.isArray(saisie) ? saisie : t ? t.split(/[,;]/).map((x) => x.trim()).filter(Boolean) : [];
    case 'EMAILS': return { primaryEmail: t, additionalEmails: actuelle?.additionalEmails || [] };
    case 'PHONES': {
      const chiffres = t.replace(/[^\d+]/g, '');
      const fr = chiffres.startsWith('+33') ? chiffres.slice(3) : chiffres.startsWith('0') ? chiffres.slice(1) : chiffres;
      return { primaryPhoneNumber: fr, primaryPhoneCountryCode: 'FR', primaryPhoneCallingCode: '+33', additionalPhones: actuelle?.additionalPhones || [] };
    }
    case 'LINKS': return { primaryLinkUrl: t, primaryLinkLabel: actuelle?.primaryLinkLabel || '', secondaryLinks: actuelle?.secondaryLinks || [] };
    case 'CURRENCY': {
      if (!t) return { amountMicros: null, currencyCode: actuelle?.currencyCode || 'EUR' };
      const n = Number(t.replace(/\s/g, '').replace(',', '.'));
      if (!Number.isFinite(n)) throw erreur(400, 'Un montant est attendu.');
      return { amountMicros: Math.round(n * 1e6), currencyCode: actuelle?.currencyCode || 'EUR' };
    }
    case 'FULL_NAME': { const [prenom, ...nom] = t.split(/\s+/); return { firstName: prenom || '', lastName: nom.join(' ') }; }
    // Une adresse tapée « 12 rue Carnot, Lyon » : la rue, puis la ville après la dernière virgule ; le pays gardé.
    case 'ADDRESS': {
      if (!t) return { addressStreet1: '', addressStreet2: '', addressCity: '', addressPostcode: '', addressState: '', addressCountry: actuelle?.addressCountry || '', addressLat: null, addressLng: null };
      const i = t.lastIndexOf(',');
      const rue = i > 0 ? t.slice(0, i).trim() : '';
      const ville = (i > 0 ? t.slice(i + 1) : t).trim();
      const cp = (ville.match(/\b\d{5}\b/) || [])[0] || '';
      return { addressStreet1: rue, addressStreet2: '', addressCity: ville.replace(/\b\d{5}\b/, '').trim(), addressPostcode: cp, addressState: actuelle?.addressState || '', addressCountry: actuelle?.addressCountry || 'France', addressLat: null, addressLng: null };
    }
    default: return t;
  }
}

// --- Les filtres ---

const q = (v) => JSON.stringify(String(v));
/** Pure : le chemin d'un champ dans un filtre de Twenty (les champs composés filtrent sur leur partie principale). */
const chemin = (c) => ({ EMAILS: `${c.nom}.primaryEmail`, PHONES: `${c.nom}.primaryPhoneNumber`, LINKS: `${c.nom}.primaryLinkUrl`, CURRENCY: `${c.nom}.amountMicros`, ADDRESS: `${c.nom}.addressCity`, RELATION: c.cle }[c.type] || c.nom);

/** Pure : un filtre de l'écran ({ champ, op, valeur }) en filtre de Twenty ; null s'il ne s'applique pas. */
export function filtreTwenty(c, { op, valeur }, { membreId = null } = {}) {
  if (!c) return null;
  const p = chemin(c);
  const texte = ['TEXT', 'EMAILS', 'PHONES', 'LINKS', 'ADDRESS', 'RICH_TEXT'].includes(c.type);
  const nombre = (v) => (c.type === 'CURRENCY' ? Math.round(Number(v) * 1e6) : Number(v));
  switch (op) {
    case 'contient': {
      if (!String(valeur || '').trim()) return null;
      const m = q(`%${String(valeur).trim()}%`);
      return c.type === 'FULL_NAME' ? `or(${c.nom}.firstName[ilike]:${m},${c.nom}.lastName[ilike]:${m})` : `${p}[ilike]:${m}`;
    }
    case 'ne_contient_pas': return String(valeur || '').trim() ? `not(${p}[ilike]:${q(`%${String(valeur).trim()}%`)})` : null;
    case 'parmi': case 'hors': {
      const v = (Array.isArray(valeur) ? valeur : [valeur]).filter(Boolean);
      if (!v.length) return null;
      const f = c.type === 'MULTI_SELECT' ? `${p}[containsAny]:[${v.map(q).join(',')}]` : `${p}[in]:[${v.map(q).join(',')}]`;
      return op === 'hors' ? `not(${f})` : f;
    }
    case 'est': return c.type === 'BOOLEAN' ? `${p}[eq]:${valeur === true || valeur === 'true'}` : valeur ? `${p}[eq]:${q(valeur)}` : null;
    case 'vide': return texte ? `or(${p}[is]:NULL,${p}[eq]:"")` : `${p}[is]:NULL`;
    case 'non_vide': return texte ? `and(${p}[is]:NOT_NULL,${p}[neq]:"")` : `${p}[is]:NOT_NULL`;
    case 'avant': return valeur ? `${p}[lt]:${q(valeur)}` : null;
    case 'apres': return valeur ? `${p}[gt]:${q(valeur)}` : null;
    case 'sup': return valeur !== '' && valeur != null && Number.isFinite(nombre(valeur)) ? `${p}[gte]:${nombre(valeur)}` : null;
    case 'inf': return valeur !== '' && valeur != null && Number.isFinite(nombre(valeur)) ? `${p}[lte]:${nombre(valeur)}` : null;
    case 'moi': return membreId ? `${p}[eq]:${q(membreId)}` : null;
    default: return null;
  }
}

/** Pure : un filtre d'une vue de Twenty (viewFilter) en filtre de l'écran ; null s'il n'a pas d'équivalent. */
export function depuisFiltreDeVue(c, f) {
  if (!c) return null;
  let v = f.value;
  try { v = JSON.parse(f.value); } catch { /* une valeur simple */ }
  switch (f.operand) {
    case 'IS': case 'IS_NOT':
      if (c.type === 'RELATION' && v?.isCurrentWorkspaceMemberSelected) return { champ: c.nom, op: 'moi' };
      if (Array.isArray(v)) return { champ: c.nom, op: f.operand === 'IS' ? 'parmi' : 'hors', valeur: v };
      if (c.type === 'BOOLEAN') return { champ: c.nom, op: 'est', valeur: v === true || v === 'true' };
      return null;
    case 'CONTAINS': case 'CONTAINS_ANY': return Array.isArray(v) ? { champ: c.nom, op: 'parmi', valeur: v } : { champ: c.nom, op: 'contient', valeur: String(v ?? '') };
    case 'DOES_NOT_CONTAIN': return Array.isArray(v) ? { champ: c.nom, op: 'hors', valeur: v } : { champ: c.nom, op: 'ne_contient_pas', valeur: String(v ?? '') };
    case 'IS_EMPTY': return { champ: c.nom, op: 'vide' };
    case 'IS_NOT_EMPTY': return { champ: c.nom, op: 'non_vide' };
    case 'IS_BEFORE': return { champ: c.nom, op: 'avant', valeur: String(v ?? '').slice(0, 10) };
    case 'IS_AFTER': return { champ: c.nom, op: 'apres', valeur: String(v ?? '').slice(0, 10) };
    case 'GREATER_THAN': case 'GREATER_THAN_OR_EQUAL': return { champ: c.nom, op: 'sup', valeur: v };
    case 'LESS_THAN': case 'LESS_THAN_OR_EQUAL': return { champ: c.nom, op: 'inf', valeur: v };
    default: return null;
  }
}

// --- La structure vue par un rôle ---

/** Pure : la structure vue par un rôle. Les dossiers et l'ordre de la barre de Twenty ; les vues de chaque tableau. */
export function structurePour(role, { objets, menu, vues, champsDeVue, trisDeVue, filtresDeVue = [], relations = {}, personnes = {} }) {
  const parId = new Map(objets.map((o) => [o.id, o]));
  const parSingulier = new Map(objets.map((o) => [o.nameSingular, o]));
  const ouvert = (singulier) => { const o = parSingulier.get(singulier); return !!o && niveauDe(role, o.id) !== 'ferme'; };
  const objetVu = (o) => {
    const niveau = niveauDe(role, o.id);
    if (niveau === 'ferme') return null;
    const sesVues = vues.filter((v) => v.objectMetadataId === o.id && ['TABLE', 'KANBAN'].includes(v.type) && v.visibility !== 'UNLISTED' && v.isActive !== false)
      .sort((a, b) => (a.key === 'INDEX' ? -1 : b.key === 'INDEX' ? 1 : (a.type === 'KANBAN') - (b.type === 'KANBAN') || a.position - b.position))
      .filter((v, i, t) => t.findIndex((x) => x.name === v.name) === i);
    const principale = sesVues[0];
    const ordre = new Map(champsDeVue.filter((x) => x.viewId === principale?.id).map((x) => [x.fieldMetadataId, x]));
    const tete = (o.fields || []).some((f) => f.name === 'name') ? 'name' : 'title';
    const champs = (o.fields || []).filter((f) => champMontre(f) && !champCache(role, f.id)).map((f) => {
      const rel = f.type === 'RELATION' ? relations[f.id] : null;
      if (f.type === 'RELATION' && (!rel || (rel.cible !== 'workspaceMember' && !ouvert(rel.cible)))) return null;
      return {
        id: f.id, nom: f.name, libelle: EN_FRANCAIS[f.label] || String(f.label).replace(/\s*\(texte\)$/i, ""), type: f.type,
        options: (f.options || []).slice().sort((a, b) => a.position - b.position).map((x) => ({ valeur: x.value, libelle: OPTIONS_FR[x.label] || x.label, couleur: x.color })),
        ...(rel ? { cle: f.settings?.joinColumnName || `${f.name}Id`, cible: rel.cible } : {}),
        // Un champ Personnes (SPOC…) : un texte « A, B » que les membres suivent ; il se choisit parmi l'équipe.
        ...((personnes[o.nameSingular] || []).includes(f.name) ? { personnes: true } : {}),
        modifiable: niveau === 'plein' && MODIFIABLES.has(f.type) && !['createdAt', 'updatedAt'].includes(f.name) && !(f.isUIReadOnly),
        colonne: f.name === tete || !!ordre.get(f.id)?.isVisible,
        position: f.name === tete ? -1 : ordre.get(f.id)?.position ?? 999,
      };
    }).filter(Boolean).sort((a, b) => a.position - b.position);
    const parIdChamp = new Map(champs.map((c) => [c.id, c]));
    const principal = champs.find((c) => c.nom === 'name') ? 'name' : champs.find((c) => c.nom === 'title') ? 'title' : champs[0]?.nom || 'name';
    const vueDe = (v) => {
      const cv = champsDeVue.filter((x) => x.viewId === v.id);
      const tri = trisDeVue.find((t) => t.viewId === v.id);
      const champTri = tri && parIdChamp.get(tri.fieldMetadataId);
      return {
        id: v.id, nom: v.key === 'INDEX' ? 'Tout' : EN_FRANCAIS[v.name] || v.name,
        // Un tableau en colonnes (Kanban) se range par un choix : ses colonnes sont les options de ce choix.
        ...(v.type === 'KANBAN' && parIdChamp.get(v.mainGroupByFieldMetadataId)?.type === 'SELECT' ? { kanban: parIdChamp.get(v.mainGroupByFieldMetadataId).nom } : {}),
        colonnes: cv.length ? [principal, ...cv.filter((x) => x.isVisible).sort((a, b) => a.position - b.position).map((x) => parIdChamp.get(x.fieldMetadataId)?.nom).filter((n) => n && n !== principal)] : champs.filter((c) => c.colonne).map((c) => c.nom),
        tri: champTri ? { champ: champTri.nom, sens: tri.direction === 'DESC' ? 'desc' : 'asc' } : null,
        filtres: filtresDeVue.filter((x) => x.viewId === v.id).map((x) => depuisFiltreDeVue(parIdChamp.get(x.fieldMetadataId), x)).filter(Boolean),
      };
    };
    // Les listes liées (les Propriétés d'un Agent…), hors notes, tâches et fichiers, hors tables de jonction.
    const liees = (o.fields || []).filter((f) => f.type === 'RELATION' && f.settings?.relationType === 'ONE_TO_MANY' && !f.settings?.junctionTargetFieldId && !f.isSystem && f.isActive !== false && !champCache(role, f.id))
      .map((f) => ({ f, rel: relations[f.id] })).filter(({ rel }) => rel && !CIBLES_SYSTEME.has(rel.cible) && ouvert(rel.cible))
      .map(({ f, rel }) => ({ nom: f.name, libelle: f.label, cible: rel.cible, cle: `${rel.champCible}Id` }));
    const deplacerVers = (o.fields || []).find((f) => f.name === 'deplacerVers' && f.type === 'SELECT');
    return {
      singulier: o.nameSingular, pluriel: o.namePlural, nom: EN_FRANCAIS[o.labelPlural] || o.labelPlural, nom_un: EN_FRANCAIS[o.labelSingular] || o.labelSingular, niveau, principal,
      champs: champs.map(({ position, id, ...c }) => ({ id, ...c })),
      vues: sesVues.map(vueDe),
      tri: sesVues[0] ? vueDe(sesVues[0]).tri : null,
      liees,
      deplacer: niveau === 'plein' && deplacerVers ? (deplacerVers.options || []).slice().sort((a, b) => a.position - b.position).map((x) => ({ valeur: x.value, libelle: x.label })) : [],
    };
  };
  const dossiers = menu.filter((x) => x.type === 'FOLDER' && !x.userWorkspaceId).sort((a, b) => a.position - b.position);
  const entrees = (dossierId) => menu.filter((x) => x.type === 'OBJECT' && !x.userWorkspaceId && (x.folderId || null) === dossierId)
    .sort((a, b) => a.position - b.position).map((x) => parId.get(x.targetObjectMetadataId)).filter(Boolean).map(objetVu).filter(Boolean);
  return [...dossiers.map((d) => ({ nom: d.name, objets: entrees(d.id) })), { nom: null, objets: entrees(null) }].filter((d) => d.objets.length);
}

/** Pure : le rôle Twenty d'une personne, par son adresse ; null sans rôle. */
export const roleDe = (roles, email) => {
  const e = String(email || '').toLowerCase();
  return e ? roles.find((r) => (r.workspaceMembers || []).some((m) => String(m.userEmail || '').toLowerCase() === e)) || null : null;
};

// Le schéma, les rôles, la barre et les vues changent rarement : lus ensemble. Leur lecture complète prend près d'une
// minute (des dizaines de requêtes au pas de Twenty) : on sert la copie gardée et, passé deux minutes, on la relit
// derrière, sans faire attendre l'écran ; un changement fait depuis l'écran l'oublie aussitôt (oublierSchema).
let cache = null;
let relecture = null;
async function schema() {
  if (cache && Date.now() - cache.le < 120_000) return cache;
  if (cache) {
    relecture ||= lireSchema().catch((e) => console.warn('[crm] relecture du schéma :', e.message)).finally(() => { relecture = null; });
    return cache;
  }
  relecture ||= lireSchema().finally(() => { relecture = null; });
  return relecture;
}

async function lireSchema() {
  const toutes = async (cle) => {
    const lignes = [];
    let apres = null;
    for (;;) {
      const r = await requeteTwenty('GET', `/metadata/${cle}?limit=200${apres ? `&starting_after=${apres}` : ''}`);
      const lot = Array.isArray(r?.data) ? r.data : r?.data?.[cle] || [];
      lignes.push(...lot);
      if (!r?.pageInfo?.hasNextPage || !lot.length) break;
      apres = r.pageInfo.endCursor;
    }
    return lignes;
  };
  const relationsGql = async () => {
    const d = await gql('{ objects(paging: { first: 1000 }) { edges { node { fields(paging: { first: 1000 }) { edges { node { id relation { targetObjectMetadata { nameSingular } targetFieldMetadata { name } } } } } } } } }');
    const out = {};
    for (const o of d.objects.edges) for (const { node: f } of o.node.fields.edges) if (f.relation) out[f.id] = { cible: f.relation.targetObjectMetadata?.nameSingular, champCible: f.relation.targetFieldMetadata?.name };
    return out;
  };
  const [objets, roles, menu, vues, champsDeVue, trisDeVue, filtresDeVue, relations] = await Promise.all([objetsTwenty(), lireRoles(), lireMenu(), toutes('views'), toutes('viewFields'), toutes('viewSorts'), toutes('viewFilters'), relationsGql()]);
  const Mb = await import('./membres.js');
  const fs = await import('fs');
  const personnes = {};
  try {
    for (const o of JSON.parse(fs.readFileSync(new URL('../../crm/schema.json', import.meta.url), 'utf8')).objets) personnes[o.nameSingular] = Mb.champsPersonnes(o).map((p) => p.champ);
  } catch { /* sans schéma, les champs Personnes restent du texte */ }
  cache = { le: Date.now(), objets, roles, menu, vues, champsDeVue, trisDeVue, filtresDeVue, relations, personnes };
  return cache;
}
/** Après un changement fait d'ici (vue, colonnes) : la prochaine lecture repart de Twenty. */
export const oublierSchema = () => { if (cache) cache.le = 0; relecture = null; cache = null; };

// L'espace K Partners (5 nov. 2026, Jules : « les mandataires ont accès à Propriétés Klocka ; l'espace Klocka leur est
// fermé ») : un mandataire de Klocka, ou Jules quand il regarde l'espace mandataire, a les droits du rôle Twenty
// « Mandataire K Partners », sans compte Twenty à lui ; seul l'espace KPartners s'ouvre.
export const ROLE_MANDATAIRE = 'Mandataire K Partners';
export const ESPACE_MANDATAIRE = 'KPartners';
const RESERVE = { [ESPACE_MANDATAIRE]: 'Cet espace est réservé aux mandataires K Partners.' };
const RESERVE_KLOCKA = 'Cet espace est réservé aux administrateurs Klocka.';

/** Pure : la barre vue par quelqu'un. Les espaces et pages de Twenty dans son ordre ; ce qui lui est fermé reste
 * écrit, avec son cadenas et la raison. En espace mandataire, tout ce qui n'est pas KPartners est fermé. */
export function barrePour(ouverts, tous, { mandataire = false, admin = false } = {}) {
  const ouvertsParNom = new Map(ouverts.map((d) => [d.nom, d]));
  const espaces = tous.map((d) => {
    // Un administrateur dans l'espace mandataire garde ses droits : il peut aller voir l'espace Klocka (Jules, 5 nov.).
    const ferme = (mandataire && !admin && d.nom !== ESPACE_MANDATAIRE) || !ouvertsParNom.has(d.nom);
    const vus = ferme ? [] : ouvertsParNom.get(d.nom).objets;
    const raison = RESERVE[d.nom] || RESERVE_KLOCKA;
    return {
      nom: d.nom, ferme, raison,
      objets: d.objets.map((o) => vus.find((x) => x.singulier === o.singulier) || { singulier: o.singulier, nom: o.nom, ferme: true, raison }),
    };
  });
  // L'espace qui est le sien d'abord : KPartners pour un mandataire.
  return mandataire ? [...espaces.filter((d) => d.nom === ESPACE_MANDATAIRE), ...espaces.filter((d) => d.nom !== ESPACE_MANDATAIRE)] : espaces;
}

const TOUT_VOIR = { canReadAllObjectRecords: true, canUpdateAllObjectRecords: true, objectPermissions: [], fieldPermissions: [] };

async function contexte(qui) {
  if (!twentyConfigure()) throw erreur(503, "Twenty CRM n'est pas branché ici.");
  const email = typeof qui === 'string' ? qui : qui?.email;
  const mandataire = typeof qui === 'object' && !!qui?.mandataire;
  const admin = typeof qui === 'object' && !!qui?.admin;
  const s = await schema();
  // Un administrateur dans l'espace mandataire : ses propres droits, KPartners en premier. Un mandataire : ceux de K Partners.
  const role = mandataire && !admin ? s.roles.find((r) => r.label === ROLE_MANDATAIRE) : roleDe(s.roles, email) || (mandataire ? s.roles.find((r) => r.label === ROLE_MANDATAIRE) : null);
  if (!role) throw erreur(403, mandataire ? `Le rôle « ${ROLE_MANDATAIRE} » manque dans Twenty.` : "Vous n'avez pas encore d'accès à Twenty CRM : demandez-le à Jules.");
  const membreId = membresDe(s.roles).length ? (s.roles.flatMap((r) => r.workspaceMembers || []).find((m) => String(m.userEmail || '').toLowerCase() === String(email || '').toLowerCase())?.id || null) : null;
  const ouverts = structurePour(role, s);
  const barreVue = barrePour(ouverts, structurePour(TOUT_VOIR, s).map((d) => ({ nom: d.nom, objets: d.objets.map((o) => ({ singulier: o.singulier, nom: o.nom })) })), { mandataire, admin: admin && role.label !== ROLE_MANDATAIRE });
  // Ce qui s'ouvre : les pages ouvertes des espaces ouverts seulement.
  const dossiers = barreVue.filter((d) => !d.ferme).map((d) => ({ nom: d.nom, objets: d.objets.filter((o) => !o.ferme) }));
  return { s, role, membreId, dossiers, barreVue };
}

const objetDe = (dossiers, singulier) => {
  const o = dossiers.flatMap((d) => d.objets).find((x) => x.singulier === singulier);
  if (!o) throw erreur(404, 'Tableau introuvable.');
  return o;
};
const objetsVus = (dossiers) => dossiers.flatMap((d) => d.objets);

/** Pure : une fiche réduite aux champs que la personne voit (une relation garde l'id de sa fiche liée). */
export const sansCaches = (fiche, champs) => (fiche ? { id: fiche.id, ...Object.fromEntries(champs.map((c) => [c.nom, (c.type === 'RELATION' ? fiche[c.cle] : fiche[c.nom]) ?? null])) } : null);

/** Les noms des fiches liées d'une page ({ champ: { id: nom } }), une requête par relation montrée. */
async function nomsLies(o, fiches, dossiers, membresVus = null) {
  const out = {};
  // Les colonnes liées se lisent en même temps (8 nov. 2026, Jules : « le crm lag ») : une requête Twenty chacune.
  await Promise.all(o.champs.filter((x) => x.type === 'RELATION').map(async (c) => {
    const ids = [...new Set(fiches.map((f) => f[c.nom]).filter(Boolean))];
    if (!ids.length) return;
    // Une personne de l'équipe (assignée à…) : son nom vient des membres de Twenty.
    if (c.cible === 'workspaceMember') { out[c.nom] = Object.fromEntries((membresVus || []).filter((m) => ids.includes(m.id)).map((m) => [m.id, m.nom])); return; }
    const cible = objetsVus(dossiers).find((x) => x.singulier === c.cible);
    if (!cible) return;
    const r = await requeteTwenty('GET', `/${cible.pluriel}?limit=${Math.min(200, ids.length)}&depth=0&filter=${encodeURIComponent(`id[in]:[${ids.map(q).join(',')}]`)}`);
    out[c.nom] = Object.fromEntries((r?.data?.[cible.pluriel] || []).map((x) => [x.id, nomDe(x)]));
  }));
  return out;
}

/** Pure : les membres de l'espace Twenty (id, nom), depuis les rôles. */
export const membresDe = (roles) => [...new Map((roles || []).flatMap((r) => r.workspaceMembers || []).map((m) => [m.id, { id: m.id, nom: [m.name?.firstName, m.name?.lastName].filter(Boolean).join(' ') || m.userEmail }])).values()];

export async function barre(email) {
  const { role, barreVue, s } = await contexte(email);
  const membres = avecAlias(membresDe(s.roles), s.roles, equipe());
  // Les comptes de Klocka (6 nov. 2026) : un tableau de plus dans l'espace Klocka, pour l'équipe (un admin les garde dans la vue mandataire).
  const klocka = equipeKlocka(email) && barreVue.find((d) => d.nom === 'Klocka' && !d.ferme);
  if (klocka) klocka.objets = [...klocka.objets, (await import('./utilisateurs.js')).objet({ superAdmin: await superAdmin(email) }), (await import('./mandataires.js')).objet()];
  return { role: role.label, dossiers: barreVue, membres, spoc: choixSpoc(spocLu(), equipe(), s.roles), ordre: await ordreLu(email) };
}

// Les tableaux Utilisateurs et Mandataires (server/crm/utilisateurs.js, mandataires.js) : l'équipe seule. Un admin les
// garde dans la vue mandataire, où l'espace Klocka lui reste ouvert (6 nov. 2026, Jules : « je ne les vois plus »).
const equipeKlocka = (qui) => typeof qui === 'object' && !!qui?.admin;
const compteDe = async (qui) => (await import('../db.js')).Records.findBy('User', 'email', String(qui?.email || '').toLowerCase());
const superAdmin = async (qui) => (await import('../acces-pages.js')).estSuperAdmin(await compteDe(qui));
const TABLEAUX_KLOCKA = { utilisateurs: () => import('./utilisateurs.js'), mandataires: () => import('./mandataires.js') };
const U = async (qui, singulier) => {
  if (!equipeKlocka(qui)) throw erreur(403, "Réservé à l'équipe Klocka.");
  return TABLEAUX_KLOCKA[singulier]();
};

// L'ordre des pages de chaque espace (6 nov. 2026, Jules : « réorganiser les pages en drag & drop, mettre Clients en
// haut ») : le sien, gardé dans Klocka par personne ; Twenty n'est pas touché. Une page absente de la liste garde sa
// place d'origine, après les autres.
const cleOrdre = (qui) => `crm.ordre_pages.${String((typeof qui === 'string' ? qui : qui?.email) || '').toLowerCase()}`;
async function ordreLu(qui) {
  const { Meta } = await import('../db.js');
  try { const o = JSON.parse(Meta.get(cleOrdre(qui)) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}

/** Pure : les pages d'un espace dans l'ordre choisi ; les autres ensuite, dans l'ordre de Twenty. */
export function rangerPages(objets, ordre) {
  const rang = new Map((Array.isArray(ordre) ? ordre : []).map((s, i) => [s, i]));
  return objets.map((o, i) => [o, rang.has(o.singulier) ? rang.get(o.singulier) : rang.size + i]).sort((a, b) => a[1] - b[1]).map(([o]) => o);
}

export async function poserOrdre(qui, espace, pages) {
  if (!espace || !Array.isArray(pages)) throw erreur(400, 'Espace et pages attendus.');
  const { Meta } = await import('../db.js');
  const ordre = await ordreLu(qui);
  ordre[String(espace).slice(0, 80)] = [...new Set(pages.map(String))].slice(0, 100);
  Meta.set(cleOrdre(qui), JSON.stringify(ordre));
  return { ordre };
}

// Les personnes proposées dans un champ SPOC (crm/equipe.json, « _spoc »), dans l'ordre de Jules.
let spocFichier = null;
const spocLu = () => {
  if (!spocFichier) {
    try { spocFichier = JSON.parse(fs.readFileSync(new URL('../../crm/equipe.json', import.meta.url), 'utf8'))._spoc || []; } catch { spocFichier = []; }
  }
  return spocFichier;
};

/** Pure : chaque choix du SPOC avec la valeur écrite (son nom Monday, que la synchro relie) et son membre Twenty. */
export function choixSpoc(liste, equipeNoms, roles) {
  const membres = (roles || []).flatMap((r) => r.workspaceMembers || []);
  return (liste || []).map((p) => {
    const email = String(p.email || '').toLowerCase();
    const valeur = Object.entries(equipeNoms || {}).find(([, e]) => String(e).toLowerCase() === email)?.[0] || p.nom;
    const m = membres.find((x) => String(x.userEmail || '').toLowerCase() === email);
    return { nom: p.nom, valeur, membre: m?.id || null };
  });
}

// Les noms que Monday donnait aux gens (« JulesB », « Maxime Pama ») : le SPOC est écrit avec eux (crm/equipe.json).
let equipeLue = null;
const equipe = () => {
  if (!equipeLue) {
    try { equipeLue = Object.fromEntries(Object.entries(JSON.parse(fs.readFileSync(new URL('../../crm/equipe.json', import.meta.url), 'utf8'))).filter(([k]) => !k.startsWith('_'))); } catch { equipeLue = {}; }
  }
  return equipeLue;
};

/** Pure : chaque membre avec les noms qui le désignent dans un champ Personnes (son nom, ses noms Monday). */
export function avecAlias(membres, roles, equipeNoms) {
  const emails = new Map((roles || []).flatMap((r) => r.workspaceMembers || []).map((m) => [m.id, String(m.userEmail || '').toLowerCase()]));
  return membres.map((m) => {
    const email = emails.get(m.id) || '';
    const alias = Object.entries(equipeNoms || {}).filter(([, e]) => String(e).toLowerCase() === email).map(([n]) => n);
    return { ...m, alias: [...new Set([m.nom, ...alias])] };
  });
}

// La photo d'un membre (le SPOC en têtes, 5 nov. 2026, Jules) : l'adresse signée de Twenty change, on la relit, et
// l'image reste une heure en mémoire (une dizaine de petites photos).
const photos = new Map();
let adresses = { le: 0, parId: new Map() };
export async function photoMembre(id) {
  const deja = photos.get(id);
  if (deja && Date.now() - deja.le < 3600e3) return deja;
  if (Date.now() - adresses.le > 10 * 60e3 || !adresses.parId.has(id)) {
    const r = await requeteTwenty('GET', '/workspaceMembers?limit=100');
    adresses = { le: Date.now(), parId: new Map((r?.data?.workspaceMembers || []).map((m) => [m.id, m.avatarUrl || null])) };
  }
  const url = adresses.parId.get(id);
  if (!url) return null;
  const rep = await fetch(url);
  if (!rep.ok) return null;
  const image = { le: Date.now(), type: rep.headers.get('content-type') || 'image/jpeg', octets: Buffer.from(await rep.arrayBuffer()) };
  photos.set(id, image);
  return image;
}

/** Pure : la recherche sur les champs texte de la vue (nom, mails, téléphones, villes…). */
export function rechercheTwenty(champs, texte) {
  const t = String(texte || '').trim();
  if (!t) return null;
  const cibles = champs.filter((c) => ['TEXT', 'EMAILS', 'PHONES', 'FULL_NAME', 'LINKS'].includes(c.type)).slice(0, 10);
  const parts = cibles.map((c) => filtreTwenty(c, { op: 'contient', valeur: c.type === 'PHONES' ? t.replace(/\D/g, '').replace(/^0/, '') || t : t })).filter(Boolean);
  return parts.length > 1 ? `or(${parts.join(',')})` : parts[0] || null;
}

/** Pure : une tranche de 50 d'un tableau servi par Klocka ; `apres` est le rang où reprendre. */
export function parTranche(r, apres = null) {
  const de = Math.max(0, Number(apres) || 0);
  const fiches = r.fiches.slice(de, de + PAR_PAGE);
  return { ...r, fiches, suite: de + PAR_PAGE < r.fiches.length ? String(de + PAR_PAGE) : null };
}

/** Une page de fiches : recherche, filtres, tri, 50 par page. */
export async function page(email, singulier, { q: texte = '', tri = null, sens = 'asc', apres = null, filtres = [] } = {}) {
  if (TABLEAUX_KLOCKA[singulier]) return parTranche(await (await U(email, singulier)).page({ q: texte, tri, sens, filtres }), apres);
  const { dossiers, membreId, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  const params = new URLSearchParams({ limit: String(PAR_PAGE), depth: '0' });
  const parNom = new Map(o.champs.map((c) => [c.nom, c]));
  const morceaux = [rechercheTwenty(o.champs, texte), ...(Array.isArray(filtres) ? filtres : []).map((f) => filtreTwenty(parNom.get(f?.champ), f || {}, { membreId }))].filter(Boolean);
  if (morceaux.length) params.set('filter', morceaux.length > 1 ? `and(${morceaux.join(',')})` : morceaux[0]);
  const champTri = parNom.get(tri || o.tri?.champ);
  if (champTri) params.set('order_by', `${champTri.type === 'RELATION' ? champTri.cle : champTri.nom}${champTri.type === 'FULL_NAME' ? '.firstName' : champTri.type === 'CURRENCY' ? '.amountMicros' : champTri.type === 'EMAILS' ? '.primaryEmail' : ''}[${(tri ? sens : o.tri?.sens) === 'desc' ? 'DescNullsLast' : 'AscNullsFirst'}]`);
  if (apres) params.set('starting_after', apres);
  const r = await requeteTwenty('GET', `/${o.pluriel}?${params}`);
  const fiches = (r?.data?.[o.pluriel] || []).map((f) => sansCaches(f, o.champs));
  return { fiches, liens: await nomsLies(o, fiches, dossiers, membresDe(s.roles)).catch(() => ({})), suite: r?.pageInfo?.hasNextPage ? r.pageInfo.endCursor : null, total: r?.totalCount ?? null };
}

const cible = (singulier) => `target${singulier[0].toUpperCase()}${singulier.slice(1)}Id`;

/** Une fiche, ses fiches liées, ses notes, ses tâches et ses pièces jointes. */
export async function fiche(email, singulier, id) {
  if (TABLEAUX_KLOCKA[singulier]) return (await U(email, singulier)).fiche(id);
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  const f = await lire(o.pluriel, id);
  if (!f) throw erreur(404, 'Fiche introuvable.');
  const filtreCible = encodeURIComponent(`${cible(singulier)}[eq]:${q(id)}`);
  const sur = async (fn) => { try { return await fn(); } catch { return []; } };
  const [notes, taches, pieces] = await Promise.all([
    sur(async () => ((await requeteTwenty('GET', `/noteTargets?limit=60&depth=1&filter=${filtreCible}`))?.data?.noteTargets || []).map((x) => x.note).filter((n) => n && !n.deletedAt)
      .map((n) => ({ id: n.id, titre: n.title || '', texte: n.bodyV2?.markdown || '', le: n.createdAt })).sort((a, b) => String(b.le).localeCompare(String(a.le)))),
    sur(async () => ((await requeteTwenty('GET', `/taskTargets?limit=60&depth=1&filter=${filtreCible}`))?.data?.taskTargets || []).map((x) => x.task).filter((t) => t && !t.deletedAt)
      .map((t) => ({ id: t.id, titre: t.title || '', statut: t.status || 'TODO', echeance: t.dueAt || null, le: t.createdAt })).sort((a, b) => String(a.statut === 'DONE').localeCompare(String(b.statut === 'DONE')) || String(b.le).localeCompare(String(a.le)))),
    sur(async () => ((await requeteTwenty('GET', `/attachments?limit=60&depth=0&filter=${filtreCible}`))?.data?.attachments || []).filter((a) => !a.deletedAt)
      .map((a) => ({ id: a.id, nom: a.name || a.file?.[0]?.label || 'Fichier', url: a.file?.[0]?.url || a.fullPath || null, le: a.createdAt }))),
  ]);
  const visibles = sansCaches(f, o.champs);
  const liens = await nomsLies(o, [visibles], dossiers, membresDe(s.roles)).catch(() => ({}));
  const liees = await Promise.all(o.liees.map(async (l) => {
    const c = objetsVus(dossiers).find((x) => x.singulier === l.cible);
    const lignes = await sur(async () => (await requeteTwenty('GET', `/${c.pluriel}?limit=30&depth=0&filter=${encodeURIComponent(`${l.cle}[eq]:${q(id)}`)}`))?.data?.[c.pluriel] || []);
    return { ...l, nom_cible: c.nom_un, fiches: lignes.map((x) => ({ id: x.id, nom: nomDe(x) })) };
  }));
  return { fiche: visibles, liens, liees, notes, taches, pieces };
}

/** Changer un champ : seulement sur un tableau en plein accès, et un champ que l'écran sait écrire. */
// Ce que l'écran écrit repart vers Monday quand Klocka écrit aux deux (CRM=double) (5 nov. 2026, Jules : « tout
// connecté, comme Twenty avant »). Le webhook de Twenty ignore la clé de Klocka (pas de boucle) : l'écran pousse donc
// lui-même, dans la file ordonnée du CRM, comme un geste fait dans Twenty.
async function versMonday(singulier, geste, fiche, champs = []) {
  const M = await import('../monday.js');
  if (!M.crmDouble() || !fiche) return;
  const S = await import('./synchro.js');
  const o = S.objetSchema(singulier);
  if (!o) return;
  M.enFileCrm('écran CRM → Monday', () => S.ficheVersMonday(o, geste, fiche, champs));
}
async function noteVersMonday(singulier, noteId, ficheId) {
  const M = await import('../monday.js');
  if (!M.crmDouble()) return;
  const S = await import('./synchro.js');
  M.enFileCrm('note de l’écran CRM → Monday', () => S.noteVersMonday({ noteId, [cible(singulier)]: ficheId }));
}

export async function changer(email, singulier, id, nomChamp, saisie) {
  if (TABLEAUX_KLOCKA[singulier]) return (await U(email, singulier)).changer(await compteDe(email), id, nomChamp, saisie);
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  const c = o.champs.find((x) => x.nom === nomChamp);
  if (!c?.modifiable) throw erreur(403, 'Ce champ ne se modifie pas ici.');
  if (c.type === 'SELECT' && saisie && !c.options.some((x) => x.valeur === saisie)) throw erreur(400, 'Choix inconnu.');
  const actuelle = ['EMAILS', 'PHONES', 'LINKS', 'CURRENCY'].includes(c.type) ? (await lire(o.pluriel, id))?.[c.nom] : null;
  const valeur = valeurPourTwenty(c.type, saisie, actuelle);
  const f = await modifier(o.pluriel, id, { [c.type === 'RELATION' ? c.cle : c.nom]: valeur });
  // Un champ Personnes (texte) : ses membres suivent, comme quand Klocka écrit ailleurs.
  (await import('./membres.js')).apresEcriture(singulier, id, { [c.nom]: valeur }).catch(() => {});
  await versMonday(singulier, 'updated', f, [c.nom]).catch(() => {});
  const visibles = sansCaches(f, o.champs);
  return { fiche: visibles, liens: await nomsLies(o, [visibles], dossiers, membresDe(s.roles)).catch(() => ({})) };
}

/** Chercher une fiche à lier (le choix d'un Agent pour une Propriété…). */
export async function chercherLien(email, singulier, texte) {
  const { dossiers, s } = await contexte(email);
  if (singulier === 'workspaceMember') {
    const t = String(texte || '').toLowerCase().trim();
    return { fiches: membresDe(s.roles).filter((m) => !t || m.nom.toLowerCase().includes(t)).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) };
  }
  const o = objetDe(dossiers, singulier);
  const params = new URLSearchParams({ limit: '20', depth: '0' });
  const f = rechercheTwenty(o.champs.filter((c) => c.nom === o.principal || c.type === 'EMAILS'), texte);
  if (f) params.set('filter', f);
  const r = await requeteTwenty('GET', `/${o.pluriel}?${params}`);
  return { fiches: (r?.data?.[o.pluriel] || []).map((x) => ({ id: x.id, nom: nomDe(x) || 'Sans nom' })) };
}

export async function ajouter(email, singulier, nom, valeurs = {}) {
  const { dossiers } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture.');
  const champNom = o.champs.find((c) => c.nom === o.principal);
  const corps = { [o.principal]: valeurPourTwenty(champNom?.type || 'TEXT', nom || '') };
  // Une fiche créée depuis la liste liée d'une autre (une Propriété depuis son Agent) y reste attachée.
  for (const [k, v] of Object.entries(valeurs || {})) if (/^[a-zA-Z0-9]+Id$/.test(k) && typeof v === 'string') corps[k] = v;
  const f = await creer(o.pluriel, corps);
  await versMonday(singulier, 'created', f).catch(() => {});
  return { fiche: sansCaches(f, o.champs) };
}

/** Les actions en lot de Twenty : Supprimer (corbeille), Dupliquer, Déplacer vers. */
export async function lot(email, singulier, { action, ids = [], vers = null, champ = null, valeur = null } = {}) {
  const { dossiers } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture.');
  const liste = (Array.isArray(ids) ? ids : []).filter((x) => typeof x === 'string').slice(0, 200);
  if (!liste.length) throw erreur(400, 'Aucune fiche choisie.');
  if (action === 'supprimer') {
    for (const id of liste) {
      const avant = await lire(o.pluriel, id).catch(() => null);
      await supprimer(o.pluriel, id);
      await versMonday(singulier, 'deleted', avant).catch(() => {});
    }
    return { faites: liste.length };
  }
  if (action === 'restaurer') {
    for (const id of liste) await requeteTwenty('PATCH', `/restore/${o.pluriel}/${id}`).catch(() => modifier(o.pluriel, id, { deletedAt: null }));
    return { faites: liste.length };
  }
  if (action === 'dupliquer') {
    const copies = [];
    for (const id of liste) {
      const f = await lire(o.pluriel, id);
      if (!f) continue;
      const corps = {};
      for (const c of o.champs.filter((x) => x.modifiable)) {
        const v = c.type === 'RELATION' ? f[c.cle] : f[c.nom];
        if (v != null) corps[c.type === 'RELATION' ? c.cle : c.nom] = v;
      }
      corps[o.principal] = typeof f[o.principal] === 'string' ? `${f[o.principal]} (copie)` : f[o.principal];
      const copie = await creer(o.pluriel, corps);
      await versMonday(singulier, 'created', copie).catch(() => {});
      copies.push(copie.id);
    }
    return { faites: copies.length, ids: copies };
  }
  if (action === 'modifier') {
    // « Modifier » en lot, comme l'action épinglée dans Twenty : un champ, une valeur, toutes les fiches cochées.
    const c = o.champs.find((x) => x.nom === champ);
    if (!c?.modifiable) throw erreur(403, 'Ce champ ne se modifie pas ici.');
    if (c.type === 'SELECT' && valeur && !c.options.some((x) => x.valeur === valeur)) throw erreur(400, 'Choix inconnu.');
    if (['EMAILS', 'PHONES', 'LINKS', 'CURRENCY'].includes(c.type)) throw erreur(400, 'Ce champ se corrige fiche par fiche.');
    const v = valeurPourTwenty(c.type, valeur);
    for (const id of liste) {
      const f = await modifier(o.pluriel, id, { [c.type === 'RELATION' ? c.cle : c.nom]: v });
      await versMonday(singulier, 'updated', f, [c.nom]).catch(() => {});
    }
    if (c.personnes) { const Mb = await import('./membres.js'); for (const id of liste) await Mb.apresEcriture(singulier, id, { [c.nom]: v }).catch(() => {}); }
    return { faites: liste.length };
  }
  if (action === 'deplacer') {
    if (!o.deplacer.some((x) => x.valeur === vers)) throw erreur(400, 'Tableau d’arrivée inconnu.');
    const r = await (await import('./deplacer.js')).deplacer({ objet: singulier, vers, fiches: liste.map((id) => ({ id })) });
    return { faites: r.deplacees.length, erreurs: r.erreurs };
  }
  throw erreur(400, 'Action inconnue.');
}

export async function noterFiche(email, singulier, id, texte, auteur) {
  const { dossiers } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture.');
  const t = String(texte || '').trim();
  if (!t) throw erreur(400, 'La note est vide.');
  const n = await noter(cible(singulier), id, `${auteur ? `${auteur} · ` : ''}${t.split('\n')[0].slice(0, 100)}`, t);
  await noteVersMonday(singulier, n.id, id).catch(() => {});
  return { note: { id: n.id, titre: n.title, texte: t, le: n.createdAt || new Date().toISOString() } };
}

/** Une tâche rattachée à la fiche (titre, échéance, assignée à la personne qui l'écrit). */
export async function ajouterTache(email, singulier, id, { titre, echeance = null } = {}) {
  const { dossiers, membreId } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture.');
  const t = String(titre || '').trim();
  if (!t) throw erreur(400, 'La tâche est vide.');
  const tache = await creer('tasks', { title: t.slice(0, 200), status: 'TODO', ...(echeance ? { dueAt: new Date(echeance).toISOString() } : {}), ...(membreId ? { assigneeId: membreId } : {}) });
  await creer('taskTargets', { taskId: tache.id, [cible(singulier)]: id });
  return { tache: { id: tache.id, titre: t, statut: 'TODO', echeance: tache.dueAt || null, le: tache.createdAt } };
}

export async function cocherTache(email, tacheId, faite) {
  await contexte(email);
  const t = await modifier('tasks', tacheId, { status: faite ? 'DONE' : 'TODO' });
  return { tache: { id: t.id, statut: t.status } };
}

/** Les modèles de mails (objet « Modèles » de Twenty). */
export async function modeles(email) {
  await contexte(email);
  const liste = await lister('modelesMail', { limite: 200 }).catch(() => []);
  return { modeles: liste.map((m) => ({ id: m.id, nom: m.name || m.objet || 'Sans nom', objet: m.objet || '', corps: m.corps || '' })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) };
}

/** Un mail depuis la fiche : il part de la boîte Gmail de la personne, s'inscrit dans « Mails envoyés » et en note. */
export async function envoyerMail(user, singulier, id, { a, objet, corps, modele = null } = {}, qui = user.email) {
  const { dossiers } = await contexte(qui);
  objetDe(dossiers, singulier);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(a || '').trim())) throw erreur(400, 'Adresse du destinataire invalide.');
  if (!String(objet || '').trim() && !String(corps || '').trim()) throw erreur(400, 'Le mail est vide.');
  const { sendEmail } = await import('../email.js');
  const r = await sendEmail({ owner: user.email, to: String(a).trim(), subject: String(objet || ''), body: String(corps || ''), template_titre: modele, intention: 'twenty-crm-klocka' });
  if (!r?.success) throw erreur(400, String(r?.error || 'Envoi refusé : la boîte Gmail est-elle connectée ?').slice(0, 300));
  await creer('envoisMail', { name: String(objet || '').slice(0, 200), a: String(a).trim(), objet: String(objet || ''), corps: String(corps || ''), modele, statut: 'ENVOYE', expediteur: r.expediteur || user.email, ficheObjet: singulier, ficheId: id }).catch((e) => console.warn('[crm] mails envoyés :', e.message));
  await noter(cible(singulier), id, `Mail à ${String(a).trim()} : ${String(objet || '(sans objet)').slice(0, 80)}`, `Mail envoyé à ${String(a).trim()} par ${user.email} : ${objet || '(sans objet)'}\n\n${corps || ''}`).catch(() => {});
  return { envoye: true, expediteur: r.expediteur || user.email };
}

// --- L'historique de la fiche (la Timeline de Twenty) ---

const ACTIONS = { created: 'a créé la fiche', deleted: 'a supprimé la fiche', restored: 'a restauré la fiche' };
const LIES = { noteLinked: 'a ajouté une note', taskLinked: 'a ajouté une tâche', attachmentLinked: 'a déposé un fichier', linked: 'a lié' };

/** Pure : une activité de Twenty en ligne d'historique ; les champs changés gardent leur avant et leur après. */
export function ligneHistorique(a, champs, membres = []) {
  const type = a.timelineActivityTypeSnapshot || {};
  const membre = membres.find((m) => m.id === a.workspaceMemberId)?.nom;
  const auteur = membre || (a.createdBy?.name && !/^(System|TWENTY_API_KEY)$/i.test(a.createdBy.name) && a.createdBy.source !== 'API' ? a.createdBy.name : 'Klocka');
  const diff = a.properties?.diff || {};
  const changes = Object.entries(diff).map(([nom, d]) => {
    const c = champs.find((x) => x.nom === nom || x.cle === nom);
    return c ? { champ: c.nom, libelle: c.libelle, avant: d?.before ?? null, apres: d?.after ?? null } : null;
  }).filter(Boolean);
  const quoi = type.action === 'updated' ? (changes.length ? `a modifié ${changes.map((x) => x.libelle).join(', ')}` : null)
    : LIES[type.name] || ACTIONS[type.action] || (type.action === 'linked' ? LIES.linked : null);
  if (!quoi) return null;
  return { id: a.id, le: a.happensAt || a.createdAt, qui: auteur, quoi, lie: a.linkedRecordCachedName || null, changes };
}

export async function historique(email, singulier, id) {
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  const r = await requeteTwenty('GET', `/timelineActivities?limit=100&depth=0&order_by=happensAt[DescNullsLast]&filter=${encodeURIComponent(`${cible(singulier)}[eq]:${q(id)}`)}`);
  const membres = membresDe(s.roles);
  return { lignes: (r?.data?.timelineActivities || []).map((a) => ligneHistorique(a, o.champs, membres)).filter(Boolean) };
}

// --- Déposer un fichier sur une fiche ---

/** Le fichier part dans le stockage de Twenty (createFileUpload, PUT, completeFileUpload), puis devient une pièce jointe. */
export async function deposer(email, singulier, id, { chemin, nom, taille, type = null }) {
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture.');
  const champFichier = s.objets.find((x) => x.nameSingular === 'attachment')?.fields?.find((f) => f.name === 'file' && f.type === 'FILES');
  if (!champFichier) throw erreur(503, 'Twenty ne dit pas où ranger les fichiers.');
  const fs = await import('fs');
  const contenu = await fs.promises.readFile(chemin);
  const t = (await gql('mutation($f: String!, $s: Float!, $fid: String) { createFileUpload(filename: $f, size: $s, fileFolder: FilesField, fieldMetadataId: $fid) { fileId uploadUrl contentType } }', { f: nom, s: taille || contenu.length, fid: champFichier.id })).createFileUpload;
  const put = await fetch(t.uploadUrl, { method: 'PUT', headers: { 'Content-Type': t.contentType || type || 'application/octet-stream' }, body: contenu });
  if (!put.ok) throw erreur(502, `Twenty a refusé le fichier (${put.status}).`);
  await gql('mutation($id: String!) { completeFileUpload(fileId: $id) { id } }', { id: t.fileId });
  const a = await creer('attachments', { name: nom, file: [{ fileId: t.fileId, label: nom }], [cible(singulier)]: id });
  return { piece: { id: a.id, nom, url: a.file?.[0]?.url || null, le: a.createdAt } };
}

// --- Les vues : enregistrer, régler les colonnes, renommer, supprimer (comme dans Twenty, pour toute l'équipe) ---

/** Pure : un filtre de l'écran en filtre de vue de Twenty ; null s'il n'en a pas. */
export function versFiltreDeVue(c, f) {
  if (!c) return null;
  const v = (operand, value) => ({ fieldMetadataId: c.id, operand, value: typeof value === 'string' ? value : JSON.stringify(value) });
  switch (f.op) {
    case 'parmi': return v('IS', f.valeur || []);
    case 'hors': return v('IS_NOT', f.valeur || []);
    case 'contient': return v('CONTAINS', String(f.valeur || ''));
    case 'ne_contient_pas': return v('DOES_NOT_CONTAIN', String(f.valeur || ''));
    case 'vide': return v('IS_EMPTY', '');
    case 'non_vide': return v('IS_NOT_EMPTY', '');
    case 'avant': return v('IS_BEFORE', String(f.valeur || ''));
    case 'apres': return v('IS_AFTER', String(f.valeur || ''));
    case 'sup': return v('GREATER_THAN_OR_EQUAL', String(f.valeur ?? ''));
    case 'inf': return v('LESS_THAN_OR_EQUAL', String(f.valeur ?? ''));
    case 'est': return v('IS', String(!!f.valeur));
    case 'moi': return v('IS', { isCurrentWorkspaceMemberSelected: true, selectedRecordIds: [] });
    default: return null;
  }
}

const vueModifiable = (o) => { if (o.niveau !== 'plein') throw erreur(403, 'Ce tableau est en lecture : ses vues se règlent dans Twenty.'); };
const meta = (methode, chemin, corps) => requeteTwenty(methode, `/metadata/${chemin}`, corps);
const idCree = (r) => r?.id || r?.data?.id || Object.values(r?.data || {})[0]?.id;

async function poserColonnes(o, vueId, colonnes, existants) {
  const parNom = new Map(o.champs.map((c) => [c.nom, c]));
  const voulues = colonnes.map((n) => parNom.get(n)).filter(Boolean);
  for (const c of o.champs) {
    const pos = voulues.indexOf(c);
    const vf = existants.find((x) => x.fieldMetadataId === c.id);
    if (vf) {
      const isVisible = pos >= 0;
      const position = pos >= 0 ? pos : vf.position;
      if (vf.isVisible !== isVisible || (isVisible && vf.position !== position)) await meta('PATCH', `viewFields/${vf.id}`, { isVisible, position });
    } else if (pos >= 0) {
      await meta('POST', 'viewFields', { viewId: vueId, fieldMetadataId: c.id, isVisible: true, position: pos, size: 180 });
    }
  }
}

async function poserFiltresEtTri(o, vueId, { filtres = [], tri = null }, s) {
  for (const f of s.filtresDeVue.filter((x) => x.viewId === vueId)) await meta('DELETE', `viewFilters/${f.id}`);
  for (const t of s.trisDeVue.filter((x) => x.viewId === vueId)) await meta('DELETE', `viewSorts/${t.id}`);
  const parNom = new Map(o.champs.map((c) => [c.nom, c]));
  for (const f of filtres) { const vf = versFiltreDeVue(parNom.get(f?.champ), f || {}); if (vf) await meta('POST', 'viewFilters', { viewId: vueId, ...vf }); }
  const ct = tri && parNom.get(tri.champ);
  if (ct) await meta('POST', 'viewSorts', { viewId: vueId, fieldMetadataId: ct.id, direction: tri.sens === 'desc' ? 'DESC' : 'ASC' });
}

/** Une nouvelle vue partagée, faite de ce que l'écran montre (colonnes, filtres, tri). */
export async function creerVue(email, singulier, { nom, colonnes = [], filtres = [], tri = null } = {}) {
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  vueModifiable(o);
  const n = String(nom || '').trim().slice(0, 80);
  if (!n) throw erreur(400, 'Donnez un nom à la vue.');
  const objetId = s.objets.find((x) => x.nameSingular === singulier)?.id;
  const position = Math.max(0, ...s.vues.filter((v) => v.objectMetadataId === objetId).map((v) => v.position || 0)) + 1;
  const vueId = idCree(await meta('POST', 'views', { name: n, objectMetadataId: objetId, type: 'TABLE', icon: 'IconList', visibility: 'WORKSPACE', position }));
  if (!vueId) throw erreur(502, 'Twenty n’a pas créé la vue.');
  await poserColonnes(o, vueId, colonnes.length ? colonnes : o.vues[0]?.colonnes || [o.principal], []);
  await poserFiltresEtTri(o, vueId, { filtres, tri }, { filtresDeVue: [], trisDeVue: [] });
  oublierSchema();
  return { id: vueId };
}

/** Mettre une vue à jour : son nom, ses colonnes (montrées et ordre), ses filtres et son tri. */
export async function majVue(email, singulier, vueId, { nom = null, colonnes = null, filtres = null, tri } = {}) {
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  vueModifiable(o);
  const vue = s.vues.find((v) => v.id === vueId);
  if (!vue || vue.objectMetadataId !== s.objets.find((x) => x.nameSingular === singulier)?.id) throw erreur(404, 'Vue introuvable.');
  if (nom != null && vue.key !== 'INDEX') { const n = String(nom).trim().slice(0, 80); if (n && n !== vue.name) await meta('PATCH', `views/${vueId}`, { name: n }); }
  if (Array.isArray(colonnes)) await poserColonnes(o, vueId, colonnes, s.champsDeVue.filter((x) => x.viewId === vueId));
  if (Array.isArray(filtres) || tri !== undefined) await poserFiltresEtTri(o, vueId, { filtres: filtres || [], tri: tri || null }, s);
  oublierSchema();
  return { id: vueId };
}

export async function supprimerVue(email, singulier, vueId) {
  const { dossiers, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  vueModifiable(o);
  const vue = s.vues.find((v) => v.id === vueId);
  if (!vue || vue.key === 'INDEX') throw erreur(400, 'La vue « Tout » reste.');
  await meta('DELETE', `views/${vueId}`);
  oublierSchema();
  return { ok: true };
}

// --- Exporter (comme « Exporter » dans Twenty) ---

/** Pure : le texte d'une case pour un export, selon le type du champ. */
export function texteCase(c, v, liens = {}) {
  if (v == null || v === '') return '';
  switch (c.type) {
    case 'SELECT': return c.options.find((o) => o.valeur === v)?.libelle || v;
    case 'MULTI_SELECT': return (v || []).map((x) => c.options.find((o) => o.valeur === x)?.libelle || x).join(', ');
    case 'DATE': return String(v).slice(0, 10);
    case 'DATE_TIME': return new Date(v).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
    case 'BOOLEAN': return v ? 'Oui' : 'Non';
    case 'EMAILS': return v.primaryEmail || '';
    case 'PHONES': return v.primaryPhoneNumber ? `${v.primaryPhoneCallingCode || ''}${v.primaryPhoneNumber}` : '';
    case 'LINKS': return v.primaryLinkUrl || '';
    case 'CURRENCY': return v.amountMicros == null ? '' : String(v.amountMicros / 1e6);
    case 'FULL_NAME': return [v.firstName, v.lastName].filter(Boolean).join(' ');
    case 'ADDRESS': return [v.addressCity || v.addressStreet1, v.addressCountry].filter(Boolean).join(', ');
    case 'RICH_TEXT': case 'RICH_TEXT_V2': return typeof v === 'string' ? v : v.markdown || '';
    case 'RELATION': return liens[c.nom]?.[v] || v;
    default: return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

const csvCase = (t) => (/[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t);

/** Le CSV (séparateur « ; », lisible par Excel en français) des fiches qui répondent à la recherche et aux filtres. */
export async function exporter(email, singulier, { q: texte = '', tri = null, sens = 'asc', filtres = [], colonnes = [] } = {}) {
  const { dossiers, membreId, s } = await contexte(email);
  const o = objetDe(dossiers, singulier);
  const parNom = new Map(o.champs.map((c) => [c.nom, c]));
  const morceaux = [rechercheTwenty(o.champs, texte), ...(filtres || []).map((f) => filtreTwenty(parNom.get(f?.champ), f || {}, { membreId }))].filter(Boolean);
  const lignes = [];
  let apres = null;
  while (lignes.length < 5000) {
    const params = new URLSearchParams({ limit: '200', depth: '0' });
    if (morceaux.length) params.set('filter', morceaux.length > 1 ? `and(${morceaux.join(',')})` : morceaux[0]);
    const ct = parNom.get(tri || o.tri?.champ);
    if (ct && ct.type !== 'RELATION') params.set('order_by', `${ct.nom}${ct.type === 'FULL_NAME' ? '.firstName' : ''}[${(tri ? sens : o.tri?.sens) === 'desc' ? 'DescNullsLast' : 'AscNullsFirst'}]`);
    if (apres) params.set('starting_after', apres);
    const r = await requeteTwenty('GET', `/${o.pluriel}?${params}`);
    const lot = r?.data?.[o.pluriel] || [];
    lignes.push(...lot.map((f) => sansCaches(f, o.champs)));
    if (!r?.pageInfo?.hasNextPage || !lot.length) break;
    apres = r.pageInfo.endCursor;
  }
  const cols = (colonnes.length ? colonnes : o.vues[0]?.colonnes || []).map((n) => parNom.get(n)).filter(Boolean);
  const liens = await nomsLies({ ...o, champs: cols }, lignes, dossiers, membresDe(s.roles)).catch(() => ({}));
  const csv = [cols.map((c) => csvCase(c.libelle)).join(';'), ...lignes.map((f) => cols.map((c) => csvCase(texteCase(c, f[c.nom], liens))).join(';'))].join('\r\n');
  return { nom: `${o.nom} ${new Date().toISOString().slice(0, 10)}.csv`, csv: `\uFEFF${csv}`, lignes: lignes.length };
}
