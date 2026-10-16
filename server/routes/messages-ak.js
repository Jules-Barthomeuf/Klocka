// Les messages d'AK (16 oct. 2026) : la conversation où AK écrit de lui-même, et ce qui n'a pas été vu.
import { ok, wrap, currentUser } from '../contexte.js';

export function monterMessagesAK(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  app.get('/api/messages-ak', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await import('../ak-messages.js')).etatDAK(user.email));
  }));
  app.post('/api/messages-ak/lus', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await import('../ak-messages.js')).marquerLus(user.email));
  }));
}
