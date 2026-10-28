// Monday et Twenty tenus à jour l'un par l'autre (CRM=double, 28 oct. 2026, Jules).
//
// Klocka écrit dans Monday et recopie dans Twenty (server/monday.js). Ce module ajoute ce que l'équipe fait à la main :
//   Monday → Twenty : un webhook Monday par tableau migré (fiche créée, colonne, nom, groupe, commentaire, archivage,
//     suppression, restauration). La fiche est relue dans Monday et Twenty ne reçoit que ce qui diffère.
//   Twenty → Monday : le webhook Twenty (déjà là pour « Déplacer vers ») sur création, modification, suppression. Seuls
//     les gestes d'une personne (workspaceMemberId) repartent vers Monday : ce que Klocka écrit avec sa clé est déjà
//     dans Monday. Une suppression dans Twenty archive l'élément Monday (récupérable), sans le supprimer.
// Pas de boucle : un aller Twenty → Monday revient par le webhook Monday, trouve Twenty à jour et s'arrête là ; une
// écriture de Klocka dans Twenty n'a pas de workspaceMemberId et ne repart pas.
// Tout passe par la file de server/monday.js : copies et synchronisations s'appliquent dans l'ordre.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as M0 from '../monday.js';
import * as T0 from '../twenty.js';
import { enregistrementDe, valeurOption, optionsDe } from './correspondance.js';
import { texteDe } from './monday-sur-twenty.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let schema = null;
const objets = () => (schema ||= JSON.parse(fs.readFileSync(path.join(RACINE, 'crm/schema.json'), 'utf8')).objets);
let M = M0;
let T = T0;
let DELAI = 5000;

/** Pour les tests : autres objets, autre Monday, autre Twenty, sans délai. */
export function brancherPourTests({ objets: o = null, monday = null, twenty = null, delai = 0 } = {}) {
  if (!process.env.NODE_TEST_CONTEXT) return;
  schema = o;
  M = monday || M0;
  T = twenty || T0;
  DELAI = delai;
  metaCache = null;
  attentes.clear();
}

const objetDuTableau = (boardId) => objets().find((o) => o.mondayTableau === String(boardId)) || null;
const objetDuNom = (singulier) => objets().find((o) => o.nameSingular === singulier) || null;

let metaCache = null;
async function meta(o) {
  if (!metaCache || Date.now() - metaCache.le > 600000) metaCache = { le: Date.now(), objets: await T.objetsTwenty() };
  return metaCache.objets.find((x) => x.nameSingular === o.nameSingular) || null;
}
// Les champs du schéma avec le type réel du champ Twenty (comme l'import).
async function champsReels(o) {
  const m = await meta(o);
  const parNom = new Map((m?.fields || []).map((f) => [f.name, f]));
  return { m, parNom, champs: o.champs.filter((c) => parNom.has(c.name)).map((c) => ({ ...c, type: parNom.get(c.name).type, options: parNom.get(c.name).options })) };
}

const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
// Pure : un champ composite comparé sur ce qu'il porte (Twenty ajoute des sous-champs vides).
function memeValeur(type, a, b) {
  const t = (v) => texteDe(type, v);
  // Un numéro relu dans Monday garde l'indicatif collé (33 6…), Twenty le range à part (+33 / 6…) : les 9 derniers
  // chiffres suffisent à dire que c'est le même.
  if (type === 'PHONES') return t(a).replace(/\D/g, '').slice(-9) === t(b).replace(/\D/g, '').slice(-9);
  if (['EMAILS', 'LINKS', 'ADDRESS'].includes(type)) return t(a) === t(b);
  if (type === 'MULTI_SELECT') return egal([...(a || [])].sort(), [...(b || [])].sort());
  if (type === 'DATE') return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
  return egal(a === '' ? null : a, b === '' ? null : b);
}

/** Pure : ce qui change dans la fiche Twenty pour qu'elle dise ce que dit Monday. */
export function difference(voulu, actuel, types) {
  const out = {};
  for (const [k, v] of Object.entries(voulu)) {
    if (k === 'mondayCreeLe') continue;
    if (!memeValeur(types.get(k), v, actuel?.[k])) out[k] = v;
  }
  return out;
}

// --- Monday → Twenty ---

