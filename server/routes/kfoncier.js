// K-Foncier : les parcelles d'une adresse et leurs propriétaires. Réservé à
// l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { analyser, ficheParcelle, listerRecherches } from '../kfoncier.js';

export function monterKFoncier(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kfoncier', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { recherches: listerRecherches() });
  }));

  app.post('/api/kfoncier', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await analyser(req.body?.adresse, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kfoncier/parcelle', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await ficheParcelle({ code_insee: req.query.insee, section: req.query.section, numero: req.query.numero });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
