// L'équipe (10 oct. 2026) : lire les admins et les mandataires, changer un
// rôle, inviter. La lecture est ouverte aux admins ; les changements aux
// super admins (le serveur le vérifie dans equipe.js).

import { ok, wrap, currentUser, urlPublique } from '../contexte.js';

const E = () => import('../equipe.js');

export function monterEquipe(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé aux administrateurs.' }); return null; }
    return user;
  };
  const rendre = (res, r) => (r?.ok ? ok(res, r) : res.status(r?.code || 400).json({ error: r?.error || 'Impossible.' }));

  app.get('/api/admin/equipe', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const { listerEquipe } = await E();
    const { estSuperAdmin } = await import('../acces-pages.js');
    ok(res, { ...listerEquipe(), peut_modifier: estSuperAdmin(user) });
  }));
  app.post('/api/admin/equipe/:email/role', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const { changerRole } = await E();
    rendre(res, changerRole(user, req.params.email, { role: req.body?.role, aussi_mandataire: req.body?.aussi_mandataire ?? null }));
  }));
  app.post('/api/admin/equipe/inviter', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const { inviterEquipe } = await E();
    rendre(res, inviterEquipe(user, { email: req.body?.email, nom: req.body?.nom, role: req.body?.role, base: urlPublique(req) }));
  }));
}
