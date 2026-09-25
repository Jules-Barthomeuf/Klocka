// Ce qu'AK apprend de l'équipe : les corrections et les compliments.
//
// Quand quelqu'un répond « non, pas comme ça » ou « nickel » juste après une
// réponse d'AK, l'échange est gardé : la demande, ce qu'AK a répondu, ce
// qu'on lui a dit. Les corrections récentes sont relues par le modèle avant
// chaque réponse, comme des exemples de ce qu'il ne faut plus faire ; les
// compliments, comme des exemples à suivre. Rien n'est réécrit dans la
// consigne de Jules : elle reste la sienne.
//
// Et une mémoire de faits : ce qu'on lui dit de retenir (« le Devred c'est
// Firminy », « Max veut pas de Monday sans demander »), relu de la même
// façon. Quelques centaines de jetons, en cache : ça ne coûte presque rien.

import { profilDe, consignesDuProfil } from './questionnaire.js';
import { Records, Meta } from '../db.js';

const ENTITE_LECON = 'AkLecon';
const ENTITE_SOUVENIR = 'AkSouvenir';
const CLE_DERNIER = 'ak.dernier-echange';
const MAX_CORRECTIONS = 8;
const MAX_BIEN = 4;
const MAX_SOUVENIRS = 40;

const bas = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/** Pure : « non c'est pas ça », « pas comme ça », « t'as tout faux »… */
export function estUneCorrection(texte) {
  const t = bas(texte);
  if (t.length > 400) return false;
  return /^(non|nan|nope)\b/.test(t) || /\b(pas comme ca|c'?est pas ca|c pas ca|t'?as tout faux|n'?importe quoi|faux|trop long|trop corporate|pas du tout|je t'?ai pas demande|j'?ai pas demande|arrete|c'?est nul|refais|recommence|plutot comme ca|il fallait)\b/.test(t);
}

/** Pure : « nickel », « parfait », « bg », « top », « merci c'est ça »… */
export function estUnCompliment(texte) {
  const t = bas(texte);
  if (t.length > 120) return false;
  return /\b(nickel|parfait|top|bg|impec|exactement|c'?est ca|cest ca|bien joue|bien vu|merci)\b/.test(t) && !estUneCorrection(t);
}

const derniers = () => { try { return JSON.parse(Meta.get(CLE_DERNIER) || '{}'); } catch { return {}; } };

/** AK vient de répondre : on garde l'échange pour lire la réaction qui suit. */
export function noterEchange({ espace, auteur, demande, reponse }) {
  Meta.set(CLE_DERNIER, JSON.stringify({ ...derniers(), [espace]: { auteur: auteur?.nom || null, affiche: auteur?.affiche || null, demande, reponse, le: new Date().toISOString() } }));
}

/**
 * Un message qui suit une réponse d'AK : correction ou compliment, on
 * l'apprend. Rend la leçon créée, ou null.
 */
export function apprendre({ espace, auteur, texte }) {
  const d = derniers()[espace];
  if (!d || d.auteur !== auteur?.nom) return null;
  if (Date.now() - Date.parse(d.le) > 30 * 60000) return null;
  const verdict = estUneCorrection(texte) ? 'correction' : estUnCompliment(texte) ? 'bien' : null;
  if (!verdict) return null;
  Meta.set(CLE_DERNIER, JSON.stringify({ ...derniers(), [espace]: null }));
  return Records.create(ENTITE_LECON, { verdict, demande: d.demande, reponse: d.reponse, retour: texte, par: d.affiche || d.auteur, espace, le: new Date().toISOString() });
}

export const lecons = (limite = 50) => Records.list(ENTITE_LECON).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, limite);

/** Le bloc d'exemples appris, pour la consigne. Pure sur `liste`. */
export function leconsPourConsigne(liste = lecons()) {
  const corrections = liste.filter((l) => l.verdict === 'correction').slice(0, MAX_CORRECTIONS);
  const biens = liste.filter((l) => l.verdict === 'bien').slice(0, MAX_BIEN);
  if (!corrections.length && !biens.length) return '';
  const court = (t) => String(t || '').replace(/\s+/g, ' ').slice(0, 300);
  const l = ['', '---', '', "CE QUE L'ÉQUIPE T'A APPRIS (des échanges réels ; ne refais pas ce qui a été corrigé, refais ce qui a plu)"];
  for (const c of corrections) l.push(`- ${c.par} a demandé « ${court(c.demande)} », tu as répondu « ${court(c.reponse)} », et ${c.par} a corrigé : « ${court(c.retour)} ».`);
  for (const b of biens) l.push(`- Bien : à « ${court(b.demande)} », ta réponse « ${court(b.reponse)} » a plu (« ${court(b.retour)} »).`);
  return l.join('\n');
}

// --- La mémoire de faits ------------------------------------------------------

/**
 * Retient un fait ou une préférence. `pour` : l'adresse de la personne à qui
 * la préférence s'applique (« je veux des mails plus courts ») ; vide, le
 * souvenir vaut pour toute l'équipe.
 */
export function retenir({ sujet, fait, par = null, pour = null }) {
  const s = String(sujet || '').trim().slice(0, 80);
  const f = String(fait || '').trim().slice(0, 300);
  if (!f) return { ok: false, error: 'Rien à retenir.' };
  const cible = pour ? String(pour).toLowerCase() : null;
  const existant = Records.filter(ENTITE_SOUVENIR, { sujet: s || 'général' }).find((x) => bas(x.fait) === bas(f) && (x.pour || null) === cible);
  if (existant) return { ok: true, deja: true, id: existant.id };
  const r = Records.create(ENTITE_SOUVENIR, { sujet: s || 'général', fait: f, par, pour: cible, le: new Date().toISOString() });
  return { ok: true, id: r.id, pour: cible };
}

export function oublier(id) {
  if (!Records.get(ENTITE_SOUVENIR, id)) return { ok: false, error: 'Souvenir introuvable.' };
  Records.delete(ENTITE_SOUVENIR, id);
  return { ok: true };
}

export const souvenirs = (limite = MAX_SOUVENIRS) => Records.list(ENTITE_SOUVENIR).sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, limite);

/** Le bloc de mémoire commune, pour la consigne. Les préférences personnelles n'y sont pas. Pure sur `liste`. */
export function souvenirsPourConsigne(liste = souvenirs()) {
  const communs = liste.filter((s) => !s.pour);
  if (!communs.length) return '';
  return ['', '---', '', 'CE QUE TU SAIS (retenu au fil des échanges ; si une personne te dit une préférence ou un fait durable, retiens-le avec l\'outil retenir)', ...communs.map((s) => `- [${s.sujet}] ${s.fait}${s.par ? ` (${s.par})` : ''}`)].join('\n');
}

/**
 * Pure : les préférences de la personne qui parle, à suivre dans cette
 * réponse seulement. Celles des autres ne la regardent pas.
 */
export function preferencesDe(email, liste = souvenirs(200), profil = profilDe(email)) {
  const e = String(email || '').toLowerCase();
  if (!e) return '';
  // Le questionnaire d'abord (ce qu'elle ou il a posé à froid), puis ce
  // qu'elle ou il a dit en passant dans le chat.
  const questionnaire = consignesDuProfil(profil?.reponses || {});
  const siennes = liste.filter((s) => s.pour === e).slice(0, 15).map((s) => s.fait);
  const toutes = [...questionnaire, ...siennes];
  if (!toutes.length) return '';
  return ['(ses préférences, à suivre pour elle ou lui seulement :', ...toutes.map((t) => `- ${t}`), ')'].join('\n');
}
