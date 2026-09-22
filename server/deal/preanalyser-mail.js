// La pré-analyse d'un mail reçu : le message entier (RFC 822, pièces
// comprises) passe dans le pipeline .eml, le dossier naît, le mail lui est
// lié et l'expéditeur devient le contact agent. L'écran et AK font pareil.

import { Records } from '../db.js';
import { telechargerRaw } from '../gmail-inbox.js';
import { analyserFiche } from './index.js';

export async function preanalyserMail(mailRecu, { user = null, uploadDir = null, contactEmail = undefined } = {}) {
  if (mailRecu.deal_id) throw new Error('Ce mail a déjà été préanalysé.');
  const buffer = await telechargerRaw(mailRecu.compte, mailRecu.gmail_message_id);
  // L'expéditeur devient le contact agent, sauf quand on dit le contraire :
  // un mail transféré par quelqu'un de l'équipe n'a pas d'agent dedans.
  const contact = contactEmail === undefined ? mailRecu.de_email || null : contactEmail;
  const dossier = await analyserFiche(
    { buffer, filename: `${(mailRecu.objet || 'mail').slice(0, 60)}.eml`, mimetype: 'message/rfc822', contactEmail: contact },
    { user, uploadDir }
  );
  Records.update('MailRecu', mailRecu.id, { deal_id: dossier.deal_id });
  Records.update('Deal', Records.findBy('Deal', 'deal_id', dossier.deal_id).id, {
    source_mail: { mail_recu_id: mailRecu.id, de: mailRecu.de, objet: mailRecu.objet, date: mailRecu.date },
  });
  return dossier;
}
