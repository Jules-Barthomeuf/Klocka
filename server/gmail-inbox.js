// Relève de la boîte Gmail d'un compte connecté (portée gmail.readonly).
//
// Pas de polling : la relève est déclenchée par l'utilisateur (bouton
// « Actualiser » ou ouverture de l'onglet Boîte de réception). Les en-têtes
// sont stockés dans l'entité MailRecu, dédupliqués par (compte, message
// Gmail). Le contenu complet n'est pas conservé : il est re-téléchargé au
// format brut (RFC 822) au moment de la préanalyse, puis suit le pipeline
// .eml existant qui traite le texte ET les pièces jointes.

import { Records } from './db.js';
import { storedAccount, accessTokenFor } from './google-oauth.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailGet(token, path) {
  const resp = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gmail a répondu ${resp.status}`);
  }
  return data;
}

function compteLisible(email) {
  const account = storedAccount(email);
  if (!account) throw new Error(`Compte Google non connecté : ${email}`);
  if (!account.peut_lire) {
    throw new Error(
      `Le compte ${account.email} n'a pas autorisé la lecture de la boîte. Reconnectez-le depuis la page Mails (GOOGLE_GMAIL_READ doit être actif).`
    );
  }
  return account;
}

const entete = (payload, nom) =>
  (payload?.headers || []).find((h) => h.name?.toLowerCase() === nom)?.value || '';

// Les noms de pièces jointes vivent dans l'arbre MIME, à plat ou imbriqués.
function nomsPiecesJointes(payload, acc = []) {
  for (const part of payload?.parts || []) {
    if (part.filename) acc.push({ nom: part.filename, mime: part.mimeType || null, taille: part.body?.size || null });
    if (part.parts) nomsPiecesJointes(part, acc);
  }
  return acc;
}

function extraireAdresse(de) {
  const m = /<([^>]+)>/.exec(de || '');
  return (m ? m[1] : de || '').trim().toLowerCase() || null;
}

/**
 * Relève les derniers messages de la boîte et crée les MailRecu inconnus.
 * @returns {{ nouveaux: number, total: number }}
 */
export async function releverBoite(compteEmail, { max = 25 } = {}) {
  const account = compteLisible(compteEmail);
  const token = await accessTokenFor(account);

  const liste = await gmailGet(token, `/messages?labelIds=INBOX&maxResults=${max}`);
  const ids = (liste.messages || []).map((m) => m.id);
  if (!ids.length) return { nouveaux: 0, total: 0 };

  const connus = new Set(
    Records.filter('MailRecu', { compte: account.email }).map((m) => m.gmail_message_id)
  );

  let nouveaux = 0;
  for (const id of ids) {
    if (connus.has(id)) continue;
    try {
      const msg = await gmailGet(token, `/messages/${id}?format=full`);
      const de = entete(msg.payload, 'from');
      Records.create('MailRecu', {
        compte: account.email,
        gmail_message_id: msg.id,
        thread_id: msg.threadId || null,
        message_id_rfc: entete(msg.payload, 'message-id') || null,
        de,
        de_email: extraireAdresse(de),
        objet: entete(msg.payload, 'subject') || '(sans objet)',
        date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
        extrait: msg.snippet || '',
        pieces_jointes: nomsPiecesJointes(msg.payload),
        lu: !(msg.labelIds || []).includes('UNREAD'),
        deal_id: null,
      });
      nouveaux++;
    } catch (e) {
      // Un message illisible ne doit pas bloquer la relève des autres.
      console.error(`[gmail] lecture du message ${id} impossible :`, e?.message || e);
    }
  }

  return { nouveaux, total: ids.length };
}

/** Liste les mails relevés d'un compte, du plus récent au plus ancien. */
export function listerBoite(compteEmail, { limit = 50 } = {}) {
  return Records.filter('MailRecu', { compte: String(compteEmail || '').toLowerCase() })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    .slice(0, limit)
    .map(({ id, compte, gmail_message_id, de, de_email, objet, date, extrait, pieces_jointes, deal_id }) => ({
      id, compte, gmail_message_id, de, de_email, objet, date, extrait, pieces_jointes, deal_id,
    }));
}

/**
 * Télécharge le message complet au format RFC 822 (pièces jointes incluses),
 * prêt à entrer dans le pipeline .eml de la préanalyse.
 * @returns {Buffer}
 */
export async function telechargerRaw(compteEmail, gmailMessageId) {
  const account = compteLisible(compteEmail);
  const token = await accessTokenFor(account);
  const msg = await gmailGet(token, `/messages/${gmailMessageId}?format=raw`);
  if (!msg.raw) throw new Error('Gmail n’a pas renvoyé le contenu du message.');
  return Buffer.from(msg.raw, 'base64url');
}
