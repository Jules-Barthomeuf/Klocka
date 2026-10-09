// Le récap du matin (9 oct. 2026) : chaque jour à 5 h 30, un mail à Jules
// qui dit ce qu'il y a à finir aujourd'hui, ce qui attend sa décision, ce qui
// a été fait la veille, un court diagnostic et quelques idées.
//
// Un seul appel au modèle, sans boucle d'agent : il lit, il écrit, il
// n'agit jamais (ni commit, ni Monday, ni état d'un Feedback). Chaque récap
// est gardé (`RecapDuJour`) : le suivant le relit pour suivre ce qui traîne.
//
//     npm run recap                 (fait le récap et l'envoie)
//     npm run recap -- --sans-mail  (l'écrit dans le terminal seulement)

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Records, Meta } from '../db.js';
import { heureDe } from '../prospection/regles.js';
import { commitsDepuis, travailEnCours, sessionsDepuis, sessionsSousBudget, memoires, masquer } from './collecte.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RACINE = path.resolve(__dirname, '..', '..');
const RECAP = 'RecapDuJour';
const CLE_DERNIER = 'recap.dernier';
const CLE_ENVOYE = 'recap.envoye_le';
const CLE_ESSAIS = 'recap.essais';
// À l'ouverture du Mac (9 oct. 2026) : launchd relance le récap toutes les dix
// minutes et à la connexion ; il part au premier passage après 5 h, une fois
// par jour, avec au plus trois essais si le réseau ou Resend manque.
const HEURE_MATIN = 5;
const ESSAIS_PAR_JOUR = 3;
const JOUR = 24 * 3600 * 1000;
const PLAFOND_SOURCE = 60_000;

/**
 * Pure : d'où part le récap. Du dernier réussi, pour qu'un matin manqué soit
 * rattrapé le lendemain et que le lundi couvre le week-end ; jamais plus de
 * quatre jours en arrière, au moins vingt-quatre heures.
 */
export function debutDuRecap(dernier, maintenantD = new Date()) {
  const min = maintenantD.getTime() - 4 * JOUR;
  const max = maintenantD.getTime() - JOUR;
  const t = dernier ? Date.parse(dernier) : NaN;
  return new Date(Number.isFinite(t) ? Math.max(min, Math.min(t, max)) : max).toISOString();
}

/** Pure : un JSON tenu sous un plafond de caractères, en retirant la fin des listes. */
export function sousPlafond(valeur, plafond = PLAFOND_SOURCE) {
  let v = valeur;
  let texte = JSON.stringify(v);
  while (texte.length > plafond && Array.isArray(v) && v.length > 1) { v = v.slice(0, Math.ceil(v.length * 0.8)); texte = JSON.stringify(v); }
  return texte.length > plafond ? `${texte.slice(0, plafond)}…` : texte;
}

/** Ce que la base sait : les Feedback ouverts, le dernier contrôle de nuit, les incidents, les leviers en attente. */
export async function contexteDeLaBase(depuis) {
  const feedback = Records.list('Suggestion').filter((s) => !['fait', 'refuse', 'refusé', 'termine'].includes(s.statut))
    .sort((a, b) => String(b.created_date).localeCompare(String(a.created_date))).slice(0, 25)
    .map((s) => ({ le: String(s.created_date || '').slice(0, 10), statut: s.statut, page: s.page || s.categorie || null, texte: String(s.titre || s.description || s.texte || s.contenu || '').slice(0, 300) }));
  let controle = null;
  try {
    const { dernierRapport } = await import('../prospection/controles.js');
    const r = dernierRapport();
    if (r) controle = { le: r.le, conforme: r.conforme, ecarts: r.ecarts, regles: (r.regles || []).filter((x) => !x.ok).map((x) => ({ titre: x.titre, n: x.n, non_verifie: x.non_verifie || null, exemples: (x.details || []).slice(0, 3) })) };
  } catch { /* pas de contrôle encore */ }
  let incidents = [];
  try {
    const { derniersIncidents } = await import('../incidents.js');
    incidents = derniersIncidents({ limite: 200 }).filter((x) => x.le >= depuis).slice(0, 15).map((x) => ({ le: x.le, type: x.type, message: String(x.message || '').slice(0, 200) }));
  } catch { /* fichier absent */ }
  let etat = '';
  try {
    const md = fs.readFileSync(path.join(RACINE, 'docs', 'etat-plateforme.md'), 'utf8');
    const i = md.indexOf('## Les leviers');
    etat = i >= 0 ? md.slice(i, i + 4000) : '';
  } catch { /* pas de fichier */ }
  return { feedback, controle, incidents, etat };
}

