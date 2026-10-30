// L'assistant sur WhatsApp (30 oct. 2026, Jules : « un prototype qui marche pour moi »). Un message ou un vocal envoyé
// au numéro WhatsApp Business arrive ici par le webhook de Meta ; la personne est reconnue par son numéro
// (WHATSAPP_NUMEROS), le vocal est transcrit comme une dictée (Voxtral), puis le message part au même moteur que
// l'application : Haka pour un mandataire, AK pour l'équipe. La réponse revient sur WhatsApp.
//
// Variables (Render ou .env) :
//   WHATSAPP_TOKEN            le jeton d'accès Meta (24 h pour le numéro de test, permanent avec un utilisateur système)
//   WHATSAPP_PHONE_NUMBER_ID  le « Phone number ID » du numéro WhatsApp
//   WHATSAPP_VERIFY_TOKEN     le mot de passe choisi, recopié dans Meta (Webhook > Verify token)
//   WHATSAPP_APP_SECRET       l'« App secret » de l'app Meta : la signature de chaque message est vérifiée
//   WHATSAPP_NUMEROS          qui peut écrire : « 33612345678:jules.b@klocka.immo », plusieurs séparés par des virgules
// Sans jeton ni numéro, rien n'est branché : le webhook répond 404.

import crypto from 'crypto';
import { Records } from './db.js';

const GRAPH = () => `https://graph.facebook.com/${(process.env.WHATSAPP_GRAPH || 'v23.0').trim()}`;
const env = (k) => String(process.env[k] || '').trim();

export const actif = () => !!(env('WHATSAPP_TOKEN') && env('WHATSAPP_PHONE_NUMBER_ID') && env('WHATSAPP_VERIFY_TOKEN'));

/** Pure : « 33612345678:jules@x.fr, +33 6 98…:nora@x.fr » → Map numéro (chiffres seuls) → adresse. */
export function lireNumeros(texte = '') {
  const m = new Map();
  for (const morceau of String(texte).split(',')) {
    const [num, email] = morceau.split(':').map((x) => String(x || '').trim());
    const chiffres = num.replace(/\D/g, '').replace(/^00/, '');
    if (chiffres && email) m.set(chiffres, email.toLowerCase());
  }
  return m;
}

/** Pure : la signature de Meta (x-hub-signature-256) sur le corps brut. Sans secret, rien n'est vérifié. */
export function signatureValable({ corps, entete, secret }) {
  if (!secret) return true;
  if (!corps || !entete) return false;
  const attendu = `sha256=${crypto.createHmac('sha256', secret).update(corps).digest('hex')}`;
  return entete.length === attendu.length && crypto.timingSafeEqual(Buffer.from(entete), Buffer.from(attendu));
}

/** Pure : les messages d'une notification Meta (les accusés de lecture et statuts sont ignorés). */
export function messagesDu(corps) {
  const sortie = [];
  for (const e of corps?.entry || []) for (const c of e?.changes || []) for (const m of c?.value?.messages || []) sortie.push(m);
  return sortie;
}

/** Pure : le texte d'une réponse, au format WhatsApp (gras simple, pas de titres), coupé en messages de 4 000 signes. */
export function pourWhatsApp(texte = '') {
  const propre = String(texte || '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 : $2')
    .trim();
  const morceaux = [];
  let reste = propre;
  while (reste.length > 4000) {
    const coupe = Math.max(reste.lastIndexOf('\n', 4000), 2000);
    morceaux.push(reste.slice(0, coupe).trim());
    reste = reste.slice(coupe).trim();
  }
  if (reste) morceaux.push(reste);
  return morceaux;
}

const vus = new Set();
const fils = new Map(); // numéro → derniers échanges (en mémoire : un redémarrage repart d'un fil neuf)

async function envoyer(a, texte) {
  for (const morceau of pourWhatsApp(texte)) {
    const r = await fetch(`${GRAPH()}/${env('WHATSAPP_PHONE_NUMBER_ID')}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', to: a, type: 'text', text: { body: morceau } }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) console.warn(`[whatsapp] envoi refusé (${r.status}) : ${(await r.text()).slice(0, 300)}`);
  }
}

async function telechargerMedia(id) {
  const entete = { Authorization: `Bearer ${env('WHATSAPP_TOKEN')}` };
  const meta = await fetch(`${GRAPH()}/${id}`, { headers: entete, signal: AbortSignal.timeout(20000) }).then((r) => r.json());
  if (!meta?.url) throw new Error(`média introuvable : ${JSON.stringify(meta).slice(0, 200)}`);
  const r = await fetch(meta.url, { headers: entete, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error(`téléchargement refusé (${r.status})`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mimetype: String(meta.mime_type || 'audio/ogg').split(';')[0] };
}

/** Un message reçu : qui, quoi (texte ou vocal transcrit), puis la réponse du moteur de la personne. */
export async function traiterMessage(m) {
  if (!m?.id || vus.has(m.id)) return;
  vus.add(m.id);
  if (vus.size > 2000) vus.delete(vus.values().next().value);
  const numero = String(m.from || '');
  const email = lireNumeros(env('WHATSAPP_NUMEROS')).get(numero);
  if (!email) { console.warn(`[whatsapp] numéro non autorisé : ${numero}`); return; }
  const user = Records.list('User').find((u) => String(u.email || '').toLowerCase() === email);
  if (!user) { await envoyer(numero, `Le compte ${email} n'existe pas dans Klocka.`); return; }

  let texte = '';
  if (m.type === 'text') texte = String(m.text?.body || '').trim();
  else if (m.type === 'audio') {
    try {
      const { transcrireAudio } = await import('./llm.js');
      const audio = await telechargerMedia(m.audio?.id);
      texte = String(await transcrireAudio(audio) || '').trim();
      console.log(`[whatsapp] vocal transcrit (${texte.length} signes)`);
    } catch (e) {
      console.warn(`[whatsapp] vocal illisible : ${e?.message || e}`);
      await envoyer(numero, "Je n'ai pas pu écouter ce vocal. Réessayez, ou écrivez-moi.");
      return;
    }
    if (!texte) { await envoyer(numero, "Le vocal est vide ou inaudible."); return; }
  } else {
    await envoyer(numero, 'Pour l’instant je lis les messages et les vocaux, pas encore les photos ni les fichiers.');
    return;
  }
  if (!texte) return;

  const historique = fils.get(numero) || [];
  const { mesurer } = await import('./llm-couts.js');
  let reponse;
  try {
    const { resultat } = await mesurer({ operation: user.role === 'mandataire' ? 'mandataire' : 'assistant', par: user.email }, async () => {
      if (user.role === 'mandataire') return (await import('./mandataire.js')).discuter({ historique, texte, user });
      return (await import('./ak/app.js')).repondreApp({ texte, historique, user, contexte: { page: 'whatsapp' } });
    });
    reponse = String(resultat?.texte || '').trim() || 'Fait.';
  } catch (e) {
    console.error('[whatsapp] réponse impossible :', e?.message || e);
    reponse = 'Je n’ai pas pu répondre, réessayez dans un instant.';
  }
  fils.set(numero, [...historique, { role: 'user', contenu: texte }, { role: 'assistant', contenu: reponse }].slice(-20));
  await envoyer(numero, reponse);
}
