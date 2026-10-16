// AK surveille le journal des appels et pose des questions (16 oct. 2026, Jules).
//
// Quatre cas font naître une question, adressée à l'analyste qui a passé l'appel :
//   correction   il a corrigé ce qu'AK proposait (issue, champs, date, mail, actions écartées) ;
//   non_valide   l'appel attend sa validation depuis plus d'une heure ;
//   sans_appel   validé sans appel : moins de 15 secondes, ni enregistrement ni notes ;
//   trop_long    validé plus de 2 minutes après le raccrochage.
//
// Elle s'affiche dans le Dashboard de l'analyste dès sa connexion : l'écran
// enregistré pendant l'appel (rejoué, 30 jours), ce qu'il a fait ensuite, un
// court résumé d'AK et les questions. Ses réponses arrivent dans Suivi >
// Appels > Retours, pour Jules, qui y voit ce qui revient et ce qu'il faut
// améliorer dans le module. Rien ne se corrige tout seul : AK demande,
// l'équipe répond, Jules lit.
//
// La détection est du code (aucun modèle) ; le modèle rapide ne fait que
// rédiger le résumé et des questions précises. S'il est indisponible, des
// questions modèles s'affichent à la place.

import { Records, Meta } from '../db.js';
import * as R from './regles.js';
import { fichier as fichierEcranDe } from '../enregistrements-ecran.js';

const ENTITE = 'QuestionAppel';
const APPEL = 'AppelAgent';
const ECRAN = 'EnregistrementEcran';
const MODELE_RAPIDE = 'claude-haiku-4-5';
const CLE_SYNTHESE = 'questions-appels.synthese';

/** Seuils (Jules, 16 oct. 2026 : « valider en 2 min 47, c'est trop »). */
export const SEUIL_VALIDATION_MS = 2 * 60000;
export const MIN_APPEL_S = 15;
export const ATTENTE_NON_VALIDE_MS = 60 * 60000;
/** Les appels d'avant ne sont pas interrogés : avant le 13 octobre, c'était de l'essai. */
export const DEPUIS = '2026-10-13T00:00:00Z';
const FENETRE_JOURS = 14;
const GARDE_ECRAN_JOURS = 30;

export const MOTIFS = {
  correction: 'Correction',
  non_valide: 'Pas validé',
  sans_appel: 'Validé sans appel',
  trop_long: 'Validation longue',
};
const SANS_CONVERSATION = new Set(['pas_de_reponse', 'repondeur']);

const bas = (e) => String(e || '').trim().toLowerCase();
const court = (s, n = 160) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

