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

  // Une fiche reçue, ouverte avant d'être acceptée (20 oct. 2026, Jules : « on clique et on voit soit l'email soit la
  // fiche commerciale ») : le mail, puis chacune de ses pièces. Seulement pour qui peut décider de la proposition.
  const mailDeProposition = async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return null;
    const f = await F();
    const p = f.proposition(req.params.id);
    if (!p || p.type !== 'preanalyser_fiche') { res.status(404).json({ error: 'Proposition introuvable.' }); return null; }
    if (!f.peutDecider(user, p)) { res.status(403).json({ error: "Cette proposition n'est pas à vous." }); return null; }
    const { Records } = await import('../db.js');
    const mailId = p.charge?.mail_id || (p.tache_id ? (await T()).tache(p.tache_id)?.charge?.mail_id : null);
    const mail = mailId ? Records.get('MailRecu', mailId) : null;
    if (!mail) { res.status(404).json({ error: 'Le mail de cette fiche est introuvable.' }); return null; }
    return mail;
  };
  app.get('/api/haka/propositions/:id/mail', wrap(async (req, res) => {
    const mail = await mailDeProposition(req, res);
    if (!mail) return;
    const { piecesFiche } = await import('../deal/fiches-auto.js');
    const fiches = new Set(piecesFiche(mail).map((x) => x?.nom));
    ok(res, {
      de: mail.de || mail.de_email || null, compte: mail.compte || null, objet: mail.objet || '', date: mail.date || null,
      texte: String(mail.texte || '').slice(0, 20000),
      pieces: (mail.pieces_jointes || []).map((x, n) => ({ n, nom: x?.nom || `pièce ${n + 1}`, mime: x?.mime || null, fiche: fiches.has(x?.nom) })).filter((x) => mail.pieces_jointes[x.n]?.piece_id),
    });
  }));
  app.get('/api/haka/propositions/:id/piece/:n', wrap(async (req, res) => {
    const mail = await mailDeProposition(req, res);
    if (!mail) return;
    const piece = (mail.pieces_jointes || [])[Number(req.params.n)];
    if (!piece?.piece_id) return res.status(404).json({ error: 'Pièce introuvable.' });
    let buffer;
    if (String(piece.piece_id).startsWith('local:')) {
      const fs = await import('node:fs');
      buffer = fs.readFileSync(String(piece.piece_id).slice('local:'.length));
    } else {
      const { telechargerPieceJointe } = await import('../gmail-inbox.js');
      buffer = await telechargerPieceJointe(mail.compte, mail.gmail_message_id, piece.piece_id);
    }
    const mime = piece.mime || (/\.pdf$/i.test(piece.nom || '') ? 'application/pdf' : 'application/octet-stream');
    res.setHeader('Content-Type', mime);
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(piece.nom || 'piece')}`);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.end(buffer);
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
    repondre(res, await (await F()).valider(req.params.id, user, { charge: req.body?.charge || null, choix: req.body?.choix || null, motif: req.body?.motif || null, categorie: req.body?.categorie || null }));
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

  // Les automatismes (17 oct. 2026, spec § 11) : visibles par l'équipe, actions par Jules seul.
  const A = () => import('../haka/automatismes.js');
  app.get('/api/haka/automatismes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { estSuperAdmin } = await import('../acces-pages.js');
    ok(res, { ...(await (await A()).vue()), peut_agir: estSuperAdmin(currentUser(req)) });
  }));
  app.get('/api/haka/automatismes/:slug/executions', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const jour = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? req.query.date : new Date().toISOString().slice(0, 10);
    ok(res, { jour, executions: (await A()).detail(req.params.slug, { jour }) });
  }));
  // Les mails reçus avec une pièce, et ce que Haka en a fait (21 oct. 2026) : pour comprendre une fiche sans notification.
  app.get('/api/haka/fiches/recentes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { mails: await (await import('../haka/declencheurs.js')).etatDesFiches({ jours: Math.min(14, Number(req.query.jours) || 3) }) });
  }));

  // La cloche : les lignes que chacun a retirées, et le retrait (ou le rappel à une date) d'une ligne (21 oct. 2026).
  app.get('/api/haka/cloche/masques', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { cles: (await import('../haka/cloche.js')).masquesDe(user.email) });
  }));
  app.post('/api/haka/cloche/masquer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    repondre(res, await (await import('../haka/cloche.js')).masquer(user, { cle: b.cle, jusqua: b.jusqua || null, phrase: b.phrase || null, lien: b.lien || null }));
  }));

  app.get('/api/haka/alertes', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { estSuperAdmin } = await import('../acces-pages.js');
    ok(res, { alertes: estSuperAdmin(user) ? await (await A()).alertes() : [] });
  }));
  for (const [chemin, faire] of [['pause', 'pause'], ['reprendre', 'reprendre'], ['lancer', 'lancer'], ['ignores/traiter', 'traiterIgnores']]) {
    app.post(`/api/haka/automatismes/:slug/${chemin}`, wrap(async (req, res) => {
      const user = await jules(req, res);
      if (!user) return;
      repondre(res, await (await A())[faire](req.params.slug, user));
    }));
  }
  app.post('/api/haka/executions/:id/relancer', wrap(async (req, res) => {
    const user = await jules(req, res);
    if (!user) return;
    repondre(res, await (await A()).relancer(req.params.id, user));
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

  // Haka par transfert (23 oct. 2026) : un collègue transfère un mail à sourcing@, en simulation seulement.
  app.post('/api/haka/simuler-transfert', upload.array('fichiers', 6), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    if (!SIMULER) return res.status(403).json({ error: 'Seulement en simulation (HAKA_SIMULER).' });
    const { Records } = await import('../db.js');
    const b = req.body || {};
    const mail = Records.create('MailRecu', {
      compte: 'sourcing@klocka.immo', gmail_message_id: `simule-${Date.now()}`, thread_id: null,
      de: user.full_name ? `${user.full_name} <${user.email}>` : user.email, de_email: String(user.email).toLowerCase(),
      objet: b.objet || 'TR: transfert simulé', texte: b.texte || '', date: new Date().toISOString(), retenu_parce_que: 'simulation Haka', simule: true, interne: true, commande: true,
      pieces_jointes: (req.files || []).map((f) => ({ nom: f.originalname, mime: f.mimetype, taille: f.size, piece_id: `local:${f.path}` })),
    });
    const { surTransfert } = await import('../haka/competences/transfert.js');
    const tache = surTransfert(mail, { uploadDir: (await import('../contexte.js')).UPLOAD_DIR, lancer: true });
    ok(res, { mail_id: mail.id, tache_id: tache.id });
  }));

  // Haka ambiant (22 oct. 2026) : un mail simulé (réponse, documents, rendez-vous, client), en simulation seulement.
  app.post('/api/haka/simuler-mail', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user || !actif(res)) return;
    if (!SIMULER) return res.status(403).json({ error: 'Seulement en simulation (HAKA_SIMULER).' });
    const { Records } = await import('../db.js');
    const b = req.body || {};
    const mail = Records.create('MailRecu', {
      compte: String(b.compte || user.email).toLowerCase(), gmail_message_id: `simule-${Date.now()}`, thread_id: null,
      de: b.de || 'Agent Test <agent@exemple.fr>', de_email: String(b.de_email || 'agent@exemple.fr').toLowerCase(),
      objet: b.objet || 'Mail simulé', texte: b.texte || '', date: new Date().toISOString(), retenu_parce_que: 'simulation Haka', simule: true,
      deal_id: b.deal_id || null, pieces_jointes: (b.pieces || []).map((nom) => ({ nom, mime: 'application/pdf', taille: 1000 })),
    });
    const { surMail } = await import('../haka/ambiant.js');
    const tache = surMail(mail, { uploadDir: (await import('../contexte.js')).UPLOAD_DIR, lancer: true, lecture: b.lecture || null });
    ok(res, { mail_id: mail.id, tache_id: tache.id });
  }));
}
