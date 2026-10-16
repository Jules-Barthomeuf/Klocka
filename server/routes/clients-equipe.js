// Les clients de l'équipe (16 oct. 2026) : la liste, la fiche, l'appel
// enregistré ou collé, et son annulation. Réservé à l'équipe ;
// server/clients-equipe.js fait le travail.

import fs from 'fs';
import { ok, wrap, currentUser, upload } from '../contexte.js';

export function monterClientsEquipe(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const C = () => import('../clients-equipe.js');
  const refus = (res, r) => res.status(400).json({ error: r.error || 'Impossible.' });

  app.get('/api/clients-equipe', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { clients: (await C()).listerClients() });
  }));
  app.post('/api/clients-equipe', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await C()).creerClient(req.body || {}, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // L'enregistrement en direct : un morceau de huit secondes, transcrit et rendu ; l'audio n'est pas gardé.
  app.post('/api/clients-equipe/morceau', upload.single('audio'), wrap(async (req, res) => {
    if (!admin(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Morceau vide.' });
    const audio = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    try {
      ok(res, { ok: true, i: Number(req.body?.i) || 0, texte: await (await import('../prospection/appel.js')).transcrire(audio) });
    } catch (e) {
      res.status(502).json({ error: `Morceau non transcrit : ${e?.message || e}` });
    }
  }));
  app.post('/api/clients-equipe/appels', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    const r = await (await C()).noterAppelClient({ client_id: b.client_id || null, contenu: b.contenu, source: b.source === 'enregistre' ? 'enregistre' : 'colle', duree_s: b.duree_s, user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/clients-equipe/appels/:id/annuler', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await C()).annulerAppelClient(req.params.id, { user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.get('/api/clients-equipe/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const f = await (await C()).ficheClient(req.params.id);
    if (!f) return res.status(404).json({ error: 'Client introuvable.' });
    ok(res, { client: f });
  }));
  app.patch('/api/clients-equipe/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await C()).retoucherClient(req.params.id, req.body || {}, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
}
