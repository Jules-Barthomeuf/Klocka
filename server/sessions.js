// Sessions utilisateur, adossées à un cookie HttpOnly.
//
// Les sessions vivent en base (entité Session) et non en mémoire : redémarrer le
// serveur ne déconnecte personne.
//
// Une seconde porte : la session « de fenêtre ». Le cookie est commun à toutes
// les fenêtres d'un navigateur ; pour ouvrir deux comptes côte à côte, une
// fenêtre peut porter sa propre session dans un en-tête (Authorization:
// Bearer), gardée par le navigateur dans sessionStorage — propre à la fenêtre.
// L'en-tête X-Klocka-Fenetre dit au serveur d'ignorer le cookie dans cette
// fenêtre, même quand aucune session de fenêtre n'est encore ouverte.

import { randomBytes } from 'crypto';
import { Records } from './db.js';

const COOKIE_NAME = 'klocka_session';
// Quatre-vingt-dix jours, glissants : chaque ouverture de l'application
// repousse l'échéance. On n'est déconnecté qu'après trois mois sans venir —
// jamais au milieu d'une semaine de travail.
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
// En dessous d'un jour écoulé, on ne réécrit ni la base ni le cookie : la
// prolongation vaut pour la visite, pas pour chaque requête.
const RENOUVELLEMENT_MIN_MS = 24 * 60 * 60 * 1000;
const SECURE = (process.env.APP_URL || '').startsWith('https://');

export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return [part.trim(), ''];
      return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())];
    })
  );
}

function poserCookie(res, token) {
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

/**
 * Le jeton de la requête : l'en-tête d'abord, puis le cookie — sauf si la
 * fenêtre l'a récusé. Un Bearer qui ne correspond à aucune session ne coupe
 * pas la route au cookie : d'anciens bundles envoient encore un jeton hérité
 * de Base44, qui ne veut rien dire ici.
 */
export function tokenDe(req) {
  const auth = String(req.headers?.authorization || '');
  const recuse = String(req.headers?.['x-klocka-fenetre'] || '') === '1';
  if (/^Bearer\s+\S+/i.test(auth)) {
    const token = auth.replace(/^Bearer\s+/i, '').trim();
    if (Records.filter('Session', { token })[0]) return { token, fenetre: true };
  }
  if (recuse) return { token: null, fenetre: true };
  return { token: parseCookies(req)[COOKIE_NAME] || null, fenetre: false };
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.sansCookie] - session de fenêtre : pas de cookie, le
 *   jeton est rendu à l'appelant qui le garde dans sa fenêtre.
 */
export function createSession(res, userEmail, { sansCookie = false } = {}) {
  const token = randomBytes(32).toString('hex');
  Records.create('Session', {
    token,
    user_email: String(userEmail).toLowerCase(),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    renouvelee_le: new Date().toISOString(),
    fenetre: !!sansCookie,
  });
  if (!sansCookie) poserCookie(res, token);
  return token;
}

/**
 * Prolonge la session courante : nouvelle échéance en base, cookie réémis.
 * À appeler là où l'application passe à chaque ouverture — /api/auth/me.
 * @returns {boolean} true si la session a été prolongée
 */
export function prolongerSession(req, res) {
  const { token, fenetre } = tokenDe(req);
  if (!token) return false;
  const session = Records.filter('Session', { token })[0];
  if (!session) return false;
  const depuis = session.renouvelee_le || session.created_date;
  if (depuis && Date.now() - new Date(depuis).getTime() < RENOUVELLEMENT_MIN_MS) return false;
  Records.update('Session', session.id, {
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    renouvelee_le: new Date().toISOString(),
  });
  if (!fenetre) poserCookie(res, token);
  return true;
}

// Returns the session's user email, or null when absent/expired.
export function sessionEmail(req) {
  const { token } = tokenDe(req);
  if (!token) return null;
  const session = Records.filter('Session', { token })[0];
  if (!session) return null;
  if (session.expires_at && new Date(session.expires_at).getTime() < Date.now()) {
    Records.delete('Session', session.id);
    return null;
  }
  return session.user_email || null;
}

export function destroySession(req, res) {
  const { token, fenetre } = tokenDe(req);
  if (token) Records.filter('Session', { token }).forEach((s) => Records.delete('Session', s.id));
  // Fermer une session de fenêtre ne touche pas au cookie : l'autre compte,
  // dans les autres fenêtres, reste connecté.
  if (fenetre) return;
  const parts = [`${COOKIE_NAME}=`, 'HttpOnly', 'Path=/', 'SameSite=Lax', 'Max-Age=0'];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

// Housekeeping so the table doesn't grow forever.
export function purgeExpiredSessions() {
  const now = Date.now();
  Records.list('Session')
    .filter((s) => s.expires_at && new Date(s.expires_at).getTime() < now)
    .forEach((s) => Records.delete('Session', s.id));
}
