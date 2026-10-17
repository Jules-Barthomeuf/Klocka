// Haka : les exécutions des compétences (17 oct. 2026, Jules). Une exécution est
// un lancement : la compétence et SA VERSION PUBLIÉE au moment du lancement
// (figée pour toute l'exécution, même si une nouvelle version sort entre-temps),
// ce qui l'a déclenchée, le dossier, les sources actives et éteintes, les outils
// appelés, le coût, la durée, le résultat. Chaque tâche du moteur rattachée à
// une compétence a la sienne ; chaque proposition de la file en porte l'identifiant,
// ce qui permet de remonter d'une proposition (ou d'un rejet) à la version qui l'a produite.

import { randomUUID } from 'node:crypto';
import db, { Records } from '../db.js';
import { installer } from './schema.js';
import { publiee } from './competences.js';

installer();

const maintenant = () => new Date().toISOString();
const json = (v, repli) => { try { return JSON.parse(v); } catch { return repli; } };
/** Les coûts sont mesurés en dollars (llm-couts) ; l'écran les donne en euros, au taux fixe ci-dessous (approximation assumée). */
export const EUR_PAR_USD = 0.92;

const STATUT = { en_attente: 'en_attente', differee: 'en_attente', en_cours: 'en_cours', en_attente_validation: 'a_valider', en_pause: 'en_pause', faite: 'faite', echec: 'echec', annulee: 'annulee' };

const lire = (r) => (r ? {
  ...r, entrees: json(r.entrees, {}), sources_actives: json(r.sources_actives, []), sources_eteintes: json(r.sources_eteintes, []),
  outils_appeles: json(r.outils_appeles, []), resultat: json(r.resultat, null), cout_eur: Math.round(r.cout_usd * EUR_PAR_USD * 10000) / 10000,
} : null);

