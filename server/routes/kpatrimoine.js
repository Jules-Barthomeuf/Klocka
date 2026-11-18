// K-Patrimoine : un bien en vente, la société qui en possède les murs, et tout ce qu'elle possède ailleurs. Réservé à
// l'équipe, comme K-Foncier dont il partage le préfixe d'accès (/api/kfoncier).

import { currentUser, ok, wrap } from '../contexte.js';
import { ajouterBien, ficheBien, lireBien, listerBiens, modifierBien, relancerBien, reprendreAnalyses, supprimerBien } from '../kpatrimoine.js';

export function monterKPatrimoine(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kfoncier/patrimoine', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { biens: listerBiens() });
  }));

  app.post('/api/kfoncier/patrimoine', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = ajouterBien(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kfoncier/patrimoine/bien', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await ficheBien({ idu: req.query.idu, adresse: req.query.adresse, commune: req.query.commune });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kfoncier/patrimoine/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = lireBien(req.params.id);
    if (!r) return res.status(404).json({ error: 'Bien introuvable.' });
    ok(res, r);
  }));

  app.patch('/api/kfoncier/patrimoine/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = modifierBien(req.params.id, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/kfoncier/patrimoine/:id/relancer', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = relancerBien(req.params.id);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/kfoncier/patrimoine/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, supprimerBien(req.params.id));
  }));

  // Une analyse coupée par un redémarrage reprend, après le démarrage (le serveur répond d'abord).
  setTimeout(() => { try { reprendreAnalyses(); } catch { /* rien à reprendre */ } }, 20000);
}
