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

  CREATE TABLE IF NOT EXISTS conversations (
    id            TEXT PRIMARY KEY,
    agent_name    TEXT,
    metadata      TEXT,
    messages      TEXT NOT NULL,
    created_date  TEXT NOT NULL,
    updated_date  TEXT NOT NULL,
    created_by    TEXT
  );

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

export const Records = {
  list(entity, { sort, limit, skip } = {}) {
    const rows = db.prepare('SELECT * FROM records WHERE entity = ?').all(entity);
    let records = rows.map(rowToRecord);
    records = applySort(records, sort || '-created_date');
    if (skip) records = records.slice(skip);
    if (limit != null) records = records.slice(0, limit);
    return records;
  },

  filter(entity, query, { sort, limit } = {}) {
    const rows = db.prepare('SELECT * FROM records WHERE entity = ?').all(entity);
    let records = rows.map(rowToRecord).filter((r) => matchesQuery(r, query));
    records = applySort(records, sort || '-created_date');
    if (limit != null) records = records.slice(0, limit);
    return records;
  },

  get(entity, id) {
    const row = db.prepare('SELECT * FROM records WHERE entity = ? AND id = ?').get(entity, id);
    return rowToRecord(row);
  },

  create(entity, data, createdBy) {
    const id = data.id || randomUUID();
    const ts = nowIso();
    db.prepare(
      `INSERT INTO records (id, entity, data, created_date, updated_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, entity, JSON.stringify(stripMeta(data)), data.created_date || ts, ts, data.created_by || createdBy || null);
    return this.get(entity, id);
  },

  update(entity, id, patch) {
    const existing = this.get(entity, id);
    if (!existing) return null;
    const merged = { ...stripMeta(existing), ...stripMeta(patch) };
    db.prepare('UPDATE records SET data = ?, updated_date = ? WHERE entity = ? AND id = ?').run(
      JSON.stringify(merged),
      nowIso(),
      entity,
      id
    );
    return this.get(entity, id);
  },

  delete(entity, id) {
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
