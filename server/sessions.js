// Sessions utilisateur, adossées à un cookie HttpOnly.
//
// Les sessions vivent en base (entité Session) et non en mémoire : redémarrer le
// serveur ne déconnecte personne.

import { randomBytes } from 'crypto';
import { Records } from './db.js';

const COOKIE_NAME = 'klocka_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours
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

export function createSession(res, userEmail) {
  const token = randomBytes(32).toString('hex');
  Records.create('Session', {
    token,
    user_email: String(userEmail).toLowerCase(),
    expires_at: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
  });
  const parts = [
    `${COOKIE_NAME}=${token}`,
    'HttpOnly',
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];
  if (SECURE) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
  return token;
}

// Returns the session's user email, or null when absent/expired.
export function sessionEmail(req) {
  const token = parseCookies(req)[COOKIE_NAME];
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
  const token = parseCookies(req)[COOKIE_NAME];
  if (token) Records.filter('Session', { token }).forEach((s) => Records.delete('Session', s.id));
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
