// L'Agenda (16 oct. 2026) : les présences de l'équipe, les briefings d'un
// jour (pour qui revient, pour ceux qui restent), le résumé que Jules relit et
// qui paraît dans l'Agenda de la personne le matin de son retour. Seul Jules
// pose les absences et valide. Aucun mail.

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
    const estJules = (await import('../acces-pages.js')).estSuperAdmin(user);
    ok(res, { ...(await (await S()).monAgenda(user, { estJules })), est_jules: estJules });
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
  // Le briefing d'un jour : ce qu'il faut pour l'ouvrir (pour qui, questions, réponses pré-remplies), puis l'enregistrer.
  app.get('/api/semaine/briefing/:jour', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = await (await S()).preparerBriefing(user, req.params.jour);
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/semaine/briefing', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = await (await S()).enregistrerBriefing(user, req.body || {});
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  // Jules : le brouillon, ses corrections, sa validation (il paraît dans l'Agenda de la personne le matin du retour, ou tout de suite).
  app.post('/api/semaine/retours/brouillon', wrap(async (req, res) => {
    const user = await jules(req, res); if (!user) return;
    const b = req.body || {};
    const r = await (await S()).ecrireBrouillon(b.pour, { du: b.du, au: b.au });
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/semaine/retours/:id', wrap(async (req, res) => {
    const user = await jules(req, res); if (!user) return;
    const r = (await S()).corriger(req.params.id, req.body || {});
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
  app.post('/api/semaine/retours/:id/valider', wrap(async (req, res) => {
    const user = await jules(req, res); if (!user) return;
    const M = await S();
    if (req.body && (req.body.objet !== undefined || req.body.texte !== undefined)) { const c = M.corriger(req.params.id, req.body); if (!c.ok) return res.status(400).json(c); }
    const r = await M.valider(req.params.id, user);
    if (!r.ok) return res.status(400).json(r);
    ok(res, r);
  }));
}
