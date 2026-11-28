// Local SQLite persistence layer replacing the Base44 cloud datastore.
// A generic key/value-per-entity model keeps all 22 Base44 entities working
// without hand-writing a table per entity. Records are stored as JSON blobs
// and filtered/sorted in JS (dataset sizes for this app are small).

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// KLOCKA_DATA_DIR : chez un hébergeur au disque éphémère (Render sans disque
// attaché), le dossier du dépôt est effacé à chaque déploiement — sessions,
// dossiers, clients, tout. Monter un disque persistant et pointer ici dessus.
export const DATA_DIR = (process.env.KLOCKA_DATA_DIR || '').trim() || path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * Le dossier de données est-il sur un disque monté ? Déclarer KLOCKA_DATA_DIR
 * ne suffit pas : si le chemin ne correspond pas au point de montage du
 * disque, on écrit dans l'éphémère en croyant écrire sur le disque. On
 * compare le périphérique du dossier à celui de la racine, et on cherche le
 * chemin dans /proc/mounts.
 */
export function infoStockage() {
  const declare = !!(process.env.KLOCKA_DATA_DIR || '').trim();
  let monte = false;
  let pointDeMontage = null;
  try {
    const dev = fs.statSync(DATA_DIR).dev;
    const racine = fs.statSync('/').dev;
    monte = dev !== racine;
    if (fs.existsSync('/proc/mounts')) {
      const points = fs
        .readFileSync('/proc/mounts', 'utf-8')
        .split('\n')
        .map((l) => l.split(' ')[1])
        .filter((m) => m && m !== '/' && (DATA_DIR === m || DATA_DIR.startsWith(m + '/')))
        .sort((a, b) => b.length - a.length);
      pointDeMontage = points[0] || null;
      if (pointDeMontage) monte = true;
    }
  } catch {
    /* sans /proc ni stat, on s'en tient à la déclaration */
  }
  let taille_base_ko = null;
  try {
    taille_base_ko = Math.round(fs.statSync(path.join(DATA_DIR, 'klocka.db')).size / 1024);
  } catch {
    /* pas encore de base */
  }
  return { chemin: DATA_DIR, declare, monte, point_de_montage: pointDeMontage, taille_base_ko };
}

{
  const i = infoStockage();
  console.log(`[base] données dans ${i.chemin}${i.declare ? (i.monte ? ` — disque monté${i.point_de_montage ? ` sur ${i.point_de_montage}` : ''}` : ' — ATTENTION : ce chemin n\'est pas un disque monté, les données seront perdues au prochain déploiement') : ' (dossier du code)'}`);
}

// Les fichiers déposés suivent la base. Cinq modules définissaient chacun
// leur chemin « ../uploads » : sur un disque persistant, ils auraient écrit
// à côté, dans l'éphémère. Un seul chemin, exporté d'ici.
export const CHEMIN_UPLOADS = (process.env.KLOCKA_DATA_DIR || '').trim()
  ? path.join(DATA_DIR, 'uploads')
  : path.join(__dirname, 'uploads');
