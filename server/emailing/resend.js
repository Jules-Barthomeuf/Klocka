// L'envoi par Resend (https://resend.com), depuis le domaine
// notifications-klocka.com : la réputation de klocka.immo reste à l'abri
// des envois en nombre. La clé est RESEND_API_KEY ; l'expéditeur se règle
// par EMAILING_FROM.

const API = 'https://api.resend.com/emails';
export const EXPEDITEUR = () => (process.env.EMAILING_FROM || "L'équipe Klocka <equipe@notifications-klocka.com>").trim();
export const resendConfigure = () => !!(process.env.RESEND_API_KEY || '').trim();

/**
 * Un email. Rend { ok, id } ou { ok: false, error, definitif }.
 * `definitif` : inutile de réessayer (adresse refusée, domaine non vérifié).
 */
export async function envoyerResend({ a, objet, html, texte, repondreA = null, entetes = null, etiquettes = [], idempotence = null, de = null }, { lire = fetch } = {}) {
  if (!resendConfigure()) return { ok: false, error: 'RESEND_API_KEY manque.', definitif: true };
  const r = await lire(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
      ...(idempotence ? { 'Idempotency-Key': String(idempotence).slice(0, 256) } : {}),
    },
    body: JSON.stringify({
      from: de || EXPEDITEUR(),
      to: [a],
      subject: objet,
      html,
      text: texte,
      ...(repondreA ? { reply_to: repondreA } : {}),
      ...(entetes ? { headers: entetes } : {}),
      ...(etiquettes.length ? { tags: etiquettes.map(([name, value]) => ({ name, value: String(value).replace(/[^\w-]/g, '_').slice(0, 256) })) } : {}),
    }),
    signal: AbortSignal.timeout(20_000),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ message: e?.message || String(e) }) }));
  const j = await r.json().catch(() => ({}));
  if (r.ok && j.id) return { ok: true, id: j.id };
  const error = j.message || j.error || `Resend a répondu ${r.status}`;
  return { ok: false, error, definitif: [400, 401, 403, 422].includes(r.status) };
}

const LOT = 'https://api.resend.com/emails/batch';
export const TAILLE_LOT = 100;

/** Pure : un message au format de l'API Resend. */
const versResend = (m) => ({
  from: m.de || EXPEDITEUR(),
  to: [m.a],
  subject: m.objet,
  html: m.html,
  text: m.texte,
  ...(m.repondreA ? { reply_to: m.repondreA } : {}),
  ...(m.entetes ? { headers: m.entetes } : {}),
  ...(m.etiquettes?.length ? { tags: m.etiquettes.map(([name, value]) => ({ name, value: String(value).replace(/[^\w-]/g, '_').slice(0, 256) })) } : {}),
});

/**
 * Un lot d'au plus 100 emails, en une requête. Rend { ok, ids } (dans l'ordre
 * des messages) ou { ok: false, error, reessayer } : une limite de débit (429)
 * ou une panne (5xx) se réessaie plus tard ; le reste est définitif.
 */
export async function envoyerLot(messages, { idempotence = null, lire = fetch } = {}) {
  if (!resendConfigure()) return { ok: false, error: 'RESEND_API_KEY manque.', reessayer: false };
  if (!messages.length) return { ok: true, ids: [] };
  const r = await lire(LOT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
      ...(idempotence ? { 'Idempotency-Key': String(idempotence).slice(0, 256) } : {}),
    },
    body: JSON.stringify(messages.slice(0, TAILLE_LOT).map(versResend)),
    signal: AbortSignal.timeout(60_000),
  }).catch((e) => ({ ok: false, status: 0, json: async () => ({ message: e?.message || String(e) }) }));
  const j = await r.json().catch(() => ({}));
  if (r.ok && Array.isArray(j.data)) return { ok: true, ids: j.data.map((x) => x?.id || null) };
  return { ok: false, error: j.message || `Resend a répondu ${r.status}`, reessayer: r.status === 429 || r.status === 0 || r.status >= 500 };
}
