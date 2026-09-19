// K-Data : le lanceur commun et la file des analyses. Réservé à l'équipe.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerAnalyses, listerAnalyses, ranger, supprimerAnalyse, listerDossiers, creerDossier } from '../kdata.js';

export function monterKData(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kdata/analyses', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { analyses: listerAnalyses(), dossiers: listerDossiers() });
  }));

  app.post('/api/kdata/analyses', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerAnalyses(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Ranger : plusieurs analyses d'un coup, dans un dossier ou hors de tout dossier.
  app.patch('/api/kdata/analyses', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = ranger(req.body?.ids, req.body?.dossier_id ?? null);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/kdata/analyses/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerAnalyse(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/kdata/dossiers', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = creerDossier(req.body?.nom, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
