// Le journal des échanges des chats (12 oct. 2026, phase 0 de l'audit) :
// chaque réponse d'AK (application, Google Chat) et des chats mandataire
// garde ce qui a été envoyé au modèle (consigne, messages), ce qu'il a
// répondu à chaque tour, les outils appelés avec leurs arguments et leurs
// résultats, l'erreur s'il y en a eu, le coût et la durée. Lu dans
// Suivi > Chat. La consigne, longue et souvent identique, est gardée une
// fois (PromptChat, par empreinte).

import crypto from 'crypto';
import { Records } from '../db.js';

export const ECHANGE = 'EchangeChat';
export const PROMPT = 'PromptChat';
const GARDER = 3000;
const LONGUEUR_MESSAGE = 6000;
let ecrits = 0;

const empreinte = (t) => crypto.createHash('sha1').update(String(t || '')).digest('hex').slice(0, 16);
/** Pure : le contenu d'un message, en texte (les blocs image ou document ne gardent que leur type). */
export function texteDuContenu(c) {
  if (typeof c === 'string') return c.slice(0, LONGUEUR_MESSAGE);
  if (!Array.isArray(c)) return '';
  return c.map((b) => (b?.type === 'text' ? b.text : b?.type === 'tool_result' ? `[résultat d'outil] ${String(b.content || '').slice(0, 1500)}` : `[${b?.type || 'bloc'}]`)).join('\n').slice(0, LONGUEUR_MESSAGE);
}

/** Écrit un échange. Ne fait jamais tomber la réponse : une erreur d'écriture part dans les logs. */
export function noterEchange({ chat, par = null, page = null, systeme = '', messages = [], outils_declares = 0, tours = [], appels = [], reponse = '', erreur = null, cout_usd = null, modele = null, duree_ms = null, limite = false }) {
  try {
    const cle = systeme ? empreinte(systeme) : null;
    if (cle && !Records.findBy(PROMPT, 'empreinte', cle)) Records.create(PROMPT, { empreinte: cle, texte: systeme, longueur: systeme.length, le: new Date().toISOString() });
    const derniere = [...messages].reverse().find((m) => m.role === 'user' && (typeof m.content === 'string' || (Array.isArray(m.content) && m.content.some((b) => b?.type === 'text'))));
    const e = Records.create(ECHANGE, {
      le: new Date().toISOString(), chat, par: par ? String(par).toLowerCase() : null, page,
      // Sans l'en-tête que le chat ajoute (« Jules (compte …, lundi 12 octobre 2026, depuis l'application) : »).
      demande: texteDuContenu(derniere?.content || '').replace(/^[^\n]{0,200}?\) : /, '').slice(0, 2000),
      systeme_empreinte: cle, systeme_longueur: systeme.length,
      messages: messages.map((m) => ({ role: m.role, texte: texteDuContenu(m.content) })),
      outils_declares, tours, appels, reponse: String(reponse || '').slice(0, 20000),
      erreur: erreur ? String(erreur).slice(0, 2000) : null, limite: !!limite,
      n_outils: appels.length, n_echecs: appels.filter((a) => a.echec).length,
      cout_usd, modele, duree_ms,
    });
    if (++ecrits % 50 === 0) elaguer();
    return e.id;
  } catch (err) {
    console.warn('[journal des échanges] non écrit :', err?.message || err);
    return null;
  }
}

/** Ne garde que les plus récents. */
export function elaguer(garder = GARDER) {
  const tous = Records.list(ECHANGE).sort((a, b) => String(b.le).localeCompare(String(a.le)));
  for (const x of tous.slice(garder)) Records.delete(ECHANGE, x.id);
}

/** Pure : la ligne d'un échange dans la liste de Suivi. */
export const leger = (e) => ({ id: e.id, le: e.le, chat: e.chat, par: e.par, page: e.page, demande: e.demande, reponse: String(e.reponse || '').slice(0, 240), n_outils: e.n_outils, n_echecs: e.n_echecs, tours: (e.tours || []).length, erreur: e.erreur, limite: e.limite, cout_usd: e.cout_usd, duree_ms: e.duree_ms, modele: e.modele });

/** Les échanges, les plus récents d'abord, filtrés. */
export function lister({ chat = null, par = null, echecs = false, limite = 200 } = {}) {
  return Records.list(ECHANGE)
    .filter((e) => (!chat || e.chat === chat) && (!par || e.par === par) && (!echecs || e.erreur || e.n_echecs || e.limite))
    .sort((a, b) => String(b.le).localeCompare(String(a.le)))
    .slice(0, limite)
    .map(leger);
}

/** Un échange entier, avec sa consigne. */
export function lire(id) {
  const e = Records.get(ECHANGE, id);
  if (!e) return null;
  const p = e.systeme_empreinte ? Records.findBy(PROMPT, 'empreinte', e.systeme_empreinte) : null;
  return { ...e, systeme: p?.texte || null };
}
