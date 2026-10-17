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
  const repondre = (res, r) => (r.ok ? ok(res, r) : res.status(r.statut || 400).json({ error: r.error, proposition: r.proposition || null }));

  app.get('/api/haka/etat', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const t = await T();
    ok(res, { ...drapeaux(), file: FILE ? t.etatFile() : null, plafond: FILE ? { jour: t.tachesDuJour('fiche_recue'), max: drapeaux().plafond_jour } : null });
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
