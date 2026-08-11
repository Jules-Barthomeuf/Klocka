// Local email/SMS delivery. In the Base44 cloud these went through a provider;
// locally we log them and persist an EmailLog record so the Mails admin page has
// data. Wire a real SMTP/provider here if you need actual delivery.

import { Records } from './db.js';

export async function sendEmail({ to, subject, body }) {
  console.log(`[email] → ${to} | ${subject}`);
  try {
    Records.create('EmailLog', {
      to,
      destinataire: to,
      subject,
      sujet: subject,
      body,
      contenu: body,
      statut: 'envoye',
      sent_at: new Date().toISOString(),
    });
  } catch {
    /* EmailLog entity may not be needed; ignore */
  }
  return { success: true };
}

export async function sendSMS({ to, body }) {
  console.log(`[sms] → ${to} | ${body}`);
  return { success: true };
}
