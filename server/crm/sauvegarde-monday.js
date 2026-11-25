// La sauvegarde de Monday dans la plateforme (25 nov. 2026, Jules : « mets un export de chaque page pour avoir une
// sauvegarde dans la plateforme, comme ça on pourra toujours avoir la dernière version de Monday ; ça nous permet de
// couper Monday une fois pour toutes »).
//
// Chaque tableau de Monday qui a des éléments est gardé dans la base (entité SauvegardeMonday, une ligne par tableau) :
// ses colonnes, ses groupes, chaque élément avec ses valeurs lisibles, et le fil de chaque fiche (mises à jour et
// réponses). Les fichiers joints sont téléchargés à côté de la base (DATA_DIR/monday-sauvegarde), car leurs liens Monday
// ne s'ouvriront plus une fois l'abonnement coupé. Une nouvelle sauvegarde remplace la précédente, tableau par tableau.
// La page Paramètres › Monday (src/pages/SauvegardeMonday.jsx) la montre et la télécharge, à l'équipe seulement.
//
// Lecture seule côté Monday : rien n'y est écrit ni supprimé. La lecture passe ici en direct, même en CRM=twenty (où
// server/monday.js refuse les requêtes brutes), parce que c'est sa seule raison d'être.

import fs from 'node:fs';
import path from 'node:path';
import { Records, Meta, DATA_DIR } from '../db.js';

export const ENTITE = 'SauvegardeMonday';
const CLE_ETAT = 'monday.sauvegarde.etat';
export const DOSSIER_FICHIERS = path.join(DATA_DIR, 'monday-sauvegarde');
const API = 'https://api.monday.com/v2';
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

export const mondayLisible = () => !!(process.env.MONDAY_TOKEN || '').trim();

/** Une requête GraphQL de lecture ; Monday plafonne la « complexité » par minute : on attend au lieu d'abandonner. */
async function lire(query, variables = {}, essai = 0) {
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { Authorization: String(process.env.MONDAY_TOKEN || '').trim(), 'Content-Type': 'application/json', 'API-Version': '2024-10' },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(90_000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || d.errors?.length) throw new Error(d.errors?.[0]?.message || d.error_message || `Monday a répondu ${r.status}`);
    return d.data;
  } catch (e) {
    const msg = String(e?.message || e);
    const reseau = /fetch failed|ECONN|ETIMEDOUT|UND_ERR|socket|aborted|timeout/i.test(`${msg} ${e?.cause?.code || ''}`);
    if (essai < 8 && (reseau || /complexity|rate limit|budget|429|5\d\d/i.test(msg))) {
      await attendre(reseau ? 15_000 : 60_000);
      return lire(query, variables, essai + 1);
    }
    throw e;
  }
}

async function tableauxAvecElements() {
  const tous = [];
  for (let page = 1; page < 500; page += 1) {
    const d = await lire('query ($page: Int!) { boards(limit: 100, page: $page, state: active) { id name type items_count workspace { id name } } }', { page });
    const lot = d?.boards || [];
    tous.push(...lot);
    if (lot.length < 100) break;
  }
  return tous.filter((t) => (t.type === 'board' || t.type === 'sub_items_board') && t.items_count > 0);
}

async function detailDe(id) {
  const d = await lire('query ($b: ID!) { boards(ids: [$b]) { id columns { id title type } groups { id title position } } }', { b: String(id) });
  return d?.boards?.[0] || {};
}

async function elementsDe(id) {
  const champs = 'id name created_at updated_at state creator { name email } group { id title } parent_item { id } column_values { id text type } assets { id name file_extension }';
  const lignes = [];
  let d = await lire(`query ($b: ID!) { boards(ids: [$b]) { items_page(limit: 200) { cursor items { ${champs} } } } }`, { b: String(id) });
  let page = d?.boards?.[0]?.items_page;
  while (page) {
    lignes.push(...(page.items || []));
    if (!page.cursor || !page.items?.length) break;
    d = await lire(`query ($c: String!) { next_items_page(cursor: $c, limit: 200) { cursor items { ${champs} } } }`, { c: page.cursor });
    page = d?.next_items_page;
  }
  return lignes;
}

