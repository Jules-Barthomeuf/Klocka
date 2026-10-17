// Haka : le moteur de tâches (17 oct. 2026, Jules).
//
// Sur le modèle de server/layer-taches.js : une tâche est une ligne en base,
// reprise au démarrage, un seul consommateur, trois essais. Ce qui change :
// une tâche est découpée en PAS idempotents (`haka_etapes`), chacun avec sa
// clé unique. Un redéploiement de Render (une minute de coupure à chaque push)
// reprend la tâche à son dernier pas au lieu de la perdre.
//
// Un pas « externe » agit vers l'extérieur (un mail part, Monday s'écrit) ou
// engage une décision humaine. Il n'est JAMAIS exécuté par la file elle-même ni
// rejoué à la reprise : seule la validation dans « À valider » l'exécute
// (`executerExterne`). Un pas externe surpris « en cours » par une coupure
// passe `incertaine`, la tâche `en_pause`, et Jules est prévenu : on vérifie à
// la main plutôt que d'envoyer deux fois.

import { randomUUID } from 'node:crypto';
import db from '../db.js';
import { installer } from './schema.js';
import { ouvrir as ouvrirExecution, synchroniser } from './executions.js';

installer();

export const ESSAIS_MAX = 3;
// Sous `node --test`, une tâche ne part pas seule (le test appelle `tourner()`) ;
// dans le bac à sable (qui pose aussi NODE_TEST_CONTEXT), elle part.
const AUTO = !process.env.NODE_TEST_CONTEXT || !!process.env.KLOCKA_BAC_A_SABLE;
const maintenant = () => new Date().toISOString();
const competences = new Map();
let enCours = null;
let minuterie = null;

/**
 * Déclare une compétence : ses pas, dans l'ordre.
 * @param {string} type
 * @param {{version?: string, etapes: Array<{nom: string, externe?: boolean, run: (ctx: object) => Promise<object|void>}>}} def
 *   `run(ctx)` reçoit `{ tache, charge, resultats, user }` ; il peut rendre
 *   `{ fin: true }` (les pas suivants sont sautés), `{ sauter: [noms] }`,
 *   `{ attendre: 'validation', proposition_id }` (la tâche s'arrête devant le pas externe suivant)
 *   ou `{ differer: iso }` (la tâche repart plus tard, le pas sera rejoué).
 */
export function enregistrer(type, { version = '1', etapes, surRejet = null, competence = null }) {
  if (!Array.isArray(etapes) || !etapes.length) throw new Error(`Compétence ${type} : aucun pas`);
  competences.set(type, { version: String(version), etapes, surRejet, competence });
}

/** Ce qu'une compétence fait quand sa proposition est rejetée (écarter un mail préparé, par exemple). */
export async function surRejet(tacheId, proposition, user) {
  const t = tacheAJour(tacheId);
  const def = t && competences.get(t.type);
  if (def?.surRejet) await def.surRejet(t, proposition, user);
}
export const competenceDe = (type) => competences.get(type) || null;

const lire = (t) => (t ? { ...t, charge: JSON.parse(t.charge || '{}') } : null);
const majTache = (id, champs) => {
  const cles = Object.keys(champs);
  db.prepare(`UPDATE haka_taches SET ${cles.map((k) => `${k} = @${k}`).join(', ')}, maj_le = @maj_le WHERE id = @id`).run({ ...champs, maj_le: maintenant(), id });
  // L'exécution de la compétence suit l'état de sa tâche.
  if ('etat' in champs || 'dossier' in champs) { try { synchroniser(id); } catch { /* la trace ne bloque jamais la tâche */ } }
};
const majEtape = (id, champs) => {
  const cles = Object.keys(champs);
  db.prepare(`UPDATE haka_etapes SET ${cles.map((k) => `${k} = @${k}`).join(', ')} WHERE id = @id`).run({ ...champs, id });
};
export const etapesDe = (tacheId) => db.prepare('SELECT * FROM haka_etapes WHERE tache_id = ? ORDER BY ordre').all(tacheId);

