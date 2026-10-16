// Le Layer (l'Intelligence, à l'écran) : les tables dédiées (phase 2, 15 oct. 2026).
//
// Les sources, les faits, les liens et les questions restent des enregistrements
// JSON de la table `records` (CerveauSource, CerveauFait, CerveauLien,
// CerveauQuestion) : leurs nouveaux champs s'y ajoutent sans migration, lus
// avec une valeur par défaut. Ce qui demande un index ou un volume vit ici,
// dans des tables SQLite créées seulement si elles manquent :
//
//   layer_fts                 plein texte (FTS5, accents ignorés) des faits : résumé + citation
//   layer_vecteurs            l'embedding de chaque fait, avec son modèle (pour ré-embedder)
//   layer_syntheses           une synthèse par fiche
//   layer_evaluations         le banc de questions ; layer_evaluations_runs, ses exécutions
//   layer_requetes            le journal des recherches (AK et humains)
//   layer_audit               qui a validé, corrigé, rejeté, remplacé quoi, avant / après
//   layer_taches              les tâches de fond, reprises au démarrage
//
// Réversible : `defaire()` supprime ces tables (les enregistrements JSON ne
// bougent pas). Rien n'est supprimé de l'existant : le journal des recherches
// du MVP (CerveauRecherche) est recopié dans layer_requetes, pas déplacé.
//
// Seuils du chantier Postgres (décision de Jules, 15 oct. 2026) : une recherche
// de plus de 300 ms, ou plus de 50 000 faits. `alertePostgres()` les mesure.

import { randomUUID } from 'node:crypto';
import db, { Records } from './db.js';

export const SEUIL_RECHERCHE_MS = 300;
export const SEUIL_FAITS = 50000;

const SCHEMA = `
  CREATE VIRTUAL TABLE IF NOT EXISTS layer_fts USING fts5(fait_id UNINDEXED, resume, citation, tokenize = 'unicode61 remove_diacritics 2');

  CREATE TABLE IF NOT EXISTS layer_vecteurs (
    fait_id    TEXT PRIMARY KEY,
    modele     TEXT NOT NULL,
    dims       INTEGER NOT NULL,
    vecteur    BLOB NOT NULL,
    empreinte  TEXT NOT NULL,
    cree_le    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS layer_syntheses (
    type_entite TEXT NOT NULL,
    entite_id   TEXT NOT NULL,
    texte       TEXT NOT NULL,
    lignes      TEXT NOT NULL,
    faits       TEXT NOT NULL,
    version     INTEGER NOT NULL DEFAULT 1,
    genere_le   TEXT NOT NULL,
    perime      INTEGER NOT NULL DEFAULT 0,
    cout_usd    REAL,
    PRIMARY KEY (type_entite, entite_id)
  );
  CREATE INDEX IF NOT EXISTS idx_layer_syntheses_perime ON layer_syntheses(perime);

  CREATE TABLE IF NOT EXISTS layer_evaluations (
    id               TEXT PRIMARY KEY,
    question         TEXT NOT NULL,
    reponse_attendue TEXT,
    faits_attendus   TEXT NOT NULL DEFAULT '[]',
    auteur           TEXT,
    cree_le          TEXT NOT NULL,
    actif            INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS layer_evaluations_runs (
    id          TEXT PRIMARY KEY,
    le          TEXT NOT NULL,
    version     TEXT NOT NULL,
    note        TEXT,
    resultats   TEXT NOT NULL,
    rappel      REAL,
    citation_ok REAL
  );
  CREATE INDEX IF NOT EXISTS idx_layer_runs_le ON layer_evaluations_runs(le DESC);

  CREATE TABLE IF NOT EXISTS layer_requetes (
    id       TEXT PRIMARY KEY,
    le       TEXT NOT NULL,
    par      TEXT,
    origine  TEXT,
    question TEXT,
    texte    TEXT,
    filtres  TEXT NOT NULL DEFAULT '{}',
    faits    TEXT NOT NULL DEFAULT '[]',
    cites    TEXT NOT NULL DEFAULT '[]',
    nombre   INTEGER NOT NULL DEFAULT 0,
    duree_ms INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_layer_requetes_le ON layer_requetes(le DESC);

  CREATE TABLE IF NOT EXISTS layer_audit (
    id      TEXT PRIMARY KEY,
    le      TEXT NOT NULL,
    par     TEXT,
    action  TEXT NOT NULL,
    fait_id TEXT,
    avant   TEXT,
    apres   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_layer_audit_fait ON layer_audit(fait_id);
  CREATE INDEX IF NOT EXISTS idx_layer_audit_le ON layer_audit(le DESC);

  CREATE TABLE IF NOT EXISTS layer_taches (
    id      TEXT PRIMARY KEY,
    type    TEXT NOT NULL,
    cle     TEXT,
    charge  TEXT NOT NULL DEFAULT '{}',
    etat    TEXT NOT NULL,
    essais  INTEGER NOT NULL DEFAULT 0,
    erreur  TEXT,
    apres   TEXT,
    cree_le TEXT NOT NULL,
    maj_le  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_layer_taches_etat ON layer_taches(etat, apres);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_layer_taches_cle ON layer_taches(cle) WHERE cle IS NOT NULL AND etat IN ('en_attente', 'en_cours');

  -- Les lectures fréquentes des enregistrements JSON du Layer : les faits par statut, les liens par fiche.
  CREATE INDEX IF NOT EXISTS idx_records_layer_fait_statut ON records(json_extract(data, '$.statut')) WHERE entity = 'CerveauFait';
  CREATE INDEX IF NOT EXISTS idx_records_layer_lien_fiche ON records(json_extract(data, '$.type_entite'), json_extract(data, '$.entite_id')) WHERE entity = 'CerveauLien';
`;

