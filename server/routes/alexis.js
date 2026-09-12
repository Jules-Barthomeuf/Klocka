// Alexis : lecture de documents hors dossier.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import {
  analyserDocument,
  listerDossiers as listerDossiersDoc,
  obtenirDossier as obtenirDossierDoc,
  renommerDossier,
  supprimerDocument,
  reclasserDocument,
  TYPES,
} from '../assistant/index.js';
import fs from 'fs';
import { currentUser, ok, upload, wrap } from '../contexte.js';

/** Monte les routes « alexis » sur l'application. */
export function monterAlexis(app) {
  // ---------------------------------------------------------------------------
  // Alexis — extraction documentaire
  // ---------------------------------------------------------------------------
  app.get('/api/alexis/grille', wrap((req, res) => ok(res, { types: TYPES })));

  app.post('/api/alexis/documents', upload.single('fichier'), wrap(async (req, res) => {
    const user = currentUser(req);
    if (!req.file) return res.status(400).json({ error: 'Aucun document fourni.' });
    const r = await analyserDocument(
      {
        buffer: fs.readFileSync(req.file.path),
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      },
      { dossierId: req.body?.dossier_id || null, typeForce: req.body?.type || null, user }
    );
    ok(res, r);
  }));

  app.get('/api/alexis/dossiers', wrap((req, res) => ok(res, listerDossiersDoc())));

  app.get('/api/alexis/dossiers/:id', wrap((req, res) => {
    const d = obtenirDossierDoc(req.params.id);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, d);
  }));

  app.post('/api/alexis/dossiers/:id/titre', wrap((req, res) => {
    const r = renommerDossier(req.params.id, req.body?.titre);
    if (r.error) return res.status(404).json(r);
    ok(res, r);
  }));

  app.post('/api/alexis/dossiers/:id/documents/:docId/type', wrap(async (req, res) => {
    const r = await reclasserDocument(req.params.id, req.params.docId, req.body?.type);
    if (r.error) return res.status(400).json(r);
    ok(res, r);
  }));

  app.delete('/api/alexis/dossiers/:id/documents/:docId', wrap((req, res) => {
    const r = supprimerDocument(req.params.id, req.params.docId);
    if (r.error) return res.status(404).json(r);
    ok(res, r);
  }));
}
