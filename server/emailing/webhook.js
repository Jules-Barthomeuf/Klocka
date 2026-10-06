// Les événements de Resend (webhook signé par Svix) : délivré, ouvert,
// cliqué, bounce, plainte… Chacun se range sur son envoi (par l'id Resend),
// une seule fois (dédoublonné par svix-id). Un bounce dur, une plainte ou une
// adresse supprimée par Resend rend le contact non envoyable, et le sort de
// ses séquences.

import crypto from 'crypto';
import { Records } from '../db.js';
import { E } from './schema.js';

const TOLERANCE_S = 5 * 60;
const maintenant = () => new Date().toISOString();

/**
 * Pure : la signature Svix est-elle valable ? Le contenu signé est
 * « id.timestamp.corps brut », en HMAC-SHA256 avec le secret (whsec_, en
 * base64), comparé à chacune des signatures « v1,… » de l'en-tête.
 */
export function signatureValable({ corps, id, timestamp, signature, secret, maintenantS = Math.floor(Date.now() / 1000) }) {
  if (!corps || !id || !timestamp || !signature || !secret) return false;
  if (Math.abs(maintenantS - Number(timestamp)) > TOLERANCE_S) return false;
  const cle = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64');
  const attendue = crypto.createHmac('sha256', cle).update(`${id}.${timestamp}.${corps}`).digest('base64');
  return String(signature).split(' ').some((s) => {
    const [version, valeur] = s.split(',');
    if (version !== 'v1' || !valeur) return false;
    const a = Buffer.from(valeur);
    const b = Buffer.from(attendue);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

const TYPES = {
  'email.sent': 'envoye', 'email.delivered': 'delivre', 'email.delivery_delayed': 'retarde', 'email.opened': 'ouvert',
  'email.clicked': 'clique', 'email.bounced': 'bounce', 'email.complained': 'plainte', 'email.failed': 'echec', 'email.suppressed': 'supprime',
};

/** Sort un contact de ses séquences et le rend non envoyable. */
function rendreNonEnvoyable(email, statut) {
  const c = Records.list(E.CONTACT).find((x) => x.email === String(email || '').toLowerCase());
  if (!c || c.statut === statut) return;
  // Une plainte l'emporte sur tout ; un bounce n'écrase pas une plainte.
  if (c.statut === 'plainte') return;
  Records.update(E.CONTACT, c.id, { statut, statut_le: maintenant() });
  for (const i of Records.list(E.INSCRIPTION).filter((x) => x.contact_id === c.id && x.statut === 'en_cours')) Records.update(E.INSCRIPTION, i.id, { statut: 'sortie', raison: statut, sortie_le: maintenant() });
}

/** Range un événement Resend. Rend { ok, ignore? }. */
export function traiter(evenement, { svixId = null } = {}) {
  const type = TYPES[evenement?.type];
  if (!type) return { ok: true, ignore: 'type' };
  if (svixId && Records.list(E.EVENEMENT).some((e) => e.svix_id === svixId)) return { ok: true, ignore: 'doublon' };
  const d = evenement.data || {};
  const envoi = d.email_id ? Records.list(E.ENVOI).find((e) => e.resend_id === d.email_id) : null;
  const destinataire = Array.isArray(d.to) ? d.to[0] : d.to;
  const le = evenement.created_at || maintenant();
  Records.create(E.EVENEMENT, {
    type, svix_id: svixId, resend_id: d.email_id || null, envoi_id: envoi?.id || null, email: String(destinataire || envoi?.email || '').toLowerCase(),
    campagne_id: envoi?.campagne_id || null, sequence_id: envoi?.sequence_id || null, etape_id: envoi?.etape_id || null,
    lien: d.click?.link || null, detail: d.bounce?.message || d.bounce?.type || null, le,
  });
  if (envoi) {
    const patch = {};
    if (type === 'delivre' && !envoi.delivre_le) patch.delivre_le = le;
    if (type === 'ouvert') { patch.ouvertures = (envoi.ouvertures || 0) + 1; if (!envoi.ouvert_le) patch.ouvert_le = le; }
    if (type === 'clique') { patch.clics = (envoi.clics || 0) + 1; if (!envoi.clique_le) patch.clique_le = le; }
    if (type === 'bounce') patch.bounce_le = le;
    if (type === 'plainte') patch.plainte_le = le;
    if (Object.keys(patch).length) Records.update(E.ENVOI, envoi.id, patch);
  }
  if (type === 'bounce' || type === 'supprime') rendreNonEnvoyable(destinataire || envoi?.email, 'bounce');
  if (type === 'plainte') rendreNonEnvoyable(destinataire || envoi?.email, 'plainte');
  return { ok: true };
}
