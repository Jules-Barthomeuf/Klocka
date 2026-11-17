// Gmail prévient dès qu'un mail arrive (17 nov. 2026, Jules : « au lieu de lire toutes les 15 minutes, un mail devient
// un trigger »). Gmail publie chaque changement d'une boîte dans un sujet Google Cloud Pub/Sub ; un abonnement « push »
// l'envoie aussitôt à /api/gmail/push ; le serveur relève alors les boîtes (deal/veille-mails.js), et la suite est la
// même qu'avant (tri, transfert à sourcing@, Mémoire). La relève toutes les 15 minutes reste, en filet.
//
// Réglages (Google Cloud, projet de l'application) : l'API Cloud Pub/Sub activée, un sujet dont le compte
// gmail-api-push@system.gserviceaccount.com est « Éditeur Pub/Sub », un abonnement push vers
// https://app.klocka.immo/api/gmail/push?jeton=GMAIL_PUSH_JETON.
// Variables : GMAIL_PUSH_SUJET (projects/<id du projet>/topics/<sujet>) et GMAIL_PUSH_JETON (secret de l'adresse).
// Sans elles, rien ne change. La surveillance d'une boîte dure sept jours : elle se renouvelle chaque jour.

import { timingSafeEqual } from 'node:crypto';

export const SUJET = String(process.env.GMAIL_PUSH_SUJET || '').trim();
const JETON = String(process.env.GMAIL_PUSH_JETON || '').trim();
export const actif = () => !!(SUJET && JETON);

/** Pure : le jeton de l'adresse est-il le bon ? Comparaison à temps constant. */
export function jetonValide(recu, attendu = JETON) {
  const a = Buffer.from(String(recu || ''));
  const b = Buffer.from(String(attendu || ''));
  return !!attendu && a.length === b.length && timingSafeEqual(a, b);
}

/** Pure : la notification Pub/Sub décodée, `{ emailAddress, historyId }`, ou null. */
export function lireNotification(corps) {
  try {
    const data = corps?.message?.data;
    if (!data) return null;
    const n = JSON.parse(Buffer.from(String(data), 'base64').toString('utf8'));
    return n?.emailAddress ? { emailAddress: String(n.emailAddress).toLowerCase(), historyId: n.historyId || null } : null;
  } catch {
    return null;
  }
}

/** Demande à Gmail de surveiller la boîte (sa réception) : rend `{ historyId, expiration }`. */
export async function surveiller(email) {
  const { storedAccount, accessTokenFor } = await import('./google-oauth.js');
  const compte = storedAccount(email);
  if (!compte?.peut_lire) throw new Error(`${email} : pas de lecture Gmail autorisée.`);
  const jeton = await accessTokenFor(compte);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicName: SUJET, labelIds: ['INBOX'], labelFilterBehavior: 'INCLUDE' }),
    signal: AbortSignal.timeout(15000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || `Gmail a répondu ${r.status}`);
  return d;
}

/** Chaque boîte lisible de l'équipe est surveillée (au démarrage, puis chaque jour). */
export async function surveillerToutes({ journal = console.log } = {}) {
  if (!actif()) return { inactif: true };
  const { comptesEquipe } = await import('./google-oauth.js');
  const boites = comptesEquipe().filter((a) => a.peut_lire && a.email);
  let ok = 0;
  for (const b of boites) {
    try {
      const d = await surveiller(b.email);
      ok += 1;
      journal(`[gmail push] ${b.email} surveillée jusqu'au ${new Date(Number(d.expiration) || Date.now()).toISOString().slice(0, 16)}`);
    } catch (e) {
      journal(`[gmail push] ${b.email} non surveillée : ${e?.message || e}`);
    }
  }
  return { boites: boites.length, ok };
}

/** Une notification reçue : la relève part tout de suite (une seule à la fois, la suivante enchaîne). */
export async function surNotification(corps) {
  const n = lireNotification(corps);
  if (!n) return { ignore: 'notification illisible' };
  const { relever } = await import('./deal/veille-mails.js');
  relever().then((r) => { if (r?.nouveaux) console.log(`[gmail push] ${n.emailAddress} : ${r.nouveaux} mail(s) relevé(s)`); }).catch((e) => console.warn('[gmail push] relève :', e?.message || e));
  return { ok: true, boite: n.emailAddress };
}
