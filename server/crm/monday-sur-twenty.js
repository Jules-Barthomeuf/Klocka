// Les fonctions de server/monday.js, rejouées sur Twenty (27 oct. 2026).
//
// Klocka parle à son CRM par une poignée de verbes (lireTableau, lireElement, creerElement, majElement, commenter,
// poserElement, supprimerElement) et désigne colonnes et tableaux par leurs ids Monday. Quand CRM=twenty, server/monday.js
// passe ici : un tableau Monday est l'objet Twenty de crm/schema.json, une colonne le champ qui en vient (mondayColonne),
// et les valeurs au format Monday ({ date }, { label }, { labels }, { phone }, { email }, { text }…) prennent la forme
// de Twenty. Les appelants ne changent pas ; le retour à Monday est une variable (CRM=monday).
//
// Ids : un élément créé dans Twenty a un id Twenty (uuid). Un id Monday gardé sur une fiche locale (monday_id) se
// retrouve par le champ mondayId, dans l'objet que donne crm/ids.json (écrit après l'import).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../twenty.js';
import { valeurOption, telephone, optionsDe } from './correspondance.js';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lireJson = (f, defaut) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(RACINE, f), 'utf8'));
  } catch {
    return defaut;
  }
};

let schema = null;
const objetsSchema = () => (schema ||= lireJson('crm/schema.json', { objets: [] }).objets);
let idsMonday = null;
const objetDeMondayId = (id) => (idsMonday ||= lireJson('crm/ids.json', {}))[String(id)] || null;