/** Met une tâche en file, avec ses pas. Une tâche vivante de même clé n'est pas doublée (elle est rendue). */
export function enfiler(type, charge = {}, { cle = null, pour = null, dossier = null, apres = null, lancer = AUTO } = {}) {
  const def = competences.get(type);
  if (!def) throw new Error(`Compétence inconnue : ${type}`);
  if (cle) {
    const deja = db.prepare("SELECT * FROM haka_taches WHERE cle = ? AND etat NOT IN ('faite', 'echec', 'annulee')").get(cle);
    if (deja) return lire(deja);
  }
  const id = randomUUID();
  const t = { id, type, cle, charge: JSON.stringify(charge || {}), etat: 'en_attente', etape: def.etapes[0].nom, pour, dossier, competence: type, version: def.version, essais: 0, apres, cree_le: maintenant(), maj_le: maintenant() };
  db.transaction(() => {
    db.prepare('INSERT INTO haka_taches (id, type, cle, charge, etat, etape, pour, dossier, competence, version, essais, apres, cree_le, maj_le) VALUES (@id, @type, @cle, @charge, @etat, @etape, @pour, @dossier, @competence, @version, @essais, @apres, @cree_le, @maj_le)').run(t);
    const ins = db.prepare('INSERT INTO haka_etapes (id, tache_id, ordre, nom, externe, cle, etat, essais) VALUES (?, ?, ?, ?, ?, ?, ?, 0)');
    def.etapes.forEach((e, i) => ins.run(randomUUID(), id, i, e.nom, e.externe ? 1 : 0, `${id}:${e.nom}`, 'a_faire'));
  })();
  // Une tâche d'une compétence a son exécution : la version publiée y est figée.
  if (def.competence) { try { ouvrirExecution({ ...t, charge }, { competence: def.competence, declencheur: declencheurDe(type), lance_par: pour || 'automatisme', entrees: { cle } }); } catch (e) { console.warn(`[haka] exécution non ouverte : ${e?.message || e}`); } }
  if (lancer) setImmediate(() => tourner().catch(() => {}));
  return lire(t);
}

const declencheurDe = (type) => ({ fiche_recue: 'mail_fiche_recue', relances_matin: 'planifie', relance_mail: 'planifie', demande_equipe: 'mail_sourcing' })[type] || 'automatique';

const prochaine = () => db.prepare("SELECT * FROM haka_taches WHERE etat = 'en_attente' AND (apres IS NULL OR apres <= ?) ORDER BY cree_le LIMIT 1").get(maintenant());

/** Traite les tâches une à une, jusqu'à ce qu'il n'y en ait plus de prête. Un tour déjà en cours est attendu, pas doublé. */
export function tourner() {
  if (enCours) return enCours;
  enCours = (async () => {
    for (let t = prochaine(); t; t = prochaine()) {
      if (!competences.has(t.type)) { majTache(t.id, { etat: 'echec', erreur: `Compétence inconnue : ${t.type}` }); continue; }
      await avancer(lire(t), { declencheur: 'file' });
    }
  })().finally(() => { enCours = null; });
  return enCours;
}

const sauterRestants = (tacheId, apartirDe) => db.prepare("UPDATE haka_etapes SET etat = 'sautee' WHERE tache_id = ? AND ordre > ? AND etat = 'a_faire'").run(tacheId, apartirDe);

/**
 * Fait avancer une tâche pas à pas. Depuis la file (`declencheur: 'file'`), elle
 * s'arrête devant un pas externe. Depuis une validation, elle repart après lui.
 */
