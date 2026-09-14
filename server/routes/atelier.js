// L'atelier : les routes.
//
// Réservées à l'équipe par la garde globale (préfixe dans PREFIXES_EQUIPE).
// L'écran du Feedback s'en sert pour lancer une correction, la suivre pendant
// qu'elle se fait, et retrouver la pull request à la fin.

import { Records } from '../db.js';
import { ok, wrap, currentUser } from '../contexte.js';
import { arreterChantier, etatAtelier, lancerAtelier, rangerChantier, reprendreAuDemarrage } from '../atelier.js';

const erreur = (res, e, statut = 400) => res.status(statut).json({ error: String(e?.message || e) });

/** Monte les routes « atelier » sur l'application. */
export function monterAtelier(app) {
  reprendreAuDemarrage();

  app.get('/api/atelier/etat', wrap((req, res) => ok(res, etatAtelier())));

  // Les chantiers, du plus récent au plus ancien. Le journal est long : on ne
  // le renvoie qu'à la demande, sur un chantier précis.
  app.get('/api/atelier/chantiers', wrap((req, res) => {
    const query = req.query.remarque_id ? { remarque_id: req.query.remarque_id } : undefined;
    const tous = Records.filter('Chantier', query, { sort: '-created_date' });
    ok(res, tous.slice(0, 100).map(({ journal, ...reste }) => ({ ...reste, journal_taille: (journal || []).length })));
  }));

  app.get('/api/atelier/chantiers/:id', wrap((req, res) => {
    const c = Records.get('Chantier', req.params.id);
    if (!c) return res.status(404).json({ error: 'Chantier introuvable.' });
    ok(res, c);
  }));

  // Lancer une correction à la main, quand l'automatique est coupé ou qu'on
  // veut reprendre une remarque ancienne.
  app.post('/api/atelier/remarques/:id', wrap((req, res) => {
    const remarque = Records.get('Suggestion', req.params.id);
    if (!remarque) return res.status(404).json({ error: 'Remarque introuvable.' });
    const r = lancerAtelier(remarque, { par: currentUser(req)?.email || null, auto: false });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));

  app.post('/api/atelier/chantiers/:id/arreter', wrap((req, res) => {
    const r = arreterChantier(req.params.id);
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));

  // Ranger : le worktree s'en va, la branche et la pull request restent.
  app.post('/api/atelier/chantiers/:id/ranger', wrap(async (req, res) => {
    const r = await rangerChantier(req.params.id);
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));
}
