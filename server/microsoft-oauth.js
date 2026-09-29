// « Se connecter avec Microsoft » : l'identité seule (nom, adresse), comme la
// connexion Google. Aucune boîte, aucun fichier : la portée User.Read lit le
// profil de la personne qui se connecte, rien d'autre.
//
// Comptes acceptés : professionnels (Microsoft 365, Entra ID) et personnels
// (Outlook, Hotmail). Le compte Klocka se retrouve par l'adresse, et seule une
// adresse invitée entre : la règle est celle du mot de passe et de Google.
//
// L'adresse retenue est celle que Microsoft garantit. Côté entreprise, le champ
// « mail » d'un annuaire s'écrit librement par son administrateur : un annuaire
// monté pour l'occasion pourrait y mettre l'adresse de n'importe qui. On prend
// donc le nom de connexion (userPrincipalName), dont le domaine doit avoir été
// vérifié par l'annuaire. Côté compte personnel, l'adresse est celle du compte.

import { randomBytes } from 'crypto';

const CLIENT_ID = (process.env.MICROSOFT_CLIENT_ID || '').trim();
const CLIENT_SECRET = (process.env.MICROSOFT_CLIENT_SECRET || '').trim();
// « common » : tous les annuaires et les comptes personnels.
const TENANT = (process.env.MICROSOFT_TENANT || 'common').trim();
const AUTORITE = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0`;
// L'annuaire des comptes Microsoft personnels (Outlook, Hotmail).
const ANNUAIRE_PERSONNEL = '9188040d-6c67-4c5b-b112-36a304b66dad';

export const microsoftEnabled = !!(CLIENT_ID && CLIENT_SECRET);

const etats = new Map();
const ETAT_TTL_MS = 10 * 60 * 1000;

/** L'URI de retour pour l'adresse qu'utilise le navigateur (même règle que Google). */
export function redirectUriMicrosoft(req) {
  const proto = (req?.headers['x-forwarded-proto'] || req?.protocol || 'http').split(',')[0].trim();
  const host = (req?.headers['x-forwarded-host'] || req?.headers.host || '').split(',')[0].trim();
  const base = host ? `${proto}://${host}` : (process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, '');
  return `${base}/api/auth/microsoft/callback`;
}

export function urlConnexionMicrosoft({ returnTo = '/Dashboard', req, fenetre = false } = {}) {
  const redirectUri = redirectUriMicrosoft(req);
  const state = randomBytes(16).toString('hex');
  etats.set(state, { at: Date.now(), returnTo, redirectUri, fenetre: !!fenetre });
  for (const [s, v] of etats) if (Date.now() - v.at > ETAT_TTL_MS) etats.delete(s);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid profile email User.Read',
    prompt: 'select_account',
    state,
  });
  return `${AUTORITE}/authorize?${params}`;
}

/** Le contenu d'un jeton d'identité. Reçu du point de jeton, en direct : pas de signature à revérifier. */
export function lireJeton(jeton) {
  try {
    return JSON.parse(Buffer.from(String(jeton).split('.')[1], 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

/**
 * L'adresse qu'on peut croire. Pure : testée sans réseau.
 * @param {{tid?: string, email?: string, preferred_username?: string}} claims le jeton d'identité
 * @param {{userPrincipalName?: string, mail?: string}} moi le profil Graph
 */
export function adresseFiable(claims, moi) {
  if (claims?.tid === ANNUAIRE_PERSONNEL) return String(claims.email || claims.preferred_username || moi?.userPrincipalName || '').toLowerCase() || null;
  const upn = String(moi?.userPrincipalName || '').toLowerCase();
  // Un invité d'un autre annuaire (#EXT#) n'a pas d'adresse vérifiée ici.
  if (!upn || upn.includes('#ext#') || !upn.includes('@')) return null;
  return upn;
}

/** Termine l'aller-retour : le code contre un jeton, puis le profil. */
export async function callbackMicrosoft({ code, state }) {
  if (!microsoftEnabled) throw new Error('Connexion Microsoft non configurée (MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET).');
  const etat = state && etats.get(state);
  etats.delete(state);
  if (!etat || Date.now() - etat.at > ETAT_TTL_MS) throw new Error('Requête de connexion expirée ou invalide. Réessayez.');
  if (!code) throw new Error("Microsoft n'a pas renvoyé de code d'autorisation.");

  const r = await fetch(`${AUTORITE}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: etat.redirectUri,
      grant_type: 'authorization_code',
      scope: 'openid profile email User.Read',
    }),
  });
  const jetons = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(jetons.error_description?.split('\r\n')[0] || jetons.error || `Microsoft a répondu ${r.status}`);

  const claims = lireJeton(jetons.id_token);
  const g = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,userPrincipalName', {
    headers: { Authorization: `Bearer ${jetons.access_token}` },
  });
  const moi = g.ok ? await g.json() : {};
  const email = adresseFiable(claims, moi);
  if (!email) throw new Error("Microsoft n'a pas communiqué d'adresse vérifiée pour ce compte.");
  return { email, name: moi.displayName || claims.name || '', returnTo: etat.returnTo, fenetre: etat.fenetre };
}
