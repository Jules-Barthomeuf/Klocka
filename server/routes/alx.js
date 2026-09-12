// ALX, la prospection off-market : les routes.
//
// Réservées à l'équipe par la garde globale (préfixe dans PREFIXES_EQUIPE).
// Les actions qui interrogent une source externe répondent avec ce qu'elles
// ont obtenu, ou avec une erreur lisible quand la source n'est pas configurée.

import { Records } from '../db.js';
import { ok, wrap, currentUser } from '../contexte.js';
import {
  etatDesOutils, listerVilles, obtenirVille, creerVille, classerRue, retirerRue,
  listerCibles, obtenirCible, creerCible, mettreAJourCible, reclasser, supprimerCible,
  enregistrerApproche, qualifierApproche, creerDossierDepuisCible, aFaire, bilan, PILES,
} from '../alx/index.js';
import { REGLES, LIBELLES_PILES } from '../alx/classement.js';

const erreur = (res, e, statut = 400) => res.status(statut).json({ error: String(e?.message || e) });

/** Monte les routes « alx » sur l'application. */
export function monterAlx(app) {
  app.get('/api/alx/etat', wrap((req, res) => ok(res, { outils: etatDesOutils(), piles: PILES, libelles: LIBELLES_PILES, regles_version: REGLES.version, a_faire: aFaire() })));

  // --- Villes ---------------------------------------------------------------
  app.get('/api/alx/villes', wrap((req, res) => ok(res, listerVilles())));
  app.post('/api/alx/villes', wrap((req, res) => {
    const r = creerVille({ ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.get('/api/alx/villes/:id', wrap((req, res) => {
    const v = obtenirVille(req.params.id);
    if (!v) return res.status(404).json({ error: 'Ville introuvable.' });
    ok(res, { ...v, cibles_liste: listerCibles({ ville_id: v.id }) });
  }));
  app.post('/api/alx/villes/:id/rues', wrap((req, res) => {
    const r = classerRue(req.params.id, { ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.delete('/api/alx/villes/:id/rues/:nom', wrap((req, res) => ok(res, retirerRue(req.params.id, decodeURIComponent(req.params.nom)))));
  app.delete('/api/alx/villes/:id', wrap((req, res) => {
    for (const c of Records.filter('Cible', { ville_id: req.params.id })) supprimerCible(c.id);
    Records.delete('Ville', req.params.id);
    ok(res, { ok: true });
  }));

  // --- Cibles ---------------------------------------------------------------
  app.get('/api/alx/cibles', wrap((req, res) => ok(res, listerCibles({ ville_id: req.query.ville || null, pile: req.query.pile || null }))));
  app.post('/api/alx/cibles', wrap((req, res) => {
    const r = creerCible({ ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.get('/api/alx/cibles/:id', wrap((req, res) => {
    const c = obtenirCible(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    ok(res, c);
  }));
  app.put('/api/alx/cibles/:id', wrap((req, res) => {
    const r = mettreAJourCible(req.params.id, req.body || {}, currentUser(req));
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));
  app.delete('/api/alx/cibles/:id', wrap((req, res) => ok(res, supprimerCible(req.params.id))));
  app.post('/api/alx/cibles/:id/classer', wrap((req, res) => {
    const c = reclasser(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    ok(res, { ok: true, cible: c });
  }));

  // --- Les connecteurs, un par geste ----------------------------------------

  // La devanture : photo datée et lecture par le modèle, à valider.
  app.post('/api/alx/cibles/:id/devanture', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const { lireDevanture } = await import('../alx/streetview.js');
    let r;
    try {
      r = await lireDevanture([c.adresse, c.ville].filter(Boolean).join(', '));
    } catch (e) {
      return erreur(res, e);
    }
    if (!r.ok) return erreur(res, r.error);
    const lecture = r.photo.lecture || {};
    const patch = { photo: r.photo };
    // La lecture propose ; la fiche ne prend que ce qui manque encore.
    if (!c.enseigne && lecture.enseigne) patch.enseigne = lecture.enseigne;
    if (!c.activite && lecture.activite) patch.activite = lecture.activite;
    if (lecture.occupe === false) patch.occupe = false;
    ok(res, mettreAJourCible(c.id, patch, currentUser(req)));
  }));

  // La société : Pappers, par SIREN ou par le nom lu sur Data-B.
  app.post('/api/alx/cibles/:id/societe', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const { societe } = await import('../alx/pappers.js');
    const siren = req.body?.siren || c.proprietaire?.siren || null;
    const nom = req.body?.nom || c.proprietaire?.nom || null;
    if (!siren && !nom) return erreur(res, "Il faut un SIREN ou le nom du propriétaire (lu sur Data-B, ou saisi).");
    let s;
    try {
      s = await societe({ siren, nom, ville: c.ville });
    } catch (e) {
      return erreur(res, e);
    }
    if (!s) return erreur(res, `Pappers ne trouve pas « ${nom || siren} ».`, 404);
    const patch = { societe: s, proprietaire: { ...(c.proprietaire || {}), nom: c.proprietaire?.nom || s.nom, siren: s.siren, forme: s.forme, source: c.proprietaire?.source || 'Pappers' } };
    ok(res, mettreAJourCible(c.id, patch, currentUser(req)));
  }));

  // Les événements : BODACC par SIREN.
  app.post('/api/alx/cibles/:id/evenements', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const siren = c.proprietaire?.siren || c.societe?.siren;
    if (!siren) return erreur(res, 'Pas de SIREN : lisez la société d’abord.');
    const { evenementsSociete } = await import('../bodacc.js');
    let evenements;
    try {
      evenements = await evenementsSociete(siren);
    } catch (e) {
      return erreur(res, e);
    }
    ok(res, mettreAJourCible(c.id, { evenements }, currentUser(req)));
  }));

  // La dernière mutation : DVF autour de l'adresse, la vente la plus proche.
  app.post('/api/alx/cibles/:id/mutation', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const { ventesAutour } = await import('../dvf.js');
    let r;
    try {
      r = await ventesAutour([c.adresse, c.ville].filter(Boolean).join(', '), { rayon: 40, user: currentUser(req) });
    } catch (e) {
      return erreur(res, e);
    }
    if (!r.ok) return erreur(res, r.error);
    const ventes = r.resultat?.ventes || r.resultat?.transactions || [];
    const proche = ventes[0] || null;
    const mutation = proche ? { date: proche.date || proche.date_mutation || null, prix: proche.prix ?? proche.valeur_fonciere ?? null, nature: proche.nature || null, distance_m: proche.distance_m ?? null, source: 'DVF' } : null;
    ok(res, mettreAJourCible(c.id, { mutation, dvf: r.resultat }, currentUser(req)));
  }));

  // Le loyer de marché de la rue : les connecteurs existants.
  app.post('/api/alx/cibles/:id/loyer', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const { valeurLocative } = await import('../data-b.js');
    let r;
    try {
      r = await valeurLocative([c.adresse, c.ville].filter(Boolean).join(', '), { user: currentUser(req) });
    } catch (e) {
      return erreur(res, e);
    }
    if (!r.ok) return erreur(res, r.error);
    const rue = r.resultat?.rue || {};
    const loyer = rue.basse != null && rue.haute != null ? (rue.basse + rue.haute) / 2 : null;
    const v = { ...(c.valorisation || {}), loyer_m2_marche: loyer, loyer_fourchette: [rue.basse ?? null, rue.haute ?? null], loyer_source: 'Data-B, rue', valeur_locative: r.resultat };
    ok(res, mettreAJourCible(c.id, { valorisation: v }, currentUser(req)));
  }));

  // La fourchette de prix : loyer × surface ÷ rendement, croisée avec DVF.
  app.post('/api/alx/cibles/:id/prix', wrap((req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const v = c.valorisation || {};
    const surface = Number(req.body?.surface ?? v.surface);
    const loyerM2 = Number(v.loyer_m2_marche);
    const taux = Number(req.body?.taux ?? v.taux ?? 7);
    if (!(surface > 0) || !(loyerM2 > 0)) return erreur(res, 'Il faut une surface et un loyer de marché.');
    const loyerAnnuel = surface * loyerM2;
    // Un taux cible, plus ou moins un point : jamais un chiffre.
    const bas = Math.round(loyerAnnuel / ((taux + 1) / 100) / 1000) * 1000;
    const haut = Math.round(loyerAnnuel / ((taux - 1) / 100) / 1000) * 1000;
    const alerte = c.mutation?.prix && haut <= c.mutation.prix * 1.05 ? 'Le haut de fourchette est au niveau du prix payé récemment : dossier probablement mort.' : null;
    ok(res, mettreAJourCible(c.id, { valorisation: { ...v, surface, surface_source: req.body?.surface ? 'saisie' : v.surface_source || null, taux, loyer_annuel: Math.round(loyerAnnuel), fourchette: [bas, haut], alerte, calculee_le: new Date().toISOString() } }, currentUser(req)));
  }));

  // Le message : rédigé par le modèle, relu par l'équipe, jamais envoyé d'ici.
  app.post('/api/alx/cibles/:id/message', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const canal = req.body?.canal === 'courrier' ? 'courrier' : 'mail';
    const { rediger } = await import('../alx/message.js');
    ok(res, await rediger(c, canal, currentUser(req)));
  }));

  // --- Approches --------------------------------------------------------------
  app.post('/api/alx/cibles/:id/approches', wrap((req, res) => {
    const r = enregistrerApproche({ ...req.body, cible_id: req.params.id, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.post('/api/alx/approches/:id/issue', wrap((req, res) => {
    const r = qualifierApproche(req.params.id, { ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));

  // --- Le passage en dossier ----------------------------------------------------
  app.post('/api/alx/cibles/:id/dossier', wrap(async (req, res) => {
    const r = await creerDossierDepuisCible(req.params.id, currentUser(req));
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));

  // --- Le bilan --------------------------------------------------------------
  app.get('/api/alx/bilan', wrap((req, res) => ok(res, bilan())));
}