export async function avancer(tache, { declencheur = 'file', user = null } = {}) {
  const def = competences.get(tache.type);
  majTache(tache.id, { etat: 'en_cours', essais: tache.essais + (declencheur === 'file' ? 1 : 0), erreur: null });
  const debut = Date.now();
  const { mesurer } = await import('../llm-couts.js');
  const resultats = {};
  // L'état d'un pas se relit au moment de l'exécuter : un pas précédent a pu en sauter.
  const noms = etapesDe(tache.id).map((x) => x.nom);
  const lireEtape = (nom) => db.prepare('SELECT * FROM haka_etapes WHERE tache_id = ? AND nom = ?').get(tache.id, nom);
  for (const nom of noms) {
    const e = lireEtape(nom);
    if (e.etat === 'faite' || e.etat === 'sautee') { if (e.resultat) resultats[e.nom] = JSON.parse(e.resultat); continue; }
    if (e.etat === 'incertaine') { majTache(tache.id, { etat: 'en_pause', etape: e.nom }); return; }
    const pas = def.etapes.find((x) => x.nom === e.nom);
    if (!pas) { majTache(tache.id, { etat: 'echec', erreur: `Pas inconnu : ${e.nom}` }); return; }
    if (pas.externe) {
      // Jamais depuis la file : la validation seule l'exécute.
      majTache(tache.id, { etat: 'en_attente_validation', etape: e.nom });
      return;
    }
    majEtape(e.id, { etat: 'en_cours', debut_le: maintenant() });
    majTache(tache.id, { etape: e.nom });
    try {
      const { resultat, consommation } = await mesurer(
        { operation: 'haka', groupe: tache.id, sur: tache.dossier, par: tache.pour, libelle: `${tache.type}:${e.nom}` },
        () => pas.run({ tache: tacheAJour(tache.id), charge: tache.charge, resultats, user }),
      );
      const r = resultat || {};
      db.prepare('UPDATE haka_taches SET cout_usd = cout_usd + ?, maj_le = ? WHERE id = ?').run(consommation?.cout || 0, maintenant(), tache.id);
      if (r.differer) {
        majEtape(e.id, { etat: 'a_faire' });
        majTache(tache.id, { etat: 'differee', apres: r.differer, etape: e.nom });
        return;
      }
      majEtape(e.id, { etat: 'faite', resultat: JSON.stringify(r), fin_le: maintenant(), erreur: null });
      resultats[e.nom] = r;
      if (Array.isArray(r.sauter) && r.sauter.length) {
        db.prepare(`UPDATE haka_etapes SET etat = 'sautee' WHERE tache_id = ? AND etat = 'a_faire' AND nom IN (${r.sauter.map(() => '?').join(',')})`).run(tache.id, ...r.sauter);
      }
      // Le dossier ou le propriétaire peuvent n'être connus qu'après le premier pas.
      const patch = {};
      if (r.dossier && !tache.dossier) { patch.dossier = r.dossier; tache.dossier = r.dossier; }
      if (r.pour !== undefined && !tache.pour) { patch.pour = r.pour; tache.pour = r.pour; }
      if (Object.keys(patch).length) majTache(tache.id, patch);
      if (r.fin) { sauterRestants(tache.id, e.ordre); majTache(tache.id, { etat: 'faite', finie_le: maintenant(), duree_ms: Date.now() - debut }); return; }
      if (r.attendre === 'validation') { majTache(tache.id, { etat: 'en_attente_validation', etape: noms[noms.indexOf(nom) + 1] || nom }); return; }
    } catch (err) {
      const essais = (e.essais || 0) + 1;
      const fini = tache.essais + 1 >= ESSAIS_MAX;
      majEtape(e.id, { etat: fini ? 'echec' : 'a_faire', essais, erreur: String(err?.message || err).slice(0, 500) });
      // 1 min, puis 5 min : une panne passagère d'un fournisseur se laisse passer.
      const apres = fini ? null : new Date(Date.now() + (tache.essais + 1 === 1 ? 60000 : 300000)).toISOString();
      majTache(tache.id, { etat: fini ? 'echec' : 'en_attente', erreur: String(err?.message || err).slice(0, 500), apres });
      return;
    }
  }
  majTache(tache.id, { etat: 'faite', finie_le: maintenant(), duree_ms: Date.now() - debut, etape: null });
}

/**
 * Exécute un pas externe, et un seul : appelé par la validation dans la file.
 * Déjà fait : rend le résultat gardé (idempotent). Ensuite la tâche repart
 * sur les pas suivants.
 */
export async function executerExterne(tacheId, nom, { user = null, charge = null } = {}) {
  const t = tacheAJour(tacheId);
  if (!t) throw new Error('Tâche introuvable');
  const def = competences.get(t.type);
  const e = etapesDe(tacheId).find((x) => x.nom === nom);
  if (!e || !def) throw new Error(`Pas introuvable : ${nom}`);
  if (e.etat === 'faite') return e.resultat ? JSON.parse(e.resultat) : {};
  if (e.etat !== 'a_faire' && e.etat !== 'incertaine') throw new Error(`Ce pas n'est pas à faire (${e.etat})`);
  const pas = def.etapes.find((x) => x.nom === nom);
  const resultats = {};
  for (const x of etapesDe(tacheId)) if (x.etat === 'faite' && x.resultat) resultats[x.nom] = JSON.parse(x.resultat);
  majEtape(e.id, { etat: 'en_cours', debut_le: maintenant(), essais: (e.essais || 0) + 1 });
  majTache(tacheId, { etat: 'en_cours', etape: nom });
  const { mesurer } = await import('../llm-couts.js');
  try {
    const { resultat, consommation } = await mesurer(
      { operation: 'haka', groupe: tacheId, sur: t.dossier, par: t.pour, libelle: `${t.type}:${nom}` },
      () => pas.run({ tache: t, charge: { ...t.charge, ...(charge || {}) }, resultats, user }),
    );
    const r = resultat || {};
    db.prepare('UPDATE haka_taches SET cout_usd = cout_usd + ?, maj_le = ? WHERE id = ?').run(consommation?.cout || 0, maintenant(), tacheId);
    majEtape(e.id, { etat: 'faite', resultat: JSON.stringify(r), fin_le: maintenant(), erreur: null });
    if (Array.isArray(r.sauter) && r.sauter.length) {
      db.prepare(`UPDATE haka_etapes SET etat = 'sautee' WHERE tache_id = ? AND etat = 'a_faire' AND nom IN (${r.sauter.map(() => '?').join(',')})`).run(tacheId, ...r.sauter);
    }
    if (r.fin) { sauterRestants(tacheId, e.ordre); majTache(tacheId, { etat: 'faite', finie_le: maintenant() }); return r; }
    await avancer(tacheAJour(tacheId), { declencheur: 'validation', user });
    return r;
  } catch (err) {
    // L'action n'est pas partie : le pas redevient à faire, la tâche attend de nouveau la validation.
    majEtape(e.id, { etat: 'a_faire', erreur: String(err?.message || err).slice(0, 500) });
    majTache(tacheId, { etat: 'en_attente_validation', erreur: String(err?.message || err).slice(0, 500) });
    throw err;
  }
}