const attentes = new Map();
/** Un événement de webhook Monday. Rend ce qui est prévu (pour la réponse au webhook et les tests). */
export function depuisMonday(evenement) {
  if (!M.crmDouble()) return { ignore: 'CRM n’est pas en double' };
  const e = evenement || {};
  const o = objetDuTableau(e.boardId);
  const id = String(e.pulseId || e.itemId || '');
  if (!o || !id) return { ignore: 'tableau non migré' };
  if (e.type === 'create_update') {
    M.enFileCrm('commentaire Monday → Twenty', () => noteDepuisMonday(o, id, e.updateId));
    return { prevu: 'commentaire' };
  }
  // Plusieurs événements d'un coup (une ligne collée, plusieurs colonnes) : une seule relecture, après la dernière, et
  // jamais avant la copie d'une écriture de Klocka sur la même fiche.
  clearTimeout(attentes.get(id));
  const depuis = Date.now() - (M.ecrituresRecentes.get(id) || 0);
  const delai = Math.max(DELAI, depuis < 10000 ? 10000 - depuis : 0);
  attentes.set(id, setTimeout(() => {
    attentes.delete(id);
    M.enFileCrm('Monday → Twenty', () => ficheDepuisMonday(o, id));
  }, delai));
  return { prevu: 'fiche', dans: delai };
}

export async function ficheDepuisMonday(o, id) {
  const el = await M.elementBrut(id);
  const twenty = await T.trouver(o.namePlural, { mondayId: id });
  if (!el || el.state === 'deleted' || el.state === 'archived') {
    if (twenty?.id && !twenty.deletedAt) await T.supprimer(o.namePlural, twenty.id);
    return { supprime: !!twenty?.id };
  }
  const { parNom, champs } = await champsReels(o);
  const voulu = enregistrementDe(el, champs);
  if (parNom.has('groupe') && el.group?.title) voulu.groupe = valeurOption(el.group.title);
  const types = new Map([...parNom].map(([k, f]) => [k, f.type]));
  await ajouterOptions(o, parNom, voulu, el);
  if (!twenty?.id) {
    const r = await T.creer(o.namePlural, voulu);
    return { cree: r.id };
  }
  const diff = difference(voulu, twenty, types);
  delete diff.mondayId;
  if (Object.keys(diff).length) await T.modifier(o.namePlural, twenty.id, diff);
  return { modifie: Object.keys(diff) };
}

// Un statut ou un groupe nouveau dans Monday devient une option du champ Twenty avant d'être écrit.
async function ajouterOptions(o, parNom, voulu, el) {
  const textes = new Map((el.column_values || []).map((c) => [c.id, String(c.text || '')]));
  for (const [nom, v] of Object.entries(voulu)) {
    const f = parNom.get(nom);
    if (!f || !['SELECT', 'MULTI_SELECT'].includes(f.type) || v == null) continue;
    const manquantes = (Array.isArray(v) ? v : [v]).filter((x) => !(f.options || []).some((op) => op.value === x));
    if (!manquantes.length) continue;
    const c = o.champs.find((x) => x.name === nom);
    const libelles = nom === 'groupe' ? [el.group?.title] : String(textes.get(c?.mondayColonne) || '').split(/\s*,\s*/);
    const nouvelles = optionsDe(manquantes.map((x) => libelles.find((l) => l && valeurOption(l) === x) || x));
    f.options = [...(f.options || []), ...nouvelles.map((op, i) => ({ ...op, position: (f.options || []).length + i }))];
    await T.modifierChamp(f.id, { options: f.options });
  }
}

async function noteDepuisMonday(o, id, updateId) {
  if (!updateId || M.commentairesKlocka.has(String(updateId))) return null;
  const u = await M.commentaire(updateId);
  const twenty = await T.trouver(o.namePlural, { mondayId: id });
  if (!u || !twenty?.id) return null;
  const texte = `${u.creator?.name ? `${u.creator.name} : ` : ''}${u.text_body || ''}`;
  const cible = `target${o.nameSingular[0].toUpperCase()}${o.nameSingular.slice(1)}Id`;
  return T.noter(cible, twenty.id, texte.split('\n')[0].slice(0, 120) || 'Commentaire Monday', texte);
}

// --- Twenty → Monday ---

