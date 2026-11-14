// Suivi > Corrections (13 nov. 2026, Jules) : les corrections de l'équipe sur les projets rentrés, les règles que la
// plateforme en tire et qu'elle applique d'office, et ce qui est encore en observation. Voir server/corrections-projet.js.

import { ok, wrap, currentUser } from '../contexte.js';

export function monterSuiviCorrections(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  app.get('/api/monitoring/corrections', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const C = await import('../corrections-projet.js');
    ok(res, C.etatCorrections());
  }));
  // Couper une règle (elle ne s'applique plus aux prochains projets) ou la rallumer.
  app.post('/api/monitoring/corrections/regle', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const cle = String(req.body?.cle || '').trim();
    if (!cle) return res.status(400).json({ error: 'Règle manquante.' });
    const C = await import('../corrections-projet.js');
    C.couperRegle(cle, !!req.body?.coupee, user.email);
    ok(res, C.etatCorrections());
  }));
}