async function filDe(id) {
  const tous = [];
  for (let page = 1; page < 500; page += 1) {
    const d = await lire(`query ($b: ID!, $page: Int!) { boards(ids: [$b]) { updates(limit: 100, page: $page) {
      id item_id text_body created_at creator { name } replies { text_body created_at creator { name } } assets { id name file_extension } } } }`, { b: String(id), page });
    const lot = d?.boards?.[0]?.updates || [];
    tous.push(...lot);
    if (lot.length < 100) break;
  }
  return tous;
}

// Les fiches que les tests ont écrites dans le vrai Monday entre le 6 et le 25 nov. 2026 (npm test tournait en CRM=monday
// avec la vraie clé ; corrigé le 25 nov. : MONDAY_TOKEN vide pendant les tests). Ce ne sont pas des données.
const cleNom = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).sort().join(' ');
const FUITES_TESTS = new Set(['SCI Quai', 'm. achat', 'Sofia Lemaire', 'Jean Bernard', '31 rue Hoche', "9 rue de l'Oratoire", "17 rue d'Italie", '4 place aux Aires',
  '20 quai Est, Lyon', '31 rue Hoche, Cannes', "17 rue d'Italie, Aix-en-Provence", "9 rue de l'Oratoire, Grasse", '4 place aux Aires, Grasse', '137 rue Gambetta, Lille'].map(cleNom));
/** Pure : une fiche Monday écrite par les tests (voir plus haut). */
export const fuiteDeTest = (e) => String(e?.created_at || '') >= '2026-11-06' && FUITES_TESTS.has(cleNom(e?.name));

const nomFichier = (a) => `${a.id}-${String(a.name || 'fichier').replace(/[^\w.\-àâäéèêëîïôöùûüç ]+/gi, '_').slice(0, 120)}`;

/** Pure : un tableau Monday (sa lecture brute) dans la forme gardée : compacte, lisible, sans valeur brute. */
export function compacter(t, tous = [], filTous = []) {
  const elements = tous.filter((e) => !fuiteDeTest(e));
  const gardes = new Set(elements.map((e) => String(e.id)));
  const fil = filTous.filter((u) => gardes.has(String(u.item_id)));
  const colonnes = (t.columns || []).filter((c) => c.id !== 'name').map((c) => ({ id: c.id, titre: c.title, type: c.type }));
  const fichier = (a) => ({ id: String(a.id), nom: a.name || 'fichier', chemin: nomFichier(a) });
  return {
    tableau_id: String(t.id),
    nom: t.name,
    espace: t.workspace?.name || 'Principal',
    colonnes,
    groupes: [...(t.groups || [])].sort((a, b) => String(a.position).localeCompare(String(b.position))).map((g) => g.title),
    elements: elements.map((e) => ({
      id: String(e.id),
      nom: e.name || '',
      groupe: e.group?.title || null,
      parent: e.parent_item?.id ? String(e.parent_item.id) : null,
      cree_le: e.created_at || null,
      maj_le: e.updated_at || null,
      par: e.creator?.name || null,
      archive: e.state && e.state !== 'active' ? e.state : undefined,
      valeurs: Object.fromEntries((e.column_values || []).filter((v) => v.text && String(v.text).trim()).map((v) => [v.id, String(v.text)])),
      fichiers: (e.assets || []).map(fichier),
    })),
    fil: fil.map((u) => ({
      element_id: String(u.item_id),
      le: u.created_at || null,
      par: u.creator?.name || null,
      texte: u.text_body || '',
      reponses: (u.replies || []).map((r) => ({ le: r.created_at || null, par: r.creator?.name || null, texte: r.text_body || '' })),
      fichiers: (u.assets || []).map(fichier),
    })),
  };
}

/** Pure : un tableau gardé en CSV (séparateur point-virgule, pour Excel en français), une ligne par élément. */
export function csvDuTableau(t) {
  const cellule = (v) => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const tete = ['Nom', 'Groupe', ...t.colonnes.map((c) => c.titre), 'Créé le', 'Créé par', 'Fichiers', 'Fil'];
  const filPar = new Map();
  for (const u of t.fil || []) filPar.set(u.element_id, [...(filPar.get(u.element_id) || []), u]);
  const lignes = t.elements.map((e) => [
    e.nom, e.groupe || '', ...t.colonnes.map((c) => e.valeurs?.[c.id] || ''), String(e.cree_le || '').slice(0, 10), e.par || '',
    (e.fichiers || []).map((f) => f.nom).join(' | '),
    (filPar.get(e.id) || []).map((u) => `${String(u.le || '').slice(0, 10)} ${u.par || ''} : ${u.texte}`).join('\n---\n'),
  ]);
  return `\uFEFF${[tete, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n')}\r\n`;
}

