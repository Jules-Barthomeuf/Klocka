// Les listes tirées de Monday (9 oct. 2026) : l'emailing lit les tableaux de
// l'équipe (« Agent immobilier », « Investisseurs », « Prospects ») et en fait
// des listes prêtes à l'emploi : tous les agents, ceux sans nouvelles depuis
// 60 jours, ceux qui nous envoient des biens, les clients par étape, les
// prospects à relancer.
//
// Monday fait foi, et rien n'y est écrit : on lit seulement. Un contact n'est
// jamais dupliqué (même adresse = même contact), garde son statut (un
// désinscrit le reste) et ses autres listes. L'appartenance à une liste Monday
// se recalcule à chaque lecture : un agent rappelé hier sort de « sans
// nouvelles », un client signé passe de « en recherche » à « projet signé ».
// Une liste supprimée à la main ne revient pas.
//
// Le dernier contact d'un agent : le plus récent entre la colonne Date de
// Monday, « Dernier contact » (« 08/10/2026 · Jules ») et le carnet de la
// plateforme (dernier_contact_le, appels aboutis), rapproché par l'adresse.

import { randomBytes } from 'crypto';
import { Records, Meta } from '../db.js';
import { E } from './schema.js';

const maintenant = () => new Date().toISOString();
const sansAccent = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
const premierEmail = (t) => (String(t || '').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/) || [null])[0];
const CLE_META = 'emailing:listes_monday';
export const JOURS_SANS_NOUVELLES = 60;

const ACTIFS = ['recherche', 'def strategie', 'financement', 'negociation', 'compromis'];

/** Les listes, dans l'ordre où elles s'affichent. `regle` lit un contact tiré de Monday. */
export const LISTES = [
  { cle: 'agents', nom: 'Agents immobiliers · tous', tableau: 'agents', regle: () => true },
  { cle: 'agents_sans_nouvelles', nom: `Agents immobiliers · sans nouvelles depuis ${JOURS_SANS_NOUVELLES} jours`, tableau: 'agents', regle: (c) => !c.ecarte && (c.jours_sans_contact == null || c.jours_sans_contact >= JOURS_SANS_NOUVELLES) },
  { cle: 'agents_biens', nom: 'Agents immobiliers · nous envoient des biens', tableau: 'agents', regle: (c) => c.envoie_des_biens },
  { cle: 'clients', nom: 'Clients · tous', tableau: 'clients', regle: () => true },
  { cle: 'clients_recherche', nom: 'Clients · en recherche', tableau: 'clients', regle: (c) => ACTIFS.includes(sansAccent(c.statut)) },
  { cle: 'clients_signes', nom: 'Clients · projet signé', tableau: 'clients', regle: (c) => sansAccent(c.statut) === 'projet signe' },
  { cle: 'clients_pause', nom: 'Clients · en pause ou abandonnés', tableau: 'clients', regle: (c) => ['stand-by', 'abandonne'].includes(sansAccent(c.statut)) },
  { cle: 'prospects', nom: 'Prospects · tous', tableau: 'prospects', regle: (c) => sansAccent(c.statut) !== 'out' },
  { cle: 'prospects_relancer', nom: 'Prospects · à relancer', tableau: 'prospects', regle: (c) => ['no show', 'interet', 'a relancer'].includes(sansAccent(c.statut)) },
];

/** Pure : « 08/10/2026 · Jules », « 2026-10-08 » ou « 2026-10-08 06:08 » en AAAA-MM-JJ. */
export function jourDe(t) {
  const s = String(t || '');
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return fr ? `${fr[3]}-${fr[2]}-${fr[1]}` : null;
}

/** Pure : le prénom et le nom d'une ligne « Laurent JOUANIN », le prénom de sa colonne s'il y en a une. */
export function nomEtPrenom(nomLigne, prenomColonne = '') {
  const mots = String(nomLigne || '').trim().split(/\s+/).filter(Boolean);
  const prenom = String(prenomColonne || '').trim() || mots[0] || '';
  const nom = mots.filter((m) => sansAccent(m) !== sansAccent(prenom)).join(' ');
  return { prenom, nom };
}

