// K-Expertise : lancer une étude d'implantation, la suivre, la relire.
// Réservé à l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerExpertise, listerExpertises, lireExpertise, supprimerExpertise, ETAPES, ZONES } from '../kexpertise.js';

export function monterKExpertise(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kexpertise', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { expertises: listerExpertises(), etapes: ETAPES, zones: ZONES });
  }));

  // Une étude Data-B consomme un crédit : le lancement est un geste
  // d'équipe, jamais un effet de bord d'un affichage.
  app.post('/api/kexpertise', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerExpertise(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kexpertise/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const e = lireExpertise(req.params.id);
    if (!e) return res.status(404).json({ error: "Cette expertise n'existe plus." });
    ok(res, { expertise: e });
  }));

  app.delete('/api/kexpertise/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerExpertise(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