/** Garde un tableau compacté (remplace la version précédente du même tableau). */
export function garderTableau(t, exporteLe = new Date().toISOString()) {
  const deja = Records.filter(ENTITE, { tableau_id: t.tableau_id })[0];
  const fiche = { ...t, exporte_le: exporteLe, n_elements: t.elements.length, n_fil: t.fil.length, n_fichiers: t.elements.reduce((n, e) => n + (e.fichiers || []).length, 0) + t.fil.reduce((n, u) => n + (u.fichiers || []).length, 0) };
  return deja ? Records.update(ENTITE, deja.id, fiche) : Records.create(ENTITE, fiche);
}

/** Les fichiers joints : leur lien public (temporaire) demandé à Monday, puis le fichier écrit à côté de la base. */
async function telechargerFichiers(fichiers, journal) {
  fs.mkdirSync(DOSSIER_FICHIERS, { recursive: true });
  const aFaire = fichiers.filter((f) => !fs.existsSync(path.join(DOSSIER_FICHIERS, f.chemin)));
  let ok = 0;
  const ratees = [];
  for (let i = 0; i < aFaire.length; i += 25) {
    const lot = aFaire.slice(i, i + 25);
    let liens = [];
    try {
      liens = (await lire('query ($ids: [ID!]!) { assets(ids: $ids) { id public_url } }', { ids: lot.map((f) => f.id) }))?.assets || [];
    } catch (e) { ratees.push(...lot.map((f) => `${f.nom} : ${e.message}`)); continue; }
    for (const f of lot) {
      const url = liens.find((x) => String(x.id) === f.id)?.public_url;
      if (!url) { ratees.push(`${f.nom} : pas de lien`); continue; }
      try {
        const r = await fetch(url, { signal: AbortSignal.timeout(120_000) });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        fs.writeFileSync(path.join(DOSSIER_FICHIERS, f.chemin), Buffer.from(await r.arrayBuffer()));
        ok += 1;
      } catch (e) { ratees.push(`${f.nom} : ${e.message}`); }
    }
    journal(`  fichiers : ${ok} / ${aFaire.length}`);
  }
  return { ok, deja: fichiers.length - aFaire.length, ratees };
}

export const etatSauvegarde = () => { try { return JSON.parse(Meta.get(CLE_ETAT) || 'null'); } catch { return null; } };
const poserEtat = (patch) => Meta.set(CLE_ETAT, JSON.stringify({ ...(etatSauvegarde() || {}), ...patch }));

/**
 * La sauvegarde entière, depuis Monday : chaque tableau qui a des éléments, puis ses fichiers. Un tableau qui ne se lit
 * pas garde sa version précédente, et l'erreur est dite. `journal` : la progression.
 */
export async function sauvegarderMonday({ journal = console.log, fichiers = true } = {}) {
  if (!mondayLisible()) throw new Error('MONDAY_TOKEN absent : Monday ne peut pas être lu.');
  const debut = new Date().toISOString();
  poserEtat({ en_cours: true, debut, fin: null, erreur: null, tableaux: 0, faits: 0, erreurs: [] });
  try {
    const tableaux = await tableauxAvecElements();
    poserEtat({ tableaux: tableaux.length });
    const aTelecharger = [];
    const erreurs = [];
    let faits = 0;
    for (const t of tableaux) {
      try {
        Object.assign(t, await detailDe(t.id));
        const elements = await elementsDe(t.id);
        let fil = [];
        try { fil = await filDe(t.id); } catch (e) { erreurs.push(`${t.name} (fil) : ${e.message}`); }
        const c = compacter(t, elements, fil);
        garderTableau(c, debut);
        aTelecharger.push(...c.elements.flatMap((e) => e.fichiers), ...c.fil.flatMap((u) => u.fichiers));
        faits += 1;
        journal(`- ${c.espace} / ${c.nom} : ${c.elements.length} élément(s), ${c.fil.length} message(s)`);
      } catch (e) {
        erreurs.push(`${t.name} : ${e.message}`);
        journal(`- ${t.name} : ERREUR ${e.message}`);
      }
      poserEtat({ faits, erreurs });
    }
    const f = fichiers ? await telechargerFichiers(aTelecharger, journal) : null;
    poserEtat({ en_cours: false, fin: new Date().toISOString(), faits, erreurs, fichiers: f ? { total: aTelecharger.length, ok: f.ok + f.deja, ratees: f.ratees.slice(0, 50), n_ratees: f.ratees.length } : null });
    return etatSauvegarde();
  } catch (e) {
    poserEtat({ en_cours: false, fin: new Date().toISOString(), erreur: e.message });
    throw e;
  }
}

