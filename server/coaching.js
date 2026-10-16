// Le coach (16 oct. 2026, Jules : « le tuto ultra-ciblé : un mini-article de
// 2 min sur “comment négocier avec un DAF” après un appel où le gars n'a pas
// su répondre ; ou on dit à l'assistant “j'ai pas réussi à faire ça”, et le
// jour d'après : je t'ai préparé un petit quiz ! »).
//
// Un tuto naît de deux façons : une objection que l'appel n'a pas levée (lue
// par AK, server/prospection/appel.js), ou une demande de l'analyste (« Sur
// quoi as-tu bloqué ? »). Il est écrit pour lui, sur ce sujet précis, dans le
// contexte de Klocka ; une notification le prévient. Le lendemain matin, trois
// questions l'attendent pour ancrer ce qu'il a lu.

import { Records } from './db.js';

const ENTITE = 'TutoCoaching';
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const minuscule = (e) => String(e || '').trim().toLowerCase();

const SCHEMA = {
  type: 'object',
  properties: {
    titre: { type: 'string', description: "le titre du tuto, concret (« Répondre à “on ne travaille pas avec des investisseurs” »)" },
    accroche: { type: 'string', description: 'deux phrases : pourquoi ce moment bloque, et ce que le tuto apporte' },
    etapes: { type: 'array', items: { type: 'object', properties: { titre: { type: 'string' }, texte: { type: 'string', description: 'trois à cinq phrases, concrètes' } }, required: ['titre', 'texte'] }, description: 'trois ou quatre étapes' },
    phrases: { type: 'array', items: { type: 'string' }, description: 'deux à quatre phrases prêtes à dire, mot pour mot, au vouvoiement' },
    piege: { type: 'string', description: "l'erreur à éviter, en une ou deux phrases" },
    quiz: {
      type: 'array',
      description: 'trois questions à choix multiples sur ce tuto, pour le lendemain',
      items: { type: 'object', properties: { question: { type: 'string' }, choix: { type: 'array', items: { type: 'string' }, description: 'quatre réponses' }, bonne: { type: 'number', description: 'index de la bonne réponse, de 0 à 3' }, explication: { type: 'string' } }, required: ['question', 'choix', 'bonne'] },
    },
  },
  required: ['titre', 'etapes', 'quiz'],
};

/** Pure : le lendemain, 8 h à Paris (en UTC, approché à l'heure d'été/hiver par le décalage du jour). */
export function lendemainHuitHeures(maintenant = new Date()) {
  const jour = maintenant.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  const demain = new Date(new Date(`${jour}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);
  const decalage = Number(new Date(`${demain}T12:00:00Z`).toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false })) - 12;
  return new Date(`${demain}T${String(8 - decalage).padStart(2, '0')}:00:00Z`).toISOString();
}

/** Pure : le tuto lu par le modèle, nettoyé (quiz de trois questions valides au plus). */
export function nettoyerTuto(t = {}) {
  const txt = (v) => (typeof v === 'string' ? v.trim() : '');
  const quiz = (Array.isArray(t.quiz) ? t.quiz : [])
    .map((q) => ({ question: txt(q?.question), choix: (Array.isArray(q?.choix) ? q.choix : []).map(txt).filter(Boolean).slice(0, 4), bonne: Number(q?.bonne), explication: txt(q?.explication) || null }))
    .filter((q) => q.question && q.choix.length >= 2 && Number.isInteger(q.bonne) && q.bonne >= 0 && q.bonne < q.choix.length)
    .slice(0, 3);
  return {
    titre: txt(t.titre) || 'Un tuto pour toi',
    accroche: txt(t.accroche) || null,
    etapes: (Array.isArray(t.etapes) ? t.etapes : []).map((e) => ({ titre: txt(e?.titre), texte: txt(e?.texte) })).filter((e) => e.titre && e.texte).slice(0, 4),
    phrases: (Array.isArray(t.phrases) ? t.phrases : []).map(txt).filter(Boolean).slice(0, 4),
    piege: txt(t.piege) || null,
    quiz,
  };
}

/** Un tuto pour un analyste, sur un sujet ; le même sujet dans la semaine ne se refait pas. */
export async function creerTuto({ par, sujet, contexte = null, appel_id = null, source = 'demande', maintenant = new Date(), invoke = null }) {
  const qui = minuscule(par);
  const s = String(sujet || '').trim().slice(0, 300);
  if (!qui || s.length < 4) return { ok: false, error: 'Dites sur quoi vous avez bloqué.' };
  const semaine = new Date(maintenant.getTime() - 7 * 86400000).toISOString();
  const deja = Records.list(ENTITE).find((t) => t.par === qui && norm(t.sujet) === norm(s) && String(t.cree_le) > semaine);
  if (deja) return { ok: true, tuto: deja, deja: true };
  const { NOTE_KLOCKA } = await import('./klocka-nom.js');
  const prompt = `Tu es le coach commercial de Klocka. ${NOTE_KLOCKA} Les analystes de Klocka appellent des agents immobiliers (et parfois des propriétaires, des directeurs financiers d'enseignes, des banquiers) pour trouver des murs commerciaux loués à acheter pour leurs clients investisseurs.
Écris un tuto ultra-ciblé, qui se lit en deux minutes (environ 350 mots), pour un analyste qui a bloqué sur ce moment précis : « ${s} ».
${contexte ? `Ce qui s'est dit pendant l'appel : « ${String(contexte).slice(0, 600)} »\n` : ''}Concret, tutoiement pour l'analyste, phrases prêtes à dire au vouvoiement pour l'interlocuteur. Pas de jargon de manuel, pas de généralités : ce qu'il dit, ce qu'il demande, ce qu'il évite. Puis trois questions de quiz sur ce tuto, pour le lendemain.`;
  const { invokeLLM } = await import('./llm.js');
  const { mesurer } = await import('./llm-couts.js');
  const appeler = invoke || ((o) => invokeLLM(o));
  const { resultat } = await mesurer({ operation: 'tuto du coach', par: qui }, () => appeler({ prompt, response_json_schema: SCHEMA }));
  const t = nettoyerTuto(resultat || {});
  const tuto = Records.create(ENTITE, { par: qui, sujet: s, source, appel_id, ...t, cree_le: maintenant.toISOString(), quiz_dispo_le: t.quiz.length ? lendemainHuitHeures(maintenant) : null, lu_le: null, quiz_fait_le: null, score: null });
  try {
    const { notifier } = await import('./notifications.js');
    notifier({ pour: qui, titre: 'Un tuto de 2 minutes pour toi', texte: tuto.titre, lien: '/TableauDeBord', action: 'Lire', cle: `tuto-${tuto.id}` });
  } catch { /* sans notification, le Dashboard le montre quand même */ }
  return { ok: true, tuto };
}

/** Pure : ce qu'un analyste voit de ses tutos. */
export function etatDesTutos(tutos, maintenant = new Date()) {
  const n = maintenant.toISOString();
  return {
    a_lire: tutos.filter((t) => !t.lu_le).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))),
    quiz: tutos.filter((t) => t.quiz?.length && !t.quiz_fait_le && t.quiz_dispo_le && t.quiz_dispo_le <= n).sort((a, b) => String(a.quiz_dispo_le).localeCompare(String(b.quiz_dispo_le))),
    lus: tutos.filter((t) => t.lu_le).sort((a, b) => String(b.cree_le).localeCompare(String(a.cree_le))).slice(0, 10),
  };
}

