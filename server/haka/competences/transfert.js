// Haka, compétence « transfert » (23 oct. 2026, Jules : « mes collaborateurs gardent chacun leur boîte ; pour lancer
// une pré-analyse, la data room, etc., ils transfèrent le mail à sourcing@klocka.immo. L'assistant reçoit les
// documents et les rentre directement dans la plateforme, comme un collaborateur à qui on transmet le mail. Je préfère
// ça à l'agent qui va lui-même dans les boîtes. »).
//
// Le transfert EST la décision humaine : Haka agit sans redemander, puis prévient le collègue dans l'application.
//   1. lire        le transfert : la note du collègue, l'expéditeur d'origine (l'agent), l'objet d'origine, les pièces.
//   2. comprendre  une fiche à pré-analyser, des documents pour un dossier, ou une simple demande (le chat de Haka).
//                  Le dossier se trouve sans modèle : l'agent d'origine, le nom ou l'adresse du dossier dans la note
//                  ou l'objet. Un seul dossier : on y va. Plusieurs, ou aucun quand il en faut un : on demande.
//   3. choisir     (externe, seulement si Haka a demandé) : la réponse du collègue dans sa cloche.
//   4. agir        la pré-analyse (dossier au nom du collègue, l'agent d'origine en contact) ou les pièces dans la
//                  Data Room du dossier : noms proposés, rangées dans les sous-dossiers du Drive, lues sur leur grille
//                  (2 nov. 2026, Jules : sans relecture des noms). Des pièces sans dossier reconnu ni fiche : un
//                  nouveau dossier, ses pièces dans la Data Room, puis la pré-analyse par les documents.
//                  Un dossier né du transfert a sa fiche en Mémoire et sa Propriété dans Twenty CRM, sans attendre la
//                  nuit. « Ne rentre pas la fiche dans la plateforme » : aucun dossier, la fiche lue va en Mémoire et
//                  dans Twenty seulement (2 nov. 2026, Jules).
//                  17 nov. 2026 (Jules) : une fiche transférée SANS consigne va en Mémoire seulement, plus de dossier
//                  d'office. « Préanalyse » : toutes les fiches du mail sont pré-analysées (et en Mémoire) ; « préanalyse
//                  juste la fiche X » : X seule est pré-analysée, les autres vont en Mémoire.
//   5. repondre    une notification au collègue seul : ce qui a été fait, avec le lien du dossier. Plus de mail
//                  depuis sourcing@ (2 nov. 2026, Jules : « je ne veux pas qu'il réponde à l'analyste par mail »).
//
// Un mandataire transfère aussi (9 nov. 2026, Jules) : le bien entre dans ses Biens (server/transfert-mandataire.js). Qui
// est à la fois admin et mandataire répond d'abord, dans sa cloche : côté mandataire ou côté admin ?
//
// Drapeau : HAKA_TRANSFERT (avec HAKA_FILE). Allumé, Haka ne lit plus les boîtes personnelles pour les fiches et les
// mails (le transfert remplace la veille de Haka) ; les autres passes de la veille ne changent pas.

import fs from 'node:fs';
import { Records, CHEMIN_UPLOADS } from '../../db.js';
import { SIMULER } from '../drapeaux.js';
import * as taches from '../taches.js';
import * as file from '../file.js';
import { sourceMail } from '../sources.js';
import { membreDeLEquipe } from './demande-equipe.js';
import { notifier } from '../../notifications.js';
import { piecesFiche, parleDUnBien } from '../../deal/fiches-auto.js';
import { estTableur } from '../../deal/lire-bureautique.js';
import { estMandataire } from '../../mandataire-espace.js';

export const COMPETENCE = 'transfert';
export const VERSION = '1';
const norm = (e) => String(e || '').trim().toLowerCase();
const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const UTILES = /\.(pdf|docx?|xlsx?|odt|ods|jpe?g|png|webp)$/i;
const PARASITES = /^(image\d+|logo|signature|banniere|banner|icon|unnamed|outlook-)/i;
const piecesUtiles = (mail) => (mail?.pieces_jointes || []).filter((p) => UTILES.test(p?.nom || '') && !PARASITES.test(p?.nom || ''));

// ---------------------------------------------------------------------------
// 1. Lire le transfert
// ---------------------------------------------------------------------------

