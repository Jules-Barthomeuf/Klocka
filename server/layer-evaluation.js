// Le Layer, phase 8 (16 oct. 2026) : l'évaluation.
//
// Un banc de questions (`layer_evaluations`), chacune avec sa réponse attendue
// et les faits qui la portent, éditable depuis l'onglet Évaluation. Le banc se
// constitue à partir du journal des recherches et des questions de l'équipe ;
// `proposerBanc` en rédige un brouillon à partir des faits validés, que Jules
// relit (auteur « brouillon »).
//
// Une exécution (`layer_evaluations_runs`) par version (changement de
// consigne, de modèle d'embedding, de fusion) : pour chaque question, la
// recherche hybride telle qu'AK la fait ; le **rappel** = part des faits
// attendus présents dans les 10 rendus ; puis une réponse courte du modèle
// rapide sur ces faits, et la **citation correcte** = la réponse cite un fait
// attendu, ou un fait de la même source. On compare les deux dernières
// exécutions, et `regression()` dit si le rappel a baissé : pas de mise en
// production dans ce cas (`node server/layer-evaluation.js` sort en erreur).

import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import db, { Records } from './db.js';
import './layer-schema.js';
import { enfiler, enregistrer } from './layer-taches.js';

export const TAILLE_BANC = 30;
const MODELE_RAPIDE = 'claude-haiku-4-5';
const maintenant = () => new Date().toISOString();
const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const lireQ = (r) => (r ? { ...r, faits_attendus: JSON.parse(r.faits_attendus || '[]'), actif: !!r.actif } : null);
const lireRun = (r) => (r ? { ...r, resultats: JSON.parse(r.resultats || '[]') } : null);

// --- Le banc ---------------------------------------------------------------------------------

export const banc = ({ tous = false } = {}) => db.prepare(`SELECT * FROM layer_evaluations ${tous ? '' : 'WHERE actif = 1'} ORDER BY cree_le`).all().map(lireQ);
export const question = (id) => lireQ(db.prepare('SELECT * FROM layer_evaluations WHERE id = ?').get(id));

export function ajouter({ question: q, reponse_attendue = null, faits_attendus = [], auteur = null }) {
  const texte = String(q || '').trim();
  if (!texte) return { ok: false, error: 'Question vide.' };
  const id = randomUUID();
  db.prepare('INSERT INTO layer_evaluations (id, question, reponse_attendue, faits_attendus, auteur, cree_le, actif) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .run(id, texte.slice(0, 500), reponse_attendue ? String(reponse_attendue).slice(0, 1000) : null, JSON.stringify([...new Set(faits_attendus || [])]), auteur ? String(auteur).toLowerCase() : null, maintenant());
  return { ok: true, question: question(id) };
}

export function modifier(id, { question: q, reponse_attendue, faits_attendus, auteur }) {
  const avant = question(id);
  if (!avant) return { ok: false, error: 'Question introuvable.' };
  db.prepare('UPDATE layer_evaluations SET question = ?, reponse_attendue = ?, faits_attendus = ?, auteur = ? WHERE id = ?').run(
    q !== undefined ? String(q).trim().slice(0, 500) : avant.question,
    reponse_attendue !== undefined ? (reponse_attendue ? String(reponse_attendue).slice(0, 1000) : null) : avant.reponse_attendue,
    JSON.stringify(faits_attendus !== undefined ? [...new Set(faits_attendus)] : avant.faits_attendus),
    auteur !== undefined ? auteur : avant.auteur, id);
  return { ok: true, question: question(id) };
}

/** Retirée du banc (gardée en base, comme tout le reste). */
export function retirer(id) {
  if (!question(id)) return { ok: false, error: 'Question introuvable.' };
  db.prepare('UPDATE layer_evaluations SET actif = 0 WHERE id = ?').run(id);
  return { ok: true };
}

const SCHEMA_BANC = {
  type: 'object',
  properties: { questions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, reponse_attendue: { type: 'string' }, faits: { type: 'array', items: { type: 'string' } } }, required: ['question', 'reponse_attendue', 'faits'] } } },
  required: ['questions'],
};

/**
 * Un brouillon de banc : des questions que l'équipe pourrait poser, rédigées
 * à partir des faits validés (et des questions déjà posées au journal), chacune
 * avec sa réponse attendue et ses faits. À relire : auteur « brouillon ».
 */
