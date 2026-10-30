// Le webhook WhatsApp (30 oct. 2026) : public, vérifié par le mot de passe de Meta (GET) et la signature (POST).
// Le traitement part après la réponse : Meta renvoie un message qui n'a pas eu son 200 à temps.

import { wrap } from '../contexte.js';

export function monterWhatsApp(app) {
  app.get('/api/whatsapp/webhook', wrap(async (req, res) => {
    const W = await import('../whatsapp.js');
    if (!W.actif()) return res.sendStatus(404);
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === String(process.env.WHATSAPP_VERIFY_TOKEN || '').trim()) {
      return res.status(200).send(String(req.query['hub.challenge'] || ''));
    }
    res.sendStatus(403);
  }));
  app.post('/api/whatsapp/webhook', wrap(async (req, res) => {
    const W = await import('../whatsapp.js');
    if (!W.actif()) return res.sendStatus(404);
    if (!W.signatureValable({ corps: req.corpsBrut, entete: req.get('x-hub-signature-256'), secret: String(process.env.WHATSAPP_APP_SECRET || '').trim() })) return res.sendStatus(401);
    res.sendStatus(200);
    for (const m of W.messagesDu(req.body)) W.traiterMessage(m).catch((e) => console.error('[whatsapp]', e?.message || e));
  }));
}
