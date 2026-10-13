// Outils (13 oct. 2026) : le menu de l'équipe où se rangent les outils de
// terrain. Le premier est Vacance : les signaux publics qui annoncent qu'un
// local va se libérer, sur une carte, autour d'une adresse.
//
// Deux chemins suffisent à l'écran : les propositions d'adresse (par chez
// nous, pour tenir le quota et pouvoir changer de fournisseur) et les signaux.
// L'état et la table NAF servent au Suivi et aux réglages.

import { currentUser, ok, wrap } from '../contexte.js';
import { estSuperAdmin } from '../acces-pages.js';
import { suggestions } from '../outils/vacance-sources.js';
import { rechercher, etat, supprimerSignal, poserNaf, demanderZone, zone } from '../outils/vacance.js';

export function monterOutils(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };

  app.get('/api/outils/adresses/suggest', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    try {
      ok(res, { suggestions: await suggestions(req.query.q, 5) });
    } catch (e) {
      res.status(e?.statut && e.statut >= 500 ? 502 : 500).json({ error: e?.message || String(e) });
    }
  }));

  app.get('/api/outils/vacance/signaux', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const r = rechercher(req.query, { par: user.email });
    if (!r.ok) return res.status(r.statut || 400).json({ error: r.error, zone: r.zone || null });
    res.status(r.statut || 200).json(r);
  }));

  app.get('/api/outils/vacance/etat', wrap((req, res) => {
    if (!equipe(req, res)) return;
    ok(res, etat());
  }));

  // Recharger une commune à la main (après une erreur, ou pour la rafraîchir sans attendre la nuit).
  app.post('/api/outils/vacance/zones/:code/recharger', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const z = zone(req.params.code);
    if (!z) return res.status(404).json({ error: 'Commune inconnue.' });
    ok(res, { zone: demanderZone(z, { par: user.email, delta: !!z.chargee_le && req.body?.complet !== true }) });
  }));

  // La correspondance NAF → type de bien, et les demandes de suppression de la DILA : Jules seul.
  app.put('/api/outils/vacance/naf', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    if (!estSuperAdmin(user)) return res.status(403).json({ error: 'Seul Jules modifie la correspondance NAF.' });
    const r = poserNaf(req.body?.prefixe, req.body?.categorie, req.body?.raison || `${user.email}, ${new Date().toISOString().slice(0, 10)}`);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/outils/vacance/suppression', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    if (!estSuperAdmin(user)) return res.status(403).json({ error: 'Seul Jules traite une demande de suppression.' });
    const r = supprimerSignal(req.body?.source_id, { par: user.email, motif: req.body?.motif || 'demande DILA' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
}
