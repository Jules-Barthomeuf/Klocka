// Les présentations bancaires : la page Présentations les crée depuis un
// projet, les ouvre, les retouche et les exporte. Réservé à l'équipe.

import { ok, wrap, currentUser, compteAutorise, PORT } from '../contexte.js';

/** Monte les routes « présentations bancaires » sur l'application. */
export function monterPresentations(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const P = () => import('../presentation-bancaire.js');
  const base = '/api/admin/presentations-bancaires';

  // La page d'impression (publique) lit la présentation avec un jeton court, posé par le serveur pour son navigateur.
  app.get('/api/presentations-impression/:jeton', wrap(async (req, res) => {
    const { lireParJeton } = await import('../presentation-pdf.js');
    const d = lireParJeton(req.params.jeton);
    if (!d) return res.status(404).json({ error: 'Lien d’impression expiré.' });
    ok(res, d);
  }));

  // Le PDF, tiré du deck lui-même : identique à l'écran.
  app.post(`${base}/:id/pdf`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { exporterPdf } = await import('../presentation-pdf.js');
    const r = await exporterPdf(req.params.id, { base: `http://127.0.0.1:${PORT}`, forcer: !!req.body?.forcer });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get(base, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { presentations: (await P()).listerPresentations() });
  }));

  app.post(base, wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await P()).creerPresentation(String(req.body?.projet_id || ''), user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.get(`${base}/:id`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const d = (await P()).lirePresentation(req.params.id);
    if (!d) return res.status(404).json({ error: 'Présentation introuvable.' });
    ok(res, d);
  }));

  app.patch(`${base}/:id`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const M = await P();
    const { diapo = null, ordre = null, titre = null, conversation_id = null } = req.body || {};
    const r = M.modifierPresentation(req.params.id, { diapo, ordre, titre, conversation_id });
    if (!r.ok) return res.status(r.error === 'Présentation introuvable.' ? 404 : 400).json({ error: r.error });
    ok(res, M.lirePresentation(req.params.id));
  }));

  app.post(`${base}/:id/export`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { compte = null } = req.body || {};
    if (compte && !compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
    const r = await (await P()).exporterPresentation(req.params.id, { compte });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/:id/reconstruire`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await (await P()).reconstruirePresentation(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.delete(`${base}/:id`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await P()).supprimerPresentation(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