/**
 * Pure : les contacts d'une lecture de Monday. `tableaux` = { agents,
 * clients, prospects }, chacun { colonnes: [{ id, title }], lignes:
 * [{ id, nom, colonnes: { id: texte } }] }. `carnet` : les dates de dernier
 * contact du carnet, par adresse ; `envoient` : les adresses des agents qui
 * nous envoient des fiches, d'après le carnet (Monday ne rend pas le texte
 * d'une colonne reliée).
 */
export function contactsDeMonday(tableaux, { carnet = new Map(), envoient = new Set(), aujourdhui = new Date() } = {}) {
  const out = new Map();
  const auj = Date.parse(aujourdhui.toISOString().slice(0, 10));
  for (const tableau of ['agents', 'clients', 'prospects']) {
    const t = tableaux[tableau];
    if (!t) continue;
    const parTitre = (...titres) => t.colonnes.filter((c) => titres.map(sansAccent).includes(sansAccent(c.title))).map((c) => c.id);
    const lire = (l, ...titres) => parTitre(...titres).map((id) => String(l.colonnes?.[id] || '').trim()).find(Boolean) || '';
    for (const l of t.lignes || []) {
      const email = premierEmail(lire(l, 'E-mail', 'Email'));
      if (!email || out.has(email)) continue;
      const { prenom, nom } = nomEtPrenom(l.nom, lire(l, 'Prénom', 'Texte'));
      const c = { email, prenom, nom, monday_id: String(l.id), tableau, statut: lire(l, tableau === 'clients' ? 'Statut Client' : 'Statut'), ville: lire(l, 'Ville'), entreprise: lire(l, 'Entreprise') };
      if (tableau === 'agents') {
        const jours = [jourDe(lire(l, 'Date')), jourDe(lire(l, 'Dernier contact')), jourDe(carnet.get(email))].filter(Boolean).sort();
        const dernier = jours[jours.length - 1] || null;
        c.dernier_contact = dernier;
        c.jours_sans_contact = dernier ? Math.floor((auj - Date.parse(dernier)) / 86400000) : null;
        c.envoie_des_biens = envoient.has(email) || !!lire(l, 'Propriétés');
        c.ecarte = sansAccent(c.statut) === 'ne plus appeler' || sansAccent(lire(l, 'Priorité')) === 'mort';
        c.hors_diffusion = sansAccent(lire(l, 'Liste de diffusion')) === 'non';
        if (c.hors_diffusion) continue;
      }
      c.listes = LISTES.filter((x) => x.tableau === tableau && x.regle(c)).map((x) => x.cle);
      out.set(email, c);
    }
  }
  return [...out.values()];
}

const TYPE = { agents: 'mandataire', clients: 'client', prospects: 'lead' };
const TAG = { agents: 'Agent immobilier', clients: 'Client', prospects: 'Prospect' };

/** Les listes Monday en base : créées au premier passage, jamais recréées si on les a supprimées. */
function listesEnBase(par) {
  let etat = {};
  try { etat = JSON.parse(Meta.get(CLE_META) || '{}') || {}; } catch { etat = {}; }
  const ids = { ...(etat.ids || {}) };
  for (const x of LISTES) {
    if (ids[x.cle] && Records.get(E.LISTE, ids[x.cle])) continue;
    if (ids[x.cle]) { ids[x.cle] = null; continue; }
    if (ids[x.cle] === null) continue;
    ids[x.cle] = Records.create(E.LISTE, { nom: x.nom, monday: x.cle, cree_le: maintenant(), cree_par: par }).id;
  }
  return { etat, ids };
}

/**
 * Range les contacts tirés de Monday et recalcule les listes. Rend le compte
 * de chaque liste. `contacts` vient de contactsDeMonday.
 */
