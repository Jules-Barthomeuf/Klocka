// Le Layer : les tâches de fond, en base (phase 2, 15 oct. 2026).
//
// Jusqu'ici l'extraction partait en promesse, et un redémarrage du serveur la
// perdait : la source restait « en cours » pour toujours. Une tâche est
// désormais une ligne de `layer_taches` : en_attente → en_cours → faite, ou
// échec après trois essais (avec un délai qui s'allonge). Au démarrage, ce qui
// était en cours repart (`reprendre`), sur le modèle de la lecture des pièces
// (server/deal/file-extraction.js, reprendreEnAttente).
//
// Une seule tâche à la fois : les quotas des modèles sont par clé, et l'ordre
// d'arrivée est celui qu'on attend. Une tâche porte une `cle` facultative :
// deux tâches de même clé ne peuvent pas attendre ensemble (une source n'est
// pas extraite deux fois en parallèle).

import { randomUUID } from 'node:crypto';
import db from './db.js';
import './layer-schema.js';

export const ESSAIS_MAX = 3;
// Sous le lanceur de tests (node --test), une tâche ne part pas seule : le test appelle `tourner()`. Aucun appel d'IA par surprise.
const AUTO = !process.env.NODE_TEST_CONTEXT;
const maintenant = () => new Date().toISOString();
const executants = new Map();
let enMarche = false;
let minuterie = null;

/** Ce qu'une tâche de ce type fait : `fn(charge)` rend une promesse. */
export function enregistrer(type, fn) { executants.set(type, fn); }

/** Met une tâche en file. Une tâche de même clé déjà en attente ou en cours n'est pas doublée. Rend la tâche. */
export function enfiler(type, charge = {}, { cle = null, lancer = AUTO } = {}) {
  if (cle) {
    const deja = db.prepare("SELECT * FROM layer_taches WHERE cle = ? AND etat IN ('en_attente', 'en_cours')").get(cle);
    if (deja) return deja;
  }
  const t = { id: randomUUID(), type, cle, charge: JSON.stringify(charge || {}), etat: 'en_attente', essais: 0, cree_le: maintenant(), maj_le: maintenant() };
  db.prepare('INSERT INTO layer_taches (id, type, cle, charge, etat, essais, cree_le, maj_le) VALUES (@id, @type, @cle, @charge, @etat, @essais, @cree_le, @maj_le)').run(t);
  if (lancer) setImmediate(tourner);
  return t;
}

const prochaine = () => db.prepare("SELECT * FROM layer_taches WHERE etat = 'en_attente' AND (apres IS NULL OR apres <= ?) ORDER BY cree_le LIMIT 1").get(maintenant());

/** Traite les tâches une à une, jusqu'à ce qu'il n'y en ait plus de prête. */
export async function tourner() {
  if (enMarche) return;
  enMarche = true;
  try {
    for (let t = prochaine(); t; t = prochaine()) {
      const fn = executants.get(t.type);
      if (!fn) { db.prepare("UPDATE layer_taches SET etat = 'echec', erreur = ?, maj_le = ? WHERE id = ?").run(`Type inconnu : ${t.type}`, maintenant(), t.id); continue; }
      db.prepare("UPDATE layer_taches SET etat = 'en_cours', essais = essais + 1, maj_le = ? WHERE id = ?").run(maintenant(), t.id);
      try {
        await fn(JSON.parse(t.charge || '{}'));
        db.prepare("UPDATE layer_taches SET etat = 'faite', erreur = NULL, maj_le = ? WHERE id = ?").run(maintenant(), t.id);
      } catch (e) {
        const essais = t.essais + 1;
        const fini = essais >= ESSAIS_MAX;
        // 1 min, puis 5 min : une panne passagère d'un fournisseur se laisse passer.
        const apres = fini ? null : new Date(Date.now() + (essais === 1 ? 60000 : 300000)).toISOString();
        db.prepare('UPDATE layer_taches SET etat = ?, erreur = ?, apres = ?, maj_le = ? WHERE id = ?').run(fini ? 'echec' : 'en_attente', String(e?.message || e).slice(0, 500), apres, maintenant(), t.id);
      }
    }
  } finally {
    enMarche = false;
  }
}

/** Au démarrage : ce qui était en cours repart en attente, puis la file tourne, et se relit chaque minute (les tâches différées). */
export function reprendre() {
  const n = db.prepare("UPDATE layer_taches SET etat = 'en_attente', maj_le = ? WHERE etat = 'en_cours'").run(maintenant()).changes;
  if (!minuterie) { minuterie = setInterval(() => { tourner().catch(() => {}); }, 60000); minuterie.unref?.(); }
  setImmediate(tourner);
  return n;
}

/** L'état de la file, pour l'écran et les tests. */
export function etatFile() {
  const lignes = db.prepare('SELECT etat, COUNT(*) AS n FROM layer_taches GROUP BY etat').all();
  return Object.fromEntries(lignes.map((l) => [l.etat, l.n]));
}

export const tache = (id) => db.prepare('SELECT * FROM layer_taches WHERE id = ?').get(id) || null;
