// Le coach (16 oct. 2026) : les tutos et les quiz de chaque analyste. Réservé à l'équipe ; server/coaching.js fait le travail.
import { ok, wrap, currentUser } from '../contexte.js';

export function monterCoaching(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const C = () => import('../coaching.js');
  app.get('/api/coaching', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await C()).mesTutos(user));
  }));
  app.post('/api/coaching/tuto', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await C()).creerTuto({ par: user.email, sujet: req.body?.sujet, source: 'demande' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/coaching/:id/lu', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await C()).marquerLu(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/coaching/:id/quiz', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await C()).repondreQuiz(req.params.id, user, req.body?.reponses);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
