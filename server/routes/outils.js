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

  // Les cinq outils hors dossier (11 nov. 2026, Jules) : une adresse entendue au téléphone, un essai. Chaque lancement
  // est gardé (outils/lancements.js) ; l'historique les liste tous, et un lancement se rattache à un dossier.
  app.post('/api/outils/lancements', wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const O = await import('../outils/lancements.js');
    const b = req.body || {};
    const e = {
      adresse: String(b.adresse || '').trim() || null, locataire: String(b.locataire || '').trim() || null,
      surface: Number(b.surface) || null, loyer: Number(b.loyer) || null, prix: Number(b.prix) || null, echeance: b.echeance || null,
    };
    e.ville = String(b.ville || '').trim() || (e.adresse ? String(e.adresse).split(',').pop().replace(/\b\d{5}\b/, '').trim() || null : null);
    if (!e.adresse && !e.locataire) return res.status(400).json({ error: 'Donnez au moins une adresse ou un locataire.' });
    const lancements = O.lancerOutils(e, { outils: Array.isArray(b.outils) ? b.outils : null, user });
    ok(res, { ok: true, lancements: lancements.map((l) => l.id) });
  }));
  app.get('/api/outils/lancements', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const O = await import('../outils/lancements.js');
    if (req.query.ids) {
      const ids = String(req.query.ids).split(',').filter(Boolean).slice(0, 10);
      return ok(res, { outils: O.OUTILS, lancements: ids.map((id) => O.lireLancement(id)).filter(Boolean) });
    }
    ok(res, { outils: O.OUTILS, lancements: O.historique({ limite: Number(req.query.limite) || 150 }) });
  }));
  app.post('/api/outils/lancements/:id/rattacher', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const { rattacher } = await import('../outils/lancements.js');
    const r = rattacher(req.params.id, String(req.body?.deal_id || ''), Number(req.body?.index) || 0);
    if (!r.ok) return res.status(404).json(r);
    ok(res, r);
  }));
  app.post('/api/outils/lancements/:id/verifier', wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const { verifier } = await import('../outils/lancements.js');
    const r = verifier(req.params.id, !!req.body?.verifie, user);
    if (!r.ok) return res.status(404).json(r);
    ok(res, r);
  }));

  // L'outil Rue (11 nov. 2026, Jules) : le local, la rue, la position, le passage noté sur 10, la conclusion.
  app.get('/api/outils/rue', wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const { analyserRue } = await import('../outils/rue.js');
    const r = await analyserRue(String(req.query.adresse || ''), { forcer: req.query.forcer === '1', user });
    if (!r.ok) return res.status(r.error?.includes('introuvable') || r.error?.includes('numéro') ? 404 : 502).json(r);
    ok(res, r);
  }));
  app.get('/api/outils/rue/:id', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const { lireAnalyse } = await import('../outils/rue.js');
    const r = lireAnalyse(req.params.id);
    if (!r.ok) return res.status(404).json(r);
    ok(res, r);
  }));
  // La note de passage de l'analyste : elle remplace le calcul à l'écran, le calcul reste visible à côté.
  app.post('/api/outils/rue/:id/passage', wrap(async (req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const { noterPassage } = await import('../outils/rue.js');
    const r = noterPassage(req.params.id, { note: req.body?.note ?? null, commentaire: req.body?.commentaire || '' }, user);
    if (!r.ok) return res.status(404).json(r);
    ok(res, r);
  }));

  app.get('/api/outils/vacance/signaux', wrap((req, res) => {
    const user = equipe(req, res);
    if (!user) return;
    const r = rechercher(req.query, { par: user.email });
    if (!r.ok) return res.status(r.statut || 400).json({ error: r.error, zone: r.zone || null });
    res.status(r.statut || 200).json(r);
  }));

  // Le taux de vacance d'une rue ou d'un rayon (14 oct. 2026) : recensement des locaux, état de chacun, taux.
  app.get('/api/outils/vacance/taux', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const r = await (await import('../outils/vacance-taux.js')).tauxDeVacance(req.query);
    if (!r.ok) return res.status(r.statut || 400).json({ error: r.error });
    res.status(r.statut || 200).json(r);
  }));

  // Le taux d'une rue entière et de ses tronçons (16 oct. 2026) : mêmes règles que le taux par zone, sans rayon.
  app.get('/api/outils/vacance/taux-rue', wrap(async (req, res) => {
    if (!equipe(req, res)) return;
    const r = await (await import('../outils/vacance-taux.js')).tauxDeLaRue(req.query);
    if (!r.ok) return res.status(r.statut || 400).json({ error: r.error });
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
