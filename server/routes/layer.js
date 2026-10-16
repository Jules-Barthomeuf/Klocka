// L'Intelligence (spec MVP du 14 oct. 2026) : les routes de la page Intelligence et des onglets Historique.
// Réservé à l'équipe ; seul Jules valide (les super-admins).

import fs from 'fs';
import { currentUser, ok, wrap, upload } from '../contexte.js';

const C = () => import('../layer.js');

export function monterLayer(app) {
  // L'ancienne adresse de l'API (« Cerveau », jusqu'au 15 oct. 2026) reste servie : elle mène aux mêmes routes.
  app.use((req, res, next) => { if (req.url === '/api/cerveau' || req.url.startsWith('/api/cerveau/')) req.url = `/api/layer${req.url.slice(12)}`; next(); });
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const valideur = async (req, res) => {
    const user = equipe(req, res);
    if (!user) return null;
    if (!(await C()).peutValider(user)) { res.status(403).json({ error: 'Au MVP, seul Jules valide les faits.' }); return null; }
    return user;
  };

  app.get('/api/layer/etat', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const M = await C();
    ok(res, { a_valider: M.nombreAValider(), peut_valider: M.peutValider(user), mesures: M.mesures() });
  }));
  app.get('/api/layer/a-valider', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { lots: (await C()).aValider() }); }));
  app.get('/api/layer/faits', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { faits: (await C()).tousLesFaits() }); }));
  app.get('/api/layer/savoir', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { faits: (await C()).savoir() }); }));
  app.get('/api/layer/sources', wrap(async (req, res) => { if (!equipe(req, res)) return; ok(res, { sources: (await C()).sources() }); }));
  app.get('/api/layer/sources/:id', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const s = (await C()).source(req.params.id);
    if (!s) return res.status(404).json({ error: 'Source introuvable.' });
    ok(res, { source: s });
  }));
  app.get('/api/layer/historique/:type/:id', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    ok(res, { faits: (await C()).historique(req.params.type, req.params.id) });
  }));
  app.get('/api/layer/candidats', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    ok(res, { candidats: (await C()).candidatsPour(String(req.query.type || ''), String(req.query.q || ''), { limite: 8 }) });
  }));

  // Une source collée ou déposée (compte rendu) : le journal brut, puis l'extraction.
  app.post('/api/layer/sources', upload.single('fichier'), wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    let contenu = String(req.body?.contenu || '');
    let titre = req.body?.titre || null;
    if (req.file) {
      try {
        const buffer = fs.readFileSync(req.file.path);
        if (/^text\/|\.(txt|md|vtt|srt)$/i.test(`${req.file.mimetype} ${req.file.originalname}`)) contenu = buffer.toString('utf8');
        else contenu = String((await (await import('../deal/ingest.js')).ingerer({ buffer, filename: req.file.originalname, mimetype: req.file.mimetype }))?.texte || '');
        titre = titre || req.file.originalname;
      } catch (e) {
        return res.status(400).json({ error: `Fichier illisible : ${e?.message || e}` });
      }
    }
    const M = await C();
    const s = M.ajouterSource({ type: 'compte_rendu', auteur: user.email, date: req.body?.date || null, titre, contenu, lien_original: req.body?.lien_original || null });
    if (!s.ok) return res.status(400).json({ error: s.error });
    if (s.deja) return ok(res, { source_id: s.source.id, deja: true });
    const r = await M.extraire(s.source.id);
    ok(res, { source_id: s.source.id, ...r });
  }));
  app.post('/api/layer/sources/:id/extraire', wrap(async (req, res) => {
    if (!(await valideur(req, res))) return;
    ok(res, await (await C()).extraire(req.params.id));
  }));
  app.post('/api/layer/importer-appels', wrap(async (req, res) => {
    if (!(await valideur(req, res))) return;
    ok(res, (await C()).importerAppelsGardes());
  }));

  // La validation : valider, corriger, rejeter ; un lot par source.
  app.post('/api/layer/faits/:id', wrap(async (req, res) => {
    const user = await valideur(req, res); if (!user) return;
    const r = (await C()).trancher(req.params.id, { ...req.body, par: user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/layer/sources/:id/valider', wrap(async (req, res) => {
    const user = await valideur(req, res); if (!user) return;
    ok(res, (await C()).validerLot(req.params.id, { par: user.email }));
  }));

  // La question d'une décision sans motif, et sa réponse.
  app.get('/api/layer/questions/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const { Records } = await import('../db.js');
    const q = Records.get('CerveauQuestion', req.params.id);
    if (!q || q.pour !== String(user.email).toLowerCase()) return res.status(404).json({ error: 'Question introuvable.' });
    ok(res, { question: q });
  }));
}
