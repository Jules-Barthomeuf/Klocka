// Google Chat, par le compte de l'équipe.
//
// AK n'est pas une « application Chat » chez Google : le serveur Klocka n'est
// pas joignable de l'extérieur, Google ne pourrait pas le prévenir. C'est le
// compte AK_COMPTE, connecté à Klocka avec la portée Chat (google-oauth.js),
// qui relit lui-même les espaces où il est membre et y répond. Ce que
// l'équipe voit dans le groupe, c'est donc ce compte, sous le nom qu'il porte
// chez Google (AK_NOM) : c'est ce nom qu'on mentionne.
//
// Tout passe par l'API REST de Chat, avec le jeton du compte.

import { Records, Meta } from '../db.js';
import { accessTokenFor, storedAccount } from '../google-oauth.js';

const RACINE = 'https://chat.googleapis.com/v1';
const DELAI_MS = 20000;

export const NOM = (process.env.AK_NOM || 'Assistant Klocka').trim();
export const COMPTE = (process.env.AK_COMPTE || 'sourcing@klocka.immo').trim().toLowerCase();
const ESPACE_VOULU = (process.env.AK_ESPACE || '').trim();
const CLE_UTILISATEUR = 'ak.utilisateur';

/** Le compte qui parle, s'il est connecté avec la portée Chat. */
export function compteAk() {
  const a = storedAccount(COMPTE);
  if (!a) return { ok: false, error: `Le compte ${COMPTE} n'est pas connecté à Klocka : connectez-le depuis le dashboard (GOOGLE_CHAT=true).` };
  if (!a.peut_chat) return { ok: false, error: `Le compte ${COMPTE} est connecté sans la portée Google Chat : reconnectez-le depuis le dashboard, avec GOOGLE_CHAT=true dans .env.` };
  return { ok: true, compte: a };
}

async function appeler(chemin, { method = 'GET', body = null, params = null } = {}) {
  const c = compteAk();
  if (!c.ok) throw new Error(c.error);
  const token = await accessTokenFor(Records.get('MailAccount', c.compte.id) || c.compte);
  const url = `${RACINE}/${chemin}${params ? `?${new URLSearchParams(params)}` : ''}`;
  const r = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(DELAI_MS),
  });
  const texte = await r.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { json = null; }
  if (!r.ok) {
    const message = json?.error?.message || texte.slice(0, 200);
    // 403 sur l'API : elle n'est pas activée dans le projet Google Cloud, ou
    // la portée manque. Le message de Google le dit ; on le garde tel quel.
    throw new Error(`Google Chat a répondu ${r.status} : ${message}`);
  }
  return json || {};
}

/** Les espaces où le compte est membre. */
export async function espaces() {
  const d = await appeler('spaces', { params: { pageSize: '100' } });
  return (d.spaces || []).map((s) => ({ nom: s.name, titre: s.displayName || null, type: s.spaceType || null }));
}

/**
 * Les espaces à suivre : celui d'AK_ESPACE (par identifiant ou par nom), ou
 * tous. Les messages privés au compte sont toujours suivis.
 */
export async function espacesSuivis() {
  const tous = await espaces();
  if (!ESPACE_VOULU) return tous;
  const cible = ESPACE_VOULU.toLowerCase();
  return tous.filter((s) => s.type === 'DIRECT_MESSAGE' || s.nom === ESPACE_VOULU || String(s.titre || '').toLowerCase() === cible);
}

/** Les messages d'un espace postés après une date. Du plus ancien au plus récent. */
export async function messagesDepuis(espace, depuisIso) {
  const params = { pageSize: '100', orderBy: 'createTime desc' };
  if (depuisIso) params.filter = `createTime > "${depuisIso}"`;
  const d = await appeler(`${espace}/messages`, { params });
  return (d.messages || []).map(lireMessage).sort((a, b) => a.le.localeCompare(b.le));
}