/** Pure : une valeur Twenty au format d'une colonne Monday ; undefined : la colonne n'est pas écrite. */
export function versMonday(mondayType, f, v) {
  const t = texteDe(f.type, v, f.options || []);
  switch (mondayType) {
    case 'text': return t;
    case 'long_text': return { text: t };
    case 'numbers': return t.replace(/\s/g, '');
    case 'status': return t ? { label: t } : {};
    case 'dropdown': return t ? { labels: t.split(/\s*,\s*/).filter(Boolean) } : {};
    case 'date': return t ? { date: t.slice(0, 10) } : {};
    case 'email': { const e = t.split(',')[0].trim(); return e ? { email: e, text: e } : {}; }
    case 'phone': return t ? { phone: t.replace(/\s/g, ''), countryShortName: v?.primaryPhoneCountryCode || 'FR' } : {};
    case 'link': return t ? { url: t, text: t } : {};
    case 'checkbox': return t ? { checked: 'true' } : {};
    default: return undefined; // personnes, liens entre tableaux, miroirs, formules : non réécrits
  }
}

const GESTES = /\.(created|updated|deleted|destroyed)$/;
/** Un événement du webhook Twenty. Rend ce qui est prévu. */
export function depuisTwenty(ev) {
  if (!M.crmDouble()) return { ignore: 'CRM n’est pas en double' };
  const nom = String(ev?.eventName || '');
  const o = objetDuNom(nom.split('.')[0]);
  if (!o || !GESTES.test(nom)) return { ignore: 'objet non synchronisé' };
  if (!ev.workspaceMemberId) return { ignore: 'écrit par Klocka' };
  const champs = (ev.updatedFields || []).filter((c) => c !== 'deplacerVers');
  if (nom.endsWith('.updated') && ev.updatedFields?.length && !champs.length) return { ignore: '« Déplacer vers » seul' };
  M.enFileCrm('Twenty → Monday', () => ficheVersMonday(o, nom.split('.')[1], ev.record || {}, champs));
  return { prevu: nom };
}

export async function ficheVersMonday(o, geste, r, champsModifies = []) {
  const mondayId = r.mondayId ? String(r.mondayId) : null;
  if (geste === 'deleted' || geste === 'destroyed') {
    if (mondayId) await M.archiverElement(mondayId);
    return { archive: mondayId };
  }
  const { parNom } = await champsReels(o);
  const tous = geste === 'created' || !mondayId;
  const colonnes = {};
  for (const c of o.champs) {
    const f = parNom.get(c.name);
    if (!c.mondayColonne || !f || (!tous && !champsModifies.includes(c.name))) continue;
    const x = versMonday(c.mondayType, f, r[c.name]);
    if (x !== undefined) colonnes[c.mondayColonne] = x;
  }
  let id = mondayId;
  if (!id) {
    const cree = await M.creerElement(o.mondayTableau, r.name || 'Sans nom', colonnes, { labels: true, sansCopie: true });
    id = String(cree.id);
    await T.modifier(o.namePlural, r.id, { mondayId: id });
  } else {
    if (champsModifies.includes('name') && r.name) colonnes.name = r.name;
    if (Object.keys(colonnes).length) await M.majElement(o.mondayTableau, id, colonnes, { labels: true, sansCopie: true });
  }
  if ((tous || champsModifies.includes('groupe')) && r.groupe) {
    const options = parNom.get('groupe')?.options || [];
    const titre = options.find((x) => x.value === r.groupe)?.label;
    const g = titre && (await M.groupesDuTableau(o.mondayTableau)).find((x) => valeurOption(x.title) === valeurOption(titre));
    if (g) await M.deplacerDansGroupe(id, g.id);
  }
  return { mondayId: id, colonnes: Object.keys(colonnes) };
}

// --- Les webhooks Monday des tableaux migrés ---

export const EVENEMENTS = ['create_item', 'change_column_value', 'change_name', 'create_update', 'item_archived', 'item_deleted', 'item_moved_to_any_group', 'item_restored'];

/** Pose (une fois) les webhooks Monday de chaque tableau migré vers `url`. Rejouable. */
export async function brancherWebhooksMonday(url) {
  const bilan = [];
  for (const o of objets()) {
    if (!o.mondayTableau) continue;
    const deja = await M.webhooksDuTableau(o.mondayTableau);
    const vers = (w) => { try { return JSON.parse(w.config || '{}').url; } catch { return null; } };
    let poses = 0;
    for (const evenement of EVENEMENTS) {
      if (deja.some((w) => w.event === evenement && String(vers(w) || '').split('?')[0] === url.split('?')[0])) continue;
      await M.creerWebhook(o.mondayTableau, url, evenement);
      poses++;
    }
    bilan.push({ tableau: o.labelPlural, poses });
  }
  return bilan;
}