export function mesTutos(user, maintenant = new Date()) {
  return etatDesTutos(Records.list(ENTITE).filter((t) => t.par === minuscule(user?.email)), maintenant);
}

const sien = (id, user) => { const t = Records.get(ENTITE, id); return t && t.par === minuscule(user?.email) ? t : null; };

export function marquerLu(id, user) {
  const t = sien(id, user);
  if (!t) return { ok: false, error: 'Tuto introuvable.' };
  return { ok: true, tuto: Records.update(ENTITE, id, { lu_le: t.lu_le || new Date().toISOString() }) };
}

/** Pure : le score d'un quiz et la correction de chaque question. */
export function corriger(quiz, reponses = []) {
  const corrections = quiz.map((q, i) => ({ juste: Number(reponses[i]) === q.bonne, bonne: q.bonne, explication: q.explication || null }));
  return { score: corrections.filter((c) => c.juste).length, sur: quiz.length, corrections };
}

export function repondreQuiz(id, user, reponses) {
  const t = sien(id, user);
  if (!t) return { ok: false, error: 'Tuto introuvable.' };
  if (!t.quiz?.length) return { ok: false, error: 'Pas de quiz pour ce tuto.' };
  const r = corriger(t.quiz, Array.isArray(reponses) ? reponses : []);
  Records.update(ENTITE, id, { quiz_fait_le: new Date().toISOString(), score: r.score, lu_le: t.lu_le || new Date().toISOString() });
  return { ok: true, ...r };
}

/** Le matin : « Je t'ai préparé un petit quiz ! », une notification par quiz devenu disponible. */
export async function prevenirQuiz(maintenant = new Date()) {
  const { notifier } = await import('./notifications.js');
  let n = 0;
  for (const t of Records.list(ENTITE).filter((x) => x.quiz?.length && !x.quiz_fait_le && !x.quiz_prevenu && x.quiz_dispo_le && x.quiz_dispo_le <= maintenant.toISOString())) {
    notifier({ pour: t.par, titre: "Je t'ai préparé un petit quiz !", texte: `Trois questions sur « ${t.titre} »`, lien: '/TableauDeBord', action: 'Jouer', cle: `quiz-${t.id}` });
    Records.update(ENTITE, t.id, { quiz_prevenu: true });
    n += 1;
  }
  return n;
}

export function planifier() {
  const tour = () => prevenirQuiz().catch((e) => console.warn('[coach] quiz :', e?.message || e));
  const t = setInterval(tour, 15 * 60 * 1000);
  t.unref?.();
  setTimeout(tour, 2 * 60 * 1000).unref?.();
  return t;
}