if (!fs.existsSync(CHEMIN_UPLOADS)) fs.mkdirSync(CHEMIN_UPLOADS, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'klocka.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS records (
    id            TEXT PRIMARY KEY,
    entity        TEXT NOT NULL,
    data          TEXT NOT NULL,
    created_date  TEXT NOT NULL,
    updated_date  TEXT NOT NULL,
    created_by    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_records_entity ON records(entity);

  -- Les trois recherches du chemin chaud. Sans elles, retrouver une session
  -- par son jeton désérialisait les soixante et une sessions, et retrouver un
  -- dossier par son identifiant les trente dossiers — cinq millisecondes,
  -- pour un seul enregistrement. SQLite sait indexer une expression : le
  -- filtre descend dans la base au lieu de remonter en JavaScript.
  CREATE INDEX IF NOT EXISTS idx_records_token
    ON records(json_extract(data, '$.token')) WHERE entity = 'Session';
  CREATE INDEX IF NOT EXISTS idx_records_email
    ON records(json_extract(data, '$.email')) WHERE entity = 'User';
  CREATE INDEX IF NOT EXISTS idx_records_deal_id
    ON records(json_extract(data, '$.deal_id')) WHERE entity = 'Deal';
  -- Les commerces d'ALX se lisent ville par ville : des milliers de fiches
  -- lourdes, qu'on ne désérialise plus toutes pour en garder une ville.
  CREATE INDEX IF NOT EXISTS idx_records_ville_id
    ON records(entity, json_extract(data, '$.ville_id'));
  -- Le fil d'un dossier de mandataire (15 nov. 2026) : ses messages seuls, sans parcourir ceux des autres dossiers.
  CREATE INDEX IF NOT EXISTS idx_records_fil_dossier
    ON records(json_extract(data, '$.dossier_id')) WHERE entity = 'MessageDossier';
  -- Les comptes d'ALX (30 oct. 2026) : cibles par ville et par pile, à appeler, à écrire. L'index porte les quatre
  -- valeurs : SQLite compte depuis l'index sans relire le JSON des onze mille fiches (2 s, à chaque passage de la
  -- veille de toutes les pages, devenues 10 ms).
  -- La signature d'une entité (combien, dernière modification) lue dans l'index seul (30 oct. 2026) : les caches des
  -- vues lourdes s'en servent à chaque appel pour savoir s'ils sont encore justes.
  CREATE INDEX IF NOT EXISTS idx_records_entity_maj ON records(entity, updated_date);
  CREATE INDEX IF NOT EXISTS idx_records_cibles_comptes
    ON records(entity, json_extract(data, '$.ville_id'), json_extract(data, '$.pile'), json_extract(data, '$.deal_id'), json_extract(data, '$.derniere_approche_le'));
  -- Les commerces qui restent à chercher dans une ville (16 nov. 2026), lus dans l'index seul : la tâche de fond le
  -- demande toutes les 2,5 s, et décoder les 60 000 fiches de Lyon (157 Mo) figeait le serveur 7 à 15 s à chaque fois.
  -- Partiel, limité aux commerces : en tête de colonne, l'entité le faisait choisir par d'autres requêtes, dont il
  -- changeait l'ordre des lignes (findBy sans tri). Seul Records.enAttente, entité écrite en clair, s'en sert.
  DROP INDEX IF EXISTS idx_records_a_chercher;
  CREATE INDEX IF NOT EXISTS idx_records_commerces_a_chercher
    ON records(json_extract(data, '$.ville_id'), json_extract(data, '$.etat_recherche'), updated_date, id) WHERE entity = 'CommerceSimple';

  CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    agent_name    TEXT,
    metadata      TEXT,
    messages      TEXT NOT NULL,
    created_date  TEXT NOT NULL,
    updated_date  TEXT NOT NULL,
    created_by    TEXT
  );

  -- Qui a fait quoi. Le schéma vit ici, avec les autres tables ; les règles et
  -- la lecture sont dans audit.js.
  CREATE TABLE IF NOT EXISTS audit (
    id       TEXT PRIMARY KEY,
    le       TEXT NOT NULL,
    email    TEXT,
    role     TEXT,
    methode  TEXT NOT NULL,
    chemin   TEXT NOT NULL,
    statut   INTEGER,
    ip       TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_le ON audit(le DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_email ON audit(email);

  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
`);

const nowIso = () => new Date().toISOString();

function rowToRecord(row) {
  if (!row) return null;
  return {
    ...JSON.parse(row.data),
    id: row.id,
    created_date: row.created_date,
    updated_date: row.updated_date,
    created_by: row.created_by,
  };
}

// Strip meta fields that are stored in dedicated columns from the JSON blob.
function stripMeta(data) {
  const { id, created_date, updated_date, created_by, ...rest } = data || {};
  return rest;
}

// --- Sorting helper: Base44 accepts "field" (asc) or "-field" (desc) ---
function applySort(records, sort) {
  if (!sort) return records;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av == null && bv == null) return 0;
    if (av == null) return desc ? 1 : -1;
    if (bv == null) return desc ? -1 : 1;
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

// --- Filtering helper: shallow equality match on all keys of `query` ---
function matchesQuery(record, query) {
  if (!query) return true;
  return Object.entries(query).every(([k, v]) => {
    if (Array.isArray(v)) return v.includes(record[k]);
    return record[k] === v;
  });
}

// Les champs que findBy cherche par leur index d'expression (idx_records_token, idx_records_email, idx_records_deal_id).
const INDEX_FIND_BY = { Session: 'token', User: 'email', Deal: 'deal_id' };

// L'index partiel de Records.enAttente, par entité (16 nov. 2026).
const INDEX_EN_ATTENTE = { CommerceSimple: 'idx_records_commerces_a_chercher' };

// La lecture par lots (16 nov. 2026) : quelques champs, `lot` lignes à la fois dans l'ordre des rowid, la main rendue
// entre deux lots pour que les requêtes des autres passent.
async function lireParLots(entity, chemins, { lot = 2000, ou = null, valeurs = [] } = {}) {
  const valides = chemins.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(c));
  // Un seul json_extract pour tous les champs (22 nov. 2026, klocka-9d) : un par champ relisait la fiche autant de fois
  // (155 ms le lot de 2 000 commerces de Lyon, contre 20 ms). Il rend une liste JSON ; un chemin de plus, toujours vide,
  // garantit la liste même pour un seul champ. Les booléens y sont true / false (et non 1 / 0).
  const cols = valides.length ? `json_extract(data, ${[...valides, '__aucun__'].map((c) => `'$.${c}'`).join(', ')}) AS v` : '';
  const st = db.prepare(`SELECT rowid AS rang, id, updated_date${cols ? `, ${cols}` : ''} FROM records WHERE entity = ?${ou ? ` AND ${ou}` : ''} AND rowid > ? ORDER BY rowid LIMIT ?`);
  const out = [];
  // La taille du lot suit le temps (22 nov. 2026, Jules : « baisse le temps de chargement ») : 2 000 commerces lus d'un
  // coup tenaient le serveur 0,5 à 1 s (chaque champ relit la fiche en JSON), et les instantanés de ville en enchaînaient
  // des dizaines ; chaque lot vise désormais ~40 ms, `lot` n'étant plus qu'un plafond.
  let taille = Math.min(lot, 250);
  for (let apres = 0; ;) {
    const t0 = performance.now();
    const lignes = st.all(entity, ...valeurs, apres, taille);
    for (const r of lignes) {
      const v = r.v ? JSON.parse(r.v) : [];
      out.push({ id: r.id, updated_date: r.updated_date, ...Object.fromEntries(valides.map((c, i) => [c, v[i] ?? null])) });
    }
    if (lignes.length < taille) return out;
    apres = lignes[lignes.length - 1].rang;
    const ms = performance.now() - t0;
    taille = Math.max(50, Math.min(lot, Math.round(taille * (ms > 0 ? 40 / ms : 2))));
    await new Promise((r) => setImmediate(r));
  }
}

// Les entités relues entières à chaque ouverture de la Prospection, gardées décodées (27 nov. 2026, Jules : « le moins
// de temps de chargement possible ») : les 7 000 agences étaient décodées par chaque route de la page (relances, file
// d'une ville, listes, session), 45 ms ici et plusieurs centaines sur Render, cinq ou six fois par ouverture. La copie
// gardée est jetée à chaque écriture de l'entité par Records (create, update, delete, elaguer) et par oublierLectures
// pour une écriture directe en SQL (restauration d'une sauvegarde). Chaque lecture rend des copies de surface : changer
// un champ d'une fiche lue ne touche pas la copie gardée. Une liste imbriquée (agents, pour…) reste partagée et ne se
// modifie pas en place (vérifié dans les modules qui lisent les agences, 27 nov. 2026).
const GARDEES = new Set(['AgenceProspect']);
const gardees = new Map(); // entité → enregistrements décodés, triés par -created_date
const oublier = (entity) => { if (GARDEES.has(entity)) gardees.delete(entity); };
/** Jette les copies gardées : à appeler après une écriture qui ne passe pas par Records. */
export function oublierLectures() { gardees.clear(); }
function lireGardee(entity) {
  let l = gardees.get(entity);
  if (!l) {
    l = applySort(db.prepare('SELECT * FROM records WHERE entity = ?').all(entity).map(rowToRecord), '-created_date');
    gardees.set(entity, l);
  }
  return l;
}

export const Records = {
  list(entity, { sort, limit, skip } = {}) {
    if (GARDEES.has(entity)) {
      let records = lireGardee(entity);
      if (sort && sort !== '-created_date') records = applySort(records, sort);
      if (skip) records = records.slice(skip);
      if (limit != null) records = records.slice(0, limit);
      return records.map((r) => ({ ...r }));
    }
    const rows = db.prepare('SELECT * FROM records WHERE entity = ?').all(entity);
    let records = rows.map(rowToRecord);
    records = applySort(records, sort || '-created_date');
    if (skip) records = records.slice(skip);
    if (limit != null) records = records.slice(0, limit);
    return records;
  },

  filter(entity, query, { sort, limit } = {}) {
    if (GARDEES.has(entity)) {
      let records = lireGardee(entity).filter((r) => matchesQuery(r, query));
      if (sort && sort !== '-created_date') records = applySort(records, sort);
      if (limit != null) records = records.slice(0, limit);
      return records.map((r) => ({ ...r }));
    }
    // Les égalités sur une chaîne descendent dans la base : SQLite écarte les
    // lignes avant qu'on les désérialise. Le filtre JavaScript reste derrière,
    // seul juge (null, booléens, tableaux ne se comparent pas pareil en SQL).
    const sql = ['SELECT * FROM records WHERE entity = ?'];
    const params = [entity];
    for (const [k, v] of Object.entries(query || {})) {
      if (typeof v !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
      sql.push(`AND json_extract(data, '$.${k}') = ?`);
      params.push(v);
    }
    const rows = db.prepare(sql.join(' ')).all(...params);
    let records = rows.map(rowToRecord).filter((r) => matchesQuery(r, query));
    records = applySort(records, sort || '-created_date');
    if (limit != null) records = records.slice(0, limit);
    return records;
  },

  /**
   * Quelques champs de chaque enregistrement, lus par la base sans
   * désérialiser le reste. Pour compter sur des milliers de fiches lourdes
   * (les commerces d'ALX) quand on n'a besoin que de deux ou trois valeurs.
   *
   * @param {string[]} chemins  chemins pointés, « societe.siren »
   * @returns {object[]}  une ligne par enregistrement : id, puis une clé par chemin
   */
  champs(entity, chemins) {
    // « journal[#-1] » : le dernier élément d'une liste, sans relire la liste (27 nov. 2026).
    const valides = chemins.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*(\[#-1\])?$/.test(c));
    // json_extract rend un objet ou une liste en texte JSON : ils sont relus (31 oct. 2026 : la géographie d'une ville
    // arrivait en texte, et aucun client cherchant par département ou par région n'avait de ville).
    const cols = valides.map((c, i) => `json_extract(data, '$.${c}') AS c${i}, json_type(data, '$.${c}') AS t${i}`).join(', ');
    const valeur = (r, i) => (['object', 'array'].includes(r[`t${i}`]) ? JSON.parse(r[`c${i}`]) : r[`c${i}`]);
    return db.prepare(`SELECT id${cols ? `, ${cols}` : ''} FROM records WHERE entity = ?`).all(entity)
      .map((r) => ({ id: r.id, ...Object.fromEntries(valides.map((c, i) => [c, valeur(r, i)])) }));
  },

  /**
   * `champs`, sur les seuls enregistrements dont `champ` vaut `valeur` (3 nov. 2026) : l'état d'une ville (combien de
   * propriétaires cherchés, combien de prix) décodait ses milliers de commerces entiers, onze secondes par ouverture
   * de la prospection d'un mandataire. `updated_date` vient avec chaque ligne.
   */
  champsOu(entity, champ, valeur, chemins) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(champ)) return [];
    const valides = chemins.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(c));
    const cols = valides.map((c, i) => `json_extract(data, '$.${c}') AS c${i}, json_type(data, '$.${c}') AS t${i}`).join(', ');
    const lire = (r, i) => (['object', 'array'].includes(r[`t${i}`]) ? JSON.parse(r[`c${i}`]) : r[`c${i}`]);
    return db.prepare(`SELECT id, updated_date${cols ? `, ${cols}` : ''} FROM records WHERE entity = ? AND json_extract(data, '$.${champ}') = ?`).all(entity, valeur)
      .map((r) => ({ id: r.id, updated_date: r.updated_date, ...Object.fromEntries(valides.map((c, i) => [c, lire(r, i)])) }));
  },

  /**
   * `champsOu`, lu par lots de `lot` lignes en rendant la main entre deux lots (16 nov. 2026) : sur les 60 000
   * commerces de Lyon, la lecture d'un bloc figeait le serveur 4 s ; par lots, les requêtes passent entre deux.
   */
  champsOuParLots(entity, champ, valeur, chemins, { lot = 2000 } = {}) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(champ)) return Promise.resolve([]);
    return lireParLots(entity, chemins, { lot, ou: `json_extract(data, '$.${champ}') = ?`, valeurs: [valeur] });
  },

  /** `champs`, lu par lots de la même façon (16 nov. 2026 : la relecture de l'annuaire, 82 000 commerces, 15 s d'un bloc). */
  champsParLots(entity, chemins, { lot = 2000 } = {}) {
    return lireParLots(entity, chemins, { lot });
  },

  /**
   * L'état de chaque enregistrement dont `champ` vaut `valeur` : id, updated_date et `etat`, lus dans l'index partiel de
   * l'entité (INDEX_EN_ATTENTE), sans rien désérialiser (16 nov. 2026). Pour compter une ville par état.
   */
  lignesEtat(entity, champ, valeur, etat) {
    if (!INDEX_EN_ATTENTE[entity] || ![champ, etat].every((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c))) return [];
    return db.prepare(`SELECT id, updated_date, json_extract(data, '$.${etat}') AS ${etat} FROM records INDEXED BY ${INDEX_EN_ATTENTE[entity]} WHERE entity = '${entity}' AND json_extract(data, '$.${champ}') = ?`).all(valeur);
  },

  /**
   * Les enregistrements dont `champ` vaut `valeur` et dont `etat` est vide ou l'une des `etats` : id, updated_date et
   * l'état, lus dans un index partiel qui porte ces colonnes (idx_records_commerces_a_chercher) sans rien désérialiser
   * (16 nov. 2026). L'entité est écrite en clair, et l'index nommé (INDEXED BY) : laissé à lui-même, SQLite prenait
   * idx_records_cibles_comptes, qui relit chaque fiche (4 s pour Lyon au lieu de 12 ms).
   */
  enAttente(entity, champ, valeur, etat, etats = []) {
    if (![entity, champ, etat].every((c) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(c))) return [];
    const dans = etats.length ? ` OR json_extract(data, '$.${etat}') IN (${etats.map(() => '?').join(', ')})` : '';
    return db.prepare(`SELECT id, updated_date, json_extract(data, '$.${etat}') AS ${etat} FROM records${INDEX_EN_ATTENTE[entity] ? ` INDEXED BY ${INDEX_EN_ATTENTE[entity]}` : ''} WHERE entity = '${entity}' AND json_extract(data, '$.${champ}') = ? AND (json_extract(data, '$.${etat}') IS NULL${dans})`)
      .all(valeur, ...etats);
  },

  /**
   * Existe-t-il un enregistrement dont `champ` vaut `valeur` ? (30 oct. 2026) Rien n'est désérialisé, et le chemin
   * écrit en clair laisse SQLite prendre l'index de l'expression (ville_id) : savoir si une ville a des commerces
   * chargeait et décodait ses milliers de fiches.
   */
  existe(entity, champ, valeur) {
    if (valeur == null) return false;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(champ)) return !!this.findBy(entity, champ, valeur);
    return !!db.prepare(`SELECT 1 FROM records WHERE entity = ? AND json_extract(data, '$.${champ}') = ? LIMIT 1`).get(entity, valeur);
  },

  /**
   * Des comptes groupés par la base, sans rien désérialiser (30 oct. 2026) : `grouper('Cible', ['ville_id', 'pile'])`
   * rend une ligne par couple avec `n`. La veille d'ALX comptait les cibles de chaque ville en décodant les onze
   * mille fiches, toutes les trente secondes, depuis toutes les pages.
   */
  grouper(entity, chemins) {
    const valides = chemins.filter((c) => /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(c));
    const cols = valides.map((c, i) => `json_extract(data, '$.${c}') AS c${i}`).join(', ');
    const groupe = valides.map((_, i) => `c${i}`).join(', ');
    return db.prepare(`SELECT ${cols}, COUNT(*) AS n FROM records WHERE entity = ? GROUP BY ${groupe}`).all(entity)
      .map((r) => ({ ...Object.fromEntries(valides.map((c, i) => [c, r[`c${i}`]])), n: r.n }));
  },

  /**
   * La signature d'une entité : combien d'enregistrements, et la dernière modification (30 oct. 2026). Sans lire le
   * JSON : de quoi savoir si un résultat gardé en cache est encore juste.
   */
  signature(entity) {
    const r = db.prepare('SELECT COUNT(*) AS n, MAX(updated_date) AS m FROM records WHERE entity = ?').get(entity);
    return `${r.n}|${r.m || ''}`;
  },

  /** Le nombre d'éléments d'un tableau de chaque enregistrement (`rues` d'une ville), sans le décoder. */
  longueurs(entity, chemin) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(chemin)) return new Map();
    return new Map(db.prepare(`SELECT id, json_array_length(data, '$.${chemin}') AS n FROM records WHERE entity = ?`).all(entity).map((r) => [r.id, r.n || 0]));
  },

  get(entity, id) {
    const row = db.prepare('SELECT * FROM records WHERE entity = ? AND id = ?').get(entity, id);
    return rowToRecord(row);
  },

  /**
   * Le premier enregistrement dont `champ` vaut `valeur`, cherché par la base.
   *
   * `filter()` remonte toute l'entité et la désérialise avant de comparer :
   * acceptable pour parcourir, ruineux pour retrouver une ligne. Les champs
   * indexés ci-dessus (jeton de session, adresse d'un compte, identifiant de
   * dossier) sont ceux du chemin chaud, parcourus à chaque requête.
   *
   * @returns {object|null}
   */
  findBy(entity, champ, valeur) {
    if (valeur == null) return null;
    // Le chemin écrit en clair pour les champs indexés (27 nov. 2026) : passé en paramètre (`'$.' || ?`), SQLite ne
    // reconnaissait pas l'expression de l'index et relisait les 570 sessions à chaque requête, deux ou trois fois par
    // requête (jeton, puis compte). Les autres champs gardent la requête d'avant : sans index propre, le chemin en
    // clair pourrait faire choisir à SQLite un autre index et changer la ligne rendue la première.
    if (INDEX_FIND_BY[entity] === champ) {
      return rowToRecord(db.prepare(`SELECT * FROM records WHERE entity = '${entity}' AND json_extract(data, '$.${champ}') = ? LIMIT 1`).get(valeur));
    }
    const row = db
      .prepare("SELECT * FROM records WHERE entity = ? AND json_extract(data, '$.' || ?) = ? LIMIT 1")
      .get(entity, champ, valeur);
    return rowToRecord(row);
  },

  /**
   * Ne garde que les `plafond` lignes les plus récentes d'un journal (au champ `le`), en une requête, sans rien
   * désérialiser (27 nov. 2026). Les journaux relisaient leur table entière à chaque écriture pour savoir s'ils
   * débordaient : 20 000 visites décodées à chaque page ouverte. Le compte se lit dans l'index ; passé le plafond, on
   * redescend à 95 % pour ne pas recommencer à l'écriture suivante.
   */
  elaguer(entity, plafond) {
    const n = this.count(entity);
    if (n <= plafond) return 0;
    const trop = n - Math.floor(plafond * 0.95);
    oublier(entity);
    return db.prepare(`DELETE FROM records WHERE id IN (SELECT id FROM records WHERE entity = ? ORDER BY json_extract(data, '$.le') ASC LIMIT ?)`).run(entity, trop).changes;
  },

  create(entity, data, createdBy) {
    oublier(entity);
    const id = data.id || randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO records (id, entity, data, created_date, updated_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, entity, JSON.stringify(stripMeta(data)), data.created_date || ts, ts, data.created_by || createdBy || null);
    return this.get(entity, id);
  },

  /**
   * `garderDate` (3 nov. 2026) : une écriture de fond qui ne doit pas changer la signature de l'entité (la relecture de
   * l'annuaire réécrit des milliers de commerces ; chaque date neuve relançait les calculs de la Prospection).
   */
  update(entity, id, patch, { garderDate = false } = {}) {
    const existing = this.get(entity, id);
    if (!existing) return null;
    oublier(entity);
    const merged = { ...stripMeta(existing), ...stripMeta(patch) };
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?').run(
      JSON.stringify(merged),
      garderDate && existing.updated_date ? existing.updated_date : nowIso(),
      entity,
      id
    );
    return this.get(entity, id);
  },

  delete(entity, id) {
    oublier(entity);
    db.prepare('DELETE FROM records WHERE entity = ? AND id = ?').run(entity, id);
    return { success: true };
  },

  count(entity) {
    return db.prepare('SELECT COUNT(*) AS c FROM records WHERE entity = ?').get(entity).c;
  },

  listEntities() {
    return db.prepare('SELECT DISTINCT entity FROM records ORDER BY entity').all().map((r) => r.entity);
  },
};

export const Conversations = {
  list(agentName) {
    const rows = agentName
      ? db.prepare('SELECT * FROM conversations WHERE agent_name = ? ORDER BY updated_date DESC').all(agentName)
      : db.prepare('SELECT * FROM conversations ORDER BY updated_date DESC').all();
    return rows.map((r) => ({
      id: r.id,
      agent_name: r.agent_name,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      messages: JSON.parse(r.messages),
      created_date: r.created_date,
      updated_date: r.updated_date,
    }));
  },

  get(id) {
    const r = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    if (!r) return null;
    return {
      id: r.id,
      agent_name: r.agent_name,
      metadata: r.metadata ? JSON.parse(r.metadata) : {},
      messages: JSON.parse(r.messages),
      created_date: r.created_date,
      updated_date: r.updated_date,
    };
  },

  create({ agent_name, metadata }) {
    const id = randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO conversations (id, agent_name, metadata, messages, created_date, updated_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, agent_name || null, JSON.stringify(metadata || {}), JSON.stringify([]), ts, ts);
    return this.get(id);
  },

  setMessages(id, messages) {
    db.prepare('UPDATE conversations SET messages = ?, updated_date = ? WHERE id = ?').run(
      JSON.stringify(messages),
      nowIso(),
      id
    );
    return this.get(id);
  },

  // Sans toucher à la date : renommer ne fait pas remonter une conversation.
  setMetadata(id, metadata) {
    db.prepare('UPDATE conversations SET metadata = ? WHERE id = ?').run(JSON.stringify(metadata || {}), id);
    return this.get(id);
  },

  delete(id) {
    db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
    return { success: true };
  },
};

export const Meta = {
  get(key) {
    const r = db.prepare('SELECT value FROM meta WHERE key = ?').get(key);
    return r ? r.value : null;
  },
  set(key, value) {
    db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(
      key,
      value,
      value
    );
  },
};

export default db;
