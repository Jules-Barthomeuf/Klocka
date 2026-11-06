// Tokimo : les analyses des opérations présentées à Tokimo. Réservé à l'équipe ; l'API se ferme avec la page.

import { currentUser, ok, wrap } from '../contexte.js';
import { creer, enregistrer, lire, lireAdresse, lister, supprimer } from '../tokimo.js';

export function monterTokimo(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const trouver = (req, res) => {
    const a = lire(req.params.id);
    if (!a) res.status(404).json({ error: 'Cette analyse n\'existe plus.' });
    return a;
  };

  app.get('/api/tokimo', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { analyses: lister() });
  }));

  app.post('/api/tokimo', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { analyse: creer(user, req.body || {}) });
  }));

  app.get('/api/tokimo/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const a = trouver(req, res);
    if (a) ok(res, { analyse: a });
  }));

  app.put('/api/tokimo/:id', wrap((req, res) => {
    if (!admin(req, res) || !trouver(req, res)) return;
    ok(res, { analyse: enregistrer(req.params.id, req.body || {}) });
  }));

  app.delete('/api/tokimo/:id', wrap((req, res) => {
    if (!admin(req, res) || !trouver(req, res)) return;
    ok(res, supprimer(req.params.id));
  }));

  // L'adresse lue : le point, la parcelle, les ventes DVF du secteur. Gardé dans l'analyse.
  app.post('/api/tokimo/:id/adresse', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const a = trouver(req, res);
    if (!a) return;
    // La page envoie ce qu'elle montre : l'enregistrement automatique peut avoir une frappe de retard.
    const s = { ...(a.saisie || {}), ...(req.body || {}) };
    const r = await lireAdresse(s.adresse, { typologie: s.typologie === 'Appartement' ? 'Appartement' : 'Maison', surface: s.surface ?? s.surfaces?.utile });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const lu = { ...r, le: new Date().toISOString() };
    ok(res, { analyse: enregistrer(a.id, { lu }) });
  }));
}
