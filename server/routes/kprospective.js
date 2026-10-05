// K-Prospective : lancer une prospection, la suivre, la relire. L'équipe voit
// tout ; un mandataire (onglet de sa Prospection) ne voit que les siennes.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerProspection, listerProspections, lireProspection, supprimerProspection, ETAPES, CRITERES } from '../kprospective.js';
import { listerMetiers, TOUS_LES_COMMERCES } from '../kzoning-metiers.js';

export function monterKProspective(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin' && user?.role !== 'mandataire') { res.status(403).json({ error: 'Réservé à l\'équipe et aux mandataires.' }); return null; }
    return user;
  };
  const moi = (user) => String(user?.email || '').toLowerCase();
  // Un mandataire ne lit et ne supprime que ce qu'il a lancé.
  const sienne = (p, user) => !!p && (user.role === 'admin' || String(p.par || '').toLowerCase() === moi(user));

  app.get('/api/kprospective', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { prospections: listerProspections().filter((p) => sienne(p, user)), etapes: ETAPES, criteres: CRITERES, metiers: listerMetiers().map((m) => m.nom), tous: TOUS_LES_COMMERCES.nom });
  }));

  app.post('/api/kprospective', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerProspection(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kprospective/:id', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = lireProspection(req.params.id);
    if (!sienne(p, user)) return res.status(404).json({ error: "Cette prospection n'existe plus." });
    ok(res, { prospection: p });
  }));

  app.delete('/api/kprospective/:id', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    if (!sienne(lireProspection(req.params.id), user)) return res.status(404).json({ error: "Cette prospection n'existe plus." });
    const r = supprimerProspection(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