/** Les récaps précédents, pour suivre ce qui traîne et ne pas reprendre ce que Jules a fermé. */
export function recapsPrecedents(n = 7) {
  return Records.list(RECAP).filter((r) => !r.essai).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, n)
    .map((r) => ({ le: String(r.le).slice(0, 10), a_finir: (r.contenu?.a_finir || []).map((x) => ({ quoi: x.quoi, etat: x.etat || 'a_faire' })) }));
}

/** Tout ce que le modèle lira. */
export async function rassembler({ depuis, racine = RACINE, dossierSessions, dossierMemoire, maintenantD = new Date() } = {}) {
  // L'historique des sessions remonte à sept jours : ce qui a été demandé et jamais fini ne se voit pas sur la seule veille.
  const historique = new Date(Math.min(Date.parse(depuis), maintenantD.getTime() - 7 * JOUR)).toISOString();
  const [sessions, base] = await Promise.all([sessionsDepuis(historique, dossierSessions, depuis), contexteDeLaBase(depuis)]);
  return {
    depuis,
    commits: commitsDepuis(racine, depuis),
    en_cours: travailEnCours(racine),
    sessions,
    memoires: memoires(dossierMemoire),
    ...base,
    precedents: recapsPrecedents(),
  };
}

export const SCHEMA = {
  type: 'object',
  properties: {
    phrase: { type: 'string', description: 'Une phrase pour la journée : ce qui compte le plus aujourd\'hui.' },
    sessions: { type: 'array', description: 'Une entrée par session Claude Code active sur la période, la plus récente d\'abord.', items: { type: 'object', properties: {
      session: { type: 'string' }, titre: { type: 'string', description: 'Le sujet de la session, en quelques mots.' },
      fait: { type: 'string', description: 'Ce qui a été fait et confirmé.' }, arret: { type: 'string', description: 'Où elle s\'est arrêtée : la dernière demande et si la dernière réponse la clôt.' },
      reste: { type: 'string', description: 'Ce qui reste, ou « rien ».' },
    }, required: ['session', 'titre', 'fait', 'arret', 'reste'] } },
    a_finir: { type: 'array', items: { type: 'object', properties: {
      quoi: { type: 'string' }, ou: { type: 'string' }, pourquoi: { type: 'string', description: 'Pourquoi ce n\'est pas fini.' },
      prochaine_etape: { type: 'string' }, depuis_jours: { type: 'number', description: 'Depuis combien de récaps il revient (1 s\'il est nouveau).' }, source: { type: 'string' },
    }, required: ['quoi', 'prochaine_etape', 'source'] } },
    decisions: { type: 'array', items: { type: 'object', properties: { question: { type: 'string' }, contexte: { type: 'string' }, source: { type: 'string' } }, required: ['question', 'source'] } },
    hier: { type: 'array', items: { type: 'object', properties: { fait: { type: 'string' }, source: { type: 'string' } }, required: ['fait', 'source'] } },
    diagnostic: { type: 'array', items: { type: 'object', properties: { constat: { type: 'string' }, chiffre: { type: 'string' }, piste: { type: 'string' }, source: { type: 'string' } }, required: ['constat', 'source'] } },
    idees: { type: 'array', items: { type: 'object', properties: { idee: { type: 'string' }, pourquoi: { type: 'string' } }, required: ['idee'] } },
    prompt_du_jour: { type: 'string', description: 'Un prompt prêt à coller dans Claude Code pour le premier élément à finir.' },
  },
  required: ['phrase', 'sessions', 'a_finir', 'decisions', 'hier', 'diagnostic', 'idees', 'prompt_du_jour'],
};

