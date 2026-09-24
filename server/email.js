// Envoi de mails, multi-expéditeur.
//
// Deux sources d'expéditeurs, présentées de la même façon dans l'app :
//   1. les comptes connectés via « Se connecter avec Google » (OAuth, stockés
//      dans l'entité MailAccount) — c'est la voie normale ;
//   2. des comptes déclarés dans .env avec un mot de passe d'application
//      (SMTP_1_USER / SMTP_1_PASS…) — alternative si vous ne voulez pas d'OAuth.
//
// Sans aucun compte, les envois sont simulés : journalisés dans EmailLog avec le
// statut « simule », mais jamais délivrés.

import nodemailer from 'nodemailer';
import { Records } from './db.js';
import { listGoogleAccounts, sendViaGmail } from './google-oauth.js';

const DEFAULT_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const DEFAULT_PORT = Number(process.env.SMTP_PORT || 465);

// Google displays app passwords in groups of four; the spaces are decorative.
const cleanPass = (p) => (p || '').replace(/\s+/g, '');

function buildSmtpAccount({ name, user, pass, host, port }) {
  const email = (user || '').trim();
  if (!email || !cleanPass(pass)) return null;
  return {
    id: email.toLowerCase(),
    provider: 'smtp',
    name: (name || '').trim() || email.split('@')[0],
    email,
    pass: cleanPass(pass),
    host: (host || '').trim() || DEFAULT_HOST,
    port: Number(port || DEFAULT_PORT),
  };
}

