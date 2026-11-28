// Répondre depuis l'extension (28 nov. 2026, Jules : « on tape l'extension en haut à droite, on dit réponds à ce message,
// ça crée un brouillon en lisant l'écran » ; « dans WhatsApp, que ça écrive directement le message »). L'extension
// (extensions/klocka) lit le fil ouvert dans Gmail ou WhatsApp Web et l'envoie ici ; on rend un brouillon, rien ne part :
// l'extension le pose dans la case de réponse, et la personne l'envoie elle-même.

import { Records } from '../db.js';
import { invokeLLM } from '../llm.js';
import { mesurer } from '../llm-couts.js';
import { contexteDe, styleDe } from './modele.js';
import { fichesDevinees } from './ranger.js';

export const CANAUX_REPONSE = ['whatsapp', 'mail'];
// Ce qu'on lit du fil : la fin, la plus récente.
const LIMITE_FIL = 12000;

const SCHEMA = {
  type: 'object',
  properties: { texte: { type: 'string' } },
  required: ['texte'],
};

const propre = (t, n) => String(t ?? '').replace(/\r/g, '').trim().slice(0, n);

/**
 * Comment l'auteur s'adresse à la personne, lu dans SES messages du fil (« [..] Vous: ») : 'tutoie', 'vouvoie', ou null
 * s'il ne lui a rien écrit qui le dise (28 nov. 2026, Jules : « il a répondu en vouvoyant alors que je le tutoie ; il
 * faut bien copier comment on vouvoie ou on tutoie »). Ce que fait l'autre ne compte pas.
 */