/**
 * Au démarrage : ce qui était en cours repart. Un pas interne en cours est
 * rejoué ; un pas EXTERNE en cours devient incertain (l'action est peut-être
 * partie), la tâche se met en pause et Jules est prévenu.
 */
export async function reprendre() {
  const incertains = db.prepare("SELECT e.*, t.type, t.dossier FROM haka_etapes e JOIN haka_taches t ON t.id = e.tache_id WHERE e.etat = 'en_cours' AND e.externe = 1").all();
  for (const e of incertains) {
    majEtape(e.id, { etat: 'incertaine' });
    majTache(e.tache_id, { etat: 'en_pause', etape: e.nom });
    try {
      const { notifier } = await import('../notifications.js');
      const { SUPER_ADMINS } = await import('../acces-pages.js');
      notifier({ pour: SUPER_ADMINS[0], titre: 'Haka : une action est incertaine', texte: `Le serveur a redémarré pendant « ${e.nom} » (${e.type}). Vérifiez si elle est partie avant de la relancer.`, lien: `/AValider?tache=${e.tache_id}`, genre: 'haka', cle: `haka:incertaine:${e.id}` });
    } catch { /* la notification n'est pas vitale */ }
  }
  db.prepare("UPDATE haka_etapes SET etat = 'a_faire' WHERE etat = 'en_cours' AND externe = 0").run();
  const n = db.prepare("UPDATE haka_taches SET etat = 'en_attente', maj_le = ? WHERE etat = 'en_cours' AND id NOT IN (SELECT tache_id FROM haka_etapes WHERE etat = 'incertaine')").run(maintenant()).changes;
  if (!minuterie) { minuterie = setInterval(() => { tourner().catch(() => {}); }, 60000); minuterie.unref?.(); }
  setImmediate(() => tourner().catch(() => {}));
  return { reprises: n, incertaines: incertains.length };
}

/** Annule une tâche (proposition rejetée) : ses pas restants sont sautés. */
export function annuler(tacheId, motif = null) {
  db.prepare("UPDATE haka_etapes SET etat = 'sautee' WHERE tache_id = ? AND etat = 'a_faire'").run(tacheId);
  majTache(tacheId, { etat: 'annulee', erreur: motif ? `Rejetée : ${String(motif).slice(0, 300)}` : null, finie_le: maintenant() });
}

/** Lève la pause d'un pas incertain : Jules a vérifié, l'action n'était pas partie (ou on la relance). */
export function leverPause(tacheId, { reprendreLePas = true } = {}) {
  const e = etapesDe(tacheId).find((x) => x.etat === 'incertaine');
  if (!e) return false;
  majEtape(e.id, { etat: reprendreLePas ? 'a_faire' : 'faite', ...(reprendreLePas ? {} : { resultat: JSON.stringify({ verifie_a_la_main: true }), fin_le: maintenant() }) });
  majTache(tacheId, { etat: reprendreLePas ? 'en_attente_validation' : 'en_attente' });
  if (!reprendreLePas) setImmediate(() => tourner().catch(() => {}));
  return true;
}

export const tacheAJour = (id) => lire(db.prepare('SELECT * FROM haka_taches WHERE id = ?').get(id));
export const tache = tacheAJour;

/** Les tâches d'un type créées ce jour (pour le plafond). */
export function tachesDuJour(type, jour = maintenant().slice(0, 10)) {
  return db.prepare("SELECT COUNT(*) AS n FROM haka_taches WHERE type = ? AND substr(cree_le, 1, 10) = ? AND etat != 'annulee'").get(type, jour).n;
}

/** L'état de la file, pour l'écran et les tests. */
export function etatFile() {
  const lignes = db.prepare('SELECT etat, COUNT(*) AS n FROM haka_taches GROUP BY etat').all();
  return Object.fromEntries(lignes.map((l) => [l.etat, l.n]));
}

/** Les tâches récentes, pour le Suivi. */
export function tachesRecentes({ limite = 50 } = {}) {
  return db.prepare('SELECT * FROM haka_taches ORDER BY cree_le DESC LIMIT ?').all(limite).map(lire);
}