/** Ce qu'on garde d'un message : qui, quoi, où, et s'il nous parle. */
export function lireMessage(m) {
  const mentions = (m.annotations || [])
    .filter((a) => a.type === 'USER_MENTION' && a.userMention?.user)
    .map((a) => ({ nom: a.userMention.user.name || null, affiche: a.userMention.user.displayName || null }));
  const pieces = (m.attachment || m.attachments || []).map((a) => ({
    nom: a.contentName || a.name || 'pièce',
    type: a.contentType || null,
    ref: a.attachmentDataRef?.resourceName || null,
    drive_id: a.driveDataRef?.driveFileId || null,
  }));
  return {
    nom: m.name,
    espace: m.space?.name || String(m.name || '').split('/messages/')[0],
    pieces,
    fil: m.thread?.name || null,
    le: m.createTime || '',
    texte: m.text || '',
    argument: m.argumentText ?? null,
    auteur: { nom: m.sender?.name || null, affiche: m.sender?.displayName || null, type: m.sender?.type || null },
    mentions,
  };
}

/** L'identité Chat du compte (users/…), apprise au premier message qu'il poste. */
export const utilisateurAk = () => Meta.get(CLE_UTILISATEUR) || null;

/**
 * Le message nous est-il adressé ? Une mention de notre nom, ou un message
 * privé. Pure : testée sans réseau.
 */
export function estPourAk(message, { direct = false, utilisateur = utilisateurAk(), nom = NOM } = {}) {
  if (estDeAk(message, { utilisateur, nom })) return false;
  if (direct) return true;
  const parId = utilisateur && message.mentions.some((x) => x.nom === utilisateur);
  const parNom = message.mentions.some((x) => x.affiche && x.affiche.toLowerCase() === nom.toLowerCase());
  const parTexte = new RegExp(`@${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message.texte);
  return !!(parId || parNom || parTexte);
}

/** Le message vient-il du compte lui-même ? Pure. */
export function estDeAk(message, { utilisateur = utilisateurAk(), nom = NOM } = {}) {
  if (utilisateur && message.auteur.nom === utilisateur) return true;
  return !!message.auteur.affiche && message.auteur.affiche.toLowerCase() === nom.toLowerCase();
}

/** Le texte sans la mention, pour ne pas faire lire « @Assistant Klocka » au modèle. Pure. */
export function sansMention(message, nom = NOM) {
  const t = message.argument != null && message.argument.trim() ? message.argument : message.texte;
  return t.replace(new RegExp(`@${nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi'), '').replace(/\s+/g, ' ').trim();
}

/**
 * Poste un message dans un espace, dans le fil donné s'il y en a un. Rend le
 * message créé ; la première fois, on y apprend notre propre identité.
 */
export async function envoyer(espace, texte, { fil = null } = {}) {
  const body = { text: String(texte || '').slice(0, 4000) };
  if (fil) body.thread = { name: fil };
  const params = fil ? { messageReplyOption: 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD' } : null;
  const m = await appeler(`${espace}/messages`, { method: 'POST', body, params });
  if (m?.sender?.name && !utilisateurAk()) Meta.set(CLE_UTILISATEUR, m.sender.name);
  return lireMessage(m);
}

/**
 * Le contenu d'une pièce jointe : un fichier déposé dans Chat (media.download),
 * ou un fichier Drive partagé dans le message (Drive, alt=media).
 */
export async function telechargerPiece(piece) {
  const c = compteAk();
  if (!c.ok) throw new Error(c.error);
  const token = await accessTokenFor(Records.get('MailAccount', c.compte.id) || c.compte);
  const url = piece.ref
    ? `${RACINE}/media/${encodeURIComponent(piece.ref)}?alt=media`
    : piece.drive_id ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(piece.drive_id)}?alt=media&supportsAllDrives=true` : null;
  if (!url) throw new Error(`Pièce jointe sans contenu téléchargeable : ${piece.nom}.`);
  const r = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`Google a répondu ${r.status} pour la pièce ${piece.nom}.`);
  return Buffer.from(await r.arrayBuffer());
}

/** « <users/123> » : la mention d'une personne dans un message. Pure. */
export const mention = (auteur) => (auteur?.nom ? `<${auteur.nom}>` : auteur?.affiche || '');
