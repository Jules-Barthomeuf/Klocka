// « Se connecter avec Google » pour l'envoi de mails.
//
// Flow OAuth 2.0 classique : l'utilisateur est redirigé vers Google, accepte de
// laisser l'app envoyer des mails en son nom, et on stocke le refresh token dans
// l'entité MailAccount. Plus besoin de mot de passe d'application.
//
// La portée demandée est gmail.send uniquement : l'app peut envoyer, mais ne
// peut ni lire ni supprimer quoi que ce soit dans la boîte.

import { randomBytes } from 'crypto';
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import { Records } from './db.js';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const APP_URL = (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');

export const googleEnabled = !!(CLIENT_ID && CLIENT_SECRET);
export const REDIRECT_URI = `${APP_URL}/api/auth/google/callback`;

// Optionnel : n'accepter que les adresses d'un domaine (ex. klocka.immo).
// Le mode « Internal » de Google l'impose déjà, ceci est une seconde barrière.
const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN || '').trim().toLowerCase();

// La connexion demande d'abord le strict minimum : s'authentifier.
// L'autorisation d'envoyer des mails (gmail.send) est une portée « sensible »
// qui alourdit l'écran de consentement et impose de la déclarer dans Data
// Access ; on ne la demande que si GOOGLE_GMAIL_SEND=true.
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
export const gmailSendDemande = /^(1|true|oui|yes)$/i.test(process.env.GOOGLE_GMAIL_SEND || '');

// Lecture de la boîte (relève des fiches d'agents) : portée « restricted »
// chez Google, encore plus lourde à déclarer — même mécanique d'opt-in.
const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const gmailReadDemande = /^(1|true|oui|yes)$/i.test(process.env.GOOGLE_GMAIL_READ || '');

// Classement des documents d'un deal dans le Drive : drive.file ne donne accès
// qu'aux fichiers créés par l'app, jamais au reste du Drive.
//
// Un Drive partagé change la donne : pour retrouver le Drive « Klocka » et son
// dossier « Projets » — créés par quelqu'un d'autre — il faut pouvoir lister ce
// que l'application n'a pas créé, ce que drive.file interdit par construction.
// GOOGLE_DRIVE_COMPLET bascule alors sur la portée drive complète. À n'activer
// que si vous classez dans un Drive partagé : elle donne accès à tout le Drive
// du compte connecté.
const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FULL_SCOPE = 'https://www.googleapis.com/auth/drive';
export const driveComplet = /^(1|true|oui|yes)$/i.test(process.env.GOOGLE_DRIVE_COMPLET || '');
const DRIVE_SCOPE = driveComplet ? DRIVE_FULL_SCOPE : DRIVE_FILE_SCOPE;
export const driveDemande = /^(1|true|oui|yes)$/i.test(process.env.GOOGLE_DRIVE || '');

// Calendrier d'équipe : calendar.app.created ne donne accès qu'aux agendas que
// l'application a créés elle-même — jamais aux agendas personnels. C'est
// l'équivalent de drive.file côté Calendar.
const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
export const calendarDemande = /^(1|true|oui|yes)$/i.test(process.env.GOOGLE_CALENDAR || '');

// Se connecter n'est pas connecter une boîte. Un client qui entre dans son
// espace ne cède que son identité — nom, adresse, photo. Les portées Gmail,
// Drive et Agenda sont réservées au rattachement d'une boîte d'équipe, par un
// admin. Sans cette séparation, chaque client voyait « Klocka veut lire vos
// e-mails » pour ouvrir son espace, et sa boîte personnelle entrait dans la
// veille — et Google exige un audit pour ces portées « restreintes ».
const SCOPES_IDENTITE = ['openid', 'email', 'profile'];

const SCOPES = [
  'openid',
  'email',
  'profile',
  ...(gmailSendDemande ? [GMAIL_SEND_SCOPE] : []),
  ...(gmailReadDemande ? [GMAIL_READ_SCOPE] : []),
  ...(driveDemande ? [DRIVE_SCOPE] : []),
  ...(calendarDemande ? [CALENDAR_SCOPE] : []),
];

// Un refresh token est nécessaire dès qu'une portée d'API long-terme est demandée.
const besoinOffline = gmailSendDemande || gmailReadDemande || driveDemande || calendarDemande;

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
const GMAIL_SEND_ENDPOINT = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Anti-CSRF: the state we handed to Google must come back untouched.
const pendingStates = new Map();
const STATE_TTL_MS = 10 * 60 * 1000;

function rememberState(returnTo, redirectUri, boite = false, fenetre = false) {
  const state = randomBytes(16).toString('hex');
  // `boite` voyage dans l'état signé, pas dans l'URL : c'est lui — et non les
  // portées que Google renvoie — qui autorise l'enregistrement d'une boîte.
  // `fenetre` : la session ira dans la fenêtre, pas dans le cookie.
  pendingStates.set(state, { at: Date.now(), returnTo: returnTo || '/', redirectUri, boite: !!boite, fenetre: !!fenetre });
  for (const [s, v] of pendingStates) if (Date.now() - v.at > STATE_TTL_MS) pendingStates.delete(s);
  return state;
}