/** Pour les tests : un autre schéma, un autre index, une autre API Twenty. */
let api = T;
export function brancherPourTests({ objets, ids = {}, twenty } = {}) {
  if (!process.env.NODE_TEST_CONTEXT) return;
  schema = objets || null;
  idsMonday = ids;
  api = twenty || T;
  metaCache = null;
  objetDeId.clear();
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const estIdTwenty = (id) => UUID.test(String(id || ''));

/** L'objet Twenty d'un tableau Monday (par son id), ou d'un nom d'objet. */
export function objetDuTableau(boardId) {
  const o = objetsSchema().find((x) => x.mondayTableau === String(boardId) || x.nameSingular === String(boardId));
  if (!o) throw new Error(`Tableau ${boardId} absent de crm/schema.json : il n'a pas été migré dans Twenty`);
  return o;
}

// Les champs réels de Twenty (types et options), relus toutes les dix minutes ou après l'ajout d'une option.
let metaCache = null;
async function metaDe(o) {
  if (!metaCache || Date.now() - metaCache.le > 600000) metaCache = { le: Date.now(), objets: await api.objetsTwenty() };
  const m = metaCache.objets.find((x) => x.nameSingular === o.nameSingular);
  if (!m) throw new Error(`Objet ${o.nameSingular} absent de Twenty`);
  return m;
}

// L'objet d'un id Twenty déjà vu (créé, lu) : lireElement(id) ne reçoit pas le tableau.
const objetDeId = new Map();

/** Le champ Twenty d'une colonne Monday (son id), ou d'un nom de champ. */
// L'id de colonne Monday d'abord : dans Agent immobilier, la colonne d'id « date » est la Prochaine relance, alors
// qu'un autre champ s'appelle « date » (la colonne « Date »).
const champDe = (o, colonne) => o.champs.find((c) => c.mondayColonne === colonne) || o.champs.find((c) => c.name === colonne) || null;

/** Pure : la valeur lisible d'un champ Twenty, comme le `text` d'une colonne Monday. */
export function texteDe(type, v, options = []) {
  if (v == null || v === '') return '';
  switch (type) {
    case 'SELECT':
      return options.find((o) => o.value === v)?.label || String(v);
    case 'MULTI_SELECT':
      return (v || []).map((x) => options.find((o) => o.value === x)?.label || x).join(', ');
    case 'EMAILS':
      return [v.primaryEmail, ...(v.additionalEmails || [])].filter(Boolean).join(', ');
    case 'PHONES':
      return v.primaryPhoneNumber ? `${v.primaryPhoneCallingCode || ''}${v.primaryPhoneNumber}` : '';
    case 'LINKS':
      return v.primaryLinkUrl || '';
    case 'ADDRESS':
      return [v.addressStreet1, v.addressCity].filter(Boolean).join(', ').replace(/^(.+), \1$/, '$1');
    case 'BOOLEAN':
      return v ? 'v' : '';
    case 'DATE':
    case 'DATE_TIME':
      return String(v).slice(0, 10);
    default:
      return typeof v === 'object' ? JSON.stringify(v) : String(v);
  }
}

/** Pure : une valeur au format Monday dans la forme du champ Twenty. undefined : rien à écrire. */
export function versTwenty(type, v) {
  const vide = v === '' || v == null;
  const texte = typeof v === 'string' || typeof v === 'number' ? String(v) : v?.text ?? v?.label ?? (Array.isArray(v?.labels) ? v.labels.join(', ') : undefined);
  switch (type) {
    case 'SELECT': {
      const l = v?.label ?? (Array.isArray(v?.labels) ? v.labels[0] : texte);
      return vide || !String(l ?? '').trim() ? null : valeurOption(l);
    }
    case 'MULTI_SELECT': {
      const ls = Array.isArray(v?.labels) ? v.labels : String(texte ?? '').split(/\s*,\s*/);
      const out = ls.map((x) => String(x).trim()).filter(Boolean).map(valeurOption);
      return out.length ? out : null;
    }
    case 'DATE':
      return vide ? null : v?.date || (String(texte || '').match(/^\d{4}-\d{2}-\d{2}/) || [])[0] || null;
    case 'DATE_TIME':
      return vide ? null : v?.date ? `${v.date}T${v.time || '00:00:00'}Z` : texte || null;
    case 'NUMBER': {
      const n = Number(String(texte ?? '').replace(/\s/g, '').replace(',', '.'));
      return vide || !Number.isFinite(n) ? null : n;
    }
    case 'BOOLEAN':
      return !vide && (v?.checked === true || v?.checked === 'true' || v === true);
    case 'EMAILS': {
      const e = v?.email || texte;
      return e ? { primaryEmail: String(e).trim().toLowerCase(), additionalEmails: [] } : { primaryEmail: '', additionalEmails: [] };
    }
    case 'PHONES':
      return telephone(v?.phone || texte || '', null) || { primaryPhoneNumber: '', primaryPhoneCountryCode: '', primaryPhoneCallingCode: '' };
    case 'LINKS': {
      const url = v?.url || (String(texte || '').match(/https?:\/\/\S+/) || [])[0] || '';
      return { primaryLinkUrl: url, primaryLinkLabel: v?.text && v.text !== url ? v.text : '', secondaryLinks: [] };
    }
    case 'ADDRESS':
      return vide ? { addressStreet1: '' } : { addressStreet1: v?.address || texte || '', ...(v?.lat && v?.lng ? { addressLat: Number(v.lat), addressLng: Number(v.lng) } : {}) };
    default:
      if (v?.personsAndTeams) return undefined; // les personnes se traduisent avant (noms), voir personnesEnTexte
      // Un lien vers un autre tableau ({ item_ids }) ou une valeur sans texte : rien à écrire, le texte importé reste.
      if (v && typeof v === 'object' && texte === undefined) return v.url ? String(v.url) : undefined;
      return vide ? null : String(texte ?? '');
  }
}

// Les personnes Monday (SPOC, analystes) : Twenty garde leurs noms. L'annuaire Monday reste lisible pendant la bascule.
async function personnesEnTexte(v) {
  const ids = (v?.personsAndTeams || []).filter((p) => p.kind !== 'team').map((p) => Number(p.id));
  if (!ids.length) return '';
  try {
    const { utilisateursMondayDirect } = await import('../monday.js');
    const liste = await utilisateursMondayDirect();
    return ids.map((id) => liste.find((u) => Number(u.id) === id)?.name).filter(Boolean).join(', ');
  } catch {
    return '';
  }
}

/** Les valeurs Monday d'un élément, prêtes pour Twenty ; ajoute les options de liste qui manquent (comme labels: true). */
async function valeursTwenty(o, colonnes = {}, nom = null) {
  const meta = await metaDe(o);
  const parNom = new Map((meta.fields || []).map((f) => [f.name, f]));
  const out = {};
  if (nom != null) out.name = String(nom).slice(0, 250);
  for (const [colonne, v] of Object.entries(colonnes || {})) {
    if (colonne === 'name') {
      out.name = String(v || '').slice(0, 250);
      continue;
    }
    const c = champDe(o, colonne);
    const f = c && parNom.get(c.name);
    if (!f) continue;
    if (v?.personsAndTeams) {
      out[f.name] = (await personnesEnTexte(v)) || null;
      continue;
    }
    const x = versTwenty(f.type, v);
    if (x === undefined) continue;
    if ((f.type === 'SELECT' || f.type === 'MULTI_SELECT') && x) {
      const voulues = Array.isArray(x) ? x : [x];
      const labels = Array.isArray(v?.labels) ? v.labels : [v?.label ?? v?.labels?.[0] ?? (typeof v === 'string' ? v : '')];
      const manquantes = voulues.filter((val) => !(f.options || []).some((op) => op.value === val));
      if (manquantes.length) {
        const nouvelles = optionsDe(manquantes.map((val) => labels.find((l) => valeurOption(l) === val) || val));
        await api.modifierChamp(f.id, { options: [...(f.options || []), ...nouvelles.map((op, i) => ({ ...op, position: (f.options || []).length + i }))] });
        metaCache = null;
      }
    }
    out[f.name] = x;
  }
  return out;
}

/** Pure : un enregistrement Twenty dans la forme d'une ligne lireTableau de Monday. */
export function ligneDe(o, meta, r) {
  const parNom = new Map((meta.fields || []).map((f) => [f.name, f]));
  const colonnes = {};
  // Les valeurs brutes utiles au-delà du texte : les coordonnées d'une adresse, comme la valeur « location » de Monday.
  const valeurs = {};
  for (const c of o.champs) {
    if (!c.mondayColonne) continue;
    const f = parNom.get(c.name);
    colonnes[c.mondayColonne] = f ? texteDe(f.type, r[c.name], f.options) : '';
    const a = r[c.name];
    if (f?.type === 'ADDRESS' && a?.addressLat != null && a?.addressLng != null) valeurs[c.mondayColonne] = { lat: a.addressLat, lng: a.addressLng, address: a.addressStreet1 || '' };
  }
  return { id: String(r.id), nom: r.name || '', cree_le: r.mondayCreeLe || r.createdAt || null, colonnes, valeurs, monday_id: r.mondayId || null };
}

// --- Les verbes de server/monday.js ---

export const mondayConfigure = () => T.twentyConfigure();

export async function listerTableaux() {
  return objetsSchema().map((o) => ({ id: o.mondayTableau, name: o.labelPlural, columns: o.champs.filter((c) => c.mondayColonne).map((c) => ({ id: c.mondayColonne, title: c.label, type: c.mondayType })), groups: [] }));
}

export async function colonnesDuTableau(boardId) {
  const o = objetDuTableau(boardId);
  return o.champs.filter((c) => c.mondayColonne).map((c) => ({ id: c.mondayColonne, title: c.label, type: c.mondayType, settings_str: JSON.stringify({ labels: (c.options || []).map((op) => op.label) }) }));
}

export async function lireTableau(boardId, limite = 2000) {
  const o = objetDuTableau(boardId);
  const meta = await metaDe(o);
  const lignes = await api.lister(o.namePlural, { limite });
  for (const r of lignes) objetDeId.set(String(r.id), o);
  return lignes.map((r) => ligneDe(o, meta, r));
}

/** L'objet et l'id Twenty d'un élément, qu'on ait un id Twenty ou un ancien id Monday. */
async function retrouver(itemId, boardId = null) {
  const id = String(itemId || '');
  if (!id) return null;
  if (estIdTwenty(id)) {
    const o = boardId ? objetDuTableau(boardId) : objetDeId.get(id);
    if (o) return { o, id };
    for (const x of objetsSchema()) {
      try {
        const r = await api.lire(x.namePlural, id);
        if (r?.id) {
          objetDeId.set(id, x);
          return { o: x, id, r };
        }
      } catch (e) {
        if (e.status && e.status !== 404 && e.status !== 400) throw e;
      }
    }
    return null;
  }
  const nom = boardId ? objetDuTableau(boardId).nameSingular : objetDeMondayId(id);
  const candidats = nom ? [objetDuTableau(nom)] : objetsSchema();
  for (const o of candidats) {
    const r = await api.trouver(o.namePlural, { mondayId: id });
    if (r?.id) {
      objetDeId.set(String(r.id), o);
      return { o, id: String(r.id), r };
    }
  }
  return null;
}

export async function lireElement(itemId) {
  const x = await retrouver(itemId);
  if (!x) return null;
  const r = x.r || (await api.lire(x.o.namePlural, x.id).catch((e) => (e.status === 404 ? null : Promise.reject(e))));
  if (!r || r.deletedAt) return null;
  const meta = await metaDe(x.o);
  const l = ligneDe(x.o, meta, r);
  return { id: l.id, nom: l.nom, tableau: x.o.mondayTableau, colonnes: l.colonnes };
}

export async function lireFiche(itemId, { notes = 5 } = {}) {
  const x = await retrouver(itemId);
  if (!x) return null;
  const r = x.r || (await api.lire(x.o.namePlural, x.id));
  if (!r || r.deletedAt) return null;
  const meta = await metaDe(x.o);
  const parNom = new Map((meta.fields || []).map((f) => [f.name, f]));
  const colonnes = {};
  for (const c of x.o.champs) {
    const f = parNom.get(c.name);
    const t = f ? texteDe(f.type, r[c.name], f.options) : '';
    if (c.mondayColonne && t.trim()) colonnes[c.label] = t;
  }
  return { id: String(r.id), nom: r.name || '', cree_le: r.mondayCreeLe || r.createdAt || null, tableau: x.o.labelPlural, groupe: r.mondayGroupe || null, colonnes, notes: notes ? [] : [], lien: T.lienFiche(x.o.nameSingular, r.id) };
}

export async function creerElement(boardId, nom, colonnes = {}) {
  const o = objetDuTableau(boardId);
  const r = await api.creer(o.namePlural, await valeursTwenty(o, colonnes, nom));
  objetDeId.set(String(r.id), o);
  return { id: String(r.id), name: r.name };
}

export async function majElement(boardId, itemId, colonnes = {}) {
  const x = await retrouver(itemId, boardId);
  if (!x) throw new Error(`Élément ${itemId} introuvable dans Twenty (not found)`);
  const valeurs = await valeursTwenty(x.o, colonnes);
  if (Object.keys(valeurs).length) await api.modifier(x.o.namePlural, x.id, valeurs);
  return { id: x.id };
}

export async function commenter(itemId, texte) {
  const x = await retrouver(itemId);
  if (!x) throw new Error(`Élément ${itemId} introuvable dans Twenty (not found)`);
  const corps = String(texte || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
  const n = await api.noter(`target${x.o.nameSingular[0].toUpperCase()}${x.o.nameSingular.slice(1)}Id`, x.id, corps.split('\n')[0].slice(0, 120) || 'Note', corps);
  return { create_update: { id: n.id } };
}

export async function supprimerElement(itemId) {
  const x = await retrouver(itemId);
  if (!x) return null;
  await api.supprimer(x.o.namePlural, x.id);
  return { delete_item: { id: x.id } };
}

export async function poserElement(boardId, { nom, colonnes = {}, itemId = null, cle = null }) {
  if (!boardId) throw new Error('Tableau non configuré');
  const o = objetDuTableau(boardId);
  if (itemId) {
    const x = await retrouver(itemId, boardId);
    if (x) {
      await majElement(boardId, x.id, colonnes);
      return { id: x.id, cree: false };
    }
  }
  if (cle?.colonne && cle?.valeur) {
    const c = champDe(o, cle.colonne);
    const existant = c ? (await api.lister(o.namePlural, { limite: 2000 })).find((r) => texteDe((c.type), r[c.name]).toLowerCase() === String(cle.valeur).toLowerCase()) : null;
    if (existant) {
      await majElement(boardId, existant.id, colonnes);
      return { id: String(existant.id), cree: false };
    }
  }
  const cree = await creerElement(boardId, nom, colonnes);
  return { id: cree.id, cree: true };
}

/** L'adresse d'un élément dans le CRM. */
export function lienElement(boardId, itemId) {
  const o = objetsSchema().find((x) => x.mondayTableau === String(boardId)) || objetDeId.get(String(itemId));
  return o && estIdTwenty(itemId) ? T.lienFiche(o.nameSingular, itemId) : null;
}

// --- La copie dans Twenty d'une écriture faite dans Monday (CRM=double, 28 oct. 2026, Jules) ---
// Monday reste la source : ses ids circulent dans Klocka. La fiche Twenty porte l'id Monday (mondayId) et se retrouve
// par lui ; une fiche née dans Twenty pendant la bascule (id Twenty) est reliée à sa jumelle Monday dès qu'elle y naît.

export const tableauMigre = (boardId) => objetsSchema().some((x) => x.mondayTableau === String(boardId));

/** L'id Monday d'une fiche Twenty (par son id Twenty), ou null si elle n'en a pas. */
export async function mondayIdDe(itemId) {
  const x = await retrouver(itemId);
  if (!x) return null;
  const r = x.r || (await api.lire(x.o.namePlural, x.id));
  return r?.mondayId ? String(r.mondayId) : null;
}

/** Une création Monday, recopiée. `twentyId` : la fiche Twenty déjà là, à relier plutôt qu'à doubler. */
export async function copierCreation(boardId, mondayId, nom, colonnes = {}, { twentyId = null } = {}) {
  const o = objetDuTableau(boardId);
  const valeurs = { ...(await valeursTwenty(o, colonnes, nom)), mondayId: String(mondayId) };
  const existant = twentyId ? { id: twentyId } : await api.trouver(o.namePlural, { mondayId: String(mondayId) });
  if (existant?.id) {
    await api.modifier(o.namePlural, existant.id, valeurs);
    objetDeId.set(String(existant.id), o);
    return { id: String(existant.id), cree: false };
  }
  const r = await api.creer(o.namePlural, valeurs);
  objetDeId.set(String(r.id), o);
  return { id: String(r.id), cree: true };
}

/** Une mise à jour Monday, recopiée. Absente de Twenty, la fiche y naît, avec le nom que donne `nomSiAbsente()`. */
export async function copierMaj(boardId, itemId, colonnes = {}, nomSiAbsente = async () => null) {
  const x = await retrouver(itemId, boardId);
  if (x) {
    const valeurs = await valeursTwenty(x.o, colonnes);
    if (Object.keys(valeurs).length) await api.modifier(x.o.namePlural, x.id, valeurs);
    return { id: x.id, cree: false };
  }
  if (estIdTwenty(itemId)) return null;
  const nom = await nomSiAbsente();
  return nom == null ? null : copierCreation(boardId, itemId, nom, colonnes);
}
