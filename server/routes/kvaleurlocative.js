// Valeur locative : chercher une adresse, rouvrir une recherche, lister les
// dernières. Réservé à l'équipe, comme tout K-Data.

import { currentUser, ok, wrap } from '../contexte.js';
import { rechercher, ouvrir, listerRecherches } from '../kvaleurlocative.js';

export function monterKValeurLocative(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/kvaleurlocative', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { recherches: listerRecherches() });
  }));

  // Une recherche consomme probablement un crédit Data-B : c'est un geste
  // d'équipe, jamais un effet de bord d'un affichage.
  app.post('/api/kvaleurlocative', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await rechercher(req.body?.adresse, { forcer: !!req.body?.forcer, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/kvaleurlocative/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await ouvrir(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