/** Pure : « 2 min 47 s », « 38 s ». */
export function duree(ms) {
  const s = Math.max(0, Math.round(Number(ms) / 1000));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

// --- Détecter -------------------------------------------------------------------------------

/** Pure : un appel qui compte (ni essai ni démonstration ni remplacé). */
export const appelReel = (x) => !!x && !x.essai && !x.faux && x.etat !== 'remplace' && !x.annule_le;

/** Pure : ce qu'AK a corrigé ou écarté dans un appel validé, en phrases. */
export function correctionsDe(appel) {
  const l = (appel.corrections || []).map((c) => `${c.champ || 'Champ'} : ${court(c.avant, 80) || '(vide)'} → ${court(c.apres, 80) || '(vide)'}`);
  const m = appel.mesure_ak;
  if (m?.corrige && !l.length) {
    if (m.issue) l.push('Issue changée');
    if (Array.isArray(m.champs) && m.champs.length) l.push(`Champs changés : ${m.champs.join(', ')}`);
    if (m.date) l.push('Date de relance changée');
    if (m.mail) l.push('Mail réécrit');
  }
  return l;
}

/** Pure : les motifs qui s'appliquent à cet appel, maintenant. */
export function motifsDe(appel, maintenant = new Date()) {
  if (!appelReel(appel) || !appel.par) return [];
  const motifs = [];
  const valide = appel.etat === 'valide';
  if (valide && (appel.modifie || appel.mesure_ak?.corrige || (appel.corrections || []).length)) motifs.push('correction');
  if (appel.etat === 'a_valider' && maintenant - new Date(appel.le) >= ATTENTE_NON_VALIDE_MS) motifs.push('non_valide');
  const sansConversation = SANS_CONVERSATION.has(appel.issue);
  if (valide && !sansConversation && !(Number(appel.duree_s) >= MIN_APPEL_S) && !appel.enregistre && !String(appel.notes || '').trim() && !appel.transcription_gardee) motifs.push('sans_appel');
  if (valide && Number(appel.temps?.valide_ms) >= SEUIL_VALIDATION_MS) motifs.push('trop_long');
  return motifs;
}

// --- Dire ce qui s'est passé ----------------------------------------------------------------

const heureFr = (iso) => new Date(iso).toLocaleString('fr-FR', { timeZone: 'Europe/Paris', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

/** Pure : ce que l'analyste a fait pendant et après l'appel, dans l'ordre, tel que l'appel l'a gardé. */
export function chronologie(appel, { agence = null } = {}) {
  const l = [];
  const qui = [appel.agent, agence].filter(Boolean).join(', ');
  l.push({ quoi: `Appel${qui ? ` à ${qui}` : ''}`, detail: `${heureFr(appel.le)}${Number(appel.duree_s) ? `, ${duree(Number(appel.duree_s) * 1000)}` : ''}${appel.enregistre ? ', enregistré' : ''}` });
  const issue = R.ISSUES?.[appel.issue] || appel.issue;
  if (appel.mesure_ak?.propose_par_ak) l.push({ quoi: appel.mesure_ak.issue ? 'AK avait compris une autre issue ; tu l\'as changée' : 'AK a compris l\'issue', detail: issue });
  else if (issue) l.push({ quoi: 'Issue', detail: `${issue}${appel.issue_deduite ? ' (comprise par AK)' : ''}` });
  if (appel.resume) l.push({ quoi: 'Ce qu\'AK a retenu', detail: court(appel.resume, 220) });
  const t = appel.temps || {};
  if (Number.isFinite(t.pret_ms)) l.push({ quoi: 'Actions proposées par AK', detail: `prêtes ${duree(t.pret_ms)} après le raccrochage${(appel.propositions || []).length ? `, ${(appel.propositions || []).length} propositions` : ''}` });
  for (const c of appel.corrections || []) l.push({ quoi: `Tu as corrigé : ${c.champ || 'un champ'}`, detail: `${court(c.avant, 90) || '(vide)'} → ${court(c.apres, 90) || '(vide)'}` });
  if (appel.annulations) l.push({ quoi: `Annulé ${appel.annulations} fois`, detail: 'tu as repris l\'appel après l\'avoir validé' });
  const ui = appel.validation_ui;
  if (ui) l.push({ quoi: appel.etat === 'valide' ? 'Validation' : 'Écran de validation', detail: [ui.depuis_fenetre ? 'depuis la fenêtre' : 'depuis la page', ui.etapes != null ? `${ui.vues ?? '?'} étapes vues sur ${ui.etapes}` : null, (ui.retirees || []).length ? `retiré : ${ui.retirees.join(', ')}` : null, (ui.ajoutees || []).length ? `ajouté : ${ui.ajoutees.join(', ')}` : null].filter(Boolean).join(' · ') });
  if (Number.isFinite(t.valide_ms)) l.push({ quoi: 'Validé', detail: `${duree(t.valide_ms)} après le raccrochage${t.valide_ms >= SEUIL_VALIDATION_MS ? ' (au-delà de 2 minutes)' : ''}` });
  else if (appel.etat === 'a_valider') l.push({ quoi: 'Pas encore validé', detail: `en attente depuis ${duree(Date.now() - new Date(appel.le))}` });
  if (appel.recu?.monday) l.push({ quoi: 'Monday', detail: court(appel.recu.monday.texte, 140) });
  if (appel.recu?.mail) l.push({ quoi: 'Mail', detail: court(appel.recu.mail.texte, 140) });
  if (Number.isFinite(t.prepare_ms)) l.push({ quoi: 'Tout préparé', detail: `${duree(t.prepare_ms)} après le raccrochage` });
  return l;
}

// --- Les questions --------------------------------------------------------------------------

const unId = (appelId, motif, k) => `${appelId.slice(0, 8)}-${motif}-${k}`;

/** Pure : les questions modèles d'un motif, quand le modèle n'a pas rédigé les siennes. */
export function questionsModele(appel, motif) {
  if (motif === 'correction') {
    const c = correctionsDe(appel);
    return [`Tu as corrigé ${c.length > 1 ? `${c.length} choses` : 'quelque chose'} dans ce qu'AK proposait${c[0] ? ` (${court(c[0], 90)})` : ''}. Qu'est-ce qui n'allait pas ?`];
  }
  if (motif === 'non_valide') return ['Cet appel n\'est pas validé. Qu\'est-ce qui t\'a empêché de le valider ?'];
  if (motif === 'sans_appel') return ['Cet appel est validé sans appel : moins de 15 secondes, ni enregistrement ni notes. Que s\'est-il passé ?'];
  return [`Tu as validé ${duree(appel.temps?.valide_ms || 0)} après le raccrochage, c'est long. Qu'est-ce qui a pris du temps, ou qui ne marchait pas ?`];
}

const nouvelles = (appel, motif) => questionsModele(appel, motif).map((texte, k) => ({ id: unId(appel.id, motif, k + 1), motif, texte, reponse: null, repondue_le: null }));

const etatDe = (qs) => (!qs.length ? 'obsolete' : qs.every((q) => q.reponse) ? 'repondue' : 'ouverte');

const enregistrementDe = (appelId) => Records.list(ECRAN).find((e) => e.appel_id === appelId) || null;

/** L'écran de l'appel, avec le jour où il s'efface. */
export function ecranDe(appelId) {
  const e = enregistrementDe(appelId);
  if (!e) return null;
  // `present` : le fichier est bien sur le disque (la fiche seule ne suffit pas à rejouer l'écran).
  return { id: e.id, present: !!fichierEcranDe(e.id), duree_s: e.duree_s || null, jusqu_au: new Date(new Date(e.le).getTime() + GARDE_ECRAN_JOURS * 86400000).toISOString() };
}

const agenceDe = (appel) => (appel.agence_id ? Records.get('AgenceProspect', appel.agence_id)?.nom : null) || (appel.agent_id ? Records.get('AgentImmo', appel.agent_id)?.agence : null) || null;

// --- Surveiller -----------------------------------------------------------------------------

/**
 * Parcourt le journal : crée les questions qui manquent, met à jour celles qui
 * existent (un motif qui n'a plus lieu d'être s'efface), rend ce qui a changé.
 * Sans effet de bord hors base : la rédaction par le modèle se lance à part.
 */
export function surveiller({ maintenant = new Date() } = {}) {
  const limite = new Date(Math.max(new Date(DEPUIS).getTime(), maintenant.getTime() - FENETRE_JOURS * 86400000)).toISOString();
  const existantes = new Map(Records.list(ENTITE).map((q) => [q.appel_id, q]));
  const crees = [];
  const rouvertes = [];
  for (const appel of Records.list(APPEL)) {
    if (String(appel.le || '') < limite) continue;
    const motifs = motifsDe(appel, maintenant);
    const q = existantes.get(appel.id);
    if (!q) {
      if (!motifs.length) continue;
      const questions = motifs.flatMap((m) => nouvelles(appel, m));
      crees.push(Records.create(ENTITE, { appel_id: appel.id, par: bas(appel.par), motifs, questions, etat: 'ouverte', resume: null, ia: false, ia_essais: 0, agence: agenceDe(appel), agent: appel.agent || null, le_appel: appel.le, cree_le: maintenant.toISOString(), reporte_jusqu: null }));
      continue;
    }
    // Les motifs qui ont disparu (l'appel a été validé depuis) : leurs questions sans réponse s'effacent.
    let questions = q.questions.filter((x) => motifs.includes(x.motif) || x.reponse);
    const ajoutes = motifs.filter((m) => !q.motifs.includes(m));
    for (const m of ajoutes) questions = [...questions, ...nouvelles(appel, m)];
    const etat = etatDe(questions);
    const change = questions.length !== q.questions.length || ajoutes.length || etat !== q.etat;
    if (!change) continue;
    const maj = Records.update(ENTITE, q.id, { questions, motifs: [...new Set([...motifs, ...questions.map((x) => x.motif)])], etat, ...(ajoutes.length ? { ia: false, ia_essais: 0, reporte_jusqu: null } : {}) });
    if (ajoutes.length && etat === 'ouverte') rouvertes.push(maj);
  }
  return { crees, rouvertes };
}

let derniereSurveillance = 0;
/** Une surveillance au plus par minute : appelée à chaque ouverture du Dashboard. */
export function surveillerSiBesoin({ maintenant = new Date(), force = false } = {}) {
  if (!force && maintenant.getTime() - derniereSurveillance < 60000) return { crees: [], rouvertes: [] };
  derniereSurveillance = maintenant.getTime();
  return surveiller({ maintenant });
}

// --- Rédiger (le modèle rapide) -------------------------------------------------------------

const SCHEMA = {
  type: 'object',
  properties: {
    resume: { type: 'string', description: 'deux ou trois phrases : ce qui s\'est passé après cet appel, à la deuxième personne, sans reproche' },
    questions: {
      type: 'array',
      items: { type: 'object', properties: { motif: { type: 'string', enum: Object.keys(MOTIFS) }, texte: { type: 'string', description: 'une question précise, une phrase, qui cite ce qui a changé ou ce qui a pris du temps' } }, required: ['motif', 'texte'] },
    },
  },
  required: ['resume', 'questions'],
};

/** Pure : la consigne du résumé et des questions. */
export function consigne(appel, motifs, { agence = null } = {}) {
  const faits = motifs.map((m) => {
    if (m === 'correction') return `- correction : ${correctionsDe(appel).join(' ; ') || 'l\'analyste a corrigé une proposition d\'AK'}`;
    if (m === 'non_valide') return `- pas validé : l'appel date d'il y a ${duree(Date.now() - new Date(appel.le))}`;
    if (m === 'sans_appel') return `- validé sans appel : ${Number(appel.duree_s) ? `${appel.duree_s} s` : 'pas de durée'}, ni enregistrement ni notes`;
    return `- validation longue : ${duree(appel.temps?.valide_ms || 0)} après le raccrochage (le seuil est 2 minutes)`;
  }).join('\n');
  return `Tu es AK, l'assistant de l'équipe Klocka (achat de murs commerciaux). Tu surveilles le journal des appels de prospection pour améliorer le module d'appel : tu veux comprendre ce qui n'a pas marché, pas juger.
Un appel de ${appel.par || 'l\'analyste'}${appel.agent || agence ? ` à ${[appel.agent, agence].filter(Boolean).join(', ')}` : ''} pose question.
Ce qu'on constate :
${faits}

Ce qui s'est passé, dans l'ordre :
${chronologie(appel, { agence }).map((e) => `- ${e.quoi}${e.detail ? ` : ${e.detail}` : ''}`).join('\n')}

Écris :
1. resume : deux ou trois phrases sur ce qui s'est passé après l'appel, en tutoyant, sans reproche, sans genre (ni « il » ni « elle » pour l'analyste), avec les chiffres et les noms.
2. questions : une question par motif (deux au plus pour une correction qui touche plusieurs choses), précise, qui cite ce qui a changé ou ce qui a pris du temps, ouverte (« qu'est-ce qui… », « pourquoi… »), une phrase chacune, en tutoyant. Pas de question à laquelle on répond par oui ou non. Ne demande rien que le journal dit déjà.
Français simple, sans tiret long, sans gras.`;
}

/**
 * Le modèle rédige le résumé et des questions précises, qui remplacent les
 * questions modèles encore sans réponse. Ne lève jamais ; ne touche jamais à
 * une question déjà répondue.
 */
const enRedaction = new Set();
export async function rediger(id, { invoke = null } = {}) {
  if (enRedaction.has(id)) return null;
  const q = Records.get(ENTITE, id);
  if (!q || q.etat !== 'ouverte') return null;
  enRedaction.add(id);
  try { return await redigerUne(id, q, { invoke }); } finally { enRedaction.delete(id); }
}

async function redigerUne(id, q, { invoke }) {
  const appel = Records.get(APPEL, q.appel_id);
  if (!appel) return null;
  Records.update(ENTITE, id, { ia_essais: (q.ia_essais || 0) + 1 });
  try {
    const prompt = consigne(appel, q.motifs, { agence: q.agence });
    let r;
    if (invoke) r = await invoke(prompt);
    else {
      const { invokeLLM } = await import('../llm.js');
      const { mesurer } = await import('../llm-couts.js');
      r = (await mesurer({ operation: 'questions appels', sur: q.appel_id }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, modele: MODELE_RAPIDE, max_tokens: 1200 }))).resultat;
    }
    const frais = Records.get(ENTITE, id);
    const par = {};
    for (const x of r?.questions || []) if (frais.motifs.includes(x.motif) && String(x.texte || '').trim()) (par[x.motif] = par[x.motif] || []).push(court(x.texte, 300));
    const questions = [];
    for (const m of frais.motifs) {
      const gardees = frais.questions.filter((x) => x.motif === m);
      // Un motif déjà répondu ne reçoit pas de nouvelle question ; sans texte du modèle, on garde les questions modèles.
      if ((gardees.length && gardees.every((x) => x.reponse)) || !(par[m] || []).length) { questions.push(...gardees); continue; }
      const repondues = gardees.filter((x) => x.reponse);
      questions.push(...repondues, ...par[m].map((t, k) => ({ id: unId(frais.appel_id, m, repondues.length + k + 1), motif: m, texte: t, reponse: null, repondue_le: null })));
    }
    return Records.update(ENTITE, id, { questions: questions.length ? questions : frais.questions, resume: court(r?.resume, 600) || frais.resume || null, ia: true });
  } catch (e) {
    console.warn('[questions-appels] rédaction :', e?.message || e);
    return null;
  }
}

/** Rédige, en tâche de fond, les questions qui n'ont que leur texte modèle (deux essais au plus). */
export async function redigerLesNouvelles({ invoke = null, maintenant = new Date(), max = 4 } = {}) {
  const a = Records.list(ENTITE).filter((q) => q.etat === 'ouverte' && !q.ia && (q.ia_essais || 0) < 2).slice(0, max);
  let n = 0;
  for (const q of a) { if (await rediger(q.id, { invoke })) n += 1; }
  return n;
}

// --- Ce que voit l'analyste -----------------------------------------------------------------

function vue(q, { complet = false } = {}) {
  const appel = Records.get(APPEL, q.appel_id);
  return {
    id: q.id, appel_id: q.appel_id, par: q.par, etat: q.etat, motifs: q.motifs, motifs_libelles: q.motifs.map((m) => MOTIFS[m]),
    agence: q.agence || null, agent: q.agent || null, le_appel: q.le_appel, cree_le: q.cree_le, resume: q.resume || null, ia: !!q.ia,
    questions: q.questions.map((x) => ({ id: x.id, motif: x.motif, texte: x.texte, reponse: x.reponse || null, repondue_le: x.repondue_le || null })),
    chronologie: appel ? chronologie(appel, { agence: q.agence }) : [],
    ecran: ecranDe(q.appel_id),
    reporte_jusqu: q.reporte_jusqu || null,
    ...(complet ? { issue: appel ? R.ISSUES?.[appel.issue] || appel.issue : null, duree_validation_ms: appel?.temps?.valide_ms ?? null } : {}),
  };
}

/** Les questions ouvertes de `user`, la plus ancienne d'abord (celles remises à plus tard attendent). */
export function mesQuestions(user, { maintenant = new Date(), limite = 3 } = {}) {
  const e = bas(user?.email);
  return Records.list(ENTITE)
    .filter((q) => q.par === e && q.etat === 'ouverte' && !(q.reporte_jusqu && new Date(q.reporte_jusqu) > maintenant))
    .sort((a, b) => String(a.le_appel).localeCompare(String(b.le_appel)))
    .slice(0, limite).map((q) => vue(q));
}

/**
 * Pour Jules (16 oct. 2026) : les questions posées aux autres, en lecture seule,
 * pour voir ce que les analystes voient et tester : les sans réponse, et celles
 * répondues depuis sept jours ; la plus récente d'abord.
 */
export function questionsEquipe(user, { maintenant = new Date(), limite = 12 } = {}) {
  const e = bas(user?.email);
  const depuis = new Date(maintenant.getTime() - 7 * 86400000).toISOString();
  return Records.list(ENTITE)
    .filter((q) => q.par !== e && (q.etat === 'ouverte' || (q.etat === 'repondue' && String(q.repondue_le || q.maj_le || q.cree_le) >= depuis)))
    .sort((a, b) => String(b.le_appel).localeCompare(String(a.le_appel)))
    .slice(0, limite).map((q) => vue(q));
}

/** `user` répond (à toutes les questions, ou à quelques-unes). Seule la personne concernée répond : Jules lit (16 oct. 2026). */
export function repondre(id, user, reponses, { maintenant = new Date() } = {}) {
  const q = Records.get(ENTITE, id);
  if (!q) return { ok: false, error: 'Question introuvable.' };
  if (q.par !== bas(user?.email)) return { ok: false, error: 'Cette question est pour quelqu\'un d\'autre.' };
  const par = new Map((reponses || []).map((r) => [String(r.id), String(r.texte || '').trim().slice(0, 4000)]));
  let n = 0;
  const questions = q.questions.map((x) => {
    const t = par.get(x.id);
    if (!t) return x;
    n += 1;
    return { ...x, reponse: t, repondue_le: maintenant.toISOString(), repondue_par: bas(user?.email) };
  });
  if (!n) return { ok: false, error: 'Écris au moins une réponse.' };
  const etat = etatDe(questions);
  Records.update(ENTITE, id, { questions, etat, ...(etat === 'repondue' ? { repondue_le: maintenant.toISOString() } : {}), reporte_jusqu: null });
  return { ok: true, question: vue(Records.get(ENTITE, id)) };
}

/** « Plus tard » : la question revient demain matin. */
export function plusTard(id, user, { maintenant = new Date() } = {}) {
  const q = Records.get(ENTITE, id);
  if (!q || q.par !== bas(user?.email)) return { ok: false, error: 'Question introuvable.' };
  const demain = new Date(maintenant.getTime() + 18 * 3600000).toISOString();
  Records.update(ENTITE, id, { reporte_jusqu: demain, reportee: (q.reportee || 0) + 1 });
  return { ok: true, reporte_jusqu: demain };
}

/** L'écran d'une question : à son analyste, ou à Jules. Rend le fichier compressé. */
export async function fichierEcran(id, user, { estJules = false } = {}) {
  const q = Records.get(ENTITE, id);
  if (!q) return { erreur: 404, message: 'Question introuvable.' };
  if (q.par !== bas(user?.email) && !estJules) return { erreur: 403, message: 'Cet écran est celui d\'un autre analyste.' };
  const e = ecranDe(q.appel_id);
  if (!e) return { erreur: 404, message: 'Pas d\'enregistrement d\'écran pour cet appel (il part à la validation).' };
  const p = fichierEcranDe(e.id);
  if (!p) return { erreur: 404, message: 'L\'enregistrement n\'est plus sur le serveur (gardé 30 jours).' };
  return { chemin: p };
}

// --- Ce que voit Jules ----------------------------------------------------------------------

/** Toutes les questions, avec leurs réponses, et ce qu'elles disent : par motif, par analyste, taux de réponse. */
export function retours({ jours = 30, maintenant = new Date() } = {}) {
  const depuis = new Date(maintenant.getTime() - jours * 86400000).toISOString();
  const tout = Records.list(ENTITE).filter((q) => String(q.cree_le) >= depuis).sort((a, b) => String(b.le_appel).localeCompare(String(a.le_appel)));
  const questions = tout.flatMap((q) => q.questions.map((x) => ({ ...x, motif: x.motif, par: q.par })));
  const parMotif = Object.keys(MOTIFS).map((m) => {
    const qs = questions.filter((x) => x.motif === m);
    return { motif: m, libelle: MOTIFS[m], appels: tout.filter((q) => q.motifs.includes(m)).length, questions: qs.length, repondues: qs.filter((x) => x.reponse).length };
  });
  const analystes = [...new Set(tout.map((q) => q.par))].map((p) => {
    const qs = questions.filter((x) => x.par === p);
    return { par: p, questions: qs.length, repondues: qs.filter((x) => x.reponse).length };
  }).sort((a, b) => b.questions - a.questions);
  let synthese = null;
  try { synthese = JSON.parse(Meta.get(CLE_SYNTHESE) || 'null'); } catch { synthese = null; }
  return {
    jours, total: tout.length, ouvertes: tout.filter((q) => q.etat === 'ouverte').length, repondues: tout.filter((q) => q.etat === 'repondue').length,
    par_motif: parMotif, analystes, synthese: synthese ? { ...synthese, a_jour: synthese.n_reponses === Records.list(ENTITE).reduce((t, q) => t + q.questions.filter((x) => x.reponse).length, 0) } : null,
    seuil_validation_s: SEUIL_VALIDATION_MS / 1000,
    questions: tout.slice(0, 120).map((q) => vue(q, { complet: true })),
  };
}

const SCHEMA_SYNTHESE = {
  type: 'object',
  properties: {
    themes: {
      type: 'array',
      items: { type: 'object', properties: { theme: { type: 'string', description: 'ce qui revient, en une phrase' }, fois: { type: 'integer' }, exemples: { type: 'array', items: { type: 'string' }, description: 'deux réponses d\'analystes, recopiées' } }, required: ['theme', 'fois'] },
    },
    ameliorations: {
      type: 'array',
      items: { type: 'object', properties: { quoi: { type: 'string', description: 'un changement concret du module d\'appel' }, pourquoi: { type: 'string', description: 'les réponses qui le justifient' } }, required: ['quoi', 'pourquoi'] },
    },
  },
  required: ['themes', 'ameliorations'],
};

/** La synthèse des réponses : ce qui revient, ce qu'il faut améliorer dans le module. À la demande de Jules. */
export async function synthetiser({ invoke = null, maintenant = new Date() } = {}) {
  const reponses = Records.list(ENTITE).flatMap((q) => q.questions.filter((x) => x.reponse).map((x) => ({ motif: MOTIFS[x.motif], analyste: q.par.split('@')[0].split('.')[0], agence: q.agence, question: x.texte, reponse: x.reponse })));
  if (!reponses.length) return { ok: false, error: 'Aucune réponse à lire encore.' };
  const prompt = `Tu aides Jules à améliorer le module d'appel de Klocka (l'écran qui écoute un appel de prospection, propose des actions, puis se valide). Voici les réponses des analystes aux questions qu'AK leur a posées (corrections, appels non validés, validés sans appel, validations trop longues).
${JSON.stringify(reponses.slice(-80))}

Rends :
1. themes : ce qui revient (au plus 6), le plus fréquent d'abord, avec le nombre de réponses concernées et deux exemples recopiés.
2. ameliorations : au plus 5 changements concrets du module, du plus utile au moins utile, chacun justifié par les réponses. Rien d'inventé : si les réponses sont trop peu nombreuses pour conclure, dis-le dans un thème.
Français simple, sans tiret long.`;
  let r;
  if (invoke) r = await invoke(prompt);
  else {
    const { invokeLLM } = await import('../llm.js');
    const { mesurer } = await import('../llm-couts.js');
    r = (await mesurer({ operation: 'synthese questions appels' }, () => invokeLLM({ prompt, response_json_schema: SCHEMA_SYNTHESE, max_tokens: 2500 }))).resultat;
  }
  const synthese = {
    genere_le: maintenant.toISOString(), n_reponses: reponses.length,
    themes: (r?.themes || []).filter((t) => t?.theme).slice(0, 6).map((t) => ({ theme: court(t.theme, 220), fois: Math.max(1, Number(t.fois) || 1), exemples: (t.exemples || []).slice(0, 2).map((e) => court(e, 220)) })),
    ameliorations: (r?.ameliorations || []).filter((a) => a?.quoi).slice(0, 5).map((a) => ({ quoi: court(a.quoi, 240), pourquoi: court(a.pourquoi, 300) })),
  };
  Meta.set(CLE_SYNTHESE, JSON.stringify(synthese));
  return { ok: true, synthese: { ...synthese, a_jour: true } };
}

// --- Le tour --------------------------------------------------------------------------------

/** Pure : la clé de ce qui a été annoncé (les motifs, triés) : un motif nouveau se réannonce. */
export const cleAnnonce = (q) => [...(q.motifs || [])].sort().join(',');

/**
 * Prévient l'analyste, et Jules, de chaque question ouverte pas encore annoncée
 * pour ses motifs actuels. Appelée à chaque surveillance (Dashboard, tour) :
 * une question née à l'ouverture du Dashboard est annoncée comme les autres.
 */
export async function annoncer() {
  const { notifier } = await import('../notifications.js');
  const { SUPER_ADMINS } = await import('../acces-pages.js');
  const juleses = SUPER_ADMINS.filter((x) => x.endsWith('@klocka.immo'));
  let n = 0;
  for (const q of Records.list(ENTITE).filter((x) => x.etat === 'ouverte' && x.annonce !== cleAnnonce(x))) {
    const cle = cleAnnonce(q);
    const quoi = `${q.agence || q.agent || 'Un appel'} : ${q.motifs.map((m) => MOTIFS[m].toLowerCase()).join(', ')}`;
    notifier({ pour: q.par, titre: 'AK a une question sur un de tes appels', texte: `${quoi}. L'écran enregistré t'attend sur le Dashboard.`, lien: '/Dashboard', cle: `question-appel:${q.id}:${cle}` });
    // Jules reçoit aussi chaque question posée aux analystes (il n'y répond pas : il voit et il teste).
    for (const j of juleses.filter((x) => x !== q.par)) {
      notifier({ pour: j, titre: `AK a posé une question à ${q.par.split('@')[0].split('.')[0].replace(/^./, (c) => c.toUpperCase())}`, texte: `${quoi}. Dans Suivi > Appels > Retours, avec son écran.`, lien: '/SuiviAppels?vue=retours', cle: `question-appel-jules:${q.id}:${cle}:${j}` });
    }
    Records.update(ENTITE, q.id, { annonce: cle });
    n += 1;
  }
  return n;
}

/** Un tour : surveille, annonce, rédige, efface les écrans de plus de 30 jours. */
export async function tour({ invoke = null, maintenant = new Date() } = {}) {
  const { crees, rouvertes } = surveiller({ maintenant });
  const annoncees = await annoncer();
  const redigees = await redigerLesNouvelles({ invoke, maintenant });
  let purges = 0;
  try { purges = (await import('../enregistrements-ecran.js')).purger({ maintenant }); } catch { /* le tour ne s'arrête pas pour un fichier */ }
  return { crees: crees.length, rouvertes: rouvertes.length, annoncees, redigees, purges };
}

/** Sur Render (ou avec QUESTIONS_APPELS=true) : un tour toutes les cinq minutes. */
export function planifier() {
  if (!process.env.RENDER && process.env.QUESTIONS_APPELS !== 'true') return null;
  const t = setInterval(() => { tour().catch((e) => console.warn('[questions-appels]', e?.message || e)); }, 5 * 60000);
  t.unref?.();
  setTimeout(() => { tour().catch(() => {}); }, 90000).unref?.();
  return t;
}
