// K-Data : le lanceur commun et la file des analyses. Réservé à l'équipe.

import { currentUser, ok, wrap } from '../contexte.js';
import { lancerAnalyses, listerAnalyses, ranger, supprimerAnalyse, listerDossiers } from '../kdata.js';
import { QUESTIONS, NOTES } from '../kdata-questions.js';
import { Records } from '../db.js';

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

  // Les lectures Data-B déjà gardées dans cette base, en un fichier (9 nov. 2026, Jules : apprendre la valeur
  // locative K-Data sur toutes les lectures de production). Lecture seule, rien n'est demandé à Data-B :
  // `node scripts/kdata-valeur-locative-test.mjs --lectures=fichier.json` les ajoute à celles de la base locale.
  app.get('/api/kdata/lectures-datab', wrap((req, res) => {
    if (!admin(req, res)) return;
    const lectures = Records.list('DataBRecherche').map((r) => ({ adresse: r.adresse, le: r.le, resultat: r.resultat }));
    res.setHeader('Content-Disposition', `attachment; filename="lectures-datab-${new Date().toISOString().slice(0, 10)}.json"`);
    res.json({ lectures, n: lectures.length });
  }));
}