/** Pure : la consigne et les sources, sous plafond. */
export function consigne(ctx, maintenantD = new Date()) {
  const jour = maintenantD.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  return `Tu prépares le récap du matin de Jules, fondateur de Klocka (immobilier commercial). Il le lit au réveil, le ${jour}, pour savoir ce qu'il a à faire aujourd'hui. Période couverte : depuis le ${ctx.depuis}.

Règles :
- Français, phrases courtes et concrètes, sans emojis ni tirets cadratins. Tutoie Jules.
- Chaque élément cite sa source, avec le nom exact de la section d'où il vient : un SHA de commit, « git » (GIT), « session xxxxxxxx », « mémoire nom », « Feedback », « contrôle de nuit », « incidents », « état de la plateforme ». Ne prête jamais à une source ce qui vient d'une autre.
- N'invente rien. Une section sans matière est une liste vide.
- Sessions : analyse chaque session Claude Code qui a des demandes récentes (« recent »: true). Pour chacune : son sujet, ce qui a été fait et confirmé par Claude, où elle s'est arrêtée (la dernière demande de Jules, et si la dernière réponse la clôt ou la laisse ouverte : « Rien n'est commité », une question posée, une vérification annoncée et pas faite, une demande arrivée en cours de route sans suite), et ce qui reste. Une demande plus ancienne (historique de sept jours) jamais close compte aussi. Une session sans demande récente n'a pas d'entrée, mais son historique sert à « À finir ».
- À finir (7 au plus, le plus important d'abord) : ce qui a été commencé et pas terminé. Signes : fichiers pas commités, commits pas encore sur main, une demande de Jules en session sans fin constatée dans la dernière réponse, « Rien n'est commité », « à valider », les lignes « pas encore fait » des mémoires. Un élément déjà dans les récaps précédents garde le même libellé et compte ses jours ; un élément marqué fait ou abandonné n'est pas repris.
- Décisions (5 au plus) : les questions posées à Jules restées sans réponse, les specs « à trancher », les leviers en attente. Ne les présente pas comme des idées neuves.
- Hier (6 au plus) : ce qui a été livré, en une ligne chacun.
- Diagnostic (3 au plus) : chaque constat s'appuie sur un chiffre des sources (écarts du contrôle de nuit, incidents, actions ratées d'AK, Feedback ouverts, coûts). Pas de conseil générique. Ne repropose pas ce qui est « Déjà en place ».
- Idées (2 au plus) : liées au travail de la veille.
- Prompt du jour : un prompt précis, prêt à coller dans Claude Code, pour le premier élément à finir.

Sources (JSON) :
COMMITS ${sousPlafond(ctx.commits)}
GIT (travail en cours) ${sousPlafond(ctx.en_cours, 8000)}
SESSIONS À ANALYSER, une entrée obligatoire pour chacune : ${ctx.sessions.filter((s) => s.tours.some((t) => t.recent)).map((s) => `${s.session} (${s.titre || 'sans titre'}, ${s.tours.filter((t) => t.recent).length} demandes récentes)`).join(' · ') || 'aucune'}
SESSIONS CLAUDE CODE (sept jours d'historique ; « recent » = sur la période) ${JSON.stringify(sessionsSousBudget(ctx.sessions))}
MÉMOIRES ${sousPlafond(ctx.memoires, 20000)}
FEEDBACK OUVERTS ${sousPlafond(ctx.feedback, 8000)}
CONTRÔLE DE NUIT ${sousPlafond(ctx.controle, 6000)}
INCIDENTS ${sousPlafond(ctx.incidents, 6000)}
ÉTAT DE LA PLATEFORME (leviers) ${masquer(ctx.etat)}
RÉCAPS PRÉCÉDENTS ${sousPlafond(ctx.precedents, 8000)}`;
}

/** Le récap, rédigé par le modèle (mesuré dans Coûts IA sous « récap du matin »). */
export async function rediger(ctx, { maintenantD = new Date(), invoquer = null } = {}) {
  const prompt = consigne(ctx, maintenantD);
  if (invoquer) return invoquer({ prompt, response_json_schema: SCHEMA });
  const { invokeLLM, llmEnabled } = await import('../llm.js');
  if (!llmEnabled) throw new Error('Aucun modèle configuré.');
  const { mesurer } = await import('../llm-couts.js');
  // Effort moyen et 32 000 jetons : en effort par défaut, la réflexion prenait 14 000 des 16 000 jetons et le JSON sortait coupé.
  const { resultat } = await mesurer({ operation: 'récap du matin', par: 'recap' }, () => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'medium', max_tokens: 32000 }));
  // Une réponse illisible revient en squelette vide : c'est une panne, pas un récap.
  if (!resultat?.phrase) throw new Error('Réponse du modèle incomplète.');
  return resultat;
}