const MARQUES = [
  /-{3,}\s*(forwarded message|message transf[ée]r[ée]|message d'origine|message original|original message)\s*-{3,}/i,
  /d[ée]but du message r[ée]exp[ée]di[ée]\s*:/i,
  /begin forwarded message\s*:/i,
  // Outlook : une ligne de soulignés, puis « De : ».
  /^_{10,}\s*\n\s*(de|from)\s*:/im,
];
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

/** Pure : « Marc Agent <marc@agence.fr> » → { nom, email }. */
export function lireAdresse(s) {
  const t = String(s || '').replace(/mailto:/gi, '').trim();
  const email = (t.match(EMAIL) || [])[0] || null;
  const nom = t.replace(/<[^>]*>/g, '').replace(EMAIL, '').replace(/["'[\]()]/g, '').trim() || null;
  return { nom, email: email ? email.toLowerCase() : null };
}

/**
 * Pure : ce que dit un mail transféré. La note du collègue (avant la marque du transfert), l'expéditeur d'origine,
 * l'objet d'origine. Sans marque, un objet « TR: / Fwd: » suffit à dire que c'est un transfert.
 */
export function lireTransfert({ texte = '', objet = '' } = {}) {
  const t = String(texte || '').replace(/\r/g, '');
  let i = -1;
  for (const m of MARQUES) { const r = t.match(m); if (r && (i < 0 || r.index < i)) i = r.index; }
  const objetPropre = String(objet || '').replace(/^\s*((tr|fw|fwd|re)\s*:\s*)+/i, '').trim();
  const estTransfert = i >= 0 || /^\s*(tr|fw|fwd)\s*:/i.test(String(objet || ''));
  if (i < 0) return { transfert: estTransfert, note: t.trim().slice(0, 2000), origine: null, objet_origine: objetPropre || null };
  const note = t.slice(0, i).trim();
  const entete = t.slice(i).split('\n').slice(1, 14).join('\n');
  const champ = (...noms) => { for (const n of noms) { const r = entete.match(new RegExp(`^\\s*\\*?${n}\\*?\\s*:\\s*(.+)$`, 'im')); if (r) return r[1].trim(); } return null; };
  const de = lireAdresse(champ('De', 'From', 'Expéditeur'));
  return {
    transfert: true,
    note: note.slice(0, 2000),
    origine: de.email ? de : null,
    objet_origine: (champ('Objet', 'Subject') || objetPropre || '').replace(/^\s*((tr|fw|fwd|re)\s*:\s*)+/i, '').trim() || null,
    date_origine: champ('Date', 'Envoyé', 'Sent') || null,
  };
}

// ---------------------------------------------------------------------------
// 2. Comprendre
// ---------------------------------------------------------------------------

// « Rentre ce dossier dans la plateforme » : une fiche à pré-analyser, seulement quand le mail en porte une.
const MOTS_RENTRER = /\brentre[rz]?\b.{0,40}\b(plateforme|dossier)/;
const MOTS_FICHE = /pr[ée]?[\s-]?analys|\banalyse[rz]?\b|nouvelle fiche|nouveau (bien|dossier)|fiche (commerciale|du bien)|[àa] analyser|[ée]tudier ce bien/;
// « Ne rentre pas la fiche dans la plateforme » (2 nov. 2026, Jules) : pas de dossier, la fiche en Mémoire et dans Twenty.
const MOTS_MEMOIRE = /\b(ne|n')\s*(la |le |les |l')?(rentre|entre|mets?|cree|ajoute|integre|enregistre)s?\s+pas\b|\bpas (de|en) dossier|\bsans (creer (de|un) )?dossier|\b(juste|seulement|uniquement|que) (en|dans la) memoire|\bne pas (la |le |les )?(rentrer|entrer|creer|mettre|integrer)\b/;
// « Ne préanalyse pas cette fiche », « pas de pré-analyse », « sans préanalyse » (17 nov. 2026, Jules) : la négation
// l'emporte sur le mot, la fiche va en Mémoire seulement.
const PAS_DE_PREANALYSE = /\b(ne|n')\s*(pas\s+)?(la |le |les |l')?(pre[\s-]?)?analys\w*\s+(pas\b)?|\b(pas|sans|aucune?)\s+(de\s+|d'|la\s+)?(pre[\s-]?)?analys|\bne\s+pas\s+(la |le |les |l')?(pre[\s-]?)?analys/;
const MOTS_DOCUMENTS = /data[\s-]?room|documents?|pi[eè]ces?|[àa] ranger|[àa] classer|ajoute|rajoute|mets? (le|les|dans)|bail|taxe fonci[eè]re/;
const OUVERTS = (d) => !d.archived && !d.doublon_de && !['abandonne', 'perdu', 'refuse', 'clos'].includes(d.statut);

/** Pure : les mots qui comptent dans un nom de dossier (« Boulangerie Aux Délices - Mâcon » → boulangerie, delices, macon). */
const motsDe = (s) => sansAccents(s).split(/[^a-z0-9]+/).filter((m) => m.length >= 4 && !['murs', 'local', 'commercial', 'commerce', 'avec', 'dans', 'pour', 'rue', 'avenue'].includes(m));

/**
 * Pure : les dossiers que le transfert vise, du plus sûr au moins sûr. L'agent d'origine en contact d'un dossier
 * ouvert compte le plus ; ensuite le nom ou la ville du dossier dans la note et l'objet. À égalité, ceux du collègue.
 */
export function dossiersVises(lu, deals, { collegue = null } = {}) {
  const texte = sansAccents(`${lu.note || ''} ${lu.objet_origine || ''}`);
  const scores = [];
  for (const d of deals.filter(OUVERTS)) {
    let s = 0;
    if (lu.origine?.email && norm(d.contact_agent_email) === lu.origine.email) s += 3;
    const mots = motsDe(d.nom);
    const touches = mots.filter((m) => texte.includes(m)).length;
    if (touches) s += Math.min(3, touches * (mots.length <= 2 ? 1.5 : 1));
    if (!s) continue;
    if (collegue && norm(d.responsable_email) === norm(collegue)) s += 0.5;
    scores.push({ deal_id: d.deal_id, nom: d.nom || d.deal_id, score: s });
  }
  return scores.sort((a, b) => b.score - a.score);
}

// Les mots d'une consigne qui ne désignent pas une fiche (« préanalyse juste la fiche de Mâcon stp » → macon).
const MOTS_CONSIGNE = new Set(['preanalyse', 'preanalyser', 'preanalyses', 'pre', 'analyse', 'analyser', 'fiche', 'fiches', 'juste', 'seulement', 'uniquement', 'cette', 'celle', 'celui', 'ceci', 'cela', 'les', 'des', 'une', 'pour', 'merci', 'stp', 'svp', 'bien', 'dossier', 'nouvelle', 'nouveau', 'avec', 'sans', 'dans', 'aussi', 'peux', 'tu', 'vous', 'pouvez', 'est', 'qui', 'que', 'pdf', 'jpg', 'png', 'docx', 'doc']);
const ORDINAUX = [[/\b(premiere|1ere|1re|1er|premier)\b/, 0], [/\b(deuxieme|seconde|second|2e|2eme|2nde)\b/, 1], [/\b(troisieme|3e|3eme)\b/, 2], [/\b(quatrieme|4e|4eme)\b/, 3], [/\b(cinquieme|5e|5eme)\b/, 4]];

/**
 * Pure : les fiches que la consigne désigne (17 nov. 2026, Jules : « préanalyse juste cette fiche X »), par leur nom de
 * fichier (une ville, une enseigne) ou leur rang (« la deuxième »). Rend les `piece_id` retenus, ou null pour toutes.
 */
export function fichesVisees(note0, fiches = []) {
  if (fiches.length < 2) return null;
  const note = sansAccents(note0 || '');
  const mots = [...new Set(note.split(/[^a-z0-9]+/).filter((m) => m.length >= 3 && !MOTS_CONSIGNE.has(m)))];
  const scores = fiches.map((f) => {
    const nom = sansAccents(f?.nom || '').split(/[^a-z0-9]+/).filter(Boolean);
    return mots.filter((m) => nom.some((n) => n === m || (m.length >= 4 && (n.startsWith(m) || m.startsWith(n)) && n.length >= 4))).length;
  });
  const max = Math.max(...scores);
  if (max > 0) return fiches.filter((_, i) => scores[i] === max).map((f) => f.piece_id);
  for (const [re, i] of ORDINAUX) if (re.test(note) && fiches[i]) return [fiches[i].piece_id];
  if (/\b(derniere|dernier)\b/.test(note)) return [fiches[fiches.length - 1].piece_id];
  return null;
}

/**
 * Pure : ce que le collègue demande. `fiche` (pré-analyser ; `seulement` : les fiches désignées), `memoire` (les fiches
 * en Mémoire, sans dossier), `documents` (dans la Data Room d'un dossier), `demande` (une question, sans pièce : le chat
 * de Haka). `dossier` : celui retenu ; `candidats` : quand il faut demander.
 */
export function comprendre(lu, { pieces = [], fiches = [], vises = [], corps = false } = {}) {
  // Un mail écrit directement à sourcing@ (pas un transfert) : son objet est aussi la consigne (« Préanalyse » en objet,
  // corps vide). Pour un transfert, l'objet est celui de l'agent : il ne compte pas (17 nov. 2026, Jules).
  const consigne = lu.transfert ? (lu.note || '') : `${lu.note || ''} ${lu.objet_origine || ''}`;
  const note = sansAccents(consigne);
  // Sans pièce : une question, sauf la fiche écrite dans le mail transféré sans un mot (22 nov. 2026) : en Mémoire.
  if (!pieces.length) return corps && !note.trim() ? { intention: 'memoire', defaut: true, corps: true } : { intention: 'demande' };
  if (MOTS_MEMOIRE.test(note) || PAS_DE_PREANALYSE.test(note)) return { intention: 'memoire' };
  const veutFiche = MOTS_FICHE.test(note) || (fiches.length > 0 && MOTS_RENTRER.test(note));
  const veutDocs = !veutFiche && MOTS_DOCUMENTS.test(note);
  const sur = vises[0] && (vises.length === 1 || vises[0].score >= vises[1].score + 1.5) && vises[0].score >= 1.5 ? vises[0] : null;
  if (veutFiche) {
    const seulement = fichesVisees(consigne, fiches);
    return seulement ? { intention: 'fiche', seulement } : { intention: 'fiche' };
  }
  // Aucun dossier reconnu (2 nov. 2026, Jules) : un nouveau dossier, sans demander.
  if (veutDocs) return sur ? { intention: 'documents', dossier: sur.deal_id } : vises.length ? { intention: 'documents', candidats: vises.slice(0, 4) } : { intention: 'nouveau' };
  // Une fiche transférée sans consigne va en Mémoire (17 nov. 2026, Jules : « si la personne transfère juste, on rentre la
  // fiche en mémoire ; si on ne dit rien, ce n'est pas à pré-analyser »).
  if (fiches.length) return { intention: 'memoire', defaut: true };
  // Sans fiche ni consigne : un dossier évident reçoit les pièces ; des pièces sans dossier font un nouveau dossier ;
  // plusieurs dossiers possibles : on demande.
  if (sur) return { intention: 'documents', dossier: sur.deal_id };
  if (!vises.length) return { intention: 'nouveau' };
  return { intention: 'documents', candidats: vises.slice(0, 4), ou_fiche: fiches.length > 0 };
}

// La consigne lue par l'IA (17 nov. 2026, Jules : « il faut que ça analyse le message ») : les mots-clés ne voient ni
// une négation ni une tournure (« ne préanalyse pas », « garde-la juste pour info »). Un modèle rapide lit la consigne
// et la liste des pièces ; les règles de `comprendre` restent en secours s'il ne répond pas. Sans consigne, pas d'appel.
const MODELE_CONSIGNE = 'claude-haiku-4-5';
const SCHEMA_CONSIGNE = {
  type: 'object',
  properties: {
    intention: { type: 'string', enum: ['memoire', 'preanalyse', 'documents', 'question'] },
    fiches: { type: 'array', items: { type: 'integer' }, description: 'numéros des fiches à pré-analyser ; vide = toutes' },
    raison: { type: 'string' },
  },
  required: ['intention'],
};

/** Pure : la question posée au modèle. */
export function promptConsigne(consigne, { pieces = [], fiches = [], transfert = false } = {}) {
  const liste = pieces.map((p, i) => `${i + 1}. ${p?.nom || 'pièce'}${fiches.some((f) => f === p || (f?.piece_id && f.piece_id === p?.piece_id)) ? ' (fiche de bien)' : ''}`).join('\n');
  return `Un membre de l'équipe Klocka (immobilier commercial) ${transfert ? 'transfère un mail' : 'écrit un mail'} à la boîte sourcing@ avec des pièces jointes. Voici son message, le seul texte qui compte :
"""
${String(consigne || '').slice(0, 1500)}
"""
Pièces jointes :
${liste || '(aucune)'}

Que veut-il ? Une seule intention :
- "memoire" : garder la ou les fiches en mémoire seulement, sans dossier (y compris « ne préanalyse pas », « pour info », « garde-la »).
- "preanalyse" : créer un dossier et pré-analyser ; « fiches » donne les numéros des fiches à pré-analyser s'il en désigne certaines (« juste celle de Lyon », « la deuxième »), sinon une liste vide pour toutes.
- "documents" : ranger les pièces dans un dossier existant (bail, data room, documents d'un bien déjà suivi).
- "question" : il pose une question ou demande autre chose qu'un rangement.
En cas de doute entre mémoire et pré-analyse, choisis "memoire".`;
}

/** Pure : des documents pour un dossier : celui qui est sûr, sinon on demande, sinon un nouveau dossier. */
function versDocuments(vises) {
  const sur = vises[0] && (vises.length === 1 || vises[0].score >= vises[1].score + 1.5) && vises[0].score >= 1.5 ? vises[0] : null;
  return sur ? { intention: 'documents', dossier: sur.deal_id } : vises.length ? { intention: 'documents', candidats: vises.slice(0, 4) } : { intention: 'nouveau' };
}

/**
 * Ce que le collègue demande, lu par l'IA quand il a écrit quelque chose. Rend la même forme que `comprendre`, plus
 * `lu_par: 'ia' | 'regles'`. `lire` : remplacé dans les tests.
 */
export async function comprendreAvecIA(lu, { pieces = [], fiches = [], vises = [], corps = false } = {}, { lire = null } = {}) {
  const regles = comprendre(lu, { pieces, fiches, vises, corps });
  const consigne = (lu.transfert ? (lu.note || '') : `${lu.note || ''} ${lu.objet_origine || ''}`).trim();
  // Sous les tests sans modèle branché : les règles (le modèle factice répondrait n'importe quoi).
  if (!pieces.length || !consigne || (!lire && process.env.NODE_TEST_CONTEXT)) return { ...regles, lu_par: 'regles' };
  try {
    const demander = lire || (async (prompt) => (await import('../../llm.js')).invokeLLM({ prompt, response_json_schema: SCHEMA_CONSIGNE, modele: MODELE_CONSIGNE, max_tokens: 400 }));
    const r = await demander(promptConsigne(consigne, { pieces, fiches, transfert: lu.transfert }));
    const fichesIds = (r?.fiches || []).map((n) => pieces[Number(n) - 1]?.piece_id).filter((id) => id && fiches.some((f) => f?.piece_id === id));
    if (r?.intention === 'memoire') return fiches.length ? { intention: 'memoire', lu_par: 'ia', raison: r.raison || null } : { ...versDocuments(vises), lu_par: 'ia' };
    if (r?.intention === 'preanalyse') return { intention: 'fiche', ...(fichesIds.length && fichesIds.length < fiches.length ? { seulement: fichesIds } : {}), lu_par: 'ia', raison: r.raison || null };
    if (r?.intention === 'documents') return { ...versDocuments(vises), lu_par: 'ia' };
    if (r?.intention === 'question') return { intention: 'demande', lu_par: 'ia' };
  } catch (e) {
    console.warn('[transfert] consigne lue par les règles :', e?.message || e);
  }
  return { ...regles, lu_par: 'regles' };
}

/** Qui peut transférer : un compte de l'équipe ou un mandataire. */
export function expediteurDuTransfert(email) {
  const e = norm(email);
  if (!e) return null;
  const u = Records.list('User').find((x) => norm(x.email) === e && (x.role === 'admin' || estMandataire(x)));
  if (u) return u;
  // La boîte commune qui s'écrit à elle-même (17 nov. 2026 : un test envoyé depuis sourcing@) : elle compte comme l'équipe.
  const communes = String(process.env.HAKA_BOITES_COMMUNES || 'sourcing@klocka.immo').toLowerCase().split(',').map((x) => x.trim());
  if (communes.includes(e)) {
    const compte = Records.list('User').find((x) => norm(x.email) === e);
    return { ...(compte || {}), email: e, role: 'admin', full_name: compte?.full_name || 'Sourcing Klocka' };
  }
  return null;
}

/**
 * Pure : le côté où entre le transfert, ou null quand il faut le demander. Une question sans rien à importer et
 * « seulement en Mémoire » restent à l'équipe ; tout le reste se demande, même quand un dossier d'équipe semble évident :
 * l'agent d'origine peut avoir un dossier ouvert côté admin et un bien côté mandataire.
 */
// 18 nov. 2026 (Jules : « j'ai transféré un dossier avec Préanalyse ce bien et ça l'a pas fait ») : la question du côté
// partait dans la cloche, retirée de l'écran le 15 nov., et le transfert attendait pour toujours. Plus de question : un
// compte admin et mandataire entre côté admin, sauf si son message dit le côté mandataire.
const COTE_MANDATAIRE = /\b(cote|espace|vue|compte)\s+(du\s+)?mandataire\b|\ben tant que mandataire\b|\bdans mes biens\b|\bcote\s+k\s?partners\b/;
export function coteDuTransfert(u, c, lu) {
  if (!estMandataire(u)) return 'admin';
  if (u.role !== 'admin') return 'mandataire';
  if (c.intention === 'memoire' || (c.intention === 'demande' && !lu.transfert)) return 'admin';
  return COTE_MANDATAIRE.test(sansAccents(lu.note || '')) ? 'mandataire' : 'admin';
}

/**
 * Les transferts qui attendent encore la question du côté (invisible depuis le 15 nov.) : le côté est déduit comme
 * ci-dessus et la tâche repart. Une fois au démarrage (`cle`).
 */
export async function debloquerCotes({ cle = 'transfert.cotes.2026-11-18', journal = console.log } = {}) {
  const { Meta } = await import('../../db.js');
  if (cle && Meta.get(cle)) return { deja: true };
  let n = 0;
  for (const p of Records.list('HakaProposition').filter((x) => x.type === 'transfert_cote' && x.etat === 'proposee')) {
    const mail = Records.get('MailRecu', p.charge?.mail_id);
    const membre = mail && expediteurDuTransfert(mail.de_email);
    if (!membre) continue;
    const lu = lireTransfert({ texte: mail.texte, objet: mail.objet });
    const choix = coteDuTransfert(membre, { intention: mail.haka_transfert?.intention || 'fiche' }, lu);
    try {
      const r = await file.valider(p.id, membre, { choix });
      if (r?.ok) { n += 1; journal(`[transfert] « ${String(lu.objet_origine || mail.objet || '').slice(0, 70)} » de ${mail.de_email} : côté ${choix}, la tâche repart`); }
    } catch (e) { journal(`[transfert] côté non posé pour ${p.id} : ${e?.message || e}`); }
  }
  if (cle) Meta.set(cle, new Date().toISOString());
  return { n };
}

// ---------------------------------------------------------------------------
// 4. Agir
// ---------------------------------------------------------------------------

/** Une pièce simulée (`local:`) se lit sur le disque ; une vraie, dans la boîte sourcing@. */
const telecharger = async (compte, messageId, pieceId) => {
  if (String(pieceId || '').startsWith('local:')) return fs.readFileSync(String(pieceId).slice('local:'.length));
  const { telechargerPieceJointe } = await import('../../gmail-inbox.js');
  return telechargerPieceJointe(compte, messageId, pieceId);
};

async function preanalyser(mail, { membre, lu, uploadDir, seulement = null }) {
  const contact = lu.origine?.email && !membreDeLEquipe(lu.origine.email) ? lu.origine.email : null;
  const locale = piecesUtiles(mail).find((p) => String(p?.piece_id || '').startsWith('local:'));
  let dossier;
  if (locale || SIMULER) {
    if (!locale) throw new Error("Simulation : le mail n'a pas de pièce locale à lire.");
    const { analyserFiche } = await import('../../deal/index.js');
    dossier = await analyserFiche({ buffer: fs.readFileSync(String(locale.piece_id).slice('local:'.length)), filename: locale.nom, mimetype: locale.mime || undefined, contactEmail: contact }, { user: membre, uploadDir, automatique: true });
    Records.update('MailRecu', mail.id, { deal_id: dossier.deal_id });
  } else {
    const { preanalyserMail } = await import('../../deal/preanalyser-mail.js');
    dossier = await preanalyserMail(mail, { user: membre, uploadDir, contactEmail: contact, automatique: true, seulement });
  }
  const rejoint = !!(dossier.repris_conversation || dossier.doublon);
  // Chaque dossier né du mail (un par fiche) est nommé, attribué et mis en Mémoire, pas seulement le premier.
  for (const un of (rejoint ? [] : dossier.dossiers || [dossier])) {
    const deal = Records.findBy('Deal', 'deal_id', un.deal_id);
    if (deal) await finirDossier(deal, { mail, membre, lu });
  }
  const d = Records.findBy('Deal', 'deal_id', dossier.deal_id);
  const n = rejoint ? 0 : (dossier.dossiers || [dossier]).length;
  return { fait: rejoint ? 'rejoint' : 'fiche', deal_id: dossier.deal_id, nom: d?.nom || null, verdict: d?.lots?.[0]?.evaluation?.verdict || null, crm: d?.memoire_crm || null, n_dossiers: n };
}

/** Un dossier né du transfert : son nom, son responsable, d'où il vient, puis sa fiche en Mémoire et dans Twenty. */
async function finirDossier(deal, { mail, membre, lu }) {
  const val = (x) => (x && typeof x === 'object' && 'valeur' in x ? (x.absent ? null : x.valeur) : x);
  const l = deal.lots?.[0]?.lot || {};
  const adresse = val(l.adresse) || {};
  const { titreDossier } = await import('../../deal/titre-dossier.js');
  const nom = titreDossier({ enseigne: val(l.locataire_nom), activite: val(l.locataire_activite), ville: (typeof adresse === 'object' && adresse.ville) || deal.lots?.[0]?.enrichissement?.commune?.nom || null });
  Records.update('Deal', deal.id, {
    ...(nom ? { nom } : {}),
    responsables: [membre.full_name || membre.email], responsable_email: norm(membre.email),
    source_mail: { ...(deal.source_mail || {}), mail_recu_id: mail.id, de: lu.origine?.email || mail.de_email, objet: lu.objet_origine || mail.objet, date: lu.date_origine || mail.date, transfere_par: norm(membre.email) },
    par_haka: { competence: COMPETENCE, version: VERSION, le: new Date().toISOString() },
    apports: [...(deal.apports || []), { de: lu.origine?.email || null, transfere_par: norm(membre.email), mail_recu_id: mail.id, le: new Date().toISOString() }],
  });
  const { ajouterSuivi } = await import('../../deal/lifecycle.js');
  ajouterSuivi(Records.get('Deal', deal.id), { type: 'preanalyse_auto', detail: `Transféré à l'Assistant Klocka par ${membre.full_name || membre.email}${lu.origine?.email ? ` (fiche de ${lu.origine.email})` : ''} : dossier créé et pré-analysé` }, membre);
  const crm = await versMemoireEtTwenty(Records.get('Deal', deal.id), membre);
  Records.update('Deal', deal.id, { memoire_crm: crm });
}

async function ranger(mail, { membre, dealId, uploadDir }) {
  const deal = Records.findBy('Deal', 'deal_id', dealId);
  if (!deal) throw new Error('Dossier introuvable');
  Records.update('MailRecu', mail.id, { deal_id: dealId, haka_attente_rangement: false, pieces_ingerees: false });
  const { ingererPiecesJointes } = await import('../../deal/pieces-mails.js');
  const r = await ingererPiecesJointes(Records.get('MailRecu', mail.id), uploadDir || CHEMIN_UPLOADS, membre, telecharger, { ranger: !SIMULER && !deal.test, dataRoom: true });
  if (!r.deposes.length && r.erreurs.length && !r.erreurs.every((e) => /déjà au dossier/.test(e))) throw new Error(r.erreurs[0]);
  // La Data Room (2 nov. 2026, Jules) : les noms proposés, le Drive par familles, la lecture sur la grille de chaque pièce.
  // En simulation, rien ne part au modèle ni vers Google.
  let suite = null;
  if (r.ids?.length && !SIMULER) {
    const { rangerEtAnalyser } = await import('../../deal/data-room.js');
    suite = await rangerEtAnalyser(dealId, r.ids, { uploadDir: uploadDir || CHEMIN_UPLOADS, user: membre }).catch((e) => ({ ok: false, drive: { ok: false, erreur: e?.message || String(e) }, lancees: 0 }));
  }
  return { fait: 'documents', deal_id: dealId, nom: deal.nom || dealId, deposes: r.deposes, deja: r.erreurs.filter((e) => /déjà au dossier/.test(e)).map((e) => e.split(' : ')[0]), drive: suite?.drive || null, lancees: suite?.lancees || 0 };
}

/**
 * Un dossier né d'un transfert (2 nov. 2026, Jules) : sa fiche en Mémoire (ligne « dossier ») et sa Propriété dans
 * Twenty CRM, avec l'adresse, le loyer, le prix et l'agent, tout de suite. Jamais bloquant : rend ce qui a été fait.
 */
export async function versMemoireEtTwenty(deal, membre, { pousser = null } = {}) {
  const { memoriser } = await import('../../memoire/memoire.js');
  const m = memoriser(deal, { origine: 'dossier', par: membre });
  if (!m.ok) return { memoire: false, raison: m.raison };
  return { memoire: true, ...(await versTwenty(m.bien, pousser)) };
}

async function versTwenty(bien, pousser = null) {
  if (SIMULER && !pousser) return { twenty: false };
  try {
    const p = pousser || (await import('../../memoire/twenty.js')).pousserBienMemoire;
    const r = await p(bien);
    return r?.ignore ? { twenty: false, raison: r.raison } : { twenty: true, twenty_id: r?.id || null };
  } catch (e) {
    console.warn('[transfert] Twenty :', e?.message || e);
    return { twenty: false, raison: e?.message || String(e) };
  }
}

/**
 * « Ne rentre pas la fiche dans la plateforme » (2 nov. 2026, Jules) : aucun dossier. La fiche est lue une fois, le
 * bien va en Mémoire (statut Mémoire, la fiche gardée) et devient une Propriété de Twenty CRM. L'agent est
 * l'expéditeur d'origine quand la fiche ne le nomme pas. La même pièce transférée deux fois n'est lue qu'une fois.
 */
// Les pièces lues en plus des fiches reconnues (18 nov. 2026, Jules : « des fiches ne sont pas lues », 17 avenue
// Jean-Médecin) : une fiche nommée « Bail… », « Mandat… », « Local … plan » ou une capture n'était jamais lue. Un
// transfert à sourcing@ est un geste voulu : chaque document est lu, l'extraction dit s'il y a un bien ; une image ne
// l'est que si rien d'autre n'en a donné (trois au plus : souvent des photos du local).
const DOC = /\.(pdf|docx?|odt|ods|odp|pptx|xlsx|xlsm|rtf)$/i;
const IMAGE = /\.(jpe?g|png|webp)$/i;
const IMAGES_MAX = 3;

export async function enMemoireSeulement(mail, { membre, lu, extraire = null, pousser = null, pieces = null, ouvrirZip = null }) {
  // Toutes les fiches du mail (17 nov. 2026 : avant, la première seule), ou celles qu'on désigne.
  const fiches = piecesFiche(mail).filter((p) => p?.piece_id);
  const utiles = piecesUtiles(mail).filter((p) => p?.piece_id);
  // Les fiches d'un ZIP joint, chacune lue comme une pièce (22 nov. 2026, Jules : « n'importe quel type de documents »).
  const dansLesZips = [];
  if (!pieces) {
    const { zipsDuMail, fichesDuZip } = await import('../../deal/zip-fiches.js');
    for (const z of zipsDuMail(mail)) {
      try {
        const entrees = await (ouvrirZip || fichesDuZip)(await telecharger(mail.compte, mail.gmail_message_id, z.piece_id));
        for (const e of entrees) dansLesZips.push({ ...e, piece_id: `${z.piece_id}#${e.nom}` });
      } catch (e) { console.warn(`[transfert] ZIP ${z.nom} :`, e?.message || e); }
    }
  }
  // Sans pièce, la fiche écrite dans le mail lui-même (le texte transféré de l'agent).
  const corps = !pieces && !fiches.length && !dansLesZips.length && !utiles.length ? ficheDuCorps(mail, lu) : null;
  const vagues = pieces
    ? [utiles.filter((p) => pieces.includes(p.piece_id))]
    : [[...fiches, ...dansLesZips, ...(corps ? [corps] : [])], utiles.filter((p) => !fiches.includes(p) && DOC.test(p.nom || '')), utiles.filter((p) => IMAGE.test(p.nom || '')).slice(0, IMAGES_MAX)];
  if (!vagues.some((v) => v.length)) throw new Error('Aucune fiche à lire dans ce transfert.');
  const biens = [];
  const erreurs = [];
  const lues = [];
  for (const [i, vague] of vagues.entries()) {
    // Les images seulement si les documents n'ont rien donné.
    if (i === 2 && biens.length) break;
    for (const piece of vague) {
      try {
        // Entre fiches reconnues, deux lignes à la même adresse restent deux fiches ; une pièce en plus ne double pas un bien lu.
        // Un PDF peut porter plusieurs fiches (20 nov. 2026, Jules : « un seul PDF, et il y avait 4 fiches dedans ») : chacune.
        for (const b of await fichesEnMemoire(mail, piece, { membre, lu, extraire, pousser, deja: i === 0 ? [] : lues })) {
          biens.push(b); if (b.cle_adresse) lues.push(b.cle_adresse);
        }
      } catch (e) {
        // Une pièce en plus qui n'est pas une fiche (un bail sans adresse, une photo) ne se dit pas en erreur.
        if (i === 0 || pieces) erreurs.push(`${piece.nom || 'fiche'} : ${e?.message || e}`);
      }
    }
  }
  if (!biens.length) throw new Error(erreurs[0] || "Aucune pièce du mail ne donne d'adresse, de prix ou de loyer.");
  const premier = biens[0];
  return { fait: 'memoire', n: biens.length, deja: biens.every((b) => b.deja), nom: premier.nom, noms: biens.map((b) => b.nom).filter(Boolean), twenty: biens.some((b) => b.twenty), erreurs };
}

/** Pure : la fiche écrite dans le corps d'un transfert sans pièce, quand le texte parle d'un bien et donne un montant. */
export function ficheDuCorps(mail, lu = {}) {
  const texte = String(mail?.texte || '').trim();
  if (texte.length < 80 || !parleDUnBien({ objet: lu.objet_origine || mail.objet, texte })) return null;
  if (!/\d[\d\s.\u00a0\u202f]*(?:k?\s?€|euros?|\s?k\b|\s?m€)/i.test(texte)) return null;
  return { nom: 'texte-du-mail.txt', mime: 'text/plain', buffer: Buffer.from(texte, 'utf-8'), piece_id: `corps:${mail.id}`, corps: true };
}

/** Une lecture de pièce, notée sur le mail reçu (une par pièce, la dernière l'emporte). */
function noterLecture(mailId, lecture) {
  const m = Records.get('MailRecu', mailId);
  if (!m) return;
  const autres = (m.fiches_lues || []).filter((x) => x.nom !== lecture.nom);
  Records.update('MailRecu', mailId, { fiches_lues: [...autres, { ...lecture, le: new Date().toISOString() }] });
}

async function fichesEnMemoire(mail, piece, { membre, lu, extraire = null, pousser = null, deja: adressesLues = [] }) {
  const M = await import('../../memoire/memoire.js');
  const buffer = piece.buffer || await telecharger(mail.compte, mail.gmail_message_id, piece.piece_id);
  const hash = M.hashDe(buffer);
  // La pièce déjà lue (un renvoi) : ses biens sont déjà là, le mail les rejoint.
  const dejaLus = Records.filter(M.ENTITE, { hash_piece: hash });
  if (dejaLus.length) {
    const m = Records.get('MailRecu', mail.id);
    Records.update('MailRecu', mail.id, { memoire_deja_ids: [...new Set([...(m?.memoire_deja_ids || []), ...dejaLus.map((d) => d.id)])] });
    const sortie = [];
    for (const d of dejaLus) sortie.push({ deja: true, cle_adresse: d.cle_adresse || null, nom: d.adresse?.rue || d.ville || null, ...(await versTwenty(d, pousser)) });
    return sortie;
  }
  const lire = extraire || (await import('../../deal/extraire-faits.js')).extraireFaits;
  const faits = await lire({ buffer, filename: piece.nom, mimetype: piece.mime }, { par: membre.email });
  const origine = lu.origine?.email && !membreDeLEquipe(lu.origine.email) ? lu.origine : null;
  const agentFiche = faits.agent || {};
  const agent = { ...agentFiche, email: agentFiche.email || origine?.email || null, nom: agentFiche.nom || origine?.nom || null };
  const lots = (faits.lots || []).length ? faits.lots : [null];
  const sortie = [];
  let fiche = null;
  let doublons = 0;
  for (const lot of lots) {
    const bien = M.bienDepuisLot(lot, agent, {
      // Reçue : le jour où le mail est arrivé chez nous, pas celui où l'agent l'avait écrit (18 nov. 2026, Jules).
      recu_le: mail.date || new Date().toISOString(),
      compte: mail.compte, gmail_message_id: mail.gmail_message_id, hash_piece: hash, mail_recu_id: mail.id,
      origine: 'transfert', statut: 'memoire',
    });
    if (!bien.cle_adresse && !bien.prix && !bien.loyer_annuel) continue;
    // Le bail ou le plan du bien dont la fiche vient d'être lue, dans le même mail : pas une seconde ligne.
    if (bien.cle_adresse && adressesLues.includes(bien.cle_adresse)) { doublons += 1; continue; }
    // Le PDF écrit une fois, partagé par les biens qu'il porte.
    fiche = fiche || M.ecrireFiche(buffer, piece.nom, piece.mime);
    bien.fiche = fiche;
    const cree = Records.create(M.ENTITE, { ...bien, objet_mail: String(lu.objet_origine || mail.objet || '').slice(0, 200), par: norm(membre.email), maj_le: new Date().toISOString() }, membre.email);
    const m = Records.get('MailRecu', mail.id);
    Records.update('MailRecu', mail.id, { memoire_id: m?.memoire_id || cree.id, memoire_ids: [...(m?.memoire_ids || []), cree.id] });
    const ou = [bien.adresse?.rue, bien.ville].filter(Boolean).join(', ');
    sortie.push({ nom: ou || null, cle_adresse: bien.cle_adresse || null, ...(await versTwenty(cree, pousser)) });
  }
  // Ce que la lecture a vu, gardé sur le mail pour le compte des fiches reçues (deal/fiches-stats.js) : les biens lus, le
  // nombre que la pièce annonce (« 4 actifs »), et si c'est un tableur (une liste de biens, comptée à part).
  noterLecture(mail.id, { nom: piece.nom || null, biens: sortie.length, annonce: faits.biens_annonces ?? null, tableur: faits.source === 'tableur' || estTableur(piece.nom, piece.mime) });
  // Rien de lisible (ni adresse, ni prix, ni loyer) : une erreur ; un bien déjà lu dans une autre pièce du mail n'en est pas une.
  if (!sortie.length && !doublons) throw new Error("La fiche ne donne ni adresse, ni prix, ni loyer : rien à garder en Mémoire.");
  return sortie;
}

/**
 * Des pièces sans dossier reconnu ni fiche (2 nov. 2026, Jules : « une data room d'un nouveau dossier ») : un dossier
 * vide au nom de l'objet d'origine, au nom du collègue, l'agent d'origine en contact ; ses pièces dans la Data Room,
 * puis la pré-analyse par les documents (le chemin « sans teaser »).
 */
async function nouveauDossier(mail, { membre, lu, uploadDir }) {
  const { creerCoquille } = await import('../../deal/index.js');
  const objet = String(lu.objet_origine || mail.objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim();
  const contact = lu.origine?.email && !membreDeLEquipe(lu.origine.email) ? lu.origine.email : null;
  const d = creerCoquille({ nom: (objet || `Transfert de ${membre.full_name || membre.email}`).slice(0, 120), responsables: [membre.full_name || membre.email], user: membre, contact_agent_email: contact });
  const deal = Records.findBy('Deal', 'deal_id', d.deal_id);
  Records.update('Deal', deal.id, {
    responsable_email: norm(membre.email),
    source_mail: { mail_recu_id: mail.id, de: lu.origine?.email || mail.de_email, objet: lu.objet_origine || mail.objet, date: lu.date_origine || mail.date, transfere_par: norm(membre.email) },
    par_haka: { competence: COMPETENCE, version: VERSION, le: new Date().toISOString() },
  });
  const r = await ranger(mail, { membre, dealId: d.deal_id, uploadDir });
  if (r.deposes.length && !SIMULER) {
    const { lancerPreanalyseDocuments } = await import('../../deal/preanalyse-documents.js');
    // La fiche composée des pièces a une adresse : la Mémoire et Twenty suivent, dès la pré-analyse faite.
    lancerPreanalyseDocuments(d.deal_id, { user: membre, uploadDir: uploadDir || CHEMIN_UPLOADS, apres: (id) => {
      const fait = Records.findBy('Deal', 'deal_id', id);
      if (fait) versMemoireEtTwenty(fait, membre).catch((e) => console.warn('[transfert] mémoire :', e?.message || e));
    } });
  }
  return { ...r, fait: 'nouveau', preanalyse: r.deposes.length > 0 && !SIMULER };
}

/** Les pièces du transfert en mémoire, celles des ZIP comprises. */
async function fichiersDuMail(mail) {
  const { fichesDuZip, zipsDuMail } = await import('../../deal/zip-fiches.js');
  const fichiers = [];
  for (const p of piecesUtiles(mail)) fichiers.push({ nom: p.nom, mime: p.mime || null, buffer: await telecharger(mail.compte, mail.gmail_message_id, p.piece_id) });
  for (const z of zipsDuMail(mail)) fichiers.push(...(await fichesDuZip(await telecharger(mail.compte, mail.gmail_message_id, z.piece_id), (nom) => UTILES.test(nom) && !PARASITES.test(nom))));
  return fichiers;
}

/** Pure : ce qui a suivi le dépôt, en une phrase : le Drive, puis la lecture. */
function suiteDataRoom(r) {
  const drive = r.drive?.ok ? (r.drive.test ? '' : ' Rangées dans le Drive.') : r.drive ? ` Le Drive n'a pas répondu (${r.drive.erreur}) : « Ranger dans le Drive » dans la Data Room.` : '';
  return `${drive} La lecture des pièces est lancée.`;
}

/** Pure : ce que Haka a fait du transfert, en une ou deux phrases. */
export function ceQuiEstFait(r) {
  let corps;
  if (r.fait === 'fiche') {
    const autres = r.memoire_autres?.n ? ` Les ${r.memoire_autres.n} autre${r.memoire_autres.n > 1 ? 's' : ''} fiche${r.memoire_autres.n > 1 ? 's' : ''} du mail ${r.memoire_autres.n > 1 ? 'sont' : 'est'} en Mémoire.` : '';
    corps = (r.n_dossiers > 1 ? `C'est fait : ${r.n_dossiers} dossiers créés à votre nom et pré-analysés, dont « ${r.nom || 'nouveau bien'} ». Leurs fiches sont en Mémoire.` : `C'est fait : le dossier « ${r.nom || 'nouveau bien'} » est créé à votre nom et pré-analysé${r.verdict ? ` (verdict : ${r.verdict})` : ''}.${r.crm?.memoire ? ' Sa fiche est en Mémoire' + (r.crm?.twenty ? ' et dans les Propriétés de Twenty CRM.' : '.') : ''}`) + autres;
  }
  else if (r.fait === 'rejoint') corps = `Ce bien était déjà en dossier (« ${r.nom || r.deal_id} ») : j'y ai rattaché votre transfert, sans en créer un second.`;
  else if (r.fait === 'documents') corps = r.deposes.length ? `C'est fait : ${r.deposes.length} pièce${r.deposes.length > 1 ? 's' : ''} dans la Data Room de « ${r.nom} » (${r.deposes.join(', ')}).${suiteDataRoom(r)}${r.deja.length ? ` Déjà présentes, non redéposées : ${r.deja.join(', ')}.` : ''}` : `Ces pièces étaient déjà dans la Data Room de « ${r.nom} » : rien à ajouter.`;
  else if (r.fait === 'nouveau') corps = r.deposes.length ? `Je n'ai reconnu aucun dossier ouvert : j'ai créé « ${r.nom} » à votre nom, avec ${r.deposes.length} pièce${r.deposes.length > 1 ? 's' : ''} dans sa Data Room (${r.deposes.join(', ')}).${suiteDataRoom(r)}${r.preanalyse ? ' La pré-analyse part de ces documents ; sa fiche ira ensuite en Mémoire et dans les Propriétés de Twenty CRM.' : ''}` : `J'ai créé « ${r.nom} », mais aucune pièce n'a pu y entrer.`;
  else if (r.fait === 'memoire') corps = `${r.n > 1 ? `${r.n} fiches mises` : r.deja ? 'Cette fiche était déjà' : 'Fiche mise'} en Mémoire${r.n > 1 ? '' : r.nom ? ` (${r.nom})` : ''}${r.twenty ? ' et dans les Propriétés de Twenty CRM' : ''}, sans dossier. Pour la pré-analyser, transférez-la avec « préanalyse » dans votre message.${r.erreurs?.length ? ` Non lue : ${r.erreurs.join(' ; ')}.` : ''}`;
  else corps = "Je n'ai rien fait de ce transfert.";
  return corps;
}

/** Pure : la notification au collègue, une fois le geste fait (2 nov. 2026 : plus de mail). */
export function compteRendu(r, { objet = '' } = {}) {
  const sujet = String(objet || '').replace(/^\s*((tr|fwd?|re)\s*:\s*)+/i, '').trim();
  return {
    titre: `Votre transfert${r.nom ? ` · ${r.nom}` : sujet ? ` · ${sujet}` : ''}`.slice(0, 140),
    texte: ceQuiEstFait(r),
    lien: r.deal_id ? `/Dossiers?deal_id=${r.deal_id}` : null,
  };
}

taches.enregistrer(COMPETENCE, {
  version: VERSION,
  etapes: [
    {
      nom: 'comprendre',
      async run({ charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        if (!mail) throw new Error('Mail introuvable');
        const membre = expediteurDuTransfert(mail.de_email);
        if (!membre) return { fin: true, ignore: 'expéditeur hors équipe' };
        const lu = lireTransfert({ texte: mail.texte, objet: mail.objet });
        // Un ZIP joint compte comme une fiche (ses fiches sont lues une à une, enMemoireSeulement).
        const { zipsDuMail } = await import('../../deal/zip-fiches.js');
        const zips = zipsDuMail(mail);
        const pieces = [...piecesUtiles(mail), ...zips];
        const fiches = [...piecesFiche(mail).filter(Boolean), ...zips];
        const vises = dossiersVises(lu, Records.list('Deal'), { collegue: membre.email });
        const c = await comprendreAvecIA(lu, { pieces, fiches, vises, corps: !!ficheDuCorps(mail, lu) });
        Records.update('MailRecu', mail.id, { haka_transfert: { intention: c.intention, lu_par: c.lu_par, raison: c.raison || null, origine: lu.origine?.email || null, le: new Date().toISOString() } });
        return { ...c, cote: coteDuTransfert(membre, c, lu), lu, pour: norm(membre.email), pieces: pieces.map((p) => p.nom) };
      },
    },
    {
      // Admin et mandataire à la fois : côté mandataire ou côté admin ? La question part dans sa cloche, dans les deux vues.
      nom: 'demander_cote',
      async run({ tache, resultats, charge }) {
        const c = resultats.comprendre;
        if (c.cote) return { sauter: ['choisir_cote'] };
        const mail = Records.get('MailRecu', charge.mail_id);
        const p = await file.proposer({
          type: 'transfert_cote', titre: `Votre transfert « ${String(c.lu.objet_origine || mail.objet || '').slice(0, 60)} » : côté mandataire ou côté admin ?`,
          resume: c.pieces.length ? `${c.pieces.length} pièce${c.pieces.length > 1 ? 's' : ''} : ${c.pieces.slice(0, 4).join(', ')}.` : null,
          charge: { mail_id: mail.id }, sources: [sourceMail(mail)], pour: c.pour, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'choisir_cote',
          cle: `transfert-cote:${mail.id}`, actions: ['choisir'], genre: 'question_cote',
          choix: [{ cle: 'mandataire', libelle: 'Côté mandataire' }, { cle: 'admin', libelle: 'Côté admin' }],
        });
        return { attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      nom: 'choisir_cote', externe: true,
      async run({ charge }) {
        if (!['mandataire', 'admin'].includes(charge.choix)) throw new Error('Choisissez un côté.');
        return { choix: charge.choix, enFond: true };
      },
    },
    {
      // Côté mandataire, le bien entre dans ses Biens et la tâche s'arrête là ; côté admin, le transfert continue comme avant.
      nom: 'cote_mandataire',
      async run({ resultats, charge }) {
        const c = resultats.comprendre;
        if ((c.cote || resultats.choisir_cote?.choix) !== 'mandataire') return {};
        const mail = Records.get('MailRecu', charge.mail_id);
        const user = expediteurDuTransfert(mail.de_email);
        const M = await import('../../transfert-mandataire.js');
        const r = await M.bienDepuisTransfert(mail, { user, lu: c.lu, uploadDir: charge.uploadDir || CHEMIN_UPLOADS, fichiers: await fichiersDuMail(mail) });
        const n = M.compteRenduBien(r, { objet: mail.objet });
        notifier({ pour: norm(user.email), titre: n.titre, texte: n.texte, lien: n.lien, action: n.lien ? 'Ouvrir le bien' : null, cle: `haka-transfert:${mail.id}` });
        return { fin: true, ...r };
      },
    },
    {
      // Une simple demande, sans pièce : la compétence « demande de l'équipe » (le chat de Haka) la prend.
      nom: 'demande',
      async run({ resultats, charge }) {
        if (resultats.comprendre.intention !== 'demande') return {};
        const t = taches.enfiler('demande_equipe', { mail_id: charge.mail_id }, { cle: `demande:${charge.mail_id}`, pour: resultats.comprendre.pour });
        Records.update('MailRecu', charge.mail_id, { haka_tache_id: t.id });
        return { fin: true, demande: t.id };
      },
    },
    {
      // Plusieurs dossiers possibles, ou aucun : on demande au collègue, dans sa cloche.
      nom: 'demander_dossier',
      async run({ tache, resultats, charge }) {
        const c = resultats.comprendre;
        if (['fiche', 'nouveau', 'memoire'].includes(c.intention) || c.dossier) return { sauter: ['choisir'] };
        const mail = Records.get('MailRecu', charge.mail_id);
        const choix = [
          ...(c.candidats || []).map((x) => ({ cle: x.deal_id, libelle: x.nom })),
          { cle: 'fiche', libelle: c.ou_fiche ? "C'est un nouveau bien : pré-analyser" : 'Nouveau dossier (pré-analyser)' },
        ];
        const p = await file.proposer({
          type: 'transfert_dossier', titre: `Votre transfert « ${String(c.lu.objet_origine || mail.objet || '').slice(0, 60)} » : pour quel dossier ?`,
          resume: `${c.pieces.length} pièce${c.pieces.length > 1 ? 's' : ''} : ${c.pieces.slice(0, 4).join(', ')}.${(c.candidats || []).length ? '' : " Je n'ai reconnu aucun dossier ouvert : dites-moi lequel dans la note du prochain transfert, ou pré-analysez."}`,
          charge: { mail_id: mail.id, candidats: (c.candidats || []).map((x) => ({ deal_id: x.deal_id, titre: x.nom, niveau: 'transfert' })) },
          sources: [sourceMail(mail)], pour: c.pour, competence: COMPETENCE, version: VERSION, tache_id: tache.id, etape: 'choisir',
          cle: `transfert:${mail.id}`, actions: ['choisir'], choix,
        });
        return { attendre: 'validation', proposition_id: p.id };
      },
    },
    {
      nom: 'choisir', externe: true,
      async run({ charge }) {
        if (!charge.choix) throw new Error('Choisissez un dossier, ou « Nouveau dossier ».');
        // La suite (une pré-analyse, ou le dépôt des pièces) est longue : le clic rend la main, la tâche repart en fond.
        return { choix: charge.choix, enFond: true };
      },
    },
    {
      nom: 'agir',
      async run({ resultats, charge }) {
        const c = resultats.comprendre;
        const mail = Records.get('MailRecu', charge.mail_id);
        const membre = expediteurDuTransfert(mail.de_email);
        const choix = resultats.choisir?.choix || null;
        const uploadDir = charge.uploadDir || CHEMIN_UPLOADS;
        // « Préanalyse juste la fiche X » : X pré-analysée, les autres fiches du mail en Mémoire (17 nov. 2026, Jules).
        const autres = c.seulement ? piecesFiche(mail).filter((p) => p?.piece_id && !c.seulement.includes(p.piece_id)).map((p) => p.piece_id) : [];
        const enPlus = async (r0) => (autres.length ? { ...r0, memoire_autres: await enMemoireSeulement(mail, { membre, lu: c.lu, pieces: autres }).catch((e) => ({ erreur: e?.message || String(e) })) } : r0);
        const r = c.intention === 'fiche' || choix === 'fiche'
          ? await enPlus(await preanalyser(mail, { membre, lu: c.lu, uploadDir, seulement: c.seulement || null }))
          : c.intention === 'memoire'
            ? await enMemoireSeulement(mail, { membre, lu: c.lu })
            : c.intention === 'nouveau'
              ? await nouveauDossier(mail, { membre, lu: c.lu, uploadDir })
              : await ranger(mail, { membre, dealId: c.dossier || choix, uploadDir });
        return { ...r, dossier: r.deal_id };
      },
    },
    {
      nom: 'repondre',
      async run({ resultats, charge }) {
        const mail = Records.get('MailRecu', charge.mail_id);
        const membre = expediteurDuTransfert(mail.de_email);
        const n = compteRendu(resultats.agir, { objet: mail.objet });
        notifier({ pour: norm(membre.email), titre: n.titre, texte: n.texte, lien: n.lien, action: n.lien ? 'Ouvrir le dossier' : null, cle: `haka-transfert:${mail.id}` });
        return { notifie: true, texte: n.texte };
      },
    },
  ],
});

/**
 * La reprise des transferts du 16 nov. 2026 (17 nov., Jules : « on a reçu 7 mails avec 8 fiches », 2 seulement traitées).
 * Relevés avant la nouvelle règle, les autres sont allés dans la Data Room d'un dossier de l'agent ou attendent une
 * question que personne ne voit (la cloche est retirée de l'écran). Chaque fiche transférée par l'équipe depuis `depuis`,
 * sans consigne de pré-analyse et pas encore pré-analysée, va en Mémoire (une pièce déjà lue ne l'est pas deux fois) ; la
 * question en attente est retirée. Une ligne par mail au journal. Une seule fois (`cle`).
 */
// 18 nov. 2026 : relancée depuis le 12 nov. pour les mails dont une pièce n'était pas reconnue comme fiche (lues désormais).
export async function reprendreTransferts({ depuis = '2026-11-12T00:00:00Z', cle = 'transfert.reprise.2026-11-18', journal = console.log, deps = {} } = {}) {
  const { Meta } = await import('../../db.js');
  if (cle && Meta.get(cle)) return { deja: true };
  const { BOITES_COMMUNES } = await import('../drapeaux.js');
  const F = await import('../file.js');
  const mails = Records.list('MailRecu')
    .filter((m) => BOITES_COMMUNES.has(norm(m.compte)) && m.commande && Date.parse(m.date || 0) >= Date.parse(depuis) && piecesUtiles(m).some((x) => x?.piece_id))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const bilan = { mails: mails.length, fiches: 0, deja: 0, preanalyses: 0, erreurs: 0 };
  for (const m of mails) {
    const membre = expediteurDuTransfert(m.de_email);
    const lu = lireTransfert({ texte: m.texte, objet: m.objet });
    const avant = m.haka_transfert?.intention || 'aucune';
    const n = piecesUtiles(m).filter((x) => x?.piece_id).length;
    const tete = `[transfert] reprise « ${String(lu.objet_origine || m.objet || '').slice(0, 70)} » de ${m.de_email}, ${n} pièce(s) : ${piecesUtiles(m).map((x) => x.nom).join(', ').slice(0, 200)}, ${avant}`;
    if (!membre || (estMandataire(membre) && membre.role !== 'admin')) { journal(`${tete} : expéditeur hors équipe, laissé`); continue; }
    const veutFiche = MOTS_FICHE.test(sansAccents(lu.note || '')) || MOTS_RENTRER.test(sansAccents(lu.note || ''));
    if (avant === 'fiche' && (m.deal_id || m.deal_ids?.length)) { bilan.preanalyses += 1; journal(`${tete} : déjà pré-analysée (dossier ${m.deal_id}), fiche en Mémoire par le dossier`); continue; }
    if (veutFiche) { journal(`${tete} : pré-analyse demandée dans le message, laissée à la tâche`); continue; }
    for (const p of Records.list('HakaProposition').filter((x) => x.etat === 'proposee' && x.charge?.mail_id === m.id)) F.retirer(p.id, 'Repris le 17 nov. 2026 : fiche transférée sans consigne, mise en Mémoire');
    try {
      const r = await enMemoireSeulement(Records.get('MailRecu', m.id), { membre, lu, ...deps });
      bilan.fiches += r.n - (r.deja ? r.n : 0);
      if (r.deja) bilan.deja += r.n;
      journal(`${tete} : ${r.n} en Mémoire${r.deja ? ' (déjà là)' : ''}${m.deal_id ? `, rangée avant dans le dossier ${m.deal_id}` : ''}${r.erreurs?.length ? ` ; non lues : ${r.erreurs.join(' ; ')}` : ''}`);
    } catch (e) {
      bilan.erreurs += 1;
      journal(`${tete} : échec, ${e?.message || e}`);
    }
  }
  if (cle) Meta.set(cle, new Date().toISOString());
  journal(`[transfert] reprise du ${depuis.slice(0, 10)} : ${bilan.mails} mail(s), ${bilan.fiches} fiche(s) mises en Mémoire, ${bilan.deja} déjà là, ${bilan.preanalyses} déjà pré-analysée(s), ${bilan.erreurs} échec(s)`);
  return bilan;
}

/** Un transfert d'un membre de l'équipe sur sourcing@ devient une tâche. */
export function surTransfert(mail, { uploadDir = null, lancer } = {}) {
  const t = taches.enfiler(COMPETENCE, { mail_id: mail.id, uploadDir }, { cle: `transfert:${mail.id}`, pour: norm(mail.de_email), ...(lancer === undefined ? {} : { lancer }) });
  Records.update('MailRecu', mail.id, { haka_tache_id: t.id });
  return t;
}

