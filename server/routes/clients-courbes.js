// Les courbes des clients, page Utilisateurs (18 oct. 2026) : réservées à l'équipe.
import { ok, wrap, currentUser } from '../contexte.js';

export function monterCourbesClients(app) {
  app.get('/api/admin/clients/courbes', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return; }
    ok(res, (await import('../clients-courbes.js')).courbesDesClients({ jours: req.query.jours }));
  }));
}
