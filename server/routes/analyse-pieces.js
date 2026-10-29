// L'analyse pièce par pièce : emplacements, lecture d'une pièce, cases, écarts, question libre.
// Voir deal/analyse-pieces.js. Sous /api/preanalyse : la même garde que le reste du dossier.

import { UPLOAD_DIR, currentUser, ok, upload, wrap } from '../contexte.js';
import { ajouterDocument } from '../deal/espace.js';
import * as A from '../deal/analyse-pieces.js';

const base = '/api/preanalyse/dossiers/:dealId/analyse-pieces';

export function monterAnalysePieces(app) {
  app.get(base, wrap((req, res) => {
    const r = A.lireAnalyse(req.params.dealId);
    if (!r) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, r);
  }));

  app.get(`${base}/depots`, wrap((req, res) => {
    const r = A.lireDepots(req.params.dealId);
    if (!r) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, r);
  }));

  // Déposer une ou plusieurs pièces dans un emplacement de la Data Room : elles y sont rangées, rien d'autre
  // (29 oct. 2026, Jules) : ni lecture, ni classement par le modèle, ni copie Drive.
  app.post(`${base}/emplacements/:type`, upload.array('fichiers', 20), wrap(async (req, res) => {
    const user = currentUser(req);
    if (!A.typeExiste(req.params.dealId, req.params.type)) return res.status(400).json({ error: 'Emplacement inconnu' });
    if (!req.files?.length) return res.status(400).json({ error: 'Aucun fichier' });
    const noms = [].concat(req.body?.noms || []);
    const ajoutes = [];
    for (const [i, f] of req.files.entries()) {
      const r = ajouterDocument(req.params.dealId, { nom: noms[i] || f.originalname, url: `/uploads/${f.filename}`, mime: f.mimetype, taille: f.size }, user);
      if (!r.ok) return res.status(404).json({ error: r.error });
      A.rangerPiece(req.params.dealId, r.document.id, req.params.type, user, { lire: false });
      if (req.body?.contexte) A.poserContexte(req.params.dealId, r.document.id, req.body.contexte, user);
      ajoutes.push(r.document.id);
    }
    ok(res, { ok: true, documents: ajoutes });
  }));

  // Après le dépôt (29 oct. 2026, Jules) : des noms proposés, le rangement dans le Drive, puis la lecture. Voir deal/data-room.js.
  app.post(`${base}/depots/noms`, wrap(async (req, res) => {
    const { proposerNoms } = await import('../deal/data-room.js');
    const r = await proposerNoms(req.params.dealId, { uploadDir: UPLOAD_DIR, user: currentUser(req), force: !!req.body?.force });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/depots/drive`, wrap(async (req, res) => {
    const { rangerDansDrive } = await import('../deal/data-room.js');
    const r = await rangerDansDrive(req.params.dealId, req.body?.noms || {}, { uploadDir: UPLOAD_DIR, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/depots/analyser`, wrap(async (req, res) => {
    const { lancerAnalyse } = await import('../deal/data-room.js');
    const r = lancerAnalyse(req.params.dealId, { uploadDir: UPLOAD_DIR, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Un type de document nommé par l'analyste (le « + » de la Data Room), et son retrait quand il est vide.
  app.post(`${base}/types`, wrap((req, res) => {
    const r = A.creerType(req.params.dealId, req.body?.titre, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/types/:id/retirer`, wrap((req, res) => {
    const r = A.retirerType(req.params.dealId, req.params.id);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/documents/:docId/contexte`, wrap((req, res) => {
    const r = A.poserContexte(req.params.dealId, req.params.docId, req.body?.contexte, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Ranger une pièce déjà dans la Data Room (ou la retirer de l'analyse, type vide).
  app.post(`${base}/documents/:docId/ranger`, wrap((req, res) => {
    const user = currentUser(req);
    const r = A.rangerPiece(req.params.dealId, req.params.docId, req.body?.type || null, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    if (r.lire) A.enfiler(req.params.dealId, req.params.docId, { uploadDir: UPLOAD_DIR, user });
    ok(res, r);
  }));

  // Relire une pièce : ses valeurs lues sont refaites, les cases décidées par l'analyste ne bougent pas.
  app.post(`${base}/documents/:docId/relire`, wrap((req, res) => {
    const d = A.lireAnalyse(req.params.dealId)?.emplacements.flatMap((e) => e.documents).find((x) => x.id === req.params.docId);
    if (!d?.type) return res.status(400).json({ error: "Rangez d'abord la pièce dans un emplacement." });
    A.enfiler(req.params.dealId, req.params.docId, { uploadDir: UPLOAD_DIR, user: currentUser(req) });
    ok(res, { ok: true });
  }));

  app.post(`${base}/documents/:docId/question`, wrap(async (req, res) => {
    const r = await A.poserQuestion(req.params.dealId, req.params.docId, req.body?.question, { uploadDir: UPLOAD_DIR, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Relire une seule case, sur les pièces de son emplacement.
  app.post(`${base}/cases/:grille/:critere/relire`, wrap((req, res) => {
    const ids = A.piecesDeLaGrille(req.params.dealId, req.params.grille);
    if (!ids.length) return res.status(400).json({ error: 'Aucune pièce rangée pour cette grille.' });
    for (const id of ids) A.enfiler(req.params.dealId, id, { uploadDir: UPLOAD_DIR, user: currentUser(req), seulement: [req.params.critere] });
    ok(res, { ok: true, pieces: ids.length });
  }));

  app.post(`${base}/cases/:grille/:critere`, wrap((req, res) => {
    const r = A.deciderCase(req.params.dealId, req.params.grille, req.params.critere, req.body || {}, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post(`${base}/ecarts/:cle`, wrap((req, res) => {
    const r = A.deciderEcart(req.params.dealId, req.params.cle, req.body?.retenu || null, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
