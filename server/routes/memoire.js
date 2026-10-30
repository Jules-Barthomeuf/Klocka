// La Mémoire Klocka (30 oct. 2026, Jules) : la liste des biens gardés, l'état du lecteur de nuit des boîtes, et
// l'autorisation d'une boîte (Jules seulement). Fermée avec la page MemoireKlocka (acces-pages.js).

import { Records } from '../db.js';
import { currentUser, ok, wrap } from '../contexte.js';
import { estSuperAdmin } from '../acces-pages.js';
import { storedAccount } from '../google-oauth.js';
import { listerMemoire, ENTITE } from '../memoire/memoire.js';
import { drapeaux } from '../memoire/drapeaux.js';

// L'équipe connectée seulement (un admin) ; un mandataire ou un client n'a rien à y lire.
function equipe(req, res) {
  const user = currentUser(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  if (user.role !== 'admin') { res.status(403).json({ error: "Réservé à l'équipe Klocka." }); return null; }
  return user;
}

export function monterMemoire(app) {
  app.get('/api/memoire', wrap((req, res) => {
    if (!equipe(req, res)) return;
    const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 200));
    const biens = listerMemoire({ q: req.query.q, limite, statut: req.query.statut || null });
    const tous = Records.list(ENTITE);
    ok(res, {
      biens,
      total: tous.length,
      en_memoire: tous.filter((b) => b.statut === 'memoire').length,
      en_dossier: tous.filter((b) => b.statut === 'dossier').length,
      agents: new Set(tous.map((b) => b.agent_email).filter(Boolean)).size,
      drapeaux: drapeaux(),
    });
  }));

  app.get('/api/memoire/scraper', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const { etat } = await import('../memoire/scraper.js');
    ok(res, { ...(await etat()), super_admin: estSuperAdmin(currentUser(req)) });
  }));

  app.post('/api/memoire/scraper/pause', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    if (!estSuperAdmin(currentUser(req))) return res.status(403).json({ error: 'Réservé à Jules.' });
    const { mettreEnPause, enPause } = await import('../memoire/scraper.js');
    mettreEnPause(req.body?.pause !== false);
    ok(res, { pause: enPause() });
  }));

  // Un tour tout de suite : relance les boîtes autorisées pas finies (après une pause, par exemple).
  app.post('/api/memoire/scraper/tour', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    if (!estSuperAdmin(currentUser(req))) return res.status(403).json({ error: 'Réservé à Jules.' });
    const { tour } = await import('../memoire/scraper.js');
    ok(res, await tour());
  }));

  // L'autorisation d'une boîte : Jules dit laquelle, et quand. Retirer l'autorisation arrête la lecture au prochain
  // message ; ce qui est déjà en Mémoire y reste.
  app.post('/api/memoire/boites/:email/autoriser', wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    if (!estSuperAdmin(user)) return res.status(403).json({ error: 'Réservé à Jules.' });
    const compte = storedAccount(req.params.email);
    if (!compte) return res.status(404).json({ error: 'Boîte inconnue.' });
    if (!compte.peut_lire) return res.status(400).json({ error: "Cette boîte n'a pas donné le droit de lecture : reconnectez-la d'abord." });
    const autoriser = req.body?.autoriser !== false;
    Records.update('MailAccount', compte.id, { memoire_autorisee_le: autoriser ? new Date().toISOString() : null, memoire_autorisee_par: autoriser ? user.email : null });
    const S = await import('../memoire/scraper.js');
    if (req.body?.recommencer) S.recommencer(compte.email);
    // Autorisée : la lecture part tout de suite, en fond (Jules : « direct quand on dit autorisé »).
    if (autoriser && !S.enPause()) S.lireBoite(compte.email).catch((e) => console.warn('[mémoire] :', e?.message || e));
    ok(res, { email: compte.email, autorisee: autoriser, lecture: autoriser && !S.enPause() });
  }));

  app.get('/api/memoire/:id', wrap((req, res) => {
    if (!equipe(req, res)) return;
    const b = Records.get(ENTITE, req.params.id);
    if (!b) return res.status(404).json({ error: 'Bien introuvable.' });
    ok(res, { bien: b });
  }));
}
