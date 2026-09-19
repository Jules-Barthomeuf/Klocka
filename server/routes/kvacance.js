// K-Vacance : les locaux vides et le turn-over d'un quartier. Réservé à
// l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { analyser, listerRecherches } from '../kvacance.js';

export function monterKVacance(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kvacance', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { recherches: listerRecherches() });
  }));

  app.post('/api/kvacance', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await analyser(req.body?.adresse, { rayon: Number(req.body?.rayon) || 400, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
