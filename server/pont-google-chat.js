// Le pont vers Google Chat : quand un mandataire écrit, dépose une pièce ou
// envoie son dossier, l'équipe le lit dans l'espace Google Chat où elle
// travaille déjà, avec le lien qui ouvre la conversation dans Klocka. On
// répond dans Klocka : le pont ne fait qu'annoncer.
//
// Un webhook entrant d'espace (Paramètres de l'espace > Applications et
// intégrations > Webhooks), dans GOOGLE_CHAT_WEBHOOK_DOSSIERS. Sans lui, rien
// ne part et rien ne casse. Un fil Google Chat par dossier (threadKey).

import { Records } from './db.js';
import { APP_URL_PROD } from './contexte.js';

const DELAI_MS = 10000;
const webhook = () => (process.env.GOOGLE_CHAT_WEBHOOK_DOSSIERS || '').trim();

const nomDe = (email) => {
  const u = email ? Records.findBy('User', 'email', String(email).toLowerCase()) : null;
  return u?.full_name || email || 'Un mandataire';
};

/** Pure : le texte posté dans Google Chat. */
export function texteAlerte({ bien, mandataire, quoi, texte = '', lien = '' }) {
  const extrait = String(texte || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return [
    `*${bien || 'Dossier mandataire'}* · ${mandataire}`,
    extrait ? `${quoi} : « ${extrait} »` : quoi,
    lien ? `<${lien}|Ouvrir la conversation>` : null,
  ].filter(Boolean).join('\n');
}

/** Pure : l'adresse du webhook, avec le fil du dossier. */
export function adresseFil(url, dossierId) {
  const u = new URL(url);
  u.searchParams.set('threadKey', `dossier-${dossierId}`);
  u.searchParams.set('messageReplyOption', 'REPLY_MESSAGE_FALLBACK_TO_NEW_THREAD');
  return u.toString();
}

/**
 * Annonce un geste du mandataire à l'équipe. Ne lève jamais : une panne de
 * Google Chat ne doit pas empêcher un message ou une pièce d'arriver.
 */
export async function prevenirEquipe(dossier, { quoi, texte = '' }, { fetchImpl = fetch, url = webhook() } = {}) {
  if (!url || !dossier?.id) return { ok: false, raison: 'sans webhook' };
  const lien = `${APP_URL_PROD || ''}/Conversations?dossier=${dossier.id}`;
  try {
    const r = await fetchImpl(adresseFil(url, dossier.id), {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ text: texteAlerte({ bien: dossier.bien, mandataire: nomDe(dossier.mandataire_email), quoi, texte, lien }) }),
      signal: AbortSignal.timeout(DELAI_MS),
    });
    if (!r.ok) {
      console.warn(`[google chat] le webhook a répondu ${r.status}`);
      return { ok: false, raison: `statut ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.warn(`[google chat] ${e?.message || e}`);
    return { ok: false, raison: e?.message || String(e) };
  }
}
