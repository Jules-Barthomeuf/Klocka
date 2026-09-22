// La boîte de réception et le rattachement d une boîte Google.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { authResultPage, RETOUR_POPUP } from '../pages-oauth.js';
import { buildAuthUrl } from '../google-oauth.js';
import { Records } from '../db.js';
import { releverBoite, listerBoite } from '../gmail-inbox.js';
import { UPLOAD_DIR, compteAutorise, currentUser, ok, wrap } from '../contexte.js';

// Rattacher une boîte d'équipe : réservé aux admins, et c'est le seul parcours
// qui demande à Google les portées Gmail, Drive et Agenda. Un client n'y
// accède pas — sa connexion ne cède que son identité.
function rattachementBoite(req, res, returnTo) {
  const user = currentUser(req);
  // Journalisé : quand une boîte ne s'enregistre pas, c'est ici qu'on voit si
  // la demande est seulement partie, et de qui.
  console.log(`[auth] rattachement d'une boîte demandé par ${user?.email || 'personne (non connecté)'} depuis host=${req.headers.host}`);
  if (user?.role !== 'admin') {
    return authResultPage(res, {
      ok: false,
      title: 'Réservé à l\'équipe',
      detail: "Seul un administrateur connecté peut rattacher une boîte Google à Klocka.",
    });
  }
  const url = buildAuthUrl({ returnTo, req, boite: true });
  console.log(`[auth]   redirect_uri envoyée : ${new URL(url).searchParams.get('redirect_uri')}`);
  res.redirect(url);
}

/** Monte les routes « mail / mails » sur l'application. */
export function monterCourriel(app) {
  app.get('/api/mail/google/connect', (req, res) => rattachementBoite(req, res, '/Dashboard'));

  // Variante en fenêtre surgissante : la page appelante (et son brouillon de
  // mail en cours de rédaction) n'est jamais quittée.
  app.get('/api/mail/google/connect-popup', (req, res) => rattachementBoite(req, res, RETOUR_POPUP));

  app.post('/api/mails/inbox/relever', wrap(async (req, res) => {
    const { compte } = req.body || {};
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    ok(res, await releverBoite(compte));
  }));

  app.get('/api/mails/inbox', wrap((req, res) => {
    const compte = req.query.compte;
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    ok(res, listerBoite(compte));
  }));

  // Préanalyse d'un mail reçu : téléchargement RFC 822 → pipeline .eml existant
  // (texte + pièces jointes), puis liaison mail ↔ deal et mémorisation de
  // l'expéditeur comme contact agent.
  app.post('/api/mails/inbox/:id/preanalyser', wrap(async (req, res) => {
    const mailRecu = Records.get('MailRecu', req.params.id);
    if (!mailRecu) return res.status(404).json({ error: 'Mail introuvable' });
    if (!compteAutorise(req, mailRecu.compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    if (mailRecu.deal_id) {
      return res.status(409).json({ error: 'Ce mail a déjà été préanalysé.', deal_id: mailRecu.deal_id });
    }

    const { preanalyserMail } = await import('../deal/preanalyser-mail.js');
    const dossier = await preanalyserMail(mailRecu, { user: currentUser(req), uploadDir: UPLOAD_DIR });
    ok(res, dossier);
  }));
}
