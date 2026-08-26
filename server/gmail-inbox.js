// Relève de la boîte Gmail d'un compte connecté (portée gmail.readonly).
//
// Pas de polling : la relève est déclenchée par l'utilisateur (bouton
// « Actualiser » ou ouverture de l'onglet Boîte de réception). Les en-têtes
// sont stockés dans l'entité MailRecu, dédupliqués par (compte, message
// Gmail). Le contenu complet n'est pas conservé : il est re-téléchargé au
// format brut (RFC 822) au moment de la préanalyse, puis suit le pipeline
// .eml existant qui traite le texte ET les pièces jointes.

import { Records } from './db.js';
import { referentielTri, trierMail, jugerParIA } from './deal/tri-mails.js';
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
      `Le compte ${account.email} n'a pas autorisé la lecture de la boîte. Reconnectez-le depuis le dashboard (GOOGLE_GMAIL_READ doit être actif).`
    );
  }
  return account;
}

const entete = (payload, nom) =>
  (payload?.headers || []).find((h) => h.name?.toLowerCase() === nom)?.value || '';

// Le texte du message, extrait de l'arbre MIME. Conservé en base — c'est de
// lui que le registre des engagements tire les promesses de l'agent, et le
// relire ne doit pas coûter un appel Gmail. On préfère text/plain ; à défaut,
// le HTML débarrassé de ses balises. Plafonné : un mail de 20 000 caractères
// a déjà tout dit.
function texteDuMessage(payload) {
  const morceaux = { plain: [], html: [] };
  const parcourir = (part) => {
    if (!part) return;
    if (part.body?.data && !part.filename) {
      const texte = Buffer.from(part.body.data, 'base64url').toString('utf8');
      if (part.mimeType === 'text/plain') morceaux.plain.push(texte);
      else if (part.mimeType === 'text/html') morceaux.html.push(texte);
    }
    for (const p of part.parts || []) parcourir(p);
  };
  parcourir(payload);
  const brut = morceaux.plain.length
    ? morceaux.plain.join('\n')
    : morceaux.html
        .join('\n')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/[ \t]+/g, ' ');
  return brut.trim().slice(0, 20000);
}

// Les pièces jointes vivent dans l'arbre MIME, à plat ou imbriquées. On garde
// leur identifiant : c'est lui qui permettra de télécharger le fichier sans
// recharger tout le message.
function nomsPiecesJointes(payload, acc = []) {
  for (const part of payload?.parts || []) {
    if (part.filename) {
      acc.push({
        nom: part.filename,
        mime: part.mimeType || null,
        taille: part.body?.size || null,
        piece_id: part.body?.attachmentId || null,
      });
    }
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

  // Référentiel de tri chargé une fois : qui est interne, qui est un agent connu.
  const ref = referentielTri();

  let nouveaux = 0;
  let ecartes = 0;
  for (const id of ids) {
    if (connus.has(id)) continue;
    try {
      const msg = await gmailGet(token, `/messages/${id}?format=full`);
      const de = entete(msg.payload, 'from');
      const mail = {
        compte: account.email,
        gmail_message_id: msg.id,
        thread_id: msg.threadId || null,
        message_id_rfc: entete(msg.payload, 'message-id') || null,
        de,
        de_email: extraireAdresse(de),
        objet: entete(msg.payload, 'subject') || '(sans objet)',
        date: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : null,
        extrait: msg.snippet || '',
        texte: texteDuMessage(msg.payload),
        pieces_jointes: nomsPiecesJointes(msg.payload),
        lu: !(msg.labelIds || []).includes('UNREAD'),
        deal_id: null,
      };

      // Un mail sans rapport avec un dossier n'entre pas : la boîte de
      // l'application reste le reflet des dossiers, pas une copie de Gmail.
      let { garder, raison, incertain } = trierMail(mail, ref);

      // Un signal ambigu — une pièce jointe qui peut être un bail comme un RIB
      // — est le seul cas où l'on fait lire le mail.
      if (incertain) {
        const juge = await jugerParIA(mail, ref);
        garder = juge.garder;
        raison = juge.garder ? `lu : ${juge.raison}` : juge.raison;
      }

      if (!garder) {
        ecartes++;
        continue;
      }

      Records.create('MailRecu', { ...mail, retenu_parce_que: raison, juge_par_ia: !!incertain });
      nouveaux++;
    } catch (e) {
      // Un message illisible ne doit pas bloquer la relève des autres.
      console.error(`[gmail] lecture du message ${id} impossible :`, e?.message || e);
    }
  }

  return { nouveaux, ecartes, total: ids.length };
}

/**
 * Télécharge une pièce jointe d'un message.
 * @returns {Buffer}
 */
export async function telechargerPieceJointe(compteEmail, messageId, pieceId) {
  const account = compteLisible(compteEmail);
  const token = await accessTokenFor(account);
  const data = await gmailGet(token, `/messages/${messageId}/attachments/${pieceId}`);
  if (!data?.data) throw new Error('Pièce jointe vide');
  // Gmail renvoie du base64url.
  return Buffer.from(String(data.data).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
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
