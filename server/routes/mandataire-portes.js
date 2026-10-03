// Les routes des quatre pages de travail du mandataire : Estimation, Mandat,
// Dossier, Mise en marché. Le mandataire (et l'admin en vue mandataire)
// passe par /api/mandataire/… ; les décisions de Klocka par
// /api/mandataire/admin/…, réservées au rôle admin.

import { ok, wrap, currentUser, upload, UPLOAD_DIR } from '../contexte.js';

const P = () => import('../mandataire-portes.js');
const F = () => import('../fil-dossier.js');

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
  // L'avis de valeur retouché dans l'éditeur : enregistré tel quel.
  app.put('/api/mandataire/estimations/:id/avis', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const P2 = await P();
    const e = P2.lireEstimation(req.params.id, user);
    if (!e) return res.status(404).json({ error: 'Estimation introuvable.' });
    if (!req.body?.avis || typeof req.body.avis !== 'object') return res.status(400).json({ error: 'Avis manquant.' });
    const { Records } = await import('../db.js');
    ok(res, { ok: true, estimation: Records.update('EstimationMandataire', e.id, { avis: req.body.avis, avis_retouche_le: new Date().toISOString() }) });
  }));
  // Les retouches à la main d'un avis encore en questions : gardées, puis reposées à la rédaction.
  app.put('/api/mandataire/estimations/:id/surcouche', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { enregistrerSurcouche } = await import('../mandataire-avis.js');
    rendre(res, enregistrerSurcouche(req.params.id, req.body || {}, vue(req, user)));
  }));
  // L'aperçu de l'avis, à côté du chat : rédigé, ou en train de se construire.
  app.get('/api/mandataire/estimations/:id/apercu', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { apercuEstimation } = await import('../mandataire-avis.js');
    rendre(res, apercuEstimation(req.params.id, vue(req, user)));
  }));
  // La conversation d'une estimation : la sienne, ou une nouvelle qui reprend où on en était.
  app.post('/api/mandataire/estimations/:id/conversation', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { conversationDeLEstimation } = await import('../mandataire-avis.js');
    rendre(res, await conversationDeLEstimation(req.params.id, vue(req, user)));
  }));
  // Les retouches de l'avis par le chat de l'éditeur, et ses versions.
  // En JSON, ou en multipart quand une image est jointe (elle remplace une photo de l'avis).
  app.post('/api/mandataire/estimations/:id/avis/retoucher', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { retoucherAvis } = await import('../mandataire-avis.js');
    const corps = { ...(req.body || {}) };
    for (const k of ['selection', 'historique']) if (typeof corps[k] === 'string') { try { corps[k] = JSON.parse(corps[k]); } catch { corps[k] = null; } }
    if (req.file) {
      if (!/^image\//.test(req.file.mimetype || '')) return res.status(400).json({ error: 'Joignez une image (photo, JPEG, PNG).' });
      corps.piece = { url: `/uploads/${req.file.filename}`, nom: req.file.originalname, mimetype: req.file.mimetype };
    }
    rendre(res, await retoucherAvis(req.params.id, corps, vue(req, user)));
  }));
  app.get('/api/mandataire/estimations/:id/avis/versions', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { versionsAvis } = await import('../mandataire-avis.js');
    rendre(res, versionsAvis(req.params.id, vue(req, user)));
  }));
  app.post('/api/mandataire/estimations/:id/avis/versions', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { poserVersion } = await import('../mandataire-avis.js');
    rendre(res, poserVersion(req.params.id, req.body || {}, vue(req, user)));
  }));
  app.post('/api/mandataire/estimations/:id/avis/versions/:vid/restaurer', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { restaurerVersion } = await import('../mandataire-avis.js');
    rendre(res, restaurerVersion(req.params.id, req.params.vid, vue(req, user)));
  }));
  // Une photo de l'avis (couverture, emplacement) : remplace celle de Street View.
  app.post('/api/mandataire/estimations/:id/photo', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const P2 = await P();
    const e = P2.lireEstimation(req.params.id, user);
    if (!e) return res.status(404).json({ error: 'Estimation introuvable.' });
    if (!req.file) return sansFichier(res);
    const cle = ['emplacement', 'portrait'].includes(req.query.cle) ? req.query.cle : 'couverture';
    const { Records } = await import('../db.js');
    const url = `/uploads/${req.file.filename}`;
    // Avis pas encore rédigé : la photo attend dans la surcouche, et rejoindra l'avis.
    if (!e.avis) {
      const sc = e.surcouche || {};
      Records.update('EstimationMandataire', e.id, { surcouche: { ...sc, photos: { ...(sc.photos || {}), [cle]: url } } });
      const { apercuEstimation } = await import('../mandataire-avis.js');
      const a = apercuEstimation(e.id, vue(req, user));
      return ok(res, { ok: true, estimation: a.estimation, avis: a.avis });
    }
    const avis = { ...e.avis, photos: { ...(e.avis.photos || {}), [cle]: url } };
    const maj = Records.update('EstimationMandataire', e.id, { avis });
    ok(res, { ok: true, estimation: maj, avis: maj.avis });
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
    const r = (await P()).demanderMandat(req.body || {}, user);
    // L'agent MyNotary s'en charge en tâche de fond quand il est allumé : le
    // mandat arrive « prêt » en quelques minutes. Sinon, la file Klocka, comme avant.
    if (r?.ok && r.mandat?.id) {
      try {
        const { agentMyNotaryActif, lancerAgentMandat } = await import('../mynotary-agent.js');
        if (agentMyNotaryActif()) lancerAgentMandat(r.mandat.id).catch((e) => console.warn('[mynotary] agent :', e?.message || e));
      } catch (e) { console.warn('[mynotary] lancement impossible :', e?.message || e); }
    }
    rendre(res, r);
  }));
  // Le mandat préparé dans le chat : son aperçu (à droite du chat), et sa conversation.
  // Les flèches de l'aperçu du mandat : la réponse d'avant, ou la suivante.
  app.post('/api/mandataire/mandats/:id/questionnaire/:sens(annuler|retablir)', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { naviguerMandat } = await import('../mandataire-mandat-chat.js');
    rendre(res, naviguerMandat(req.params.id, req.params.sens, vue(req, user)));
  }));
  app.get('/api/mandataire/mandats/:id/apercu', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { apercuMandat } = await import('../mandataire-mandat-chat.js');
    rendre(res, apercuMandat(req.params.id, vue(req, user)));
  }));
  app.post('/api/mandataire/mandats/:id/conversation', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const { conversationDuMandat } = await import('../mandataire-mandat-chat.js');
    rendre(res, await conversationDuMandat(req.params.id, vue(req, user)));
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
    const { listerDossiers, checklist, relanceProprietaire, PIECES, estimationDu, estTransfere, listerEstimations, carteDu } = await P();
    const { Records } = await import('../db.js');
    // Ce qui relie le dossier au reste de l'espace : son estimation, son mandat.
    const resumeEstimation = (e) => (e ? { id: e.id, bien: e.bien, statut: e.statut, prix_bas: e.rapport?.prix_bas ?? null, prix_haut: e.rapport?.prix_haut ?? null } : null);
    const estimations = listerEstimations(vue(req, user)).map(resumeEstimation);
    const { nonLus, nomAnalyste } = await F();
    const { filDe } = await F();
    ok(res, { pieces: PIECES, dossiers: listerDossiers(vue(req, user)).map((d) => {
      const fil = filDe(d.id, { pourKlocka: false });
      const dernier = fil[fil.length - 1] || null;
      return {
        ...d, checklist: checklist(d), relance: relanceProprietaire(d),
        // Un dossier resté chez le mandataire ne s'allume jamais : Klocka ne l'a pas.
        fil_non_lus: estTransfere(d) ? nonLus(d.id, user.email, false) : 0,
        analyste_nom: d.analyste_email ? nomAnalyste(d.analyste_email) : null,
        dernier: dernier ? { texte: String(dernier.texte || (dernier.pieces || []).map((x) => x.nom).join(', ')).slice(0, 140), le: dernier.le, cote: dernier.cote } : null,
        activite: dernier?.le || d.cree_le || null,
        transfere: estTransfere(d),
        carte: carteDu(d),
        estimation: resumeEstimation(estimationDu(d)),
        mandat: (() => { const m = d.mandat_id ? Records.get('MandatMandataire', d.mandat_id) : null; return m ? { id: m.id, statut: m.statut, numero: m.numero_registre || null, type: m.type || null, prix: m.prix || null } : null; })(),
      };
    }).sort((a, b) => (b.fil_non_lus > 0) - (a.fil_non_lus > 0) || String(b.activite || '').localeCompare(String(a.activite || ''))), estimations });
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
  app.delete('/api/mandataire/dossiers/:id', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    // Un admin en Vue Mandataire supprime comme un mandataire : son dossier, pas encore transféré.
    rendre(res, await (await P()).supprimerDossierMandataire(req.params.id, { ...user, role: 'mandataire' }));
  }));
  app.delete('/api/mandataire/admin/dossiers/:id', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, await (await P()).supprimerDossierMandataire(req.params.id, user));
  }));
  app.post('/api/mandataire/dossiers/:id/photos', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const f = await fichierDe(req); if (!f) return sansFichier(res);
    rendre(res, (await P()).ajouterPhoto(req.params.id, f, user));
  }));
  app.delete('/api/mandataire/dossiers/:id/photos', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).retirerPhoto(req.params.id, String(req.query.url || ''), user));
  }));
  app.patch('/api/mandataire/dossiers/:id/estimation', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).lierEstimation(req.params.id, req.body?.estimation_id || null, user));
  }));
  app.delete('/api/mandataire/dossiers/:id/pieces/:categorie', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, (await P()).retirerPiece(req.params.id, req.params.categorie, String(req.query.url || ''), user));
  }));
  app.post('/api/mandataire/dossiers/:id/soumettre', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    rendre(res, await (await P()).soumettreDossier(req.params.id, user, { uploadDir: UPLOAD_DIR, analyste: req.body?.analyste_email || null }));
  }));
  // Les analystes qu'on peut choisir en transférant : disponibles cette semaine.
  app.get('/api/mandataire/analystes', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    ok(res, { analystes: await (await F()).analystesDisponibles() });
  }));
  // --- Le fil du dossier : mandataire ↔ analyste ---------------------------
  const vueFil = async (d, user, pourKlocka) => {
    const f = await F();
    f.marquerLu(d.id, user.email);
    return {
      ok: true,
      dossier: { id: d.id, bien: d.bien, statut: d.statut, deal_id: d.deal_id || null },
      analyste: d.analyste_email ? { email: d.analyste_email, nom: f.nomAnalyste(d.analyste_email) } : null,
      titulaire: d.analyste_titulaire ? { email: d.analyste_titulaire, nom: f.nomAnalyste(d.analyste_titulaire) } : null,
      relais: d.relais || null,
      messages: f.filDe(d.id, { pourKlocka }).map((m) => ({ ...m, auteur: m.cote === 'analyste' ? f.nomAnalyste(m.auteur_email) : m.cote === 'mandataire' ? 'Vous' : null })),
      ...(pourKlocka ? { analystes: f.ANALYSTES } : {}),
    };
  };
  app.get('/api/mandataire/dossiers/:id/fil', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const d = (await P()).lireDossier(req.params.id, vue(req, user));
    if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
    ok(res, await vueFil(d, user, false));
  }));
  app.post('/api/mandataire/dossiers/:id/fil', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const d = (await P()).lireDossier(req.params.id, vue(req, user));
    if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
    const pieces = req.file ? [{ nom: req.file.originalname, url: `/uploads/${req.file.filename}` }] : [];
    rendre(res, await (await F()).ecrireMandataire(d.id, { ...user, email: d.mandataire_email }, { texte: req.body?.texte, pieces }));
  }));
  // La relance du propriétaire, envoyée depuis la boîte du mandataire : tracée dans le fil.
  app.post('/api/mandataire/dossiers/:id/relance', wrap(async (req, res) => {
    const user = mandataire(req, res); if (!user) return;
    const P2 = await P();
    const d = P2.lireDossier(req.params.id, vue(req, user));
    if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
    const manquantes = P2.checklist(d).manquantes.map((m) => m.mot.toLowerCase());
    (await F()).evenement(d.id, `Relance envoyée au propriétaire${manquantes.length ? ` : ${manquantes.join(', ')}` : ''}.`);
    ok(res, { ok: true });
  }));
  app.get('/api/mandataire/admin/dossiers/:id/fil', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const { Records } = await import('../db.js');
    const d = Records.get('DossierMandataire', req.params.id);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable.' });
    ok(res, await vueFil(d, user, true));
  }));
  // Le dossier mandataire d'un dossier d'analyse (pour l'afficher dans Analyse).
  app.get('/api/mandataire/admin/dossiers/par-deal/:dealId', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { Records } = await import('../db.js');
    const d = Records.list('DossierMandataire').find((x) => x.deal_id === req.params.dealId);
    const moi = currentUser(req)?.email || '';
    ok(res, { dossier_id: d?.id || null, non_lus: d ? (await F()).nonLus(d.id, moi, true) : 0 });
  }));
  app.post('/api/mandataire/admin/dossiers/:id/fil', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const pieces = req.file ? [{ nom: req.file.originalname, url: `/uploads/${req.file.filename}` }] : [];
    const interne = /^(1|true|oui)$/i.test(String(req.body?.interne || ''));
    rendre(res, await (await F()).ecrireAnalyste(req.params.id, user, { texte: req.body?.texte, pieces, interne }));
  }));
  // Les conversations avec les mandataires, côté Klocka : un dossier, une
  // conversation ; d'abord celles qui attendent une réponse.
  app.get('/api/mandataire/admin/conversations', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const { Records } = await import('../db.js');
    const { checklist } = await P();
    const f = await F();
    const moi = String(user.email || '').toLowerCase();
    const { estTransfere } = await P();
    const visibles = Records.list('DossierMandataire').filter((d) => estTransfere(d) || f.filDe(d.id).some((m) => m.cote === 'mandataire'));
    const conversations = visibles.map((d) => {
      const fil = f.filDe(d.id, { pourKlocka: true }).filter((m) => m.genre !== 'briefing');
      const dernier = fil[fil.length - 1] || null;
      const m = d.mandataire_email ? Records.findBy('User', 'email', String(d.mandataire_email).toLowerCase()) : null;
      return {
        id: d.id, bien: d.bien, adresse: d.adresse || null, statut: d.statut, deal_id: d.deal_id || null, prix: d.prix || null,
        proprietaire: d.proprietaire || null, proprietaire_email: d.proprietaire_email || null,
        commentaire: d.commentaire || null,
        mandataire_email: d.mandataire_email, mandataire_nom: m?.full_name || d.mandataire_email,
        analyste_email: d.analyste_email || null, analyste_nom: d.analyste_email ? f.nomAnalyste(d.analyste_email) : null,
        a_moi: String(d.analyste_email || '').toLowerCase() === moi,
        non_lus: f.nonLus(d.id, moi, true),
        dernier: dernier ? { texte: String(dernier.texte || (dernier.pieces || []).map((p) => p.nom).join(', ')).slice(0, 140), le: dernier.le, cote: dernier.cote, interne: !!dernier.interne } : null,
        activite: dernier?.le || d.cree_le || null,
        checklist: checklist(d),
        transfere: estTransfere(d),
        photos: d.photos || [],
      };
    }).sort((a, b) => (b.non_lus > 0) - (a.non_lus > 0) || String(b.activite || '').localeCompare(String(a.activite || '')));
    ok(res, { conversations, non_lus: conversations.reduce((n, c) => n + c.non_lus, 0) });
  }));
  app.post('/api/mandataire/admin/dossiers/:id/transferer', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    rendre(res, await (await F()).transferer(req.params.id, req.body?.email, { motif: 'manuel', par: user.email }));
  }));
  app.post('/api/mandataire/admin/dossiers/:id/briefing', wrap(async (req, res) => {
    const user = admin(req, res); if (!user) return;
    const m = await (await F()).briefing(req.params.id, { pour: user.email });
    rendre(res, m ? { ok: true, message: m } : { ok: false, error: 'Dossier introuvable.' });
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
