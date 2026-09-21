// AK, l'assistant de l'équipe dans Google Chat : son état, et un passage à la
// demande. Réservé à l'équipe : rien ici ne parle au chat sans elle.

import { ok, wrap, currentUser } from '../contexte.js';

/** Monte les routes « ak » sur l'application. */
export function monterAk(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/ak/etat', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { etatVeille } = await import('../ak/veille.js');
    ok(res, etatVeille());
  }));

  // Relire le chat tout de suite, sans attendre le passage suivant.
  app.post('/api/ak/relever', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { relever } = await import('../ak/veille.js');
    ok(res, await relever());
  }));

  // Ce qu'il a servi, et ce que l'équipe lui a appris.
  app.get('/api/ak/bilan', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { bilanAk } = await import('../ak/bilan.js');
    ok(res, bilanAk(Number(req.query.jours) || 30));
  }));
  app.get('/api/ak/lecons', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { lecons, souvenirs } = await import('../ak/lecons.js');
    ok(res, { lecons: lecons(100), souvenirs: souvenirs(100) });
  }));

  // Les espaces où le compte est membre : pour régler AK_ESPACE sans deviner.
  app.get('/api/ak/espaces', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { espaces } = await import('../ak/chat.js');
    ok(res, { espaces: await espaces() });
  }));
}
