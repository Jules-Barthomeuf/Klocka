// Suivi > Chat (12 oct. 2026) : le journal des échanges des chats, lu par
// l'équipe. La liste, filtrée par chat, par personne ou sur les échecs, et un
// échange entier : consigne, messages, tours du modèle, outils, réponse.

import { ok, wrap, currentUser } from '../contexte.js';

export function monterSuiviChat(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  app.get('/api/monitoring/chat', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const J = await import('../ak/journal-echanges.js');
    const q = req.query || {};
    ok(res, { echanges: J.lister({ chat: q.chat || null, par: q.par ? String(q.par).toLowerCase() : null, echecs: q.echecs === '1', limite: Math.min(500, Number(q.limite) || 200) }) });
  }));
  app.get('/api/monitoring/chat/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const J = await import('../ak/journal-echanges.js');
    const e = J.lire(req.params.id);
    if (!e) return res.status(404).json({ error: 'Échange introuvable.' });
    ok(res, { echange: e });
  }));
}
