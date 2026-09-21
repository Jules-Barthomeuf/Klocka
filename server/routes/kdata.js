// K-Data : le lanceur commun et la file des analyses. Réservé à l'équipe.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerAnalyses, listerAnalyses, ranger, supprimerAnalyse, listerDossiers } from '../kdata.js';
import { QUESTIONS, NOTES } from '../kdata-questions.js';

export function monterKData(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  // Toutes les analyses, ou celles d'une affaire : « ?deal_id=… » pour les
  // onglets d'un dossier.
  app.get('/api/kdata/analyses', wrap((req, res) => {
    if (!admin(req, res)) return;
    const deal_id = String(req.query.deal_id || '').trim() || null;
    ok(res, {
      analyses: listerAnalyses(60, { deal_id }),
      dossiers: deal_id ? [] : listerDossiers(),
      // Ce que chaque outil demande en plus de l'adresse : l'écran pose les
      // questions avant de lancer, sans recopier les barèmes des outils.
      questions: deal_id ? undefined : QUESTIONS,
      notes: deal_id ? undefined : NOTES,
    });
  }));

  app.post('/api/kdata/analyses', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = lancerAnalyses(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Ranger : plusieurs analyses d'un coup, dans une affaire ou hors de toute affaire.
  app.patch('/api/kdata/analyses', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = ranger(req.body?.ids, req.body?.dossier_id ?? null);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/kdata/analyses/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const r = supprimerAnalyse(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
