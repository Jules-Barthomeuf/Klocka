// Haka (17 oct. 2026) : la file « À valider », son état, et le Suivi. Réservé à
// l'équipe ; `/api/haka` est dans la liste des routes authentifiées de index.js.

import { ok, wrap, currentUser, upload } from '../contexte.js';
import { FILE, SIMULER, drapeaux } from '../haka/drapeaux.js';

/** Monte les routes « haka » sur l'application. */
export function monterHaka(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const actif = (res) => { if (!FILE) { res.status(404).json({ error: 'Haka inactif (HAKA_FILE).', actif: false }); return false; } return true; };
  const F = () => import('../haka/file.js');
  const T = () => import('../haka/taches.js');
  const repondre = (res, r) => (r.ok ? ok(res, r) : res.status(r.statut || 400).json({ error: r.error, proposition: r.proposition || null, obstacles: r.obstacles || null }));

  app.get('/api/haka/etat', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const t = await T();
    ok(res, { ...drapeaux(), file: FILE ? t.etatFile() : null, plafond: FILE ? { jour: t.tachesDuJour('fiche_recue'), max: drapeaux().plafond_jour } : null });
  }));

  // « Fait par Haka », sur l'Accueil : les passes de la veille (actives sans drapeau) et les tâches de Haka.
  app.get('/api/haka/fait', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { faitParHaka } = await import('../haka/fait.js');
    ok(res, { items: await faitParHaka({ jours: Number(req.query.jours) || 7, limite: Math.min(20, Number(req.query.limite) || 8) }) });
  }));

  // Le compteur : sans drapeau, l'écran cache l'entrée du menu.
  app.get('/api/haka/propositions/compte', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    if (!FILE) return ok(res, { actif: false, moi: 0, commun: 0, tout: null, peut_tout: false });
    ok(res, { actif: true, ...(await F()).compter(user) });
  }));

  app.get('/api/haka/propositions', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    const vue = ['moi', 'commun', 'tout'].includes(req.query.vue) ? req.query.vue : 'moi';
    ok(res, { vue, propositions: (await F()).lister(user, vue) });
  }));

  app.get('/api/haka/propositions/dossier/:dealId', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    if (!FILE) return ok(res, { propositions: [] });
    ok(res, { propositions: (await F()).pourDossier(req.params.dealId) });
  }));

  app.post('/api/haka/propositions/:id/valider', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    repondre(res, await (await F()).valider(req.params.id, user, { charge: req.body?.charge || null, choix: req.body?.choix || null }));
  }));

  app.post('/api/haka/propositions/:id/rejeter', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    repondre(res, await (await F()).rejeter(req.params.id, user, req.body?.motif));
  }));

  app.post('/api/haka/propositions/:id/prendre', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    repondre(res, (await F()).prendre(req.params.id, user));
  }));

  // Une tâche en pause (un pas externe incertain après un redémarrage) : Jules a vérifié.
  app.post('/api/haka/taches/:id/lever-pause', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    const { estSuperAdmin } = await import('../acces-pages.js');
    if (!estSuperAdmin(user)) return res.status(403).json({ error: 'Jules seul.' });
    ok(res, { ok: (await T()).leverPause(req.params.id, { reprendreLePas: req.body?.relancer !== false }) });
  }));

  // Les compétences (palier 3) : lisibles par l'équipe (les cartes), modifiables par Jules seul.
  const C = () => import('../haka/competences.js');
  const jules = async (req, res) => { const user = admin(req, res); if (!user) return null; const { estSuperAdmin } = await import('../acces-pages.js'); if (!estSuperAdmin(user)) { res.status(403).json({ error: 'Jules seul écrit les compétences.' }); return null; } return user; };
  app.get('/api/haka/competences', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const c = await C();
    if (req.query.declencheur) { const E = await import('../haka/executions.js'); return ok(res, { competences: c.pourDeclencheur(String(req.query.declencheur)).map((x) => ({ ...x, usage: E.stats(x.cle, { jours: 30 }).executions })) }); }
    const E = await import('../haka/executions.js');
    ok(res, {
      competences: c.lister().map((x) => ({ ...x, stats: E.stats(x.cle, { jours: 30 }), erreurs_format: x.brouillon ? c.validerFormat(x.brouillon) : [] })),
      outils: c.OUTILS, declencheurs: c.DECLENCHEURS, valide_par: c.VALIDE_PAR, modes: c.MODES, destinations: c.DESTINATIONS, livrables: c.LIVRABLES,
    });
  }));
  // Créer à partir d'un exemple : Haka propose un brouillon complet (en-tête et corps) ; rien n'est publié.
  app.post('/api/haka/competences/depuis-exemple', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, await (await import('../haka/competence-depuis-exemple.js')).depuisExemple(req.body || {}, user));
  }));
  // Une compétence neuve (Jules) : un brouillon, sans version publiée.
  app.post('/api/haka/competences', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).creer(req.body || {}, user));
  }));
  app.get('/api/haka/competences/:cle', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const x = (await C()).lire(req.params.cle);
    if (!x) return res.status(404).json({ error: 'Compétence introuvable.' });
    ok(res, { competence: x, rendu: (await C()).rendre(x) });
  }));
  app.put('/api/haka/competences/:cle', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).enregistrerBrouillon(req.params.cle, req.body || {}, user));
  }));
  app.post('/api/haka/competences/:cle/publier', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).publier(req.params.cle, user, { note: req.body?.note }));
  }));
  // « Tester » : le brouillon sur ses dossiers de test, en lecture seule, comparé à la version publiée.
  app.post('/api/haka/competences/:cle/tester', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, await (await C()).tester(req.params.cle));
  }));
  app.post('/api/haka/competences/:cle/republier', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).republier(req.params.cle, req.body?.version, user));
  }));
  app.post('/api/haka/competences/:cle/activer', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).basculerActivation(req.params.cle, req.body?.active !== false));
  }));
  // Les quatre onglets de la fiche : tests, exécutions, historique (versions, diff, rejets et corrections).
  app.get('/api/haka/competences/:cle/tests', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const c = (await C()).lire(req.params.cle);
    if (!c) return res.status(404).json({ error: 'Compétence introuvable.' });
    const E = await import('../haka/executions.js');
    ok(res, { tests: E.testsDe(c.cle, { brouillon_le: c.brouillon?.modifie_le || null }), brouillon: !!c.brouillon, tests_ok: !!(c.brouillon?.tests_pour), obstacles: (await C()).obstaclesPublication(c) });
  }));
  app.get('/api/haka/competences/:cle/executions', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { executions: (await import('../haka/executions.js')).lister({ competence: req.params.cle, limite: Math.min(100, Number(req.query.limite) || 30) }) });
  }));
  app.get('/api/haka/competences/:cle/historique', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const C2 = await C();
    const c = C2.lire(req.params.cle);
    if (!c) return res.status(404).json({ error: 'Compétence introuvable.' });
    const E = await import('../haka/executions.js');
    const diff = req.query.de && req.query.vers ? C2.diffVersions(c.cle, req.query.de, req.query.vers) : null;
    ok(res, { versions: [...(c.versions || [])].reverse().map(({ version, publiee_le, par, note }) => ({ version, publiee_le, par, note: note || null, publiee: version === c.version })), stats: E.stats(c.cle, { jours: 90 }), diff });
  }));
  app.get('/api/haka/executions/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const t = (await import('../haka/executions.js')).trace(req.params.id);
    if (!t) return res.status(404).json({ error: 'Exécution introuvable.' });
    ok(res, { execution: t });
  }));
  app.post('/api/haka/competences/:cle/abandonner', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, (await C()).abandonnerBrouillon(req.params.cle));
  }));

  // Le Suivi : coûts par dossier, décisions, motifs de rejet.
  app.get('/api/monitoring/haka', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const t = await T();
    ok(res, { ...drapeaux(), bilan: (await F()).bilan({ jours: Number(req.query.jours) || 30 }), recentes: t.tachesRecentes({ limite: 30 }) });
  }));

  // Bac à sable et tests : une fiche déposée joue le rôle d'un mail reçu dans la boîte du testeur.
  app.post('/api/haka/simuler-fiche', upload.single('fichier'), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    if (!SIMULER) return res.status(403).json({ error: 'Seulement en simulation (HAKA_SIMULER).' });
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
    const { Records } = await import('../db.js');
    const compte = String(req.body?.compte || user.email).toLowerCase();
    const mail = Records.create('MailRecu', {
      compte, gmail_message_id: `simule-${Date.now()}`, thread_id: null,
      de: req.body?.de || 'Agent Test <agent@exemple.fr>', de_email: req.body?.de_email || 'agent@exemple.fr',
      objet: req.body?.objet || `Fiche ${req.file.originalname}`, texte: req.body?.texte || 'Veuillez trouver ci-joint la fiche du bien.',
      date: new Date().toISOString(), retenu_parce_que: 'simulation Haka', simule: true,
      pieces_jointes: [{ nom: req.file.originalname, mime: req.file.mimetype, taille: req.file.size, piece_id: `local:${req.file.path}` }],
    });
    const { surFicheRecue } = await import('../haka/declencheurs.js');
    const tache = surFicheRecue(mail, { uploadDir: (await import('../contexte.js')).UPLOAD_DIR, lancer: true });
    ok(res, { mail_id: mail.id, tache_id: tache.id });
  }));
}