function loadSmtpAccounts() {
  const out = [];

  // Legacy single-account variables.
  const legacy = buildSmtpAccount({
    name: process.env.SMTP_FROM_NAME,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  });
  if (legacy) out.push(legacy);

  // Indexed accounts: SMTP_1_*, SMTP_2_*, …
  for (let i = 1; i <= 20; i++) {
    const user = process.env[`SMTP_${i}_USER`];
    if (!user) continue;
    const acc = buildSmtpAccount({
      name: process.env[`SMTP_${i}_NAME`],
      user,
      pass: process.env[`SMTP_${i}_PASS`],
      host: process.env[`SMTP_${i}_HOST`],
      port: process.env[`SMTP_${i}_PORT`],
    });
    if (acc) out.push(acc);
  }

  const seen = new Set();
  return out.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

const SMTP_ACCOUNTS = loadSmtpAccounts();

/**
 * La boîte qui envoie quand on ne précise rien : celle que la personne a
 * choisie (User.boite_envoi), sinon sa propre adresse si elle l'a rattachée,
 * sinon la plus ancienne. Chacun peut rattacher plusieurs boîtes (la sienne,
 * sourcing@) ; sans ce choix, la première venue partait pour tout le monde.
 */
export function boiteParDefaut(ownerEmail, comptes) {
  if (!comptes.length) return null;
  const owner = String(ownerEmail || '').toLowerCase();
  const choisie = owner ? String(Records.filter('User', { email: owner })[0]?.boite_envoi || '').toLowerCase() : '';
  return comptes.find((a) => a.id === choisie)?.id
    || comptes.find((a) => a.id === owner)?.id
    || comptes[0].id;
}

// Google accounts are read live: a mailbox connected from the UI must appear
// without restarting the server. Passing an owner restricts the list to that
// user's own mailboxes.
function allAccounts(ownerEmail) {
  const google = listGoogleAccounts(ownerEmail).map((a) => ({ ...a, provider: 'google' }));
  const taken = new Set(google.map((a) => a.id));
  const tous = [...google, ...SMTP_ACCOUNTS.filter((a) => !taken.has(a.id))];
  // La boîte par défaut passe devant : findAccount sans expéditeur et les
  // menus « Envoyer depuis » prennent le premier compte.
  const defaut = ownerEmail ? boiteParDefaut(ownerEmail, tous) : null;
  return defaut
    ? [...tous.filter((a) => a.id === defaut).map((a) => ({ ...a, par_defaut: true })), ...tous.filter((a) => a.id !== defaut)]
    : tous;
}

export const smtpEnabled = SMTP_ACCOUNTS.length > 0;
export const hasAnyAccount = () => allAccounts().length > 0;

// Public (credential-free) view of the sender accounts.
export function listAccounts(ownerEmail) {
  return allAccounts(ownerEmail).map(
    ({
      id, name, email, provider, picture, needs_reconnect,
      peut_envoyer, peut_lire, peut_drive, peut_agenda, connected_at, par_defaut,
    }) => ({
      id,
      name,
      email,
      provider,
      picture: picture || null,
      needs_reconnect: !!needs_reconnect,
      // Un compte SMTP n'a pas de portées : il ne sait qu'envoyer. Sans ce
      // défaut, l'expéditeur retenu par le plan de travail restait introuvable.
      peut_envoyer: peut_envoyer !== false,
      peut_lire: !!peut_lire,
      peut_drive: !!peut_drive,
      peut_agenda: !!peut_agenda,
      connected_at: connected_at || null,
      par_defaut: !!par_defaut,
      label: `${name} <${email}>`,
    })
  );
}

function findAccount(from, ownerEmail) {
  const accounts = allAccounts(ownerEmail);
  if (!accounts.length) return null;
  if (!from) return accounts[0];
  const raw = String(from).trim().toLowerCase();
  // Accept a bare address or a full "Nom <adresse>" string.
  const needle = (raw.match(/<([^>]+)>/)?.[1] || raw).trim();
  return accounts.find((a) => a.id === needle) || null;
}

const transporters = new Map();

function transporterFor(account) {
  if (!transporters.has(account.id)) {
    transporters.set(
      account.id,
      nodemailer.createTransport({
        host: account.host,
        port: account.port,
        secure: account.port === 465,
        auth: { user: account.email, pass: account.pass },
      })
    );
  }
  return transporters.get(account.id);
}

// SMTP authentication checks are slow, so cache each verdict briefly.
const VERIFY_TTL_MS = 5 * 60 * 1000;
const verifyCache = new Map();

export async function verifyAccount(from, ownerEmail) {
  const account = findAccount(from, ownerEmail);
  if (!account) return { ok: false, error: 'Aucun compte expéditeur' };
  // OAuth accounts are usable as long as they carry a refresh token.
  if (account.provider === 'google') {
    return account.needs_reconnect
      ? { ok: false, error: 'Session Google incomplète, reconnectez le compte.' }
      : { ok: true };
  }

  const cached = verifyCache.get(account.id);
  if (cached && Date.now() - cached.at < VERIFY_TTL_MS) return cached.result;

  let result;
  try {
    await transporterFor(account).verify();
    result = { ok: true };
  } catch (e) {
    result = { ok: false, error: String(e?.message || e) };
  }
  verifyCache.set(account.id, { at: Date.now(), result });
  return result;
}

export async function mailStatus(ownerEmail) {
  const accounts = listAccounts(ownerEmail);
  const verdicts = await Promise.all(accounts.map((a) => verifyAccount(a.id, ownerEmail)));
  return {
    smtp: accounts.length > 0,
    host: DEFAULT_HOST,
    port: DEFAULT_PORT,
    accounts: accounts.map((a, i) => ({
      ...a,
      verified: verdicts[i].ok,
      error: verdicts[i].error || null,
    })),
  };
}

// Minimal text -> HTML so the mail renders with paragraphs in every client.
function textToHtml(text) {
  const escaped = (text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#111">${escaped.replace(
    /\n/g,
    '<br>'
  )}</div>`;
}

// Accepts "a@b.c", ["a@b.c"], or "a@b.c, d@e.f" and returns a clean array.
export function normalizeRecipients(value) {
  if (!value) return [];
  const list = Array.isArray(value) ? value : String(value).split(/[,;]/);
  return list.map((v) => String(v).trim()).filter(Boolean);
}

function logEmail(fields) {
  try {
    return Records.create('EmailLog', fields);
  } catch {
    return null;
  }
}

/**
 * Send an email.
 * @param {object} opts
 * @param {string} [opts.from] - sender account id (email address); defaults to the first account
 * @param {string|string[]} opts.to
 * @param {string|string[]} [opts.cc]
 * @param {string|string[]} [opts.bcc]
 * @param {string} opts.subject
 * @param {string} [opts.body] - plain text
 * @param {string} [opts.html] - overrides the generated HTML
 * @param {string} [opts.replyTo]
 * @param {string} [opts.template_id] - stored on the log for traceability
 * @param {string} [opts.template_titre]
 * @param {string} [opts.deal_id] - deal de préanalyse concerné (traçabilité)
 * @param {string} [opts.intention] - intention du cycle de vie (refus, relance…)
 */
export async function sendEmail({
  from,
  owner,
  to,
  cc,
  bcc,
  subject,
  body,
  html,
  replyTo,
  template_id,
  template_titre,
  deal_id,
  intention,
  attachments = [],
  projet_id = null,
} = {}) {
  const toList = normalizeRecipients(to);
  const ccList = normalizeRecipients(cc);
  const bccList = normalizeRecipients(bcc);
  const text = body || '';
  // Scoped lookup: a user can only ever send from a mailbox they connected.
  const account = findAccount(from, owner);

  const base = {
    from: account ? `${account.name} <${account.email}>` : from || null,
    expediteur: account?.email || from || null,
    to: toList.join(', '),
    destinataire: toList.join(', '),
    cc: ccList.join(', '),
    subject: subject || '',
    sujet: subject || '',
    body: text,
    contenu: text,
    template_id: template_id || null,
    template_titre: template_titre || null,
    deal_id: deal_id || null,
    projet_id: projet_id || null,
    intention: intention || null,
    // Les noms seuls : le registre ne garde pas le contenu des pièces.
    pieces_jointes: (attachments || []).map((a) => a.filename),
    direction: 'sortant',
    sent_at: new Date().toISOString(),
  };

  if (!toList.length) {
    logEmail({ ...base, statut: 'erreur', error: 'Aucun destinataire' });
    return { success: false, error: 'Aucun destinataire' };
  }

  // A sender was explicitly requested but doesn't exist: never silently fall
  // back to somebody else's address.
  if (from && !account && hasAnyAccount()) {
    const error = `Expéditeur non autorisé : ${from}`;
    logEmail({ ...base, statut: 'erreur', error });
    return { success: false, error };
  }

  if (!account) {
    console.log(`[email:dry-run] → ${base.to} | ${subject}`);
    logEmail({ ...base, statut: 'simule', error: 'Aucun compte expéditeur (envoi simulé)' });
    return {
      success: false,
      simulated: true,
      error:
        "Aucun compte expéditeur : le mail n'a pas été envoyé. Connectez votre adresse Google depuis le dashboard.",
    };
  }

  const message = {
    to: toList,
    ...(ccList.length ? { cc: ccList } : {}),
    ...(bccList.length ? { bcc: bccList } : {}),
    replyTo: replyTo || account.email,
    subject: subject || '',
    text,
    html: html || textToHtml(text),
    ...(attachments?.length ? { attachments } : {}),
  };

  try {
    let messageId;
    let threadId = null;
    if (account.provider === 'google') {
      ({ messageId, threadId } = await sendViaGmail(account.email, message));
    } else {
      const info = await transporterFor(account).sendMail({
        from: `${account.name} <${account.email}>`,
        ...message,
      });
      messageId = info.messageId;
    }
    console.log(`[email] ${account.email} → ${base.to} | ${subject} | ${messageId}`);
    // Le fil Gmail : la réponse de l'agent s'y inscrit, et c'est par lui
    // qu'elle retrouve son dossier plutôt que par son expéditeur.
    logEmail({ ...base, statut: 'envoye', message_id: messageId || null, thread_id: threadId || null });
    return { success: true, messageId, from: base.from };
  } catch (e) {
    const error = String(e?.message || e);
    console.error(`[email:erreur] ${account.email} → ${base.to} | ${error}`);
    verifyCache.delete(account.id); // credentials may have gone stale
    logEmail({ ...base, statut: 'erreur', error });
    return { success: false, error };
  }
}

export async function sendSMS({ to, body }) {
  console.log(`[sms] → ${to} | ${body}`);
  return { success: true };
}
