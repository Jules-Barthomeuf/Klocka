// K-Estimation : estimer des murs commerciaux. Réservé à l'équipe, comme
// tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerEstimation, listerEstimations, lireEstimation, estimer, supprimerEstimation, ETAPES, CHOIX, TAUX_PIVOT } from '../kestimation.js';

export function monterKEstimation(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kestimation', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { estimations: listerEstimations(), etapes: ETAPES, choix: CHOIX, pivot: TAUX_PIVOT });
  }));

  app.post('/api/kestimation', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerEstimation(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kestimation/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const e = lireEstimation(req.params.id);
    if (!e) return res.status(404).json({ error: "Cette estimation n'existe plus." });
    ok(res, { estimation: e });
  }));

  // Les réponses du formulaire arrivent ici, et l'estimation se calcule dans
  // la foulée : un enregistrement sans calcul laisserait une fiche à moitié
  // remplie, qu'il faudrait relancer à la main.
  app.patch('/api/kestimation/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = estimer(req.params.id, req.body?.reponses);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/kestimation/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerEstimation(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