/**
 * URI de redirection correspondant à l'adresse réellement utilisée par le
 * navigateur. Se fier à APP_URL seul casse dès qu'on ouvre l'app autrement
 * (Codespaces, IP locale, nom de machine) : Google renverrait alors vers un
 * hôte injoignable, ou refuserait la demande.
 */
export function redirectUriPour(req) {
  if (!req) return REDIRECT_URI;
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (!host) return REDIRECT_URI;
  return `${proto}://${host}/api/auth/google/callback`;
}

// Single-use: a replayed or forged state is rejected.
function consumeState(state) {
  if (!state || !pendingStates.has(state)) return null;
  const value = pendingStates.get(state);
  pendingStates.delete(state);
  return Date.now() - value.at < STATE_TTL_MS ? value : null;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.returnTo] - path to land on once the round-trip is done
 */
export function buildAuthUrl({ returnTo, req, boite = false, fenetre = false } = {}) {
  const redirectUri = redirectUriPour(req);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: (boite ? SCOPES : SCOPES_IDENTITE).join(' '),
    // Le refresh token n'a d'intérêt que pour utiliser les API plus tard —
    // donc seulement quand on rattache une boîte.
    ...(boite && besoinOffline
      ? { access_type: 'offline', prompt: 'consent select_account' }
      : { prompt: 'select_account' }),
    state: rememberState(returnTo, redirectUri, boite, fenetre),
  });
  if (ALLOWED_DOMAIN) params.set('hd', ALLOWED_DOMAIN);
  return `${AUTH_ENDPOINT}?${params}`;
}

async function postToken(body) {
  const resp = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error_description || data.error || `Google a répondu ${resp.status}`);
  }
  return data;
}

