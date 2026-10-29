// Les visites d'acquéreurs (27 oct. 2026) : server/visites-acquereur.js.
import { ok, wrap, currentUser, upload } from '../contexte.js';

export function monterVisites(app) {
  const mandataire = (req, res) => {
    const user = currentUser(req);
    if (!['mandataire', 'admin'].includes(user?.role)) { res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }); return null; }
    return user;
  };
  const roleAvantDepot = (req, res, next) => (['mandataire', 'admin'].includes(currentUser(req)?.role) ? next() : res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }));
  const V = () => import('../visites-acquereur.js');
  const rendre = (res, r) => (r.ok ? ok(res, r) : res.status(400).json({ error: r.error }));

  app.get('/api/mandataire/visites', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const M = await V();
    ok(res, { visites: await M.mesVisites(user), acquereurs: await M.acquereursDe(user) });
  }));
  app.post('/api/mandataire/visites', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, await (await V()).creerVisite(req.body || {}, user));
  }));
  app.get('/api/mandataire/visites/:id', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await V()).lireVisite(req.params.id, user));
  }));
  app.get('/api/mandataire/visites/:id/bon', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, await (await V()).bonDeVisite(req.params.id, user));
  }));
  app.post('/api/mandataire/visites/:id/bon', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await V()).signerBon(req.params.id, req.body || {}, user));
  }));
  app.post('/api/mandataire/visites/:id/recit', roleAvantDepot, upload.single('audio'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const fs = await import('fs');
    rendre(res, await (await V()).lireRecit(req.params.id, { texte: req.body?.texte || null, audio: req.file ? fs.readFileSync(req.file.path) : null }, user));
  }));
  app.post('/api/mandataire/visites/:id/valider', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await V()).validerVisite(req.params.id, req.body || {}, user));
  }));
  app.get('/api/mandataire/visites/:id/mail', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, await (await V()).preparerMail(req.params.id, user));
  }));
  app.post('/api/mandataire/visites/:id/envoye', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await V()).marquerEnvoye(req.params.id, req.body || {}, user));
  }));
}
