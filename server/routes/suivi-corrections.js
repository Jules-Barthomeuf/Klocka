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

  // Les agences écartées du mode appel (24 nov. 2026, Jules) : les règles apprises des suppressions, combien de cartes
  // chacune écarte aujourd'hui, et ses exemples (qui a supprimé quoi, pourquoi). Voir server/prospection/ecarter-agences.js.
  const etatEcartees = async () => {
    const E = await import('../prospection/ecarter-agences.js');
    const MA = await import('../prospection/mode-appel.js');
    const { Records } = await import('../db.js');
    const listes = new Set(Records.list('ListeAgences').filter((x) => !x.essai).map((x) => x.id));
    const toutes = MA.annoter(Records.list('AgenceProspect').filter((x) => listes.has(x.liste_id) && !x.hors_cible));
    const regles = Records.list(E.ENTITE_REGLE).filter((r) => !r.annulee_le || r.active)
      .sort((a, b) => String(b.maj_le || '').localeCompare(String(a.maj_le || '')))
      .map((r) => ({ id: r.id, libelle: r.libelle, mots: r.mots || [], specialite: r.specialite || null, active: !!r.active, trop_large: !!r.trop_large, ecartees: E.portee(r, toutes).n, exemples: (r.exemples || []).slice(-5).reverse() }));
    return { regles, agences: toutes.length };
  };
  app.get('/api/monitoring/agences-ecartees', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await etatEcartees());
  }));
  app.post('/api/monitoring/agences-ecartees/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const E = await import('../prospection/ecarter-agences.js');
    const r = E.basculerRegle(String(req.params.id), !!req.body?.active);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, await etatEcartees());
  }));
}
