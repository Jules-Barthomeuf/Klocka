// Les fiches commerciales et les appels de prospection : ce que l'onglet
// Fiches commerciales lit, et le bouton « Noter un appel ». Réservé à
// l'équipe.

import { Records } from '../db.js';
import { ok, wrap, currentUser } from '../contexte.js';

const ENTITE_APPEL = 'Appel';

/** Monte les routes « fiches » et « appels » sur l'application. */
export function monterFiches(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/fiches', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerFiches, statsParSemaine, recordDeFiches, agentsDeLaPeriode } = await import('../deal/fiches-stats.js');
    const semaines = Math.min(52, Math.max(4, Number(req.query.semaines) || 12));
    const fiches = listerFiches({ deals: Records.list('Deal'), mails: Records.list('MailRecu'), projets: Records.list('Project') });
    const appels = Records.list(ENTITE_APPEL);
    const stats = statsParSemaine(fiches, appels, { semaines });
    const depuis = stats[0]?.semaine || null;
    ok(res, {
      fiches: fiches.slice(0, 400),
      total: fiches.length,
      semaines: stats,
      record: recordDeFiches(fiches),
      agents: agentsDeLaPeriode(fiches, { depuis }),
      appels: appels.sort((a, b) => String(b.le).localeCompare(String(a.le))).slice(0, 30),
    });
  }));

  // Un appel de prospection, noté en deux clics : qui, et ce que ça a donné.
  app.post('/api/appels', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { RESULTATS_APPEL } = await import('../deal/fiches-stats.js');
    const resultat = String(req.body?.resultat || '');
    if (!RESULTATS_APPEL.includes(resultat)) return res.status(400).json({ error: 'Résultat inconnu.' });
    const a = Records.create(ENTITE_APPEL, {
      le: new Date().toISOString(),
      par: user.email,
      par_nom: user.full_name || user.email,
      agent: String(req.body?.agent || '').trim().slice(0, 120) || null,
      resultat,
      note: String(req.body?.note || '').trim().slice(0, 500) || null,
    });
    ok(res, a);
  }));

  app.delete('/api/appels/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    if (!Records.get(ENTITE_APPEL, req.params.id)) return res.status(404).json({ error: 'Appel introuvable.' });
    Records.delete(ENTITE_APPEL, req.params.id);
    ok(res, { ok: true });
  }));
}