/** Ouvre l'exécution d'une tâche (une seule par tâche). La version publiée est lue ici, une fois pour toutes. */
export function ouvrir(tache, { competence, declencheur = 'automatique', lance_par = 'automatisme', entrees = {} } = {}) {
  if (!competence) return null;
  const deja = db.prepare('SELECT * FROM haka_executions WHERE tache_id = ?').get(tache.id);
  if (deja) return lire(deja);
  let version = null;
  try { version = publiee(competence)?.version ?? null; } catch { /* la compétence n'est pas (encore) en base */ }
  const charge = tache.charge || {};
  const id = randomUUID();
  db.prepare('INSERT INTO haka_executions (id, tache_id, competence, version, declencheur, lance_par, dossier, entrees, sources_actives, sources_eteintes, statut, cree_le) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, tache.id, competence, version, declencheur, lance_par, tache.dossier || null, JSON.stringify(entrees), JSON.stringify(charge.sources || []), JSON.stringify(charge.sources_eteintes || []), 'en_attente', maintenant());
  return lire(db.prepare('SELECT * FROM haka_executions WHERE id = ?').get(id));
}

/** Aligne l'exécution sur l'état de sa tâche : statut, coût, durée, dossier. */
export function synchroniser(tacheId) {
  const e = db.prepare('SELECT * FROM haka_executions WHERE tache_id = ?').get(tacheId);
  if (!e) return null;
  const t = db.prepare('SELECT * FROM haka_taches WHERE id = ?').get(tacheId);
  if (!t) return null;
  db.prepare('UPDATE haka_executions SET statut = ?, cout_usd = ?, duree_s = ?, dossier = COALESCE(dossier, ?) WHERE id = ?')
    .run(STATUT[t.etat] || t.etat, t.cout_usd || 0, t.duree_ms != null ? Math.round(t.duree_ms / 100) / 10 : null, t.dossier || null, e.id);
  return e.id;
}

export const parTache = (tacheId) => lire(db.prepare('SELECT * FROM haka_executions WHERE tache_id = ?').get(tacheId));
export const executionDe = (id) => lire(db.prepare('SELECT * FROM haka_executions WHERE id = ?').get(id));

/** Garde la trace d'un appel d'outil : entrée, sortie résumée, durée. */
export function noterOutil(tacheId, { outil, entree = null, sortie = null, duree_ms = null, refuse = false }) {
  const e = db.prepare('SELECT id, outils_appeles FROM haka_executions WHERE tache_id = ?').get(tacheId);
  if (!e) return false;
  const liste = json(e.outils_appeles, []);
  liste.push({ outil, entree: entree == null ? null : String(entree).slice(0, 240), sortie: sortie == null ? null : String(sortie).slice(0, 400), duree_ms, refuse: !!refuse, le: maintenant() });
  db.prepare('UPDATE haka_executions SET outils_appeles = ? WHERE id = ?').run(JSON.stringify(liste.slice(-60)), e.id);
  return true;
}

export const lister = ({ competence = null, limite = 30 } = {}) =>
  db.prepare(`SELECT * FROM haka_executions ${competence ? 'WHERE competence = ?' : ''} ORDER BY cree_le DESC LIMIT ?`).all(...(competence ? [competence, limite] : [limite])).map(lire);

/** La trace d'une exécution : ses pas, ses outils, ses sorties (propositions) et ce qu'on en a décidé. */
export function trace(id) {
  const e = executionDe(id);
  if (!e) return null;
  const etapes = e.tache_id ? db.prepare('SELECT nom, externe, etat, erreur, debut_le, fin_le FROM haka_etapes WHERE tache_id = ? ORDER BY ordre').all(e.tache_id) : [];
  const propositions = Records.list('HakaProposition').filter((p) => p.execution_id === id || (e.tache_id && p.tache_id === e.tache_id))
    .map((p) => ({ id: p.id, type: p.type, titre: p.titre, etat: p.etat, motif_rejet: p.motif_rejet || null, decidee_par: p.decidee_par || null, decidee_le: p.decidee_le || null }));
  return { ...e, etapes, propositions };
}

const depuis = (jours) => new Date(Date.now() - jours * 86400000).toISOString();

/** Usage, rejets et coût d'une compétence sur `jours` jours ; ses rejets récents avec motif et ses corrections humaines. */
export function stats(competence, { jours = 30 } = {}) {
  const lignes = db.prepare('SELECT id, tache_id, cout_usd FROM haka_executions WHERE competence = ? AND cree_le >= ?').all(competence, depuis(jours));
  const ids = new Set(lignes.map((l) => l.id));
  const taches = new Set(lignes.map((l) => l.tache_id).filter(Boolean));
  const props = Records.list('HakaProposition').filter((p) => ids.has(p.execution_id) || taches.has(p.tache_id));
  const rejetees = props.filter((p) => p.etat === 'rejetee');
  const corrigees = props.filter((p) => p.etat === 'modifiee' || (p.etat === 'validee' && p.charge_finale));
  const decidees = props.filter((p) => ['validee', 'modifiee', 'rejetee'].includes(p.etat));
  const cout = lignes.reduce((n, l) => n + (l.cout_usd || 0), 0);
  return {
    executions: lignes.length,
    rejets: rejetees.length,
    part_rejets: decidees.length ? Math.round((rejetees.length / decidees.length) * 100) : 0,
    cout_moyen_eur: lignes.length ? Math.round((cout / lignes.length) * EUR_PAR_USD * 10000) / 10000 : 0,
    rejets_recents: rejetees.sort((a, b) => String(b.decidee_le || '').localeCompare(String(a.decidee_le || ''))).slice(0, 15)
      .map((p) => ({ id: p.id, titre: p.titre, motif: p.motif_rejet || null, par: p.decidee_par || null, le: p.decidee_le || null, dossier: p.dossier || null })),
    corrections: corrigees.sort((a, b) => String(b.decidee_le || '').localeCompare(String(a.decidee_le || ''))).slice(0, 15)
      .map((p) => ({ id: p.id, titre: p.titre, par: p.decidee_par || null, le: p.decidee_le || null, dossier: p.dossier || null })),
  };
}

/* ------------------------- les tests d'un brouillon ------------------------- */

export function noterTest({ competence, dossier, brouillon_le = null, comparaison }) {
  const id = randomUUID();
  db.prepare('INSERT INTO haka_tests (id, competence, dossier, brouillon_le, comparaison, cree_le) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, competence, dossier, brouillon_le, JSON.stringify(comparaison), maintenant());
  return id;
}
export const testsDe = (competence, { brouillon_le = null } = {}) =>
  db.prepare(`SELECT * FROM haka_tests WHERE competence = ? ${brouillon_le ? 'AND brouillon_le = ?' : ''} ORDER BY cree_le DESC LIMIT 60`)
    .all(...(brouillon_le ? [competence, brouillon_le] : [competence])).map((t) => ({ ...t, comparaison: json(t.comparaison, {}) }));
