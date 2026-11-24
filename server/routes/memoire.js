// La Mémoire Klocka (30 oct. 2026, Jules) : la liste des biens gardés, l'état du lecteur de nuit des boîtes, et
// l'autorisation d'une boîte (Jules seulement). Fermée avec la page MemoireKlocka (acces-pages.js).

import { Records } from '../db.js';
import { currentUser, ok, wrap } from '../contexte.js';
import { estSuperAdmin } from '../acces-pages.js';
import { storedAccount } from '../google-oauth.js';
import { listerMemoire, ENTITE, estAnnonce } from '../memoire/memoire.js';
import { drapeaux } from '../memoire/drapeaux.js';

// L'équipe connectée seulement (un admin) ; un mandataire ou un client n'a rien à y lire.
function equipe(req, res) {
  const user = currentUser(req);
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return null; }
  if (user.role !== 'admin') { res.status(403).json({ error: "Réservé à l'équipe Klocka." }); return null; }
  return user;
}

export function monterMemoire(app) {
  app.get('/api/memoire', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 200));
    const type = ['fiches', 'annonces'].includes(req.query.type) ? req.query.type : null;
    // « Boîte » : qui a envoyé le bien (24 nov. 2026, Jules : « là c'est marqué sourcing alors que c'est Maxime qui a
    // transféré ») : le collègue d'un transfert, le titulaire de la boîte, le responsable d'un dossier.
    const { quiDuBien } = await import('../memoire/record-memoire.js');
    const ctx = { mails: new Map(Records.list('MailRecu').map((m) => [m.id, m])), deals: new Map(Records.list('Deal').map((d) => [d.deal_id, d])) };
    const biens = listerMemoire({ q: req.query.q, limite, statut: req.query.statut || null, type }).map((b) => ({ ...b, par_qui: quiDuBien(b, ctx) }));
    const tous = Records.list(ENTITE).filter((b) => !b.supprime_le);
    ok(res, {
      biens,
      total: tous.length,
      en_memoire: tous.filter((b) => b.statut === 'memoire').length,
      en_dossier: tous.filter((b) => b.statut === 'dossier').length,
      fiches: tous.filter((b) => !estAnnonce(b)).length,
      annonces: tous.filter(estAnnonce).length,
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

  // Supprimer une fiche de la Mémoire (24 nov. 2026, Jules : « dans la Mémoire, je dois pouvoir supprimer les fiches que
  // je veux ») : marquée supprimée (qui, quand), jamais effacée ; elle sort de la liste, des fiches reçues et du record.
  app.delete('/api/memoire/:id', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const b = Records.get(ENTITE, req.params.id);
    if (!b) return res.status(404).json({ error: 'Fiche introuvable.' });
    Records.update(ENTITE, b.id, { supprime_le: new Date().toISOString(), supprime_par: String(user.email || '').toLowerCase() });
    // Sa ligne de Propriétés Klocka part aussitôt (24 nov. 2026, Jules : « les deux en synchronisation »).
    if (b.twenty_klocka_id) import('../memoire/twenty.js').then((m) => m.synchroniserKlocka({ max: 50 })).catch((e) => console.warn('[mémoire] Propriétés Klocka :', e?.message || e));
    ok(res, { ok: true });
  }));
  app.get('/api/memoire/:id', wrap((req, res) => {
    if (!equipe(req, res)) return;
    const b = Records.get(ENTITE, req.params.id);
    if (!b) return res.status(404).json({ error: 'Bien introuvable.' });
    ok(res, { bien: b });
  }));
}
