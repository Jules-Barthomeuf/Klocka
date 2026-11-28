// Les sources de marché, et ce qu elles disent d un projet.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { currentUser, ok, wrap } from '../contexte.js';
import { adressesDuDossier } from '../acces-entites.js';

/** Monte les routes « equimmox / figaro / marche / projects / projets » sur l'application. */
export function monterMarche(app) {
  // Le panorama Street View d'une adresse, dans sa rue : l'Embed de Google,
  // sur un simple point, s'ouvrait parfois sur la rue voisine.
  app.get('/api/streetview/panorama', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const { panoramaDeLaRue, panoramaDeAdresse } = await import('../alx/streetview.js');
    // L'adresse en texte d'abord : la BAN et Google croisés. Rien trouvé : on
    // le dit (point null), on ne renvoie jamais un autre endroit.
    if (req.query.adresse) {
      const pres = Number.isFinite(Number(req.query.lat)) && Number.isFinite(Number(req.query.lon)) ? { lat: Number(req.query.lat), lon: Number(req.query.lon) } : null;
      const r = await panoramaDeAdresse(String(req.query.adresse).slice(0, 300), { pres }).catch((e) => { console.warn(`[streetview] ${e?.message || e}`); return null; });
      return ok(res, r || { point: null, panorama: null });
    }
    const lat = Number(req.query.lat);
    const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return res.status(400).json({ error: 'Point manquant.' });
    ok(res, { panorama: await panoramaDeLaRue({ lat, lon, rue: req.query.rue ? String(req.query.rue).slice(0, 120) : null }) });
  }));

  // Les jeux immobiliers de la planche (26 nov. 2026) : des rues et des actifs vrais, à l'équipe seule pour l'instant.
  app.get('/api/jeux/:jeu', wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    if (u.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const J = await import('../jeux-immo.js');
    const rues = J.ruesJouables();
    if (req.params.jeu === 'rue') {
      // Loyer d'une boutique et prix des murs au m², en alternance (26 nov. 2026, Jules).
      const n = Math.min(12, Math.max(1, Number(req.query.n) || 10));
      const annonces = await J.annoncesPrixM2();
      return ok(res, { manches: J.manchesAlternees(rues, annonces, n), total: rues.length + annonces.length });
    }
    if (req.params.jeu === 'attente') {
      // La partie que le service worker garde pour l'écran d'attente, avec la clé de l'Embed Google (publique, bornée
      // aux domaines de Klocka) : quand l'écran s'affiche, Klocka ne peut plus la donner.
      res.set('Cache-Control', 'no-store');
      return ok(res, { le: new Date().toISOString(), cle_maps: process.env.VITE_GOOGLE_MAPS_API_KEY || '', manches: await J.partiePourAttente(12) });
    }
    if (req.params.jeu === 'classement') {
      // Le classement de La rue (27 nov. 2026, Jules) : les dix meilleures parties, et celle qu'on vient de finir
      // (?partie=) même plus bas. Chaque partie a sa ligne : une personne peut y être deux fois.
      const { prenomDe, photoDe } = await import('../prospection/agent-ia.js');
      const tout = J.classement(Records.list(J.SCORE).filter((s) => s.jeu === 'rue'));
      const qui = new Map();
      const ligne = (s) => {
        if (!qui.has(s.par)) qui.set(s.par, { prenom: prenomDe(s.par), photo: photoDe(Records.findBy('User', 'email', s.par) || { email: s.par }) });
        return { id: s.id, rang: s.rang, points: s.points, sur: s.sur, le: s.le, moi: s.par === String(u.email).toLowerCase(), ...qui.get(s.par) };
      };
      const haut = tout.slice(0, 10);
      const partie = req.query.partie ? tout.find((s) => s.id === String(req.query.partie)) : null;
      return ok(res, { lignes: haut.map(ligne), partie: partie && partie.rang > 10 ? ligne(partie) : null, total: tout.length });
    }
    if (req.params.jeu === 'classer') return ok(res, { rues: J.quatreRues(rues) });
    if (req.params.jeu === 'rendement') {
      const annonces = await J.annoncesRendement();
      const n = Math.min(12, Math.max(1, Number(req.query.n) || 8));
      return ok(res, { annonces: annonces.map((a) => [Math.random(), a]).sort((x, y) => x[0] - y[0]).slice(0, n).map((x) => x[1]), total: annonces.length });
    }
    if (req.params.jeu === 'duel') {
      const actifs = J.actifsJouables({ rues });
      const verdicts = Records.list(J.VERDICT);
      const valides = verdicts.filter((v) => v.etat === 'valide').length;
      const aVerifier = J.pairesAVerifier(actifs, verdicts);
      // À vérifier : la paire la plus serrée pas encore tranchée, avec la proposition de la règle.
      if (req.query.mode === 'verifier') return ok(res, { actifs: aVerifier[0] || [], reste: aVerifier.length, valides, total: actifs.length });
      // Jouer : seulement une paire tranchée par l'équipe ; sa réponse est le choix de l'équipe.
      const p = J.pairePourJouer(actifs, verdicts);
      return ok(res, { actifs: p?.actifs || [], verdict: p?.verdict || null, reste: aVerifier.length, valides, total: actifs.length });
    }
    if (req.params.jeu === 'verdicts') {
      const par = new Map(J.actifsJouables({ rues }).map((a) => [String(a.id), a]));
      const nom = (id) => par.get(String(id))?.titre || 'Dossier retiré';
      return ok(res, { verdicts: Records.list(J.VERDICT).sort((a, b) => String(b.le).localeCompare(String(a.le))).map((v) => ({ ...v, a_nom: nom(v.a_id), b_nom: nom(v.b_id), choix_nom: v.choix ? nom(v.choix) : null })) });
    }
    res.status(404).json({ error: 'Jeu inconnu.' });
  }));

  // Une partie de La rue terminée, pour le classement (27 nov. 2026).
  app.post('/api/jeux/score', wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    if (u.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const J = await import('../jeux-immo.js');
    const r = J.garderScore(req.body || {}, u.email);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { id: r.score.id });
  }));

  // Le verdict de l'équipe sur une paire d'actifs (ou l'écarter), et le retirer.
  app.post('/api/jeux/duel/verdict', wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    if (u.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const J = await import('../jeux-immo.js');
    const r = J.trancherPaire(req.body || {}, u.email);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.delete('/api/jeux/duel/verdict/:id', wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Not authenticated' });
    if (u.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const J = await import('../jeux-immo.js');
    if (!Records.get(J.VERDICT, req.params.id)) return res.status(404).json({ error: 'Verdict introuvable.' });
    Records.delete(J.VERDICT, req.params.id);
    ok(res, { ok: true });
  }));

  // La photo d'un commerce, celle de sa fiche Google, en tête des fiches (31 oct. 2026, à la place de Street View).
  app.get('/api/commerce/photo', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const { photoDuCommerce, lienMaps } = await import('../photo-commerce.js');
    const pres = Number.isFinite(Number(req.query.lat)) && Number.isFinite(Number(req.query.lon)) && req.query.lat !== '' ? { lat: Number(req.query.lat), lon: Number(req.query.lon) } : null;
    const demande = { placeId: req.query.place_id ? String(req.query.place_id).slice(0, 200) : null, nom: String(req.query.nom || '').slice(0, 200), adresse: String(req.query.adresse || '').slice(0, 300), pres };
    const r = await photoDuCommerce(demande).catch((e) => { console.warn(`[photo-commerce] ${e?.message || e}`); return { url: null, auteur: null, auteur_lien: null, maps: lienMaps(demande) }; });
    ok(res, r);
  }));

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
    // Sa propre adresse, et celle du titulaire pour un membre d'une famille.
    const siennes = adressesDuDossier(user);
    const sien = (e) => {
      const a = String(e || '').trim().toLowerCase();
      return !!a && siennes.includes(a);
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
  // L'éditeur de projet enregistre chaque retouche seule, champ par champ (14 oct. 2026) :
  // il n'envoie que ce qu'il change, pour ne pas écraser ce qu'AK vient d'écrire.
  app.patch('/api/projets/:id/champs', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const changements = Array.isArray(req.body?.changements) ? req.body.changements
      : Object.entries(req.body?.champs || {}).map(([champ, valeur]) => ({ champ, valeur }));
    const r = (await import('../projet-edition.js')).modifierChamps(req.params.id, changements, { par: user.email, editeur: req.body?.editeur === true });
    if (!r.ok) return res.status(r.error === 'Projet introuvable.' ? 404 : 400).json({ error: r.error });
    ok(res, { projet: r.projet, faits: r.faits });
  }));

  // Les versions d'un projet (14 oct. 2026) : le bouton Enregistrer en pose une ; on les liste et on en restaure une.
  app.get('/api/projets/:id/versions', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    ok(res, { versions: (await import('../projet-versions.js')).versionsDu(req.params.id) });
  }));
  app.post('/api/projets/:id/versions', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const r = (await import('../projet-versions.js')).creerVersion(req.params.id, { par: user.email, nom: req.body?.nom || null });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/projets/:id/versions/:version/restaurer', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const r = (await import('../projet-versions.js')).restaurerVersion(req.params.id, req.params.version, { par: user.email });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Le contexte de la vente, dicté puis mis en forme pour les clients (25 nov. 2026, Jules) : server/contexte-vente.js.
  // Le texte revient à l'éditeur, qui l'enregistre comme tout champ du projet.
  app.post('/api/projets/:id/contexte-vente', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable.' });
    const historique = Array.isArray(req.body?.historique) ? req.body.historique.slice(-10) : [];
    const r = await (await import('../contexte-vente.js')).redigerContexte({ projet, actuel: String(req.body?.actuel ?? projet.contexte_vente ?? ''), demande: req.body?.demande, historique });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Le lien public du projet, accessible sans connexion (25 nov. 2026, Jules) : le voir, le créer, le couper.
  const lienPublic = (methode) => wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    if (!Records.get('Project', req.params.id)) return res.status(404).json({ error: 'Projet introuvable.' });
    const L = await import('../lien-public.js');
    if (methode === 'delete') { L.couperLien(req.params.id, user); return ok(res, { lien: null }); }
    if (methode === 'post') { const r = L.creerLien(req.params.id, user); return ok(res, { lien: L.lienPourEcran(r.lien) }); }
    ok(res, { lien: L.lienPourEcran(L.lienDuProjet(req.params.id)) });
  });
  app.get('/api/projets/:id/lien-public', lienPublic('get'));
  app.post('/api/projets/:id/lien-public', lienPublic('post'));
  app.delete('/api/projets/:id/lien-public', lienPublic('delete'));

  // La parcelle du bien, pour le plan de l'onglet Bien (25 nov. 2026, Jules) : server/parcelle-projet.js. Même accès que
  // les cases : l'équipe, et le client du projet.
  app.get('/api/projets/:id/parcelle', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const r = await (await import('../parcelle-projet.js')).parcelleDuProjet(projet, { forcer: user.role === 'admin' && req.query.relire === '1' });
    ok(res, r.ok ? { plan: r.plan } : { plan: null, erreur: r.error });
  }));

  // La fiche de la société du locataire, pour l'aperçu Pappers de l'onglet Locataire (26 nov. 2026, Jules). Même accès
  // que les cases : l'équipe, et le client du projet.
  app.get('/api/projets/:id/societe-locataire', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const L = await import('../liens-locataire.js');
    let analyse = null;
    if (projet.deal_id) { try { analyse = (await import('../deal/analyse-pieces.js')).lireAnalyse(projet.deal_id); } catch { analyse = null; } }
    const siren = L.sirenDuLocataire(projet, { analyse });
    if (!siren) return ok(res, { siren: null, fiche: null });
    const r = await L.ficheSociete(siren);
    ok(res, { siren, fiche: r.ok ? r.fiche : null, erreur: r.ok ? null : r.error });
  }));


  // Les pages du locataire trouvées d'office (26 nov. 2026, Jules) : la recherche part une fois, à l'ouverture par
  // l'équipe ; le client lit ce qui est gardé (server/liens-locataire.js).
  app.get('/api/projets/:id/liens-trouves', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const r = await (await import('../liens-locataire.js')).liensTrouves(projet, { lancer: user.role === 'admin' });
    ok(res, { liens: r.liens || [], siren: r.siren || null, erreur: r.ok ? null : r.error });
  }));

  // Le résumé des avis Google du locataire (26 nov. 2026, Jules) : lu sur sa fiche Google Maps par l'équipe, gardé
  // sept jours ; le client lit ce qui est gardé (server/liens-locataire.js).
  app.get('/api/projets/:id/avis-google', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const r = await (await import('../liens-locataire.js')).avisGoogle(projet, { lancer: user.role === 'admin' });
    ok(res, { avis: r.ok ? r.avis : null, erreur: r.ok ? null : r.error });
  }));

  // Le rapport Géorisques d'une adresse, pour la carte Géorisques des diagnostics (26 nov. 2026, Jules).
  app.get('/api/marche/georisques', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const { lienGeorisques } = await import('../parcelle-projet.js');
    ok(res, { url: await lienGeorisques(String(req.query.adresse || '').slice(0, 300)) });
  }));

  // Le site et les réseaux du locataire, cherchés d'un clic dans l'éditeur (25 nov. 2026, Jules) : l'éditeur enregistre
  // ce qui revient comme ses autres champs (server/liens-locataire.js).
  app.post('/api/projets/:id/liens-locataire', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable.' });
    const r = await (await import('../liens-locataire.js')).chercherLiens({ ...projet, ...Object.fromEntries(['nom_locataire', 'activite_locataire', 'adresse_complete'].filter((k) => typeof req.body?.projet?.[k] === 'string').map((k) => [k, req.body.projet[k].slice(0, 300)])) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Le mode Sources de l'éditeur : d'où vient chaque chiffre de la page.
  app.get('/api/projets/:id/sources', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe.' });
    const p = Records.get('Project', req.params.id);
    if (!p) return res.status(404).json({ error: 'Projet introuvable.' });
    // Le projet à jour avec ses sources : l'éditeur le relit après un passage d'AK.
    ok(res, { sources: (await import('../projet-sources.js')).sourcesDuProjet(p), projet: p });
  }));

  app.get('/api/projects/:id/secteur', wrap(async (req, res) => {
    const user = currentUser(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { projetVisiblePar } = await import('../acces-entites.js');
    if (user.role !== 'admin' && !projetVisiblePar(user)(projet)) return res.status(403).json({ error: 'Accès refusé' });
    const { lireSecteur, marcheDuProjet } = await import('../projet-secteur.js');
    const admin = user.role === 'admin';
    const fiche = lireSecteur(projet, { forcer: admin && req.query.forcer === '1', forcerLoyer: admin && req.query.relancer_loyer === '1' });
    // Le Marché du dossier (Emplacement, Ville ; Prix et Loyer restent dans l'Analyse, 25 nov. 2026), relu à chaque ouverture : il ne vit pas dans
    // la fiche gardée du secteur, et un outil relancé dans l'Analyse se voit au prochain passage (14 nov. 2026, Jules).
    const { emplacement, ...marche } = marcheDuProjet(projet);
    ok(res, fiche && typeof fiche === 'object' ? { ...fiche, emplacement, marche } : fiche);
  }));

  // Les flux et la commercialité : l'étude d'implantation Data-B (un crédit),
  // l'étude interne en secours. Longue la première fois : jamais lancée sans
  // qu'un membre de l'équipe l'ait demandé.
  app.post('/api/projects/:id/implantation', wrap(async (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    if (!projet.adresse_complete) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche.' });
    const { etudeImplantation } = await import('../sources-marche.js');
    const r = await etudeImplantation(projet.adresse_complete, { activite: projet.activite_locataire || null });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { lireSecteur, attendreSecteur } = await import('../projet-secteur.js');
    lireSecteur(projet, { forcer: true });
    await attendreSecteur(projet.id);
    ok(res, lireSecteur(projet));
  }));

  // La carte des transactions autour d'une adresse (17 nov. 2026, Jules) : les cessions de fonds (BODACC) à 500 m, pour
  // l'onglet Marché de l'analyse et celui du projet (server/carte-transactions.js). Les ventes de murs (DVF) avec ?murs=1,
  // pour l'équipe seulement (24 nov. 2026, Jules : « juste pas pour les clients ») : un autre compte ne les reçoit jamais.
  app.get('/api/carte-transactions', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const adresse = String(req.query.adresse || '').trim();
    if (!adresse) return res.status(400).json({ error: 'Adresse manquante.' });
    const { carteTransactions } = await import('../carte-transactions.js');
    const user = currentUser(req);
    const r = await carteTransactions(adresse, { user, avecMurs: user.role === 'admin' && req.query.murs === '1' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Les arrêts autour d'un bien, pour l'onglet Transports de la carte de l'Emplacement quand sa lecture ne les a pas placés
  // (24 nov. 2026, Jules : « dans Transports, on ne voit rien ») : server/outils/rue.js, arretsAutour.
  app.get('/api/emplacement/arrets', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const lat = Number(req.query.lat); const lon = Number(req.query.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Point manquant.' });
    const { arretsAutour } = await import('../outils/rue.js');
    try { ok(res, await arretsAutour(lat, lon)); } catch (e) { res.status(503).json({ error: e?.message || 'OpenStreetMap ne répond pas.' }); }
  }));

  // Les indicateurs de l'Emplacement, chacun sur 10 (24 nov. 2026, Jules) : la commercialité (pieds d'immeubles
  // commerçants), les locaux vides, les enseignes, le loyer de la rue, les transports. server/outils/indicateurs.js.
  app.get('/api/emplacement/indicateurs', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).json({ error: 'Not authenticated' });
    const adresse = String(req.query.adresse || '').trim();
    if (!adresse) return res.status(400).json({ error: 'Adresse manquante.' });
    const n = (v) => (v === undefined || v === '' ? null : Number(v));
    const taux = n(req.query.taux);
    const { indicateursDeLAdresse } = await import('../outils/indicateurs.js');
    const r = await indicateursDeLAdresse(adresse, { vacance: Number.isFinite(taux) ? { taux, vacants: n(req.query.vacants), tranches: n(req.query.tranches) } : null });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Les mêmes cessions, pour un projet : un projet créé avant que le dossier ne
  // les relève peut les chercher depuis son éditeur.
  app.post('/api/projects/:id/transactions', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' });
    const { cessionsAutour: transactionsFonds } = await import('../sources-marche.js');
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
