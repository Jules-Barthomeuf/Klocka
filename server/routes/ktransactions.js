// K-Transactions : ce que les murs et les fonds se sont vendus. Réservé à
// l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { analyser, listerRecherches } from '../ktransactions.js';

export function monterKTransactions(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/ktransactions', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { recherches: listerRecherches() });
  }));

  app.post('/api/ktransactions', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await analyser(req.body?.adresse, {
      annees: Number(req.body?.annees) || 5,
      rayon: Number(req.body?.rayon) || 500,
      user,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