export function ranger(contacts, { par = null, quand = new Date() } = {}) {
  const { etat, ids } = listesEnBase(par);
  const idsMonday = new Set(Object.values(ids).filter(Boolean));
  const parEmail = new Map(Records.list(E.CONTACT).map((c) => [c.email, c]));
  const vus = new Set();
  let nouveaux = 0;
  let maj = 0;
  for (const m of contacts) {
    vus.add(m.email);
    const listes = m.listes.map((k) => ids[k]).filter(Boolean);
    const champs = { monday_tableau: TAG[m.tableau], ...(m.statut ? { monday_statut: m.statut } : {}), ...(m.dernier_contact ? { dernier_contact: m.dernier_contact } : {}) };
    const ancien = parEmail.get(m.email);
    if (ancien) {
      const complete = Object.fromEntries(['prenom', 'nom', 'entreprise', 'ville'].filter((k) => m[k] && !ancien[k]).map((k) => [k, m[k]]));
      Records.update(E.CONTACT, ancien.id, {
        ...complete, ...(!ancien.type || ancien.type === 'lead' ? { type: TYPE[m.tableau] } : {}),
        champs: { ...(ancien.champs || {}), ...champs },
        tags: [...new Set([...(ancien.tags || []), TAG[m.tableau]])],
        listes: [...new Set([...(ancien.listes || []).filter((id) => !idsMonday.has(id)), ...listes])],
        monday_id: m.monday_id, maj_le: quand.toISOString(),
      });
      maj += 1;
    } else {
      Records.create(E.CONTACT, {
        email: m.email, prenom: m.prenom || '', nom: m.nom || '', entreprise: m.entreprise || '', ville: m.ville || '', type: TYPE[m.tableau],
        champs, tags: [TAG[m.tableau]], listes, source: 'monday', statut: 'abonne', monday_id: m.monday_id,
        jeton: randomBytes(16).toString('hex'), ajoute_le: quand.toISOString(), ajoute_par: par,
      });
      nouveaux += 1;
    }
  }
  // Ceux qui ne sont plus dans Monday (ligne supprimée, adresse changée) sortent des listes Monday, et restent contacts.
  for (const c of Records.list(E.CONTACT)) {
    if (vus.has(c.email) || !(c.listes || []).some((id) => idsMonday.has(id))) continue;
    Records.update(E.CONTACT, c.id, { listes: c.listes.filter((id) => !idsMonday.has(id)) });
  }
  const tous = Records.list(E.CONTACT);
  const comptes = LISTES.filter((x) => ids[x.cle]).map((x) => ({ cle: x.cle, nom: Records.get(E.LISTE, ids[x.cle])?.nom || x.nom, total: tous.filter((c) => (c.listes || []).includes(ids[x.cle])).length }));
  Meta.set(CLE_META, JSON.stringify({ ...etat, ids, le: quand.toISOString(), nouveaux, mis_a_jour: maj }));
  return { ok: true, nouveaux, mis_a_jour: maj, listes: comptes, le: quand.toISOString() };
}

/** Lit Monday (lecture seule) et range. `lire` remplace Monday dans les tests. */
export async function synchroniser({ par = null, lire = null, quand = new Date() } = {}) {
  const M = await import('../monday.js');
  if (!lire && !M.mondayConfigure()) return { ok: false, error: 'Monday n\'est pas branché sur ce serveur (MONDAY_TOKEN).' };
  const ids = { agents: M.TABLEAUX.agents, clients: M.TABLEAUX.investisseurs, prospects: M.TABLEAUX.prospects };
  const lecture = lire || (async (id) => ({ colonnes: await M.colonnesDuTableau(id), lignes: await M.lireTableau(id, 10000) }));
  const tableaux = {};
  for (const [k, id] of Object.entries(ids)) if (id || lire) tableaux[k] = await lecture(id || k, k);
  const carnet = new Map();
  const envoient = new Set();
  for (const a of Records.list('AgentImmo')) {
    if (a.essai) continue;
    for (const e of a.emails || []) {
      const m = String(e).toLowerCase();
      if (a.statut === 'envoie_des_fiches' || (a.fiches_ids || []).length) envoient.add(m);
      if (a.dernier_contact_le && (!carnet.has(m) || carnet.get(m) < a.dernier_contact_le)) carnet.set(m, a.dernier_contact_le);
    }
  }
  return ranger(contactsDeMonday(tableaux, { carnet, envoient, aujourdhui: quand }), { par, quand });
}

/** La dernière lecture : quand, et combien. */
export function etat() {
  try { const e = JSON.parse(Meta.get(CLE_META) || '{}') || {}; return { le: e.le || null, ids: e.ids || {} }; } catch { return { le: null, ids: {} }; }
}

/** Une fois par jour, sur le serveur qui envoie : les listes suivent Monday sans qu'on y pense. */
export async function tourMonday({ quand = new Date() } = {}) {
  const { le } = etat();
  if (le && quand.getTime() - Date.parse(le) < 20 * 3600000) return null;
  return synchroniser({ par: 'monday-auto' });
}
