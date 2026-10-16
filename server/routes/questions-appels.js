// Les questions d'AK sur les appels (16 oct. 2026, Jules) : chaque analyste voit
// et répond aux siennes dans le Dashboard, avec l'écran enregistré pendant
// l'appel ; Jules lit toutes les réponses dans Suivi > Appels > Retours.

import fs from 'fs';
import { currentUser, ok, wrap } from '../contexte.js';

const Q = () => import('../prospection/questions-appels.js');

export function monterQuestionsAppels(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const estJules = async (user) => (await import('../acces-pages.js')).estSuperAdmin(user);
  const jules = async (req, res) => {
    const user = equipe(req, res);
    if (!user) return null;
    if (!(await estJules(user))) { res.status(403).json({ error: 'Réservé à Jules.' }); return null; }
    return user;
  };

  // Mes questions : la surveillance se fait à l'ouverture du Dashboard (au plus une fois par minute), la rédaction en tâche de fond.
  app.get('/api/questions-appels', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const M = await Q();
    const { crees, rouvertes } = M.surveillerSiBesoin();
    if (crees.length || rouvertes.length) M.redigerLesNouvelles().catch(() => {});
    ok(res, { questions: M.mesQuestions(user) });
  }));
  app.post('/api/questions-appels/:id/reponse', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await Q()).repondre(req.params.id, user, req.body?.reponses || [], { estJules: await estJules(user) });
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/questions-appels/:id/plus-tard', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await Q()).plusTard(req.params.id, user);
    if (!r.ok) return res.status(404).json(r);
    ok(res, r);
  }));
  // L'écran de l'appel, rejoué : à son analyste, ou à Jules. Hors de /api/monitoring, que les pages fermées ne laissent pas passer.
  app.get('/api/questions-appels/:id/ecran', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = await (await Q()).fichierEcran(req.params.id, user, { estJules: await estJules(user) });
    if (r.erreur) return res.status(r.erreur).json({ error: r.message });
    const taille = fs.statSync(r.chemin).size;
    res.set({ 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': String(taille), 'Cache-Control': 'private, max-age=3600' });
    fs.createReadStream(r.chemin).on('error', () => res.destroy()).pipe(res);
  }));

  // Pour Jules : toutes les questions et leurs réponses, et la synthèse de ce qui revient.
  app.get('/api/monitoring/questions-appels', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    ok(res, (await Q()).retours({ jours: Math.min(Math.max(Number(req.query.jours) || 30, 1), 90) }));
  }));
  app.post('/api/monitoring/questions-appels/synthese', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    const r = await (await Q()).synthetiser();
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/monitoring/questions-appels/surveiller', wrap(async (req, res) => {
    if (!(await jules(req, res))) return;
    ok(res, { ok: true, ...(await (await Q()).tour()) });
  }));
}
