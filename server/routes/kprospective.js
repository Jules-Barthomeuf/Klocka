// K-Prospective : lancer une prospection, la suivre, la relire. Réservé à
// l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerProspection, listerProspections, lireProspection, supprimerProspection, ETAPES, CRITERES } from '../kprospective.js';
import { listerMetiers, TOUS_LES_COMMERCES } from '../kzoning-metiers.js';

export function monterKProspective(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kprospective', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { prospections: listerProspections(), etapes: ETAPES, criteres: CRITERES, metiers: listerMetiers().map((m) => m.nom), tous: TOUS_LES_COMMERCES.nom });
  }));

  app.post('/api/kprospective', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerProspection(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kprospective/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const p = lireProspection(req.params.id);
    if (!p) return res.status(404).json({ error: "Cette prospection n'existe plus." });
    ok(res, { prospection: p });
  }));

  app.delete('/api/kprospective/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerProspection(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
