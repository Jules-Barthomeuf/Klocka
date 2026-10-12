// Off-market, mode Simple : les jugements du score « Zone » (11 oct. 2026).
// Un clic (Intéressant, Pas intéressant, À revoir), puis pourquoi, en texte
// libre ou dicté. L'IA lit le texte et en tire les raisons (raisons.js) ; le
// jugement garde les caractéristiques du point à cet instant, la version du
// score et le score affichés. Un point se rejuge : tout est gardé, le dernier
// fait foi. Réservé à l'équipe Klocka ; rien n'est partagé avec le mode Avancé.

import { Records } from '../../db.js';
import { invokeLLM } from '../../llm.js';
import { mesurer } from '../../llm-couts.js';
import { COMMERCE } from '../simple.js';
import { CONFIG } from './score.js';
import { contexteVille, zoneFeatures } from './features.js';
import { JUGEMENT, ajusterApresJugement, modeleActif, scorer } from './modele.js';
import { hasard } from './logistique.js';
import { RAISONS, RAISONS_VISUELLES, VERDICTS, raisonsValides } from './raisons.js';

export const EXEMPLE = 'ZoneExemple';
const maintenant = () => new Date().toISOString();

// Le contexte d'une ville (grille, grande rue) se calcule une fois, puis se garde tant que la ville n'a pas changé.
const contextes = new Map();
function contexteDe(villeId) {
  const commerces = Records.filter(COMMERCE, { ville_id: villeId });
  const ville = Records.get('Ville', villeId);
  const empreinte = `${commerces.length}:${ville?.updated_date || ''}`;
  const deja = contextes.get(villeId);
  if (deja?.empreinte === empreinte) return deja;
  const c = { empreinte, commerces, ctx: contexteVille(ville, commerces, { naf_exclus: CONFIG.naf_exclus, sections_cible: CONFIG.sections_cible }), scores: null };
  contextes.set(villeId, c);
  return c;
}

/** Oublie le contexte d'une ville : un commerce a changé sans que leur nombre change (une rue notée). */
export const oublierContexte = (villeId) => contextes.delete(villeId);

/** Les caractéristiques d'un commerce maintenant. */
export function featuresDuCommerce(c) {
  return zoneFeatures(c, contexteDe(c.ville_id).ctx);
}

/** Les scores de tous les commerces d'une ville par la version active : Map id → { score, raisons, version }. */
export function scoresDeLaVille(villeId) {
  const c = contexteDe(villeId);
  const m = modeleActif();
  const cle = `${m.id}:${m.updated_date || ''}`;
  if (c.scores?.cle === cle) return c.scores.parId;
  const parId = new Map(c.commerces.map((x) => [x.id, scorer(zoneFeatures(x, c.ctx), m)]));
  c.scores = { cle, parId };
  return parId;
}

/** Le dernier jugement de chaque point d'une ville : Map point_id → jugement. */
export function derniersJugements(villeId) {
  const dernier = new Map();
  for (const j of Records.filter(JUGEMENT, { ville_id: villeId })) {
    const d = dernier.get(j.point_id);
    if (!d || String(j.created_at) > String(d.created_at)) dernier.set(j.point_id, j);
  }
  return dernier;
}

const SCHEMA = {
  type: 'object',
  properties: {
    raisons: { type: 'array', items: { type: 'string', enum: Object.keys(RAISONS) }, description: 'Les raisons que le texte donne vraiment, aucune inventée.' },
  },
  required: ['raisons'],
};

/** Pure : la consigne qui tire les raisons d'un commentaire libre. */
export const consigneLecture = (texte, verdict) => `Un membre de l'équipe Klocka (investissement en murs commerciaux) a jugé l'emplacement d'un commerce : ${VERDICTS[verdict] || verdict}.
Il a expliqué pourquoi, librement : « ${texte} »
Parmi ces raisons, lesquelles son texte donne-t-il vraiment ? N'en invente aucune ; aucune si le texte n'en dit rien.
${Object.entries(RAISONS).map(([k, v]) => `- ${k} : ${v}`).join('\n')}`;

/** Les raisons d'un commentaire, lues par le modèle. */
export async function lireCommentaire(texte, verdict, { invoquer = invokeLLM } = {}) {
  if (!String(texte || '').trim()) return [];
  const { resultat } = await mesurer({ operation: 'jugement zone' }, () => invoquer({ prompt: consigneLecture(texte, verdict), response_json_schema: SCHEMA, effort: 'low', max_tokens: 400 }));
  return raisonsValides(resultat?.raisons);
}

