// Les routes des quatre pages de travail du mandataire : Estimation, Mandat,
// Dossier, Mise en marché. Le mandataire (et l'admin en vue mandataire)
// passe par /api/mandataire/… ; les décisions de Klocka par
// /api/mandataire/admin/…, réservées au rôle admin.

import { ok, wrap, currentUser, upload, UPLOAD_DIR } from '../contexte.js';

const P = () => import('../mandataire-portes.js');

export function monterMandatairePortes(app) {
  const mandataire = (req, res) => {
    const user = currentUser(req);
    if (!['mandataire', 'admin'].includes(user?.role)) { res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }); return null; }
    return user;
  };
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l’équipe Klocka.' }); return null; }
    return user;
  };
  // Un résultat { ok, error } devient une réponse : 400 et le message, ou l'objet.
  const roleAvantDepot = (req, res, next) => (['mandataire', 'admin'].includes(currentUser(req)?.role) ? next() : res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }));
  const rendre = (res, r) => (r?.ok ? ok(res, r) : res.status(r?.error?.includes('introuvable') ? 404 : 400).json({ error: r?.error || 'Impossible.' }));
  // La même réponse quand elle porte une mise en marché : le nom des clients
  // et les offres non validées n'en sortent que pour un admin.
  const rendreMarche = async (res, user, r) => {
    if (r?.ok && r.marche && user.role !== 'admin') r = { ...r, marche: (await P()).marcheVuParMandataire(r.marche) };
    rendre(res, r);
  };
  // Un fichier reçu par multer, sous la forme que les fonctions attendent.
  const fichierDe = async (req) => {
    if (!req.file) return null;
    const fs = await import('fs');
    return { buffer: fs.readFileSync(req.file.path), filename: req.file.originalname, mimetype: req.file.mimetype, url: `/uploads/${req.file.filename}` };
  };
  const sansFichier = (res) => res.status(400).json({ error: 'Aucun fichier reçu.' });

  // Qui voit quoi : le mandataire ses objets ; en vue mandataire, l'admin
  // aussi les siens seulement (`?tous=1` réservé à la file de validation).
  const vue = (req, user) => (user.role === 'admin' && req.query.tous !== '1' ? { ...user, role: 'mandataire' } : user);

  // --- 1. Estimation --------------------------------------------------------
  app.get('/api/mandataire/estimations', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    ok(res, { estimations: (await P()).listerEstimations(vue(req, user)) });
  }));
  app.post('/api/mandataire/estimations', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).creerEstimation(req.body || {}, user));
  }));
  app.patch('/api/mandataire/estimations/:id', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).modifierEstimation(req.params.id, req.body || {}, user));
  }));
  app.post('/api/mandataire/estimations/:id/bail', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    rendre(res, await (await P()).deposerBail(req.params.id, f, user));
  }));
  app.post('/api/mandataire/estimations/:id/generer', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { mesurer } = await import('../llm-couts.js');
    const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, async () => (await P()).genererRapport(req.params.id, user));
    rendre(res, resultat);
  }));
  app.post('/api/mandataire/estimations/:id/envoyee', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).marquerEstimationEnvoyee(req.params.id, user));
  }));

  // --- 2. Mandat ------------------------------------------------------------
  app.get('/api/mandataire/mandats', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    ok(res, { mandats: (await P()).listerMandats(vue(req, user)) });
  }));
  app.post('/api/mandataire/mandats', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).demanderMandat(req.body || {}, user));
  }));
  app.post('/api/mandataire/mandats/:id/signe', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    rendre(res, (await P()).deposerMandatSigne(req.params.id, { nom: f.filename, url: f.url }, user));
  }));
  app.post('/api/mandataire/admin/mandats/:id/pret', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    rendre(res, (await P()).deposerMandatPret(req.params.id, { document: { nom: f.filename, url: f.url }, reference_mynotary: req.body?.reference_mynotary || null }, user));
  }));
  app.post('/api/mandataire/admin/mandats/:id/registre', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).enregistrerMandat(req.params.id, user));
  }));
  app.get('/api/mandataire/admin/registre', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { registreMandats, registreCsv } = await P();
    const mandats = registreMandats();
    if (req.query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="registre-des-mandats-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(`\uFEFF${registreCsv(mandats)}`);
    }
    ok(res, { mandats });
  }));

  // --- 3. Dossier -----------------------------------------------------------
  app.get('/api/mandataire/dossiers', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { listerDossiers, checklist, relanceProprietaire, PIECES } = await P();
    ok(res, { pieces: PIECES, dossiers: listerDossiers(vue(req, user)).map((d) => ({ ...d, checklist: checklist(d), relance: relanceProprietaire(d) })) });
  }));
  app.post('/api/mandataire/dossiers', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).creerDossier(req.body || {}, user));
  }));
  app.post('/api/mandataire/dossiers/:id/pieces/:categorie', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    rendre(res, (await P()).ajouterPiece(req.params.id, req.params.categorie, f, user));
  }));
  app.delete('/api/mandataire/dossiers/:id/pieces/:categorie', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).retirerPiece(req.params.id, req.params.categorie, String(req.query.url || ''), user));
  }));
  app.post('/api/mandataire/dossiers/:id/soumettre', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, await (await P()).soumettreDossier(req.params.id, user, { uploadDir: UPLOAD_DIR }));
  }));
  app.post('/api/mandataire/admin/dossiers/:id/decision', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).deciderDossier(req.params.id, req.body || {}, user));
  }));

  // --- 4. Mise en marché ----------------------------------------------------
  app.get('/api/mandataire/marches', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { listerMarches, marcheVuParMandataire, TYPES_ACTIVITE } = await P();
    const toutVoir = user.role === 'admin' && req.query.tous === '1';
    ok(res, { types_activite: TYPES_ACTIVITE, marches: listerMarches(vue(req, user)).map((m) => (toutVoir ? m : marcheVuParMandataire(m))) });
  }));
  app.post('/api/mandataire/marches/:id/video', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    await rendreMarche(res, user, (await P()).deposerVideo(req.params.id, f, user));
  }));
  app.post('/api/mandataire/marches/:id/offres/:offre/reponse', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    await rendreMarche(res, user, (await P()).repondreOffre(req.params.id, req.params.offre, req.body || {}, user));
  }));
  app.post('/api/mandataire/marches/:id/suivi', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    await rendreMarche(res, user, (await P()).noterSuiviActe(req.params.id, req.body?.texte, user));
  }));
  app.post('/api/mandataire/marches/:id/suivi/:index', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    await rendreMarche(res, user, (await P()).basculerSuiviActe(req.params.id, req.params.index, user));
  }));
  app.post('/api/mandataire/admin/marches/:id/avancer', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const extra = req.body?.commission != null ? { commission: { montant: Number(req.body.commission) || null, payee_le: new Date().toISOString() } } : {};
    rendre(res, (await P()).avancerMarche(req.params.id, String(req.body?.statut || ''), user, extra));
  }));
  app.post('/api/mandataire/admin/marches/:id/livrable', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).poserLivrable(req.params.id, req.body?.cle, req.body?.lien, user));
  }));
  app.post('/api/mandataire/admin/marches/:id/activite', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).noterActivite(req.params.id, req.body || {}, user));
  }));
  app.post('/api/mandataire/admin/marches/:id/offres', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).poserOffre(req.params.id, req.body || {}, user));
  }));
  app.post('/api/mandataire/admin/marches/:id/offres/:offre/valider', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, (await P()).validerOffre(req.params.id, req.params.offre, req.body?.argumentaire, user));
  }));

  // --- La file de validation ---------------------------------------------
  app.get('/api/mandataire/admin/validation', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { file: (await P()).fileDeValidation() });
  }));
}
