// Les tables de Haka (17 oct. 2026) : les tâches de fond et leurs pas, les exécutions des compétences et leurs tests.
//
// Une tâche est une suite de pas. Chaque pas a une clé unique : c'est elle qui
// garantit qu'un pas ne s'exécute pas deux fois, pas une relecture de JSON.
// Les propositions de la file « À valider », elles, sont des enregistrements
// JSON de la table `records` (HakaProposition) : volume faible, charge
// hétérogène, pas d'index nécessaire aujourd'hui.
//
// Réversible : `defaire()` supprime les deux tables.

import db from '../db.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS haka_taches (
    id          TEXT PRIMARY KEY,
    type        TEXT NOT NULL,
    cle         TEXT,
    charge      TEXT NOT NULL DEFAULT '{}',
    etat        TEXT NOT NULL,
    etape       TEXT,
    pour        TEXT,
    dossier     TEXT,
    competence  TEXT,
    version     TEXT,
    essais      INTEGER NOT NULL DEFAULT 0,
    erreur      TEXT,
    apres       TEXT,
    cout_usd    REAL NOT NULL DEFAULT 0,
    duree_ms    INTEGER,
    cree_le     TEXT NOT NULL,
    maj_le      TEXT NOT NULL,
    finie_le    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_haka_taches_etat ON haka_taches(etat, apres);
  CREATE INDEX IF NOT EXISTS idx_haka_taches_jour ON haka_taches(type, cree_le);

  CREATE TABLE IF NOT EXISTS haka_etapes (
    id          TEXT PRIMARY KEY,
    tache_id    TEXT NOT NULL,
    ordre       INTEGER NOT NULL,
    nom         TEXT NOT NULL,
    externe     INTEGER NOT NULL DEFAULT 0,
    cle         TEXT NOT NULL,
    etat        TEXT NOT NULL,
    essais      INTEGER NOT NULL DEFAULT 0,
    resultat    TEXT,
    erreur      TEXT,
    debut_le    TEXT,
    fin_le      TEXT
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_haka_etapes_cle ON haka_etapes(cle);
  CREATE INDEX IF NOT EXISTS idx_haka_etapes_tache ON haka_etapes(tache_id, ordre);

  -- Un lancement d'une compétence (17 oct. 2026) : la version publiée est figée pour toute l'exécution.
  CREATE TABLE IF NOT EXISTS haka_executions (
    id               TEXT PRIMARY KEY,
    tache_id         TEXT,
    competence       TEXT NOT NULL,
    version          INTEGER,
    declencheur      TEXT,
    lance_par        TEXT,
    dossier          TEXT,
    entrees          TEXT NOT NULL DEFAULT '{}',
    sources_actives  TEXT NOT NULL DEFAULT '[]',
    sources_eteintes TEXT NOT NULL DEFAULT '[]',
    outils_appeles   TEXT NOT NULL DEFAULT '[]',
    cout_usd         REAL NOT NULL DEFAULT 0,
    duree_s          REAL,
    statut           TEXT NOT NULL,
    resultat         TEXT,
    cree_le          TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_haka_exec_comp ON haka_executions(competence, cree_le);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_haka_exec_tache ON haka_executions(tache_id);

  -- Le test d'un brouillon sur un dossier : lecture seule, comparé à la version publiée.
  CREATE TABLE IF NOT EXISTS haka_tests (
    id          TEXT PRIMARY KEY,
    competence  TEXT NOT NULL,
    dossier     TEXT NOT NULL,
    brouillon_le TEXT,
    comparaison TEXT NOT NULL,
    cree_le     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_haka_tests_comp ON haka_tests(competence, cree_le);
`;

let installe = false;
export function installer() {
  if (installe) return;
  db.exec(SCHEMA);
  installe = true;
}

export function defaire() {
  db.exec('DROP TABLE IF EXISTS haka_tests; DROP TABLE IF EXISTS haka_executions; DROP TABLE IF EXISTS haka_etapes; DROP TABLE IF EXISTS haka_taches;');
  installe = false;
}