/**
 * Enregistre un jugement. Les caractéristiques sont gardées telles qu'au
 * moment du clic ; la version à règles bouge ses poids ; un jugement qui parle
 * de la rue telle qu'on la voit devient un exemple pour la revue Street View.
 */
export async function enregistrerJugement({ point_id, user, verdict, commentaire = '', score_affiche = null, model_version = null }, { lire = lireCommentaire } = {}) {
  if (!VERDICTS[verdict]) return { ok: false, error: 'Verdict inconnu.' };
  const c = Records.get(COMMERCE, point_id);
  if (!c) return { ok: false, error: 'Commerce introuvable.' };
  const texte = String(commentaire || '').trim().slice(0, 2000);
  if (verdict !== 'a_revoir' && texte.length < 3) return { ok: false, error: 'Dites en quelques mots pourquoi.' };
  const raisons = texte ? raisonsValides(await lire(texte, verdict).catch(() => [])) : [];
  const j = Records.create(JUGEMENT, {
    point_id, siret: c.siret || null, ville_id: c.ville_id, user_id: user || null, verdict, raisons, commentaire: texte || null,
    features_snapshot: featuresDuCommerce(c), model_version: model_version ?? null, score_affiche: Number.isFinite(Number(score_affiche)) ? Number(score_affiche) : null, created_at: maintenant(),
  });
  if (verdict !== 'a_revoir') ajusterApresJugement(j);
  if (verdict !== 'a_revoir' && raisons.some((r) => RAISONS_VISUELLES.includes(r))) {
    Records.create(EXEMPLE, { jugement_id: j.id, point_id, adresse: c.adresse, ville: c.ville || null, lat: c.lat ?? null, lon: c.lon ?? null, verdict, raisons: raisons.filter((r) => RAISONS_VISUELLES.includes(r)), commentaire: texte, created_at: j.created_at });
  }
  return { ok: true, jugement: j };
}

/**
 * Pure : l'ordre de la file « À juger » : d'abord les points où le score
 * hésite (entre 40 et 60, le plus près de 50 d'abord), puis 10 % des points
 * faibles tirés au hasard (pour que le modèle apprenne aussi là où il croit
 * ne rien trouver), puis le reste, du meilleur score au plus faible.
 */
export function ordonnerAJuger(points, { graine = 1, bas = 40, haut = 60 } = {}) {
  const avecScore = points.filter((p) => p.score != null);
  const incertains = avecScore.filter((p) => p.score >= bas && p.score <= haut).sort((a, b) => Math.abs(a.score - 50) - Math.abs(b.score - 50));
  const faibles = avecScore.filter((p) => p.score < bas);
  const r = hasard(graine);
  const melange = [...faibles];
  for (let i = melange.length - 1; i > 0; i -= 1) { const j = Math.floor(r() * (i + 1)); [melange[i], melange[j]] = [melange[j], melange[i]]; }
  const exploration = melange.slice(0, Math.ceil(faibles.length * 0.1));
  const pris = new Set([...incertains, ...exploration].map((p) => p.id));
  const reste = avecScore.filter((p) => !pris.has(p.id)).sort((a, b) => b.score - a.score);
  return [...incertains, ...exploration, ...reste];
}

/** La file « À juger » d'une ville : les points jamais jugés, ou « À revoir ». */
export function fileAJuger(villeId, { graine = Date.now() % 100000, limite = 200 } = {}) {
  const scores = scoresDeLaVille(villeId);
  const juges = derniersJugements(villeId);
  const points = [...scores].filter(([id]) => !juges.has(id) || juges.get(id).verdict === 'a_revoir').map(([id, s]) => ({ id, score: s.score, version: s.version }));
  return ordonnerAJuger(points, { graine }).slice(0, limite);
}

/** Pour la carte et la liste : le score, ses raisons, la version et le dernier jugement d'un point. */
export function zoneDesCommerces(villeId) {
  const scores = scoresDeLaVille(villeId);
  const juges = derniersJugements(villeId);
  const out = new Map();
  for (const [id, s] of scores) {
    const j = juges.get(id);
    out.set(id, { score_zone: s.score, raisons_zone: s.raisons, version_zone: s.version, jugement_zone: j ? { verdict: j.verdict, commentaire: j.commentaire, par: j.user_id, le: j.created_at } : null });
  }
  return out;
}
