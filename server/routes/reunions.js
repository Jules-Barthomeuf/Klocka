// Les réunions enregistrées (14 oct. 2026) : Suivi > Réunion. L'équipe seule ;
// fermé avec la page Suivi (acces-pages.js, /api/monitoring/reunions).

import fs from 'fs';
import { currentUser, ok, wrap, upload } from '../contexte.js';

const R = () => import('../reunions.js');
const A = '/api/monitoring/reunions';

export function monterReunions(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const rendre = (res, r) => (r.ok ? ok(res, r) : res.status(400).json({ error: r.error }));

  app.get(A, wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const M = await R();
    ok(res, { reunions: M.lister(), en_cours: M.vue(M.enCoursDe(user)) });
  }));
  app.post(A, wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    rendre(res, (await R()).demarrer(user, { titre: req.body?.titre }));
  }));
  // Un morceau de trente secondes : transcrit tout de suite, son texte gardé à son rang. L'audio n'est pas gardé.
  app.post(`${A}/:id/morceau`, upload.single('audio'), wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    if (!req.file) return res.status(400).json({ error: 'Morceau vide.' });
    const audio = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    let texte;
    try { texte = await (await import('../prospection/appel.js')).transcrire(audio); } catch (e) { return res.status(502).json({ error: `Morceau non transcrit : ${e?.message || e}` }); }
    const r = (await R()).ajouterMorceau(req.params.id, req.body?.i, texte, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { ok: true, i: r.i, texte });
  }));
  app.put(`${A}/:id`, wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    rendre(res, (await R()).noter(req.params.id, req.body || {}, user));
  }));
  app.post(`${A}/:id/terminer`, wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    rendre(res, await (await R()).terminer(req.params.id, req.body || {}, user));
  }));
  app.post(`${A}/:id/abandonner`, wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    rendre(res, (await R()).abandonner(req.params.id, user));
  }));
}
