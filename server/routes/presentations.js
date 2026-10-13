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

  // La carte Google Maps de l'emplacement : une session, ou le jeton du navigateur d'impression.
  app.get('/api/presentations-carte', wrap(async (req, res) => {
    const P2 = await import('../presentation-pdf.js');
    if (!currentUser(req) && !P2.jetonValide(req.get('x-klocka-impression'))) return res.status(401).json({ error: 'Not authenticated' });
    const f = await P2.carteDuPoint(req.query.lat, req.query.lon);
    if (!f) return res.status(404).json({ error: 'Carte indisponible.' });
    res.set('Cache-Control', 'private, max-age=86400');
    res.sendFile(f);
  }));

  // Le fond Google Maps des cartes (13 oct. 2026) : les tuiles par le serveur, la clé reste chez lui.
  app.get('/api/tuiles-google/:z/:x/:y', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const r = await (await import('../tuiles-google.js')).tuile(req.params.z, req.params.x, String(req.params.y).replace(/\.png$/, ''));
    if (!r.ok) return res.status(r.statut || 502).end();
    res.set('Content-Type', r.type);
    res.set('Cache-Control', r.cache.replace(/\bpublic\b/, 'private'));
    res.send(r.contenu);
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
    const { progressionPdf } = await import('../presentation-pdf.js');
    ok(res, { presentations: (await P()).listerPresentations().map((p) => ({ ...p, pdf_en_cours: progressionPdf(p.id) })) });
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
    const { diapo = null, ordre = null, titre = null, conversation_id = null, tout = null } = req.body || {};
    const r = M.modifierPresentation(req.params.id, { diapo, ordre, titre, conversation_id, tout });
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

  // L'envoi aux clients (13 oct. 2026) : la liste des comptes clients, puis l'envoi.
  app.get(`${base}/:id/clients`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const c = (await P()).clientsPossibles(req.params.id);
    if (!c) return res.status(404).json({ error: 'Présentation introuvable.' });
    ok(res, { clients: c });
  }));

  app.post(`${base}/:id/envoyer`, wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await P()).envoyerAuxClients(req.params.id, req.body?.emails || [], user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Côté client : ses présentations, éditables ; une question part dans le Feedback.
  const connecte = (req, res) => {
    const user = currentUser(req);
    if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
    return user;
  };
  const client = '/api/client/presentations';
  app.get(client, wrap(async (req, res) => {
    const user = connecte(req, res);
    if (!user) return;
    ok(res, { presentations: (await P()).presentationsDuClient(user) });
  }));
  app.get(`${client}/:id`, wrap(async (req, res) => {
    const user = connecte(req, res);
    if (!user) return;
    const d = (await P()).lirePourClient(req.params.id, user);
    if (!d) return res.status(404).json({ error: 'Présentation introuvable.' });
    ok(res, d);
  }));
  app.patch(`${client}/:id`, wrap(async (req, res) => {
    const user = connecte(req, res);
    if (!user) return;
    const M = await P();
    if (!M.lirePourClient(req.params.id, user)) return res.status(404).json({ error: 'Présentation introuvable.' });
    // Un client retouche les diapositives et leur ordre ; le titre, la conversation et l'envoi restent à l'équipe.
    const { diapo = null, ordre = null } = req.body || {};
    const r = M.modifierPresentation(req.params.id, { diapo, ordre });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, M.lirePourClient(req.params.id, user));
  }));
  app.post(`${client}/:id/question`, wrap(async (req, res) => {
    const user = connecte(req, res);
    if (!user) return;
    const r = (await P()).poserQuestion(req.params.id, user, req.body?.texte);
    if (!r.ok) return res.status(r.error === 'Présentation introuvable.' ? 404 : 400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete(`${base}/:id`, wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await P()).supprimerPresentation(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
