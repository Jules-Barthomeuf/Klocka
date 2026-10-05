// Les offres (lettres d'intention d'achat) : la page Offres les liste, les
// ouvre, les retouche et les télécharge. Réservé à l'équipe.

import { ok, wrap, currentUser } from '../contexte.js';

/** Monte les routes « offres » sur l'application. */
export function monterOffres(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const O = () => import('../offres.js');

  app.get('/api/offres', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { offres: (await O()).listerLettres() });
  }));

  app.get('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const d = await (await O()).lireLettre(req.params.id);
    if (!d) return res.status(404).json({ error: 'LOI introuvable.' });
    ok(res, d);
  }));

  app.get('/api/offres/:id/sources', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const sources = await (await O()).sourcesDe(req.params.id);
    if (!sources) return res.status(404).json({ error: 'LOI introuvable.' });
    ok(res, { sources });
  }));

  app.patch('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const M = await O();
    const r = M.modifierLettre(req.params.id, { champs: req.body?.champs || null, textes: req.body?.textes || null, modele: req.body?.modele, conversation_id: req.body?.conversation_id });
    if (!r.ok) return res.status(r.error === 'LOI introuvable.' ? 404 : 400).json({ error: r.error });
    ok(res, await M.lireLettre(req.params.id));
  }));

  app.delete('/api/offres/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await O()).supprimerLettre(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/offres/:id/fichier', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const f = await (await O()).fichierDe(req.params.id, req.query.format === 'docx' ? 'docx' : 'pdf');
    if (!f) return res.status(404).json({ error: 'LOI introuvable.' });
    res.setHeader('Content-Type', f.type);
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.nom)}`);
    res.send(f.contenu);
  }));
}