export async function proposerBanc({ n = TAILLE_BANC, llm = null } = {}) {
  const faits = Records.list('CerveauFait').filter((f) => f.statut === 'valide').slice(-150);
  if (!faits.length) return { ok: false, error: 'Aucun fait validé : rien sur quoi poser des questions.' };
  const deja = db.prepare('SELECT question FROM layer_requetes WHERE question IS NOT NULL AND question != \'\' ORDER BY le DESC LIMIT 40').all().map((r) => r.question);
  const prompt = `Tu prépares le banc d'évaluation de la mémoire de Klocka (immobilier commercial). Écris ${n} questions qu'un analyste de l'équipe poserait vraiment à AK sur le passé (ce qui a été dit, décidé, promis, appris), variées (personnes, agences, villes, dossiers, règles), chacune avec sa réponse attendue en une phrase et les identifiants des faits qui la portent (sans le #). Uniquement des questions auxquelles les faits ci-dessous répondent.${deja.length ? `\nQuestions déjà posées par l'équipe, à reprendre en priorité si les faits y répondent :\n${deja.map((q) => `- ${q}`).join('\n')}` : ''}

FAITS VALIDÉS :
${faits.map((f) => `#${f.id} · ${f.type} : ${f.resume}`).join('\n')}`;
  let r;
  if (llm) r = await llm(prompt, SCHEMA_BANC);
  else {
    const { invokeLLM } = await import('./llm.js');
    const { mesurer } = await import('./llm-couts.js');
    r = (await mesurer({ operation: 'cerveau', libelle: 'banc' }, () => invokeLLM({ prompt, response_json_schema: SCHEMA_BANC, modele: MODELE_RAPIDE, max_tokens: 8000 }))).resultat;
  }
  const ids = new Set(faits.map((f) => f.id));
  const crees = [];
  for (const q of (r?.questions || []).slice(0, n)) {
    const attendus = (q.faits || []).map((x) => String(x).replace(/^#/, '')).filter((x) => ids.has(x));
    if (!attendus.length || !String(q.question || '').trim()) continue;
    crees.push(ajouter({ question: q.question, reponse_attendue: q.reponse_attendue, faits_attendus: attendus, auteur: 'brouillon' }).question);
  }
  return { ok: true, questions: crees };
}

// --- Les citations d'une réponse ----------------------------------------------------------

const motsPorteurs = (t) => [...new Set(norm(t).split(' ').filter((m) => m.length >= 4))];

/**
 * Pure : les faits qu'une réponse cite, parmi ceux qu'elle a reçus : la
 * majorité (60 %) des mots porteurs du résumé se retrouvent dans la réponse.
 */
export function faitsCites(reponse, faits) {
  const r = ` ${norm(reponse)} `;
  return (faits || []).filter((f) => { const m = motsPorteurs(f.resume); return m.length && m.filter((x) => r.includes(` ${x}`)).length / m.length >= 0.6; }).map((f) => f.id);
}

// --- L'exécution -------------------------------------------------------------------------------

const SCHEMA_REPONSE = { type: 'object', properties: { reponse: { type: 'string' }, cites: { type: 'array', items: { type: 'string' } } }, required: ['reponse', 'cites'] };

/** La version courante : le commit déployé (Render) ou local, et le modèle d'embedding. */
export function versionCourante() {
  let commit = (process.env.RENDER_GIT_COMMIT || '').slice(0, 7);
  if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'inconnu'; } }
  return commit;
}

/**
 * Une exécution du banc. `rechercher` et `repondre` : pour les tests. Rend le
 * run enregistré (rappel moyen, taux de citation correcte, détail par question).
 */
export async function executer({ note = null, version = null, rechercher = null, repondre = null } = {}) {
  const questions = banc();
  if (!questions.length) return { ok: false, error: 'Le banc est vide.' };
  const R = rechercher ? null : await import('./layer-recherche.js');
  const chercher = rechercher || ((q) => R.rechercher({ texte: q, limite: 10 }, { origine: 'evaluation' }));
  const sourceDe = (id) => Records.get('CerveauFait', id)?.source_id || null;
  const resultats = [];
  for (const q of questions) {
    const r = await chercher(q.question);
    const rendus = (r.faits || []).map((f) => f.id);
    const trouves = q.faits_attendus.filter((id) => rendus.includes(id));
    const rappel = q.faits_attendus.length ? trouves.length / q.faits_attendus.length : null;
    let cites = []; let reponse = null;
    if ((r.faits || []).length) {
      const prompt = `Réponds en deux phrases à la question, avec les seuls faits ci-dessous ; cite les identifiants des faits utilisés (sans le #). Si aucun ne répond, dis « rien dans l'Intelligence » et ne cite rien.\nQUESTION : ${q.question}\nFAITS :\n${r.faits.map((f) => `#${f.id} : ${f.resume}`).join('\n')}`;
      try {
        const rep = repondre ? await repondre(prompt, SCHEMA_REPONSE) : (await (await import('./llm-couts.js')).mesurer({ operation: 'cerveau', libelle: 'evaluation' }, async () => (await import('./llm.js')).invokeLLM({ prompt, response_json_schema: SCHEMA_REPONSE, modele: MODELE_RAPIDE, max_tokens: 800 }))).resultat;
        reponse = String(rep?.reponse || '').slice(0, 600);
        cites = (rep?.cites || []).map((x) => String(x).replace(/^#/, '')).filter((x) => rendus.includes(x));
      } catch { reponse = null; }
    }
    const sourcesAttendues = new Set(q.faits_attendus.map(sourceDe).filter(Boolean));
    const citation_ok = cites.some((id) => q.faits_attendus.includes(id) || sourcesAttendues.has(sourceDe(id)));
    resultats.push({ id: q.id, question: q.question, attendus: q.faits_attendus, rendus, trouves, rappel, cites, citation_ok, reponse });
  }
  const notes = resultats.filter((x) => x.rappel != null);
  const run = {
    id: randomUUID(), le: maintenant(), version: version || versionCourante(), note,
    resultats: JSON.stringify(resultats),
    rappel: notes.length ? Math.round((notes.reduce((t, x) => t + x.rappel, 0) / notes.length) * 1000) / 1000 : null,
    citation_ok: resultats.length ? Math.round((resultats.filter((x) => x.citation_ok).length / resultats.length) * 1000) / 1000 : null,
  };
  db.prepare('INSERT INTO layer_evaluations_runs (id, le, version, note, resultats, rappel, citation_ok) VALUES (@id, @le, @version, @note, @resultats, @rappel, @citation_ok)').run(run);
  return { ok: true, run: lireRun(db.prepare('SELECT * FROM layer_evaluations_runs WHERE id = ?').get(run.id)) };
}
enregistrer('evaluation', async ({ note }) => { const r = await executer({ note }); if (!r.ok) throw new Error(r.error); });
export const planifierEvaluation = (note = null) => enfiler('evaluation', { note }, { cle: 'evaluation' });

export const runs = ({ limite = 20 } = {}) => db.prepare('SELECT * FROM layer_evaluations_runs ORDER BY le DESC, rowid DESC LIMIT ?').all(limite).map(lireRun);

/** Les deux dernières exécutions côte à côte : par question, le rappel avant et après. */
export function comparer() {
  const [dernier, precedent] = runs({ limite: 2 });
  if (!dernier) return null;
  const avant = new Map((precedent?.resultats || []).map((x) => [x.id, x]));
  return {
    dernier: { id: dernier.id, le: dernier.le, version: dernier.version, note: dernier.note, rappel: dernier.rappel, citation_ok: dernier.citation_ok },
    precedent: precedent ? { id: precedent.id, le: precedent.le, version: precedent.version, note: precedent.note, rappel: precedent.rappel, citation_ok: precedent.citation_ok } : null,
    questions: dernier.resultats.map((x) => ({ id: x.id, question: x.question, rappel: x.rappel, rappel_avant: avant.get(x.id)?.rappel ?? null, citation_ok: x.citation_ok, citation_ok_avant: avant.get(x.id)?.citation_ok ?? null })),
    regression: regression(),
  };
}

/** Le rappel de la dernière exécution a-t-il baissé par rapport à la précédente ? */
export function regression() {
  const [dernier, precedent] = runs({ limite: 2 });
  return !!(dernier && precedent && dernier.rappel != null && precedent.rappel != null && dernier.rappel < precedent.rappel);
}

// `node server/layer-evaluation.js [note]` : une exécution ; sort en erreur si le rappel baisse (pas de mise en production).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await import('dotenv/config');
  const r = await executer({ note: process.argv[2] || 'ligne de commande' });
  if (!r.ok) { console.error(r.error); process.exit(1); }
  const c = comparer();
  console.log(`version ${r.run.version} · rappel ${r.run.rappel} · citation correcte ${r.run.citation_ok}${c?.precedent ? ` (avant : ${c.precedent.rappel} · ${c.precedent.citation_ok})` : ''}`);
  if (c?.regression) { console.error('Le rappel a baissé : pas de mise en production.'); process.exit(2); }
  process.exit(0);
}
