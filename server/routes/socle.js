// Le socle de la boîte à outils de Haka (18 oct. 2026, lot 1) : le registre des sources (interrupteur et
// poids), l'interrupteur de la boîte, l'identifiant de local et l'état de l'entrepôt. Lire : l'équipe.
// Régler : Jules seul (super admin).

import { currentUser, ok, wrap } from '../contexte.js';

export function monterSocle(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const superAdmin = async (req, res) => {
    const user = currentUser(req);
    const { estSuperAdmin } = await import('../acces-pages.js');
    if (!estSuperAdmin(user)) { res.status(403).json({ error: 'Réservé à Jules.' }); return null; }
    return user;
  };

  app.get('/api/socle/sources', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const { listerSources } = await import('../socle/registre-sources.js');
    const { etatEntrepot } = await import('../socle/entrepot.js');
    const { boiteOutilsActive } = await import('../socle/drapeaux.js');
    ok(res, { boite_outils: boiteOutilsActive(), sources: listerSources(), entrepot: etatEntrepot() });
  }));

  app.post('/api/socle/sources/:cle', wrap(async (req, res) => {
    const user = await superAdmin(req, res);
    if (!user) return;
    const { reglerSource } = await import('../socle/registre-sources.js');
    const r = reglerSource(req.params.cle, { actif: req.body?.actif, poids: req.body?.poids }, user.email);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/socle/interrupteur', wrap(async (req, res) => {
    if (!(await superAdmin(req, res))) return;
    const { poserBoiteOutils } = await import('../socle/drapeaux.js');
    ok(res, { boite_outils: poserBoiteOutils(!!req.body?.actif) });
  }));

  app.get('/api/socle/local', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const { boiteOutilsActive } = await import('../socle/drapeaux.js');
    if (!boiteOutilsActive()) return res.status(404).json({ error: 'La boîte à outils est éteinte.' });
    const { resoudreLocal } = await import('../socle/local.js');
    const r = await resoudreLocal(String(req.query.adresse || ''), { forcer: req.query.forcer === '1' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/socle/imports', wrap(async (req, res) => {
    if (!(await superAdmin(req, res))) return;
    const { importer, passerImports } = await import('../socle/entrepot.js');
    const { jeu, commune } = req.body || {};
    ok(res, jeu ? await importer(String(jeu), String(commune || '06')) : await passerImports({ max: Number(req.body?.max) || 30 }));
  }));
}
