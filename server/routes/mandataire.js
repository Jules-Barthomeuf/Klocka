// L'espace mandataire K Partners : le chat, les rappels, l'historique.
// Réservé aux mandataires, et aux admins pour la « Vue Mandataire ». Un
// client n'y entre pas ; un mandataire n'entre nulle part ailleurs dans
// l'arrière-boutique (la garde de l'équipe ne connaît que le rôle admin).

import { ok, wrap, currentUser, upload } from '../contexte.js';

export function monterMandataire(app) {
  const mandataire = (req, res) => {
    const user = currentUser(req);
    if (!['mandataire', 'admin'].includes(user?.role)) { res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }); return null; }
    return user;
  };
  const M = () => import('../mandataire.js');
  const C = () => import('../assistant-conversations.js');
  // Deux historiques : le chat du tableau de bord, et celui de la prospection.
  const espaceDe = (req) => ({ espace: req.query?.espace === 'prospection' ? 'mandataire-prospection' : req.query?.espace === 'affinage' ? 'mandataire-affinage' : 'mandataire' });

  // Le rôle se contrôle avant multer : un compte client n'écrit pas 50 Mo sur
  // le disque pour recevoir un 403 ensuite.
  const roleAvantDepot = (req, res, next) => (['mandataire', 'admin'].includes(currentUser(req)?.role) ? next() : res.status(403).json({ error: 'Réservé aux mandataires K Partners.' }));

  app.post('/api/mandataire/chat', roleAvantDepot, upload.single('fichier'), wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const texte = String(req.body?.texte || '').trim();
    // Une pièce jointe : rangée dans les dépôts, lue (PDF, photo, Word), puis confiée à l'assistant.
    let piece = null;
    if (req.file) {
      const fs = await import('fs');
      const { ingerer } = await import('../deal/ingest.js');
      let lu = '';
      try { lu = (await ingerer({ buffer: fs.readFileSync(req.file.path), filename: req.file.originalname, mimetype: req.file.mimetype })).texte || ''; } catch (e) { console.warn(`[mandataire] pièce illisible : ${e?.message || e}`); }
      piece = { nom: req.file.originalname, url: `/uploads/${req.file.filename}`, chemin: req.file.path, mimetype: req.file.mimetype, texte: lu };
    }
    if (!texte && !piece) return res.status(400).json({ error: 'Rien à traiter.' });
    if (typeof req.body?.historique === 'string') { try { req.body.historique = JSON.parse(req.body.historique); } catch { req.body.historique = []; } }
    // Le chat de la Prospection : même structure, autre moteur (Data Prospective).
    if (req.query.espace === 'prospection') {
      const { discuterProspection } = await import('../mandataire-prospective.js');
      const { mesurer } = await import('../llm-couts.js');
      if (req.query.flux === '1') {
        const { ouvrirFlux } = await import('../flux.js');
        const flux = ouvrirFlux(res);
        try {
          const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () =>
            discuterProspection({ historique: req.body?.historique, texte, user, surEtape: flux.etape }));
          flux.fin(resultat);
        } catch (e) { flux.erreur(e); }
        return;
      }
      const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () =>
        discuterProspection({ historique: req.body?.historique, texte, user }));
      return ok(res, resultat);
    }
    const { discuter } = await M();
    const { mesurer } = await import('../llm-couts.js');
    if (req.query.flux === '1') {
      const { ouvrirFlux } = await import('../flux.js');
      const flux = ouvrirFlux(res);
      // Stop côté client : le serveur arrête d'écrire, au lieu de finir en silence.
      let coupe = false;
      res.on('close', () => { if (!res.writableEnded) coupe = true; });
      try {
        const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () =>
          discuter({ historique: req.body?.historique, texte, user, piece, surEtape: flux.etape, surAction: flux.action, estAnnule: () => coupe, prospection_id: req.body?.prospection_id || null })
        );
        flux.fin(resultat);
      } catch (e) {
        flux.erreur(e);
      }
      return;
    }
    const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () =>
      discuter({ historique: req.body?.historique, texte, user, piece, prospection_id: req.body?.prospection_id || null })
    );
    ok(res, resultat);
  }));

  app.get('/api/mandataire/jour', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    ok(res, await (await M()).tableauDuJour(user));
  }));

  // fait, demain, supprimer (supprimer sert aussi l'« Annuler » du chat).
  app.post('/api/mandataire/rappels/:id/:geste', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = await (await M()).agirSurRappel(req.params.id, req.params.geste, user, req.body || {});
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  const E = () => import('../mandataire-espace.js');
  const R = () => import('../mandataire-recherche.js');
  // Les routes d'administration de l'espace : l'admin seulement, jamais un
  // mandataire — c'est là que vivent les secteurs, les fiches et le lien
  // entre une demande et un client Klocka.
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe Klocka.' }); return null; }
    return user;
  };

  // --- Le secteur et la recherche (mandataire) -----------------------------

  app.get('/api/mandataire/secteur', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { secteurDe, villesDuSecteur } = await E();
    const secteur = secteurDe(user);
    const { anneauxSecteur } = await E();
    ok(res, { secteur: secteur ? { id: secteur.id, nom: secteur.nom, points: secteur.points, polygones: anneauxSecteur(secteur) } : null, villes: secteur ? villesDuSecteur(secteur) : [] });
  }));

  // La recherche, ses étapes dites au fil de l'eau (`surEtape`) : la zone,
  // ce qui a été compris, les villes lues, ce qui a été trouvé.
  async function rechercher(req, user, surEtape = () => {}) {
    const { secteurDe, enregistrerProspection } = await E();
    const { interpreterRecherche, chercherCommerces, criteresDeDemande } = await R();
    surEtape('Lecture de la demande');
    const secteur = secteurDe(user);
    if (!secteur) return { status: 400, error: 'Aucun secteur ne vous est attribué : demandez à Klocka de le tracer.' };

    let criteres = req.body?.criteres && typeof req.body.criteres === 'object' ? req.body.criteres : null;
    let demande = null;
    let mode = 'libre';
    // « Pour le client B » dit au chat : la demande anonymisée qui porte cette référence.
    let demandeId = req.body?.demande_id || null;
    const ref = !criteres && !demandeId ? String(req.body?.phrase || '').match(/\bclient\s+([a-z])(\d*)\b/i) : null;
    if (ref) {
      const { demandesVisibles } = await E();
      const cherchee = `Client ${ref[1].toUpperCase()}${ref[2] || ''}`;
      demandeId = demandesVisibles().find((d) => d.reference === cherchee)?.id || null;
      if (!demandeId) return { status: 404, error: `Je ne connais pas de « ${cherchee} » : ouvrez la page Clients pour voir les références.` };
    }
    if (!criteres && demandeId) {
      const d = criteresDeDemande(String(demandeId));
      if (!d) return { status: 404, error: 'Demande introuvable.' };
      criteres = d.criteres;
      demande = d.demande;
      mode = 'client';
      surEtape(`Demande du ${d.demande.reference} : ${d.demande.type_commerce || 'murs commerciaux'}`);
    }
    if (!criteres) {
      const { mesurer } = await import('../llm-couts.js');
      const { resultat } = await mesurer({ operation: 'mandataire', par: user.email }, () => interpreterRecherche(String(req.body?.phrase || '')));
      criteres = resultat;
    }
    if (req.body?.ville !== undefined) criteres = { ...criteres, ville: req.body.ville || null };
    const compris = [criteres.activite, criteres.emplacement != null ? `emplacement n°${criteres.emplacement === 1.5 ? '1 bis' : criteres.emplacement}` : null].filter(Boolean).join(' · ');
    surEtape(`Compris : ${compris || 'tous les commerces'}`);
    surEtape(`Création de la zone : ${criteres.ville || `secteur ${secteur.nom}`}`);

    let r = chercherCommerces({ secteur, criteres, user });
    if (r.ok) {
      surEtape(`Recherche des commerces dans ${r.villes.length} ville${r.villes.length > 1 ? 's' : ''} parcourue${r.villes.length > 1 ? 's' : ''} par ALX`);
    } else {
      // Pas de ville ALX ici (Lyon, par exemple) : OpenStreetMap prend le relais.
      const { chercherCommercesOsm } = await R();
      if (criteres.emplacement != null) surEtape("L'emplacement n°1 / n°2 n'est connu que dans les villes parcourues par ALX : je cherche sans");
      r = await chercherCommercesOsm({ secteur, criteres, user, surEtape });
      if (!r.ok) return { status: 400, error: r.error, criteres };
    }
    const avecClients = r.resultats.filter((x) => x.correspondances > 0).length;
    surEtape(`${r.total} commerce${r.total > 1 ? 's' : ''} trouvé${r.total > 1 ? 's' : ''}${avecClients ? `, dont ${avecClients} qui répondent à des demandes clients` : ''}`);
    const prospection = enregistrerProspection({ criteres, mode, demande_id: demandeId, trouves: r.total }, user);
    return { status: 200, corps: { criteres, demande, villes: r.villes, resultats: r.resultats, total: r.total, prospection_id: prospection.id, prospection_nom: prospection.nom } };
  }

  app.post('/api/mandataire/recherche', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    if (req.query.flux === '1') {
      const { ouvrirFlux } = await import('../flux.js');
      const flux = ouvrirFlux(res);
      try {
        const r = await rechercher(req, user, flux.etape);
        if (r.error) flux.erreur(r.error); else flux.fin(r.corps);
      } catch (e) {
        flux.erreur(e);
      }
      return;
    }
    const r = await rechercher(req, user);
    if (r.error) return res.status(r.status).json({ error: r.error, criteres: r.criteres });
    ok(res, r.corps);
  }));

  // --- La prospection comme ALX, et les listes -------------------------------
  const L = () => import('../mandataire-lancement.js');
  app.post('/api/mandataire/prospections/lancer', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { lancerProspection } = await L();
    const corps = { phrase: String(req.body?.phrase || ''), demande_ids: Array.isArray(req.body?.demande_ids) ? req.body.demande_ids : [], ville: req.body?.ville || null };
    if (req.query.flux === '1') {
      const { ouvrirFlux } = await import('../flux.js');
      const flux = ouvrirFlux(res);
      try {
        const r = await lancerProspection(corps, user, flux.etape);
        if (!r.ok) flux.erreur(r.error); else flux.fin({ prospection_id: r.prospection.id, prospection_nom: r.prospection.nom, criteres: r.prospection.criteres });
      } catch (e) {
        flux.erreur(e);
      }
      return;
    }
    const r = await lancerProspection(corps, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { prospection_id: r.prospection.id, prospection_nom: r.prospection.nom, criteres: r.prospection.criteres });
  }));

  app.post('/api/mandataire/prospections/:id/affiner', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { affinerProspection } = await L();
    const phrase = String(req.body?.phrase || '').trim();
    if (!phrase) return res.status(400).json({ error: 'Dites ce qu\'il faut changer.' });
    const r = await affinerProspection(req.params.id, phrase, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { prospection: { id: r.prospection.id, nom: r.prospection.nom, criteres: r.prospection.criteres }, changements: r.changements });
  }));
  app.post('/api/mandataire/prospections/:id/lire', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = await (await L()).lireLaSuite(req.params.id, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.get('/api/mandataire/prospections/:id/etat', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = await (await L()).etatProspection(req.params.id, user, { sansRues: req.query.rues === '0' });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/mandataire/listes', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { LIBELLES_STATUT } = await E();
    ok(res, { listes: (await L()).mesListes(user), libelles: LIBELLES_STATUT });
  }));
  app.post('/api/mandataire/listes/exporter', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = await (await L()).exporter(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/mandataire/listes/:id/proprietaires', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await L()).completerProprietairesListe(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
  app.patch('/api/mandataire/listes/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await L()).renommerListe(req.params.id, req.body?.nom, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.delete('/api/mandataire/listes/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await L()).supprimerListe(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // --- Data Prospective : la prospection par la base Data-B -----------------
  const P2 = () => import('../mandataire-prospective.js');
  // La ville demandée doit être du secteur du mandataire : on résout sa
  // commune au point (API Géo) puis on vérifie par codes ou géométrie.
  const villeDansSecteur = async (ville, user) => (await P2()).villeDansSecteurDe(ville, user);
  app.get('/api/mandataire/prospective/metiers', wrap(async (req, res) => {
    if (!mandataire(req, res)) return;
    const { METIERS, FILTRES, SUGGESTION } = await P2();
    ok(res, { metiers: METIERS, filtres: Object.fromEntries(Object.entries(FILTRES).map(([k, v]) => [k, v.valeurs])), suggestion: SUGGESTION });
  }));
  app.get('/api/mandataire/prospective/villes', wrap(async (req, res) => {
    if (!mandataire(req, res)) return;
    ok(res, { villes: await (await P2()).chercherVilles(String(req.query.q || '')) });
  }));
  app.get('/api/mandataire/prospective/rues', wrap(async (req, res) => {
    if (!mandataire(req, res)) return;
    ok(res, { rues: await (await P2()).chercherRues(String(req.query.q || ''), String(req.query.ville || ''), { type_rue: req.query.type_rue || '' }) });
  }));
  app.get('/api/mandataire/prospective', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    ok(res, { prospectives: (await P2()).mesProspectives(user).map((p) => ({ jeton: p.jeton, nom: p.nom, criteres: p.criteres, cree_le: p.cree_le })) });
  }));
  app.post('/api/mandataire/prospective/lancer', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { ville } = req.body || {};
    if (!ville?.valeur) return res.status(400).json({ error: 'Choisissez la ville à prospecter.' });
    const garde = await villeDansSecteur(ville, user);
    if (!garde.ok) return res.status(400).json({ error: garde.error });
    const r = await (await P2()).lancerProspective(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { jeton: r.prospective.jeton, nom: r.prospective.nom });
  }));
  app.get('/api/mandataire/prospective/:jeton/resultats', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = await (await P2()).resultats(req.params.jeton, { page: Number(req.query.page) || 1, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  // L'export : les lignes cochées deviennent des fiches propriétaires dans une
  // liste, comme depuis une prospection ALX. Déduplication par SIRET.
  app.post('/api/mandataire/prospective/:jeton/exporter', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { Records } = await import('../db.js');
    const { liste_id = null, nom = null, lignes = [] } = req.body || {};
    if (!Array.isArray(lignes) || !lignes.length) return res.status(400).json({ error: 'Cochez au moins un commerce.' });
    const { creerProprietaire } = await E();
    let liste = liste_id ? Records.get('ListeMandataire', liste_id) : null;
    if (liste_id && (!liste || liste.mandataire_email !== user.email.toLowerCase())) return res.status(404).json({ error: 'Liste introuvable.' });
    if (!liste) {
      if (!String(nom || '').trim()) return res.status(400).json({ error: 'Donnez un nom à la liste.' });
      liste = Records.create('ListeMandataire', { mandataire_email: user.email.toLowerCase(), nom: String(nom).trim().slice(0, 80), cree_le: new Date().toISOString() });
    }
    const miens = Records.list('ProprietaireMandataire').filter((p) => p.mandataire_email === user.email.toLowerCase());
    let ajoutes = 0;
    const refuses = [];
    for (const l of lignes) {
      if (l.siret && miens.some((p) => p.datab_siret === l.siret && p.statut !== 'pas_vendeur')) { refuses.push(`${l.enseigne || l.nom} : déjà dans vos fiches`); continue; }
      const r = creerProprietaire({
        nom: null,
        commerce: l.enseigne || l.nom || null,
        activite: l.societe || null,
        ville: l.ville || null,
        adresse: l.adresse || null,
        telephone: l.telephone || null,
        email: l.emails?.[0] || null,
      }, user);
      if (!r.ok) { refuses.push(`${l.enseigne || l.nom} : ${r.error}`); continue; }
      Records.update('ProprietaireMandataire', r.proprietaire.id, {
        liste_id: liste.id,
        datab_siret: l.siret || null,
        datab: { type_rue: l.type_rue_mot || null, solvabilite: l.solvabilite || null, effectif: l.effectif || null, independant: !!l.independant, creation: l.creation || null, site: l.site || null, lat: l.lat ?? null, lon: l.lon ?? null },
        ...(l.telephone ? { telephone_source: 'Data-B · Prospective' } : {}),
      });
      ajoutes += 1;
    }
    ok(res, { liste: { id: liste.id, nom: liste.nom }, ajoutes, refuses });
  }));

  app.get('/api/mandataire/prospections', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { mesProspections, mesProprietaires, avancementProspection } = await E();
    const fiches = mesProprietaires(user);
    ok(res, {
      prospections: mesProspections(user).map((p) => ({
        id: p.id, nom: p.nom, criteres: p.criteres, mode: p.mode, demande_id: p.demande_id || null,
        cree_le: p.cree_le, trouves: p.trouves || 0, ...avancementProspection(p, fiches),
      })),
    });
  }));

  // --- Les demandes clients, anonymisées, et leurs correspondances ---------

  app.get('/api/mandataire/demandes', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { demandesVisibles, secteurDe, villesDuSecteur, correspond, mesProprietaires, synchroniserSiVieux } = await E();
    await synchroniserSiVieux();
    const { Records } = await import('../db.js');
    const secteur = secteurDe(user);
    const villes = secteur ? villesDuSecteur(secteur) : [];
    const cibles = villes.flatMap((v) => Records.filter('Cible', { ville_id: v.id }).map((c) => ({ ...c, ville: v.nom })));
    const miens = mesProprietaires(user);
    const mesCibles = new Set(miens.map((p) => p.cible_id).filter(Boolean));
    ok(res, {
      demandes: demandesVisibles().map((d) => ({
        ...d,
        ...(() => {
          const ok = cibles.filter((c) => !c.activite_exclue && c.pile !== 'ecartee' && correspond(c, d));
          const dansMaListe = ok.filter((c) => mesCibles.has(c.id)).length;
          return { commerces_du_secteur: ok.length, dans_ma_liste: dansMaListe, a_prospecter: ok.length - dansMaListe };
        })(),
        mes_fiches: miens.filter((p) => correspond({ activite: p.activite, enseigne: p.commerce, ville: p.ville }, d)).length,
      })),
    });
  }));

  // --- Les propriétaires ---------------------------------------------------

  app.get('/api/mandataire/proprietaires', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { mesProprietaires, LIBELLES_STATUT } = await E();
    ok(res, { proprietaires: mesProprietaires(user).sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || ''))), libelles: LIBELLES_STATUT });
  }));

  app.post('/api/mandataire/proprietaires', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { creerProprietaire } = await E();
    const { Records } = await import('../db.js');
    let champs = req.body || {};
    // Depuis un résultat de recherche : la fiche naît de la cible.
    if (String(champs.cible_id || '').startsWith('osm:')) {
      // Un commerce trouvé dans OpenStreetMap : pas de fiche ALX, la page envoie ce qu'elle a.
      champs = {
        cible_id: String(champs.cible_id), prospection_id: champs.prospection_id || null,
        nom: null, commerce: champs.commerce || null, activite: champs.activite || null,
        ville: champs.ville || null, adresse: champs.adresse || null, telephone: champs.telephone_commerce || null,
      };
    } else if (champs.cible_id) {
      const c = Records.get('Cible', String(champs.cible_id));
      if (!c) return res.status(404).json({ error: 'Commerce introuvable.' });
      champs = {
        cible_id: c.id, prospection_id: champs.prospection_id || null,
        nom: c.proprietaire?.nom || null, commerce: c.enseigne || c.activite || null,
        activite: c.activite || null, ville: c.ville || null, adresse: c.adresse || null,
      };
    }
    const r = creerProprietaire(champs, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const { pousserProspect } = await import('../mandataire-monday.js');
    ok(res, { ...r, monday: await pousserProspect(r.proprietaire) });
  }));

  app.post('/api/mandataire/proprietaires/:id/statut', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { noterResultat } = await E();
    const r = noterResultat(req.params.id, { statut: String(req.body?.statut || ''), texte: req.body?.note || null, rappel_dans_jours: req.body?.rappel_dans_jours || null }, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // L'appel d'un propriétaire, enregistré ou raconté : transcrit, lu, la
  // fiche mise à jour — le panneau d'appel de la Prospection, côté mandataire.
  app.post('/api/mandataire/proprietaires/:id/appel', roleAvantDepot, upload.single('audio'), wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const fs = await import('fs');
    const { lireAppelProprietaire } = await import('../mandataire-appel.js');
    const r = await lireAppelProprietaire(req.params.id, {
      audio: req.file ? fs.readFileSync(req.file.path) : null,
      recit: req.body?.recit || null,
      sans_reponse: req.body?.sans_reponse === 'true' || req.body?.sans_reponse === true,
    }, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/mandataire/proprietaires/:id/sans-reponse', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { noterSansReponse } = await E();
    const r = noterSansReponse(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/mandataire/proprietaires/:id/note', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { noterNote } = await E();
    const r = noterNote(req.params.id, req.body?.texte, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.patch('/api/mandataire/proprietaires/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await E()).modifierProprietaire(req.params.id, req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.delete('/api/mandataire/proprietaires/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const { supprimerProprietaire } = await E();
    const r = supprimerProprietaire(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // --- L'administration : secteurs, mandataires, demandes ------------------

  app.get('/api/mandataire/admin/secteurs', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerSecteurs, villesDuSecteur } = await E();
    const { anneauxSecteur } = await E();
    ok(res, { secteurs: listerSecteurs().map((s) => ({ ...s, polygones: anneauxSecteur(s), villes: villesDuSecteur(s).map((v) => v.nom) })) });
  }));

  app.post('/api/mandataire/admin/secteurs', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { poserSecteur } = await E();
    const r = poserSecteur(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/mandataire/admin/secteurs/:id/mandataire', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { attribuerSecteur } = await E();
    const r = attribuerSecteur(req.params.id, req.body?.mandataire_email || null, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Tracer par le découpage officiel : régions, départements, communes.
  const G = () => import('../mandataire-geo.js');
  app.get('/api/mandataire/admin/decoupage/:niveau', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerUnites, chercherCommunes } = await G();
    try {
      if (req.params.niveau === 'commune') return ok(res, { unites: await chercherCommunes(req.query.q) });
      ok(res, { unites: await listerUnites(req.params.niveau) });
    } catch (e) {
      res.status(502).json({ error: `Découpage indisponible : ${e?.message || e}` });
    }
  }));

  app.get('/api/mandataire/admin/contours/:niveau', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { contoursDe } = await G();
    const codes = String(req.query.codes || '').split(',').map((c) => c.trim()).filter(Boolean).slice(0, 60);
    try {
      ok(res, { contours: await contoursDe(req.params.niveau, codes) });
    } catch (e) {
      res.status(502).json({ error: `Contours indisponibles : ${e?.message || e}` });
    }
  }));

  app.delete('/api/mandataire/admin/secteurs/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { supprimerSecteur } = await E();
    const r = supprimerSecteur(req.params.id, user);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Un admin se met aussi mandataire (ou s'en retire) : les rôles se cumulent.
  app.post('/api/mandataire/admin/moi', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { cumulerMandataire } = await E();
    const r = cumulerMandataire(user, req.body?.actif !== false);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/mandataire/admin/mandataires', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerMandataires } = await E();
    ok(res, { mandataires: listerMandataires() });
  }));

  app.post('/api/mandataire/admin/mandataires/:email', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { poserFicheMandataire } = await E();
    const r = poserFicheMandataire(req.params.email, req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/mandataire/admin/demandes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listerDemandesAdmin, synchroniserSiVieux, derniereSynchro } = await E();
    await synchroniserSiVieux();
    ok(res, { demandes: listerDemandesAdmin(), synchro: derniereSynchro() });
  }));

  app.post('/api/mandataire/admin/demandes/synchroniser', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { synchroniserDemandesMonday } = await E();
    try {
      ok(res, await synchroniserDemandesMonday({ user }));
    } catch (e) {
      res.status(502).json({ error: `Monday n'a pas répondu : ${e?.message || e}` });
    }
  }));

  app.post('/api/mandataire/admin/demandes', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { poserDemande } = await E();
    const r = poserDemande(req.body || {}, user);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/mandataire/admin/demandes/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { supprimerDemande } = await E();
    const r = supprimerDemande(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/mandataire/admin/prospections', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { avancementProspection } = await E();
    const { Records } = await import('../db.js');
    const fiches = Records.list('ProprietaireMandataire');
    ok(res, {
      prospections: Records.list('ProspectionMandataire')
        .sort((a, b) => String(b.cree_le || '').localeCompare(String(a.cree_le || '')))
        .map((p) => ({ id: p.id, nom: p.nom, mandataire: p.mandataire_email, criteres: p.criteres, cree_le: p.cree_le, trouves: p.trouves || 0, ...avancementProspection(p, fiches) })),
    });
  }));

  app.get('/api/mandataire/conversations', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    ok(res, { conversations: (await C()).listerConversations(user, espaceDe(req)) });
  }));
  app.get('/api/mandataire/conversations/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const c = (await C()).lireConversation(user, req.params.id, espaceDe(req));
    if (!c) return res.status(404).json({ error: 'Conversation introuvable.' });
    ok(res, c);
  }));
  app.post('/api/mandataire/conversations', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await C()).enregistrerConversation(user, { id: req.body?.id || null, messages: req.body?.messages || [], ...espaceDe(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));
  app.patch('/api/mandataire/conversations/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await C()).renommerConversation(user, req.params.id, req.body?.titre, espaceDe(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/mandataire/conversations/:id', wrap(async (req, res) => {
    const user = mandataire(req, res);
    if (!user) return;
    const r = (await C()).supprimerConversation(user, req.params.id, espaceDe(req));
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
}