export function registreDe(fil) {
  const texte = String(fil || '');
  // WhatsApp : ses lignes « [..] Vous: » ; Gmail : ses mails « De : Vous ».
  const whatsapp = texte.split('\n').filter((l) => /^\[[^\]]+\]\s*Vous:/.test(l)).map((l) => l.replace(/^\[[^\]]+\]\s*Vous:\s*/, ''));
  const mails = texte.split(/\n\n---\n\n/).filter((m) => /^De : Vous\b/.test(m)).map((m) => m.split('\n').slice(1).join(' '));
  const siens = [...whatsapp, ...mails].join(' ').toLowerCase();
  const tu = (siens.match(/\b(?:tu|te|toi|ton|ta|tes)\b|\bt['’]/g) || []).length;
  const vous = (siens.match(/\b(?:vous|votre|vos)\b/g) || []).length;
  if (!tu && !vous) return null;
  return tu >= vous ? 'tutoie' : 'vouvoie';
}

/** La phrase de la consigne sur le registre : celui de l'auteur, jamais celui de l'autre. */
export function consigneRegistre(fil) {
  const r = registreDe(fil);
  return r
    ? `Dans ses propres messages de ce fil, il ${r} cette personne : ${r === 'tutoie' ? 'tutoie-la' : 'vouvoie-la'} aussi, même si elle fait autrement.`
    : "Tutoie ou vouvoie comme lui le fait dans ses propres messages (ceux de « Vous », ou les mails qu'il a signés), jamais d'après l'autre ; s'il ne lui a encore rien écrit, prends le registre de l'autre.";
}

/**
 * Sa façon d'écrire, pour une consigne : ses derniers messages envoyés, et surtout ce qu'il a changé dans les brouillons
 * avant de les envoyer (28 nov. 2026, Jules : « plus on l'utilise, plus les brouillons sonnent comme moi »).
 */
export function lignesDeStyle(style) {
  const l = [];
  if (style?.envoyes?.length) {
    l.push('', "Des messages qu'il a déjà envoyés, pour prendre sa façon d'écrire (longueur, ton, mots, salutations) :");
    for (const m of style.envoyes.slice(0, 5)) l.push(`- ${propre(m.texte, 400).replace(/\n+/g, ' / ')}`);
  }
  if (style?.retouches?.length) {
    l.push('', "Des brouillons qu'il a retouchés avant de les envoyer : fais d'emblée comme sa version, pas comme le brouillon.");
    for (const r of style.retouches.slice(0, 3)) l.push(`- Brouillon : ${propre(r.initial, 300).replace(/\n+/g, ' / ')}`, `  Envoyé : ${propre(r.texte, 300).replace(/\n+/g, ' / ')}`);
  }
  return l;
}

/** La consigne du modèle : le fil, ce que Klocka sait des personnes et des biens nommés, la façon d'écrire de l'auteur. */
export function consigneReponse({ canal, titre, fil, demande, fiches = [], style = null, auteur = '' }) {
  const mail = canal === 'mail';
  const lignes = [
    `Tu écris, pour ${auteur || "un membre de l'équipe Klocka"} (Klocka : investissement en murs de commerce), la réponse au dernier message de ${mail ? 'ce fil de mails' : 'cette conversation WhatsApp'}${titre ? ` (« ${titre} »)` : ''}.`,
    "Tu écris à sa place, à la première personne, comme lui : c'est un brouillon qu'il relira et enverra lui-même.",
    mail
      ? 'Un mail : une formule d\'appel, le corps, une formule de fin courte. Pas de signature (sa messagerie l\'ajoute), pas d\'objet.'
      : 'Un message WhatsApp : court, direct, sans formule de politesse de lettre.',
    consigneRegistre(fil),
    'Le français, sauf si le fil est dans une autre langue.',
    "N'invente rien : ni chiffre, ni date, ni rendez-vous, ni document. Ce que tu ne sais pas, tu le demandes ou tu dis que tu reviens vers lui.",
    "Ne promets rien qu'il n'a pas dit : si une question du fil reste sans consigne de sa part, n'y réponds pas à sa place.",
    "Ne donne aucun avis ni jugement à sa place (« c'est solide », « ça me plaît », « trop cher ») : un avis, c'est lui qui le donne. Sans consigne de sa part, accuse réception et dis qu'il revient vers la personne, ou pose la question qui manque.",
    'Pas d\'emoji, pas de tiret cadratin, pas de Markdown.',
  ];
  if (demande) lignes.push('', `Ce qu'il veut répondre (à suivre, en le mettant en forme) : ${demande}`);
  const connues = fiches.filter((f) => f.contexte);
  if (connues.length) {
    lignes.push('', 'Ce que Klocka sait des personnes et des biens que le fil nomme (pour être juste, pas pour tout répéter) :');
    for (const f of connues) {
      const c = f.contexte;
      lignes.push(`- ${f.nom} (${f.genre})${c.etape ? `, étape ${c.etape}` : ''}${c.resume ? ` : ${c.resume}` : ''}`);
      if (c.actions_ouvertes?.length) lignes.push(`  Prévu : ${c.actions_ouvertes.slice(0, 3).join(' ; ')}`);
    }
  }
  lignes.push(...lignesDeStyle(style));
  lignes.push('', mail ? 'Le fil, du plus ancien au plus récent :' : 'La conversation (« Vous » : lui), du plus ancien au plus récent :', fil);
  lignes.push('', 'Rends seulement le texte du message, prêt à envoyer.');
  return lignes.join('\n');
}

/**
 * Le brouillon de réponse. `fil` : le texte lu à l'écran (lignes « [10:51, 28/11/2026] Nom: message » pour WhatsApp,
 * mails à la suite pour Gmail) ; `demande` : ce que la personne veut dire, facultatif.
 */
export async function brouillonDeReponse({ canal, titre = '', fil, demande = '', participants = [] } = {}, user, { lire = null } = {}) {
  if (!CANAUX_REPONSE.includes(canal)) return { ok: false, error: 'Canal inconnu.' };
  const texteFil = String(fil || '').trim();
  if (!texteFil) return { ok: false, error: "Rien à lire à l'écran." };
  const extrait = texteFil.length > LIMITE_FIL ? texteFil.slice(-LIMITE_FIL) : texteFil;
  let fiches = [];
  try {
    const noms = (Array.isArray(participants) ? participants : []).map((p) => propre(p, 80)).filter(Boolean).slice(0, 6);
    fiches = (await fichesDevinees(`${titre}\n${extrait.slice(-6000)}`, user, { noms, limite: 4 })).map((l) => ({ ...l, contexte: contexteDe(l.cle) }));
  } catch { fiches = []; }
  let style = null;
  try { style = styleDe(user?.email); } catch { style = null; }
  const prompt = consigneReponse({ canal, titre: propre(titre, 160), fil: extrait, demande: propre(demande, 1500), fiches, style, auteur: user?.full_name || '' });
  const appeler = lire || (() => invokeLLM({ prompt, response_json_schema: SCHEMA, effort: 'low', max_tokens: 1500 }));
  const { resultat } = await mesurer({ operation: "répondre depuis l'extension", par: user?.email || null }, appeler);
  const texte = String(resultat?.texte || '').replace(/—/g, ',').trim();
  if (!texte) return { ok: false, error: "Je n'ai pas réussi à écrire la réponse." };
  return { ok: true, texte, fiches: fiches.map((f) => ({ cle: f.cle, nom: f.nom, genre: f.genre })) };
}

/**
 * Un message envoyé depuis WhatsApp Web ou Gmail après un brouillon de l'extension (28 nov. 2026, Jules : « apprendre de
 * ce que tu envoies vraiment ») : la version envoyée, et le brouillon d'où elle vient. Gardé comme les messages
 * envoyés depuis l'assistant (MessageEnvoye) : c'est de là que styleDe apprend sa façon d'écrire. Rien n'est rangé sur
 * une fiche ni envoyé à personne. Le même texte renvoyé dans les dix minutes ne compte qu'une fois.
 */
export function enregistrerEnvoi({ canal, pour = '', texte, initial = '' } = {}, user, { maintenant = new Date() } = {}) {
  if (!CANAUX_REPONSE.includes(canal)) return { ok: false, error: 'Canal inconnu.' };
  const envoye = propre(texte, 4000);
  const brouillon = propre(initial, 4000);
  if (!envoye || !user?.email) return { ok: false, error: 'Message vide.' };
  const par = String(user.email).toLowerCase();
  const depuis = maintenant.getTime() - 10 * 60 * 1000;
  if (Records.filter('MessageEnvoye', { par }).some((m) => m.texte === envoye && new Date(m.le).getTime() > depuis)) return { ok: true, deja: true };
  const m = Records.create('MessageEnvoye', {
    par, pour: propre(pour, 120) || null, canal, initial: brouillon || null, texte: envoye,
    de_l_auteur: false, retouche: !!brouillon && brouillon !== envoye, source: 'extension', fiches: [], le: maintenant.toISOString(),
  });
  return { ok: true, id: m.id, retouche: m.retouche };
}