/**
 * La sauvegarde depuis un export déjà fait (scripts/crm/export-monday.mjs, exports-prives/monday-<date>/) : les mêmes
 * tableaux, sans relire Monday. Les fichiers joints se téléchargent ensuite si `fichiers` (Monday doit encore répondre).
 */
export async function chargerExport(dossier, { journal = console.log, fichiers = false } = {}) {
  const schema = JSON.parse(fs.readFileSync(path.join(dossier, 'schema.json'), 'utf8'));
  const exporteLe = schema.exporte_le || new Date().toISOString();
  const aTelecharger = [];
  let faits = 0;
  for (const t of schema.tableaux || []) {
    const f = path.join(dossier, 'tableaux', `${t.id}.json`);
    if (!fs.existsSync(f)) continue;
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const c = compacter(t, d.elements || [], d.mises_a_jour || []);
    garderTableau(c, exporteLe);
    aTelecharger.push(...c.elements.flatMap((e) => e.fichiers), ...c.fil.flatMap((u) => u.fichiers));
    faits += 1;
  }
  journal(`${faits} tableau(x) gardé(s), ${aTelecharger.length} fichier(s) joint(s)`);
  const fic = fichiers && mondayLisible() ? await telechargerFichiers(aTelecharger, journal) : null;
  poserEtat({ en_cours: false, debut: exporteLe, fin: new Date().toISOString(), tableaux: faits, faits, erreurs: [], erreur: null, depuis_export: path.basename(dossier),
    fichiers: fic ? { total: aTelecharger.length, ok: fic.ok + fic.deja, ratees: fic.ratees.slice(0, 50), n_ratees: fic.ratees.length } : { total: aTelecharger.length, ok: aTelecharger.filter((x) => fs.existsSync(path.join(DOSSIER_FICHIERS, x.chemin))).length } });
  return etatSauvegarde();
}

let enCours = null;
/** Lance la sauvegarde en fond (le bouton de la page) ; une seule à la fois. */
export function lancerSauvegarde() {
  if (enCours) return { ok: false, error: 'Une sauvegarde est déjà en cours.' };
  if (!mondayLisible()) return { ok: false, error: 'MONDAY_TOKEN absent sur ce serveur : Monday ne peut pas être lu.' };
  enCours = sauvegarderMonday({ journal: (l) => console.log(`[monday-sauvegarde] ${l}`) })
    .catch((e) => console.warn('[monday-sauvegarde]', e?.message || e))
    .finally(() => { enCours = null; });
  return { ok: true };
}

/** La liste des tableaux gardés, sans leurs éléments. */
export function listeSauvegarde() {
  const lignes = Records.list(ENTITE).map(({ elements: _e, fil: _f, colonnes, ...t }) => ({ ...t, n_colonnes: (colonnes || []).length }));
  lignes.sort((a, b) => String(a.espace).localeCompare(String(b.espace)) || String(a.nom).localeCompare(String(b.nom)));
  return { tableaux: lignes, etat: etatSauvegarde(), monday_lisible: mondayLisible() };
}

export const tableauSauvegarde = (tableauId) => Records.filter(ENTITE, { tableau_id: String(tableauId) })[0] || null;

/** Le chemin d'un fichier gardé, s'il est bien dans le dossier de la sauvegarde. */
export function cheminFichier(nom) {
  const p = path.join(DOSSIER_FICHIERS, path.basename(String(nom || '')));
  return p.startsWith(DOSSIER_FICHIERS) && fs.existsSync(p) ? p : null;
}
