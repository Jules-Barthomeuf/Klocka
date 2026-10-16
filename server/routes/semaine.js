// La page Semaine (16 oct. 2026) : les présences de l'équipe, la passation
// avant de partir, le résumé de retour et celui laissé à ceux qui restent.
// Toute l'équipe lit ; seul Jules pose les absences.

import { currentUser, ok, wrap } from '../contexte.js';

const S = () => import('../equipe-semaine.js');

export function monterSemaine(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const jules = async (req, res) => {
    const user = equipe(req, res);
    if (!user) return null;
    if (!(await import('../acces-pages.js')).estSuperAdmin(user)) { res.status(403).json({ error: 'Réservé à Jules.' }); return null; }
    return user;
  };

  app.get('/api/semaine', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, await (await S()).maSemaine(user));
  }));
  app.get('/api/semaine/presences', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const M = await S();
    const r = await M.presences(req.query.jour || M.jourParis(), { semaines: Math.min(12, Number(req.query.semaines) || 6) });
    ok(res, { ...r, modifiable: (await import('../acces-pages.js')).estSuperAdmin(user), motifs: M.MOTIFS });
  }));
  app.post('/api/semaine/absences', wrap(async (req, res) => {
    const user = await jules(req, res); if (!user) return;
    const M = await S();
    const b = req.body || {};
    const jours = [].concat(b.jours || b.jour || []);
    const r = jours.map((jour) => M.poserAbsence({ email: b.email, jour, motif: b.motif ?? null, note: b.note || null }, user.email));
    const rate = r.find((x) => !x.ok);
    if (rate) return res.status(400).json(rate);
    ok(res, { ok: true, n: r.length });
  }));
  app.post('/api/semaine/passation', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await S()).enregistrerPassation(user, req.body || {});
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/semaine/resumes/:id/vu', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { ok: !!(await S()).marquerVu(req.params.id, user) });
  }));
}