const puces = (l, f) => (l?.length ? l.map((x) => `· ${f(x)}`).join('\n') : 'Rien.');

/** Pure : les variables du mail. Sans récap du modèle, la liste brute. */
export function mailDuRecap(contenu, ctx, { maintenantD = new Date(), erreur = null } = {}) {
  const jour = maintenantD.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Paris' });
  if (!contenu) {
    return {
      objet: `Récap du ${jour} (sans IA)`,
      titre: `Récap du ${jour}`,
      resume: `Récap impossible : ${erreur || 'raison inconnue'}. Voici la liste brute.`,
      a_finir: [`${ctx.en_cours.fichiers_n} fichier(s) pas commité(s) sur ${ctx.en_cours.branche}`, ...ctx.en_cours.fichiers.slice(0, 12)].join('\n'),
      decisions: 'Rien.',
      sessions: puces(ctx.sessions.filter((s) => s.tours.some((t) => t.recent)), (s) => `${s.titre || s.session} [session ${s.session}] : ${s.tours.filter((t) => t.recent).length} demande(s), la dernière : ${String(s.tours.at(-1)?.demande || '').slice(0, 200)}`),
      hier: puces(ctx.commits.slice(0, 10), (c) => `${c.message.split('\n')[0].slice(0, 160)} (${c.sha})`),
      diagnostic: ctx.controle ? `Contrôle de nuit : ${ctx.controle.conforme ? 'tout est conforme' : `${ctx.controle.ecarts} règle(s) non conforme(s)`}.` : 'Rien.',
      idees: 'Rien.',
      prompt: '',
    };
  }
  const n = contenu.a_finir?.length || 0;
  return {
    objet: `Récap du ${jour} · ${n} chose${n > 1 ? 's' : ''} à finir`,
    titre: `Récap du ${jour}`,
    resume: contenu.phrase || '',
    sessions: puces(contenu.sessions, (x) => `**${x.titre}** [session ${x.session}]\n   Fait : ${x.fait}\n   Arrêtée sur : ${x.arret}\n   Reste : ${x.reste}`),
    a_finir: puces(contenu.a_finir, (x) => `**${x.quoi}**${x.depuis_jours > 1 ? ` (traîne depuis ${x.depuis_jours} jours)` : ''}${x.ou ? `, ${x.ou}` : ''}.${x.pourquoi ? ` ${x.pourquoi}` : ''}\n   Ensuite : ${x.prochaine_etape} [${x.source}]`),
    decisions: puces(contenu.decisions, (x) => `**${x.question}**${x.contexte ? ` ${x.contexte}` : ''} [${x.source}]`),
    hier: puces(contenu.hier, (x) => `${x.fait} [${x.source}]`),
    diagnostic: puces(contenu.diagnostic, (x) => `**${x.constat}**${x.chiffre ? ` (${x.chiffre})` : ''}${x.piste ? `. ${x.piste}` : ''} [${x.source}]`),
    idees: puces(contenu.idees, (x) => `${x.idee}${x.pourquoi ? ` : ${x.pourquoi}` : ''}`),
    prompt: contenu.prompt_du_jour || '',
  };
}

/** Pure : le même récap en texte, pour le terminal. */
export const recapEnTexte = (v) => [v.titre, v.resume, '', 'À FINIR AUJOURD\'HUI', v.a_finir, '', 'EN ATTENTE DE TA DÉCISION', v.decisions, '', 'TES SESSIONS CLAUDE CODE', v.sessions, '', 'HIER', v.hier, '', 'DIAGNOSTIC', v.diagnostic, '', 'IDÉES', v.idees, '', 'POUR DÉMARRER', v.prompt].join('\n').replace(/\*\*/g, '');

/**
 * Fait le récap : rassemble, rédige, garde, envoie. Une fois par jour : un
 * second lancement le même jour ne refait rien, sauf `forcer`.
 */