const TABLES = ['layer_fts', 'layer_vecteurs', 'layer_syntheses', 'layer_evaluations', 'layer_evaluations_runs', 'layer_requetes', 'layer_audit', 'layer_taches'];

/** Crée ce qui manque, et recopie une fois le journal des recherches du MVP. Rejouable. */
export function installer() {
  db.exec(SCHEMA);
  const copie = db.prepare('INSERT OR IGNORE INTO layer_requetes (id, le, par, origine, question, nombre) VALUES (?, ?, ?, ?, ?, ?)');
  db.transaction(() => {
    for (const r of Records.list('CerveauRecherche')) copie.run(r.id, r.le || r.created_date, r.par || null, 'ak', r.question || null, Number(r.trouves) || 0);
  })();
}

/** Le retour arrière : les tables dédiées supprimées, les enregistrements JSON intacts. */
export function defaire() {
  db.exec(`${TABLES.map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n')}
    DROP INDEX IF EXISTS idx_records_layer_fait_statut;
    DROP INDEX IF EXISTS idx_records_layer_lien_fiche;`);
}

export const tablesPresentes = () => TABLES.filter((t) => db.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(t));

installer();

const maintenant = () => new Date().toISOString();
const json = (v) => JSON.stringify(v ?? null);

// --- Audit ---------------------------------------------------------------------------------

/** Une ligne d'audit : qui, quoi, sur quel fait, l'état avant et après. */
export function auditer({ par = null, action, fait_id = null, avant = null, apres = null }) {
  db.prepare('INSERT INTO layer_audit (id, le, par, action, fait_id, avant, apres) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(randomUUID(), maintenant(), par ? String(par).toLowerCase() : null, action, fait_id, json(avant), json(apres));
}

export const auditDe = (faitId) => db.prepare('SELECT * FROM layer_audit WHERE fait_id = ? ORDER BY le').all(faitId)
  .map((a) => ({ ...a, avant: JSON.parse(a.avant), apres: JSON.parse(a.apres) }));

// --- Journal des recherches ----------------------------------------------------------------

/** Une recherche : la question, les filtres déduits, les faits rendus, sa durée. Rend son identifiant. */
export function journaliserRequete({ par = null, origine = 'ak', question = '', texte = '', filtres = {}, faits = [], duree_ms = null }) {
  const id = randomUUID();
  db.prepare('INSERT INTO layer_requetes (id, le, par, origine, question, texte, filtres, faits, nombre, duree_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, maintenant(), par ? String(par).toLowerCase() : null, origine, String(question || '').slice(0, 500), String(texte || '').slice(0, 500), json(filtres), json(faits), faits.length, duree_ms);
  return id;
}

/** Le fait que la réponse a cité, pour l'évaluation. */
export function noterCites(requeteId, faitIds = []) {
  if (!requeteId) return;
  db.prepare('UPDATE layer_requetes SET cites = ? WHERE id = ?').run(json([...new Set(faitIds)]), requeteId);
}

export const requetesDepuis = (depuisIso) => db.prepare('SELECT * FROM layer_requetes WHERE le >= ? ORDER BY le DESC').all(depuisIso)
  .map((r) => ({ ...r, filtres: JSON.parse(r.filtres || '{}'), faits: JSON.parse(r.faits || '[]'), cites: JSON.parse(r.cites || '[]') }));

/** Les deux seuils du chantier Postgres, mesurés : recherche lente (p95 sur 7 jours) ou trop de faits. */
export function alertePostgres({ maintenantD = new Date() } = {}) {
  const depuis = new Date(maintenantD.getTime() - 7 * 86400000).toISOString();
  const durees = db.prepare('SELECT duree_ms FROM layer_requetes WHERE le >= ? AND duree_ms IS NOT NULL ORDER BY duree_ms').all(depuis).map((r) => r.duree_ms);
  const p95 = durees.length ? durees[Math.min(durees.length - 1, Math.floor(durees.length * 0.95))] : null;
  const faits = db.prepare("SELECT COUNT(*) AS n FROM records WHERE entity = 'CerveauFait'").get().n;
  return { p95_ms: p95, faits, lent: p95 != null && p95 > SEUIL_RECHERCHE_MS, trop: faits > SEUIL_FAITS, declenche: (p95 != null && p95 > SEUIL_RECHERCHE_MS) || faits > SEUIL_FAITS };
}
