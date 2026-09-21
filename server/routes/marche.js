// Les sources de marché, et ce qu elles disent d un projet.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { currentUser, ok, wrap } from '../contexte.js';

/** Monte les routes « equimmox / figaro / marche / projects / projets » sur l'application. */
export function monterMarche(app) {
  // Ce que le client voit du bail sur sa page projet : quelques lignes, et
  // l'analyse complète derrière — sans les pièces.
  // « projets » (français) ne figure pas dans le préfixe de la garde globale, qui
  // dit « entities|integrations|… » : cette route répondait sans connexion. Et son
  // contrôle comparait deux chaînes vides — un visiteur sans compte, face à un
  // projet sans adresse client, était reconnu comme le client de ce projet.
  app.get('/api/projets/:id/analyse-bail', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const email = String(user.email || '').trim().toLowerCase();
    const sien = (e) => {
      const a = String(e || '').trim().toLowerCase();
      return !!a && !!email && a === email;
    };
    const autorise =
      user.role === 'admin' || (projet.client_emails || []).some(sien) || sien(projet.client_email);
    if (!autorise) return res.status(403).json({ error: 'Accès refusé' });
    const deal = projet.deal_id ? Records.findBy('Deal', 'deal_id', projet.deal_id) : null;
    if (!deal) return ok(res, { disponible: false });
    const { lireGrilleFormatee } = await import('../deal/grilles.js');
    const bail = await lireGrilleFormatee(deal.deal_id, 'bail', { user });
    const quittances = await lireGrilleFormatee(deal.deal_id, 'quittances', { user });
    const sansPieces = (g) => g && { ...g, lignes: g.lignes.map((l) => ({ ...l, preuves: user?.role === 'admin' ? l.preuves : [] })) };
    const clefs = ['echeance', 'loyer_signature', 'depot', 'charges', 'taxes'];
    ok(res, {
      disponible: true,
      essentiel: (bail?.lignes || []).filter((l) => clefs.includes(l.id)).map((l) => ({ id: l.id, libelle: l.libelle, valeur: l.valeur })),
      quittances_essentiel: (quittances?.lignes || []).map((l) => ({ id: l.id, libelle: l.libelle, valeur: l.valeur })),
      bail: sansPieces(bail), quittances: sansPieces(quittances),
    });
  }));

  // Les cases de la page projet (Bien, Locataire, Analyse du bail), chacune
  // avec la pièce et la page qui la prouvent : le client ouvre le bail à
  // l'endroit exact au lieu de demander d'où vient le chiffre.
  app.get('/api/projets/:id/cases', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const { lireCases } = await import('../projet-cases.js');
    ok(res, lireCases(projet));
  }));

  app.get('/api/marche/alex/etat', wrap(async (req, res) => {
    const { etatRechercheMarche } = await import('../alex.js');
    const t = etatRechercheMarche(String(req.query.cle || ''));
    if (!t) return res.status(404).json({ error: 'Recherche inconnue : relancez Alex.' });
    ok(res, t);
  }));

  // Poser une question au marché. Le modèle n'a que les connecteurs pour
  // répondre : chaque chiffre rendu est accompagné de ce qui a été lu.
  app.post('/api/marche/question', wrap(async (req, res) => {
    const { repondre } = await import('../marche/question.js');
    const question = String(req.body?.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Question manquante.' });

    // Le dossier en cours donne le contexte : adresse, surface, activité.
    let contexte = {
      user: currentUser(req),
      historique: req.body?.historique || [],
      // « Rapidité » écarte Equimmox et l'étude d'implantation : l'une prend une
      // minute, l'autre coûte un crédit.
      profondeur: req.body?.profondeur === 'rapide' ? 'rapide' : 'reflexion',
    };
    const dealId = String(req.body?.deal_id || '').trim();
    if (dealId) {
      const deal = Records.findBy('Deal', 'deal_id', dealId);
      const lot = deal?.lots?.[Number(req.body?.index) || 0];
      const a = lot?.lot?.adresse?.valeur;
      if (a) contexte.adresse = [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      const s = Number(lot?.lot?.surface_m2?.valeur);
      if (s > 0) contexte.surface = s;
      contexte.activite = lot?.lot?.locataire_activite?.valeur || null;
    }
    if (req.body?.adresse) contexte.adresse = String(req.body.adresse).trim();

    ok(res, await repondre(question, contexte));
  }));

  // Le journal des lectures de marché : chaque tentative, chaque source, chaque
  // échec. C'est ce qui permet de dire d'où vient un chiffre trois jours après.
  app.get('/api/marche/journal', wrap(async (req, res) => {
    const { journalDuLot } = await import('../marche/journal.js');
    const dealId = String(req.query.deal_id || '').trim();
    if (!dealId) return res.status(400).json({ error: 'deal_id manquant.' });
    const index = Number(req.query.index) || 0;
    const passages = journalDuLot(dealId, index, Math.min(Number(req.query.limite) || 5, 20));
    ok(res, { passages, dernier: passages[0] || null });
  }));

  // Les contours des quartiers d'une commune, pour tracer la carte des prix.
  app.get('/api/figaro/carte', wrap(async (req, res) => {
    const { contoursCommune } = await import('../figaro.js');
    const c = contoursCommune(String(req.query.insee || ''));
    if (!c) return res.status(404).json({ error: 'Carte inconnue : lancez d\'abord la lecture du Figaro.' });
    ok(res, c);
  }));

  // La même lecture pour un projet.
  app.post('/api/projects/:id/figaro/prix', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const { prixResidentiel } = await import('../figaro.js');
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const adresse = String(req.body?.adresse || projet.adresse_complete || '').trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const r = await prixResidentiel(adresse, { forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    Records.update('Project', projet.id, { prix_residentiel: r.resultat });
    ok(res, { resultat: r.resultat });
  }));

  // Les chiffres du secteur d'un projet : agglomération, centre-ville,
  // résidentiel, rue, flux. Lus pour le client comme pour l'équipe ; le calcul
  // tourne en arrière-plan et la page repasse tant que `en_cours` est vrai.
  app.get('/api/projects/:id/secteur', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const { lireSecteur } = await import('../projet-secteur.js');
    ok(res, lireSecteur(projet, { forcer: user.role === 'admin' && req.query.forcer === '1' }));
  }));

  // Les flux et la commercialité : l'étude d'implantation interne. Longue la
  // première fois : jamais lancée sans qu'un membre de l'équipe l'ait demandé.
  app.post('/api/projects/:id/implantation', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    if (!projet.adresse_complete) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche.' });
    const { etudeImplantation } = await import('../implantation/etude.js');
    const r = await etudeImplantation(projet.adresse_complete, { activite: projet.activite_locataire || null });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { lireSecteur, attendreSecteur } = await import('../projet-secteur.js');
    lireSecteur(projet, { forcer: true });
    await attendreSecteur(projet.id);
    ok(res, lireSecteur(projet));
  }));

  // Les mêmes cessions, pour un projet : un projet créé avant que le dossier ne
  // les relève peut les chercher depuis son éditeur.
  app.post('/api/projects/:id/transactions', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const { cessionsAutour: transactionsFonds } = await import('../cessions-fonds.js');
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const adresse = String(req.body?.adresse || projet.adresse_complete || '').trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const r = await transactionsFonds(adresse, { rayon: Number(req.body?.rayon) || 500, forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    Records.update('Project', projet.id, { transactions_fonds: r.resultat });
    ok(res, { resultat: r.resultat });
  }));

  // Où en est la recherche lancée juste avant.
  app.get('/api/equimmox/analyse-loyer/etat', wrap(async (req, res) => {
    const { etatAnalyseLoyer } = await import('../equimmox.js');
    const t = etatAnalyseLoyer(String(req.query.cle || ''));
    if (!t) return res.status(404).json({ error: 'Recherche inconnue : relancez-la.' });
    if (t.etat === 'erreur') return res.status(400).json({ error: t.erreur });
    ok(res, t.etat === 'pret' ? { resultat: t.resultat } : { en_cours: true, cle: t.cle });
  }));

  // La même analyse, sans dossier : une adresse, une surface, trois chiffres.
  app.post('/api/equimmox/analyse-loyer', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const { lancerAnalyseLoyer, analyseLoyerEnCache } = await import('../equimmox.js');
    const adresse = String(req.body?.adresse || '');
    const surface = Number(req.body?.surface) > 0 ? Number(req.body.surface) : null;
    if (!req.body?.forcer) {
      const garde = analyseLoyerEnCache(adresse, surface);
      if (garde) return ok(res, { resultat: garde });
    }
    const t = lancerAnalyseLoyer(adresse, { surface, forcer: !!req.body?.forcer, user: currentUser(req) });
    if (t.etat === 'pret' && t.resultat) return ok(res, { resultat: t.resultat });
    if (t.etat === 'erreur') return res.status(400).json({ error: t.erreur });
    ok(res, { en_cours: true, cle: t.cle });
  }));

  // La même recherche, sans dossier : une adresse, une fourchette.
  app.post('/api/valeur-locative', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const { valeurLocative } = await import('../valeur-locative.js');
    const r = await valeurLocative(String(req.body?.adresse || ''), { forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { resultat: r.resultat });
  }));
}