export async function faireLeRecap({ a = process.env.RECAP_A || 'jules.b@klocka.immo', envoyer = true, forcer = false, matin = false, maintenantD = new Date(), invoquer = null, envoyerMail = null, ...sources } = {}) {
  const jourParis = (d) => d.toLocaleDateString('fr-CA', { timeZone: 'Europe/Paris' });
  const aujourdhui = jourParis(maintenantD);
  const dernier = Meta.get(CLE_DERNIER);
  const envoye = Meta.get(CLE_ENVOYE) || dernier;
  if (!forcer && envoyer && envoye && jourParis(new Date(envoye)) === aujourdhui) return { ok: true, deja: true, le: envoye };
  if (matin && !forcer) {
    const heure = heureDe(maintenantD);
    if (heure < HEURE_MATIN) return { ok: true, attente: true };
    let essais = {};
    try { essais = JSON.parse(Meta.get(CLE_ESSAIS) || '{}'); } catch { /* illisible : on repart de zéro */ }
    const n = essais.jour === aujourdhui ? essais.n || 0 : 0;
    if (n >= ESSAIS_PAR_JOUR) return { ok: false, abandon: true, essais: n };
    Meta.set(CLE_ESSAIS, JSON.stringify({ jour: aujourdhui, n: n + 1 }));
  }
  const depuis = debutDuRecap(dernier, maintenantD);
  const ctx = await rassembler({ depuis, maintenantD, ...sources });
  let contenu = null, erreur = null;
  try { contenu = await rediger(ctx, { maintenantD, invoquer }); } catch (e) { erreur = String(e?.message || e); }
  if (contenu && !Array.isArray(contenu.a_finir)) { erreur = 'Réponse du modèle illisible.'; contenu = null; }
  const vars = mailDuRecap(contenu, ctx, { maintenantD, erreur });
  const garde = Records.create(RECAP, { le: maintenantD.toISOString(), essai: !envoyer, depuis, contenu, erreur, sources: { commits: ctx.commits.length, sessions: ctx.sessions.length, tours: ctx.sessions.reduce((n, s) => n + s.tours.length, 0), sessions_recentes: ctx.sessions.filter((s) => s.tours.some((t) => t.recent)).length, feedback: ctx.feedback.length } });
  if (!envoyer) return { ok: !erreur, id: garde.id, vars, erreur };
  let envoi;
  try {
    if (envoyerMail) envoi = await envoyerMail({ a, vars });
    else {
      const { envoyerPlateforme } = await import('../emailing/index.js');
      envoi = await envoyerPlateforme('recap_du_matin', { a, vars, testeur: a });
    }
  } catch (e) { envoi = { ok: false, error: String(e?.message || e) }; }
  Records.update(RECAP, garde.id, { envoi: { ok: !!envoi?.ok, a, erreur: envoi?.ok ? null : envoi?.error || null } });
  if (envoi?.ok) Meta.set(CLE_ENVOYE, maintenantD.toISOString());
  if (envoi?.ok && !erreur) Meta.set(CLE_DERNIER, maintenantD.toISOString());
  return { ok: !!envoi?.ok && !erreur, id: garde.id, vars, erreur, envoi };
}

// En ligne de commande : `node server/recap/recap.js [--sans-mail] [--forcer] [--matin]`.
// --matin : le passage de launchd, silencieux tant qu'il n'y a rien à faire.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  await import('dotenv/config');
  const sansMail = process.argv.includes('--sans-mail');
  const matin = process.argv.includes('--matin');
  const quand = new Date().toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  // Au réveil, le réseau revient après quelques secondes : sans lui, on attend le passage suivant sans compter d'essai.
  if (matin) {
    try { const dns = await import('dns'); await dns.promises.lookup('api.resend.com'); } catch { process.exit(0); }
  }
  const r = await faireLeRecap({ envoyer: !sansMail, forcer: process.argv.includes('--forcer'), matin });
  if ((r.deja || r.attente) && matin) process.exit(0);
  if (r.abandon) { console.log(`[récap ${quand}] ${r.essais} essais ratés aujourd'hui : plus de nouvel essai avant demain.`); process.exit(1); }
  if (r.deja) console.log(`[récap ${quand}] déjà fait aujourd'hui (${r.le}).`);
  else if (sansMail) console.log(recapEnTexte(r.vars));
  else console.log(`[récap ${quand}] ${r.envoi?.ok ? 'envoyé' : `pas envoyé : ${r.envoi?.error || '?'}`}${r.erreur ? ` · sans IA : ${r.erreur}` : ''}`);
  process.exit(r.ok || r.deja ? 0 : 1);
}