async function fetchUserInfo(accessToken) {
  const resp = await fetch(USERINFO_ENDPOINT, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error('Impossible de lire le profil Google');
  return resp.json();
}

/**
 * Finish the OAuth dance: exchange the code, then store the mailbox so the very
 * same consent covers both signing in and sending.
 * @param {object} params
 * @param {string} params.code
 * @param {string} params.state
 * @param {string} [params.owner] - who the mailbox belongs to; defaults to itself
 * @returns {{email: string, name: string, picture: string|null, returnTo: string}}
 */
export async function handleCallback({ code, state, owner }) {
  if (!googleEnabled) throw new Error('Connexion Google non configurée (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).');
  const stateValue = consumeState(state);
  if (!stateValue) throw new Error('Requête de connexion expirée ou invalide. Réessayez.');
  if (!code) throw new Error('Google n’a pas renvoyé de code d’autorisation.');

  const tokens = await postToken({
    code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    // Doit être identique à celle envoyée à l'autorisation, sinon Google refuse.
    redirect_uri: stateValue.redirectUri || REDIRECT_URI,
    grant_type: 'authorization_code',
  });

  const profile = await fetchUserInfo(tokens.access_token);
  const email = (profile.email || '').toLowerCase();
  if (!email) throw new Error('Google n’a pas communiqué votre adresse.');

  if (ALLOWED_DOMAIN && !email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    throw new Error(`Seules les adresses @${ALLOWED_DOMAIN} peuvent accéder à l'application.`);
  }

  // La boîte n'est enregistrée comme expéditeur QUE si l'utilisateur a
  // réellement accordé gmail.send. Sans cette vérification on stockerait des
  // jetons incapables d'envoyer, et l'adresse apparaîtrait à tort dans le menu
  // « Envoyer depuis ».
  const portees = String(tokens.scope || '').split(/\s+/);
  const peutEnvoyer = portees.includes(GMAIL_SEND_SCOPE);
  const peutLire = portees.includes(GMAIL_READ_SCOPE);
  const peutDrive = portees.includes(DRIVE_FILE_SCOPE) || portees.includes(DRIVE_FULL_SCOPE);
  const driveEtendu = portees.includes(DRIVE_FULL_SCOPE);
  const peutAgenda = portees.includes(CALENDAR_SCOPE);

  // Une boîte ne s'enregistre que si le parcours l'a demandé (état `boite`) —
  // jamais sur la foi des portées renvoyées. Une simple connexion, même si
  // Google renvoyait plus que prévu, ne crée pas de compte de boîte.
  if (stateValue.boite && (peutEnvoyer || peutLire || peutDrive || peutAgenda)) {
    const existing = Records.filter('MailAccount', { email })[0] || null;
    const record = {
      provider: 'google',
      email,
      owner_email: (owner || email).toLowerCase(),
      name: profile.name || email.split('@')[0],
      picture: profile.picture || null,
      access_token: tokens.access_token,
      expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
      // Google only returns a refresh token on the first consent; keep the old
      // one when reconnecting an already-linked mailbox.
      refresh_token: tokens.refresh_token || existing?.refresh_token || null,
      connected_at: new Date().toISOString(),
      peut_envoyer: peutEnvoyer,
      peut_lire: peutLire,
      peut_drive: peutDrive,
      peut_drive_partage: driveEtendu,
      peut_agenda: peutAgenda,
    };
    if (existing) Records.update('MailAccount', existing.id, record);
    else Records.create('MailAccount', record);
  }

  return {
    email,
    name: profile.name || email.split('@')[0],
    picture: profile.picture || null,
    peut_envoyer: peutEnvoyer,
    peut_lire: peutLire,
    returnTo: stateValue.returnTo,
    fenetre: !!stateValue.fenetre,
  };
}

/**
 * Mailboxes usable by a given user. Scoping matters on a shared install: nobody
 * should be able to pick a colleague's address as sender.
 * @param {string} [ownerEmail] - omit to list every connected mailbox
 */
/**
 * Les boîtes de l'équipe : celles dont le propriétaire est administrateur.
 * Tout ce qui relève, classe ou envoie au nom de Klocka passe par ici — une
 * boîte rattachée à un compte client, quelle qu'en soit l'origine, est ignorée.
 */
export function comptesEquipe() {
  const admins = new Set(
    Records.filter('User', { role: 'admin' }).map((u) => String(u.email || '').toLowerCase())
  );
  return Records.list('MailAccount', { sort: 'connected_at' }).filter((a) =>
    admins.has(String(a.owner_email || a.email || '').toLowerCase())
  );
}

export function listGoogleAccounts(ownerEmail) {
  const owner = ownerEmail ? String(ownerEmail).toLowerCase() : null;
  return comptesEquipe()
    .filter((a) => a.provider === 'google')
    .filter((a) => !owner || (a.owner_email || a.email) === owner)
    .map((a) => ({
      id: a.email,
      name: a.name,
      email: a.email,
      picture: a.picture || null,
      provider: 'google',
      label: `${a.name} <${a.email}>`,
      // A mailbox with no refresh token can't be used once the hour is up.
      needs_reconnect: !a.refresh_token,
      // Les comptes connectés avant l'ajout du champ savaient forcément envoyer.
      peut_envoyer: a.peut_envoyer !== false,
      peut_lire: !!a.peut_lire,
      peut_drive: !!a.peut_drive,
      peut_agenda: !!a.peut_agenda,
      connected_at: a.connected_at || null,
    }));
}

export function disconnectAccount(email) {
  const key = String(email || '').toLowerCase();
  const found = Records.filter('MailAccount', { email: key });
  found.forEach((a) => Records.delete('MailAccount', a.id));
  return { success: found.length > 0 };
}

export function storedAccount(email) {
  return Records.filter('MailAccount', { email: String(email || '').toLowerCase() })[0] || null;
}

// Access tokens last an hour; refresh transparently when needed.
export async function accessTokenFor(account) {
  const stillValid = account.expires_at && new Date(account.expires_at).getTime() - Date.now() > 60_000;
  if (stillValid && account.access_token) return account.access_token;

  if (!account.refresh_token) {
    throw new Error(`Session Google expirée pour ${account.email}. Reconnectez le compte.`);
  }

  const tokens = await postToken({
    refresh_token: account.refresh_token,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    grant_type: 'refresh_token',
  });

  Records.update('MailAccount', account.id, {
    access_token: tokens.access_token,
    expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
  });
  return tokens.access_token;
}

/**
 * Send through the Gmail API on behalf of a connected account.
 * @param {string} email - the connected mailbox
 * @param {object} message - {to, cc, bcc, subject, text, html, replyTo}
 */
export async function sendViaGmail(email, message) {
  const account = storedAccount(email);
  if (!account) throw new Error(`Compte Google non connecté : ${email}`);

  const token = await accessTokenFor(account);

  const mime = await new MailComposer({
    from: `${account.name} <${account.email}>`,
    ...message,
  })
    .compile()
    .build();

  const resp = await fetch(GMAIL_SEND_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw: mime.toString('base64url') }),
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data?.error?.message || `Gmail a refusé l'envoi (${resp.status})`);
  }
  return { messageId: data.id, from: `${account.name} <${account.email}>` };
}

export function googleStatus() {
  return {
    enabled: googleEnabled,
    redirect_uri: REDIRECT_URI,
    app_url: APP_URL,
    gmail_send: gmailSendDemande,
    gmail_read: gmailReadDemande,
    drive: driveDemande,
    drive_complet: driveComplet,
    // Destination lisible, telle qu'on l'annonce à l'écran.
    drive_destination: (process.env.GOOGLE_DRIVE_NOM || process.env.GOOGLE_DRIVE_ID)
      ? `${(process.env.GOOGLE_DRIVE_NOM || 'Drive partagé').trim()} › ${(process.env.GOOGLE_DRIVE_DOSSIER || 'Projets').trim()}`
      : 'Klocka Projets',
    calendar: calendarDemande,
    scopes: SCOPES,
  };
}
