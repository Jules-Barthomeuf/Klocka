// Le garde-fou de tous les envois de l'emailing : campagnes, séquences et
// mails de la plateforme passent par expedier().
//
// Sur Render (ou EMAILING_REEL=true), l'email part à son destinataire. Partout
// ailleurs, il ne part jamais chez un vrai contact : il est redirigé vers
// l'adresse de test (EMAILING_TEST_TO, sinon l'admin qui agit), l'objet
// préfixé « [Local · pour x] » ; sans adresse de test, il est seulement noté.

import { envoyerResend } from './resend.js';

export const envoiReel = () => !!process.env.RENDER || process.env.EMAILING_REEL === 'true';
const norm = (e) => String(e || '').trim().toLowerCase();

/** L'adresse vers laquelle un envoi local est redirigé, ou null. */
export const adresseDeTest = (testeur = null) => norm(process.env.EMAILING_TEST_TO) || norm(testeur) || null;

/**
 * Envoie un email par Resend, sous le garde-fou. Rend { ok, id } et, en local,
 * { redirige: adresse } ou { simule: true }.
 */
export async function expedier(m, { testeur = null, envoyer = envoyerResend } = {}) {
  if (envoiReel()) return envoyer(m);
  const vers = adresseDeTest(testeur);
  if (!vers) {
    console.log(`[emailing] local : non envoyé à ${m.a} (« ${m.objet} ») ; EMAILING_TEST_TO pour le recevoir`);
    return { ok: true, simule: true };
  }
  const r = await envoyer({
    ...m,
    a: vers,
    objet: `[Local · pour ${m.a}] ${m.objet}`,
    idempotence: m.idempotence ? `local-${m.idempotence}` : null,
  });
  return { ...r, redirige: vers };
}

/** Pour le repli Gmail des invitations : le destinataire effectif, sous le même garde-fou. */
export function destinataireGarde(a, testeur) {
  if (envoiReel()) return { a, objetPrefixe: '' };
  const vers = adresseDeTest(testeur);
  return vers ? { a: vers, objetPrefixe: `[Local · pour ${a}] ` } : null;
}

// --- L'heure de Paris ------------------------------------------------------------

/** Pure : le décalage de Paris sur UTC (en minutes) à un instant donné. */
export function decalageParis(instant) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    .formatToParts(instant).filter((x) => x.type !== 'literal').map((x) => [x.type, Number(x.value)]));
  const commeUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return Math.round((commeUtc - Math.floor(instant.getTime() / 60000) * 60000) / 60000);
}

/** Pure : le jour civil (à Paris) d'un instant, « AAAA-MM-JJ ». */
export function jourParis(instant) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Pure : l'instant UTC de « jour » (AAAA-MM-JJ) à « heure » h « minute » à Paris. */
export function aParis(jour, heure, minute = 0) {
  const [a, m, j] = jour.split('-').map(Number);
  const naif = new Date(Date.UTC(a, m - 1, j, heure, minute));
  return new Date(naif.getTime() - decalageParis(naif) * 60000);
}
