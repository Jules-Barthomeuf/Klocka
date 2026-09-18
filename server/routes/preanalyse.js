// Les dossiers de préanalyse : le pipeline, de la fiche reçue au dossier de présentation.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { redigerMailIntention, INTENTIONS } from '../deal/mails-cycle.js';
import { changerStatut, statutDe, ajouterSuivi as ajouterSuiviDeal, STATUTS, LIBELLES_STATUTS } from '../deal/lifecycle.js';
import { Records } from '../db.js';
import { ajouterAuReferentiel } from '../deal/enrich.js';
import { ajouterDocument as ajouterDocumentEspace, renommerDocument as renommerDocumentEspace, supprimerDocument as supprimerDocumentEspace, converser, supprimerConversation, renommerConversation, extraireDocuments, supprimerExtraction, renommerExtraction, majLigneExtraction } from '../deal/espace.js';
import { alimenterBaseMarche } from '../deal/marche.js';
import {
  analyserDocument,
  obtenirDossier as obtenirDossierDoc,
  renommerDossier,
} from '../assistant/index.js';
import { analyserFiche, reevaluerLot, listerDossiers, obtenirDossier } from '../deal/index.js';
import { classerDansDrive } from '../google-drive.js';
import { nomDossierDrive } from '../deal/nom-drive.js';
import { creerProjetDepuisDeal, completerAvantProjet } from '../deal/projet.js';
import fs from 'fs';
import path from 'path';
import { syntheseDocuments } from '../deal/synthese-docs.js';
import { UPLOAD_DIR, compteAutorise, currentUser, ok, upload, wrap } from '../contexte.js';

/** Monte les routes « preanalyse » sur l'application. */
export function monterPreanalyse(app) {
  // ---------------------------------------------------------------------------
  // Préanalyse de fiches commerciales
  // ---------------------------------------------------------------------------
  app.post('/api/preanalyse/analyser', upload.single('fichier'), wrap(async (req, res) => {
    const user = currentUser(req);
    // multer a déjà écrit le fichier dans UPLOAD_DIR : on le relit plutôt que
    // d'en archiver une seconde copie.
    const dossier = await analyserFiche(
      {
        buffer: req.file ? fs.readFileSync(req.file.path) : null,
        filename: req.file?.originalname,
        mimetype: req.file?.mimetype,
        texte: req.body?.texte,
        sourceUrl: req.file ? `/uploads/${req.file.filename}` : null,
      },
      { user, dealId: req.body?.deal_id || null }
    );
    ok(res, dossier);
  }));

  app.get('/api/preanalyse/dossiers', wrap((req, res) => ok(res, listerDossiers())));

  // Mode test : crée un deal fictif réel (statut 'analyse') pour parcourir tout
  // le cycle sans appel API — mails simulés, documents fictifs, marché intact.
  app.post('/api/preanalyse/test', wrap(async (req, res) => {
    const { creerDealTest } = await import('../deal/test.js');
    ok(res, creerDealTest(currentUser(req)));
  }));

  // Simule la réception + l'extraction des documents d'un deal de test.
  app.post('/api/preanalyse/dossiers/:dealId/documents/simuler', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { simulerDocumentsTest } = await import('../deal/test.js');
    const r = simulerDocumentsTest(dossier, currentUser(req));
    if (r.error) return res.status(400).json(r);
    ok(res, r);
  }));

  // Suppression — réservée aux deals de test (nettoyage après le parcours).
  app.delete('/api/preanalyse/dossiers/:dealId', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { supprimerDealTest } = await import('../deal/test.js');
    const r = supprimerDealTest(dossier);
    if (r.error) return res.status(403).json(r);
    ok(res, r);
  }));

  app.get('/api/preanalyse/dossiers/:dealId', wrap((req, res) => {
    const d = obtenirDossier(req.params.dealId);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, d);
  }));

  // Les chiffres du simulateur, enregistrés sur le lot pour y revenir.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/simulateur', wrap(async (req, res) => {
    const { enregistrerSimulateur } = await import('../deal/index.js');
    const r = await enregistrerSimulateur(req.params.dealId, Number(req.params.index), req.body || {}, currentUser(req));
    if (r.error) return res.status(404).json(r);
    ok(res, r);
  }));

  // Un critère vérifié à la main : vert quand c'est contrôlé, jaune en cas de doute.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/verification', wrap(async (req, res) => {
    const { verifierCritere } = await import('../deal/index.js');
    const r = verifierCritere(req.params.dealId, Number(req.params.index), String(req.body?.cle || ''), req.body?.statut || null, currentUser(req));
    if (r.error) return res.status(400).json(r);
    ok(res, r);
  }));

  // Saisie humaine (emplacement, prix négocié) : rejoue les blocs déterministes.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index', wrap(async (req, res) => {
    const r = await reevaluerLot(req.params.dealId, Number(req.params.index), req.body || {});
    if (r.error) return res.status(404).json(r);
    ok(res, r);
  }));

  // Valide une enseigne qualifiée par l'IA et l'inscrit au référentiel.
  app.post('/api/preanalyse/enseignes', wrap((req, res) => {
    ok(res, ajouterAuReferentiel(req.body || {}));
  }));

  // Vue pipeline : tous les dossiers avec statut + compteurs par étape.
  // Création d'un dossier nommé, avant toute analyse : une coquille qui porte
  // le nom et les responsables ; l'analyse de la fiche la remplira (étape 2).
  app.post('/api/preanalyse/dossiers', wrap(async (req, res) => {
    const user = currentUser(req);
    const nom = String(req.body?.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Donnez un nom au dossier.' });
    const { creerCoquille } = await import('../deal/index.js');
    ok(res, creerCoquille({
      nom,
      responsables: Array.isArray(req.body?.responsables) ? req.body.responsables : [],
      user,
    }));
  }));

  // Renommer un dossier.
  app.post('/api/preanalyse/dossiers/:dealId/renommer', wrap((req, res) => {
    const brut = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
    const nom = String(req.body?.nom || '').trim();
    if (!nom) return res.status(400).json({ error: 'Le nom ne peut pas être vide.' });
    Records.update('Deal', brut.id, { nom });
    ajouterSuiviDeal(Records.get('Deal', brut.id), { type: 'renommage', detail: `Renommé : ${nom}` }, currentUser(req));
    ok(res, { nom });
  }));

  // Abandonner un dossier directement depuis la liste (sans mail).
  app.post('/api/preanalyse/dossiers/:dealId/abandonner', wrap((req, res) => {
    const brut = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
    const r = changerStatut(brut, 'abandonne', { user: currentUser(req), note: req.body?.note || 'Abandon depuis la liste' });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { statut: 'abandonne' });
  }));

  // ---------------------------------------------------------------------------
  // Espace de travail d'un dossier : documents importés et conversations (chat
  // libre ou analyses sur documents cochés). Voir deal/espace.js.
  // ---------------------------------------------------------------------------
  app.post('/api/preanalyse/dossiers/:dealId/espace/documents', upload.single('fichier'), wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });
    const user = currentUser(req);
    const r = ajouterDocumentEspace(req.params.dealId, {
      nom: req.body?.nom || req.file.originalname,
      url: `/uploads/${req.file.filename}`,
      mime: req.file.mimetype,
      taille: req.file.size,
    }, user);
    if (!r.ok) return res.status(404).json({ error: r.error });

    // L'extraction part tout seul, en tâche de fond : la réponse n'attend
    // pas l'analyse, et personne ne reste devant l'écran.
    const { enfiler } = await import('../deal/file-extraction.js');
    enfiler(req.params.dealId, [r.document.id], { uploadDir: UPLOAD_DIR, user });
    ok(res, r.document);
  }));

  // Le texte d'une page d'une pièce, lu à la demande : c'est lui qu'on surligne
  // dans le tiroir des sources. Une pièce sans couche texte rend une page vide.
  app.get('/api/preanalyse/dossiers/:dealId/espace/documents/:docId/page/:n', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { chargerPieces } = await import('../deal/espace.js');
    const piece = chargerPieces(dossier, [req.params.docId], UPLOAD_DIR, true)[0];
    if (!piece || !piece.buffer) return res.status(404).json({ error: 'Pièce introuvable' });
    const n = Math.max(1, Number(req.params.n) || 1);
    if (piece.mimetype !== 'application/pdf') {
      const { ingerer } = await import('../deal/ingest.js');
      const lu = await ingerer({ buffer: piece.buffer, filename: piece.nom, mimetype: piece.mimetype }).catch(() => null);
      return ok(res, { page: 1, total: 1, texte: lu?.texte || '', scanne: !!lu?.transcrit });
    }
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(piece.buffer) });
    try {
      const r = await parser.getText();
      const pages = r.pages || [];
      const page = pages[n - 1];
      ok(res, { page: n, total: pages.length, texte: String(page?.text || '').replace(/\r\n?/g, '\n').replace(/[ \t\u00a0]+/g, ' ').trim() });
    } finally {
      await parser.destroy().catch(() => {});
    }
  }));

  app.post('/api/preanalyse/dossiers/:dealId/espace/documents/:docId/renommer', wrap((req, res) => {
    const r = renommerDocumentEspace(req.params.dealId, req.params.docId, req.body?.nom, req.body?.categorie);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/preanalyse/dossiers/:dealId/espace/documents/:docId', wrap((req, res) => {
    const r = supprimerDocumentEspace(req.params.dealId, req.params.docId, UPLOAD_DIR);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/espace/chat', wrap(async (req, res) => {
    const { message, mode, documents, conversation_id, profondeur } = req.body || {};
    // Le client a raccroché avant la réponse : on arrête l'appel au modèle.
    // On écoute la RÉPONSE, pas la requête : depuis Node 16, `req` émet `close`
    // dès que son corps est lu, donc avant le travail — et l'on coupait son
    // propre appel. `res` n'émet `close` qu'à la fermeture de la connexion, ou
    // une fois la réponse finie : d'où le test sur `writableEnded`.
    const arret = new AbortController();
    res.on('close', () => { if (!res.writableEnded) arret.abort(); });
    const r = await converser(req.params.dealId, {
      signal: arret.signal,
      message,
      mode: ['analyse', 'verification', 'web'].includes(mode) ? mode : 'question',
      profondeur: profondeur === 'reflexion' ? 'reflexion' : 'rapide',
      documents: Array.isArray(documents) ? documents : [],
      conversationId: conversation_id || null,
      uploadDir: UPLOAD_DIR,
      user: currentUser(req),
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r.conversation);
  }));

  // Extraction : chaque document coché devient une table de données sourcées
  // (libellé, valeur, page, citation), consultable en onglets sous le chat.
  app.post('/api/preanalyse/dossiers/:dealId/espace/extraire', wrap(async (req, res) => {
    const r = await extraireDocuments(req.params.dealId, {
      documents: Array.isArray(req.body?.documents) ? req.body.documents : [],
      uploadDir: UPLOAD_DIR,
      user: currentUser(req),
    });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r.extractions);
  }));

  // Correction manuelle d'une ligne : constat, statut ou commentaire.
  app.post('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId/lignes/:index', wrap((req, res) => {
    const r = majLigneExtraction(req.params.dealId, req.params.extId, Number(req.params.index), req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // La grille de lecture, pour que le front propose les mêmes statuts.
  app.get('/api/preanalyse/grille', wrap(async (req, res) => {
    const { GRILLE, STATUTS_LIGNE } = await import('../deal/grille.js');
    ok(res, { grille: GRILLE, statuts: STATUTS_LIGNE });
  }));

  // L'onglet d'une analyse porte un titre libre, à défaut sa catégorie.
  app.post('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId/renommer', wrap((req, res) => {
    const r = renommerExtraction(req.params.dealId, req.params.extId, req.body?.titre);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/preanalyse/dossiers/:dealId/espace/extractions/:extId', wrap((req, res) => {
    const r = supprimerExtraction(req.params.dealId, req.params.extId);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/espace/conversations/:convId/renommer', wrap((req, res) => {
    const r = renommerConversation(req.params.dealId, req.params.convId, req.body?.titre);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.delete('/api/preanalyse/dossiers/:dealId/espace/conversations/:convId', wrap((req, res) => {
    const r = supprimerConversation(req.params.dealId, req.params.convId);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // Descripteur des étapes d'un dossier : le front consomme la même source que
  // le serveur au lieu de la réécrire.
  app.get('/api/preanalyse/etapes', wrap(async (req, res) => {
    const { ETAPES } = await import('../deal/etapes.js');
    ok(res, { etapes: ETAPES });
  }));

  // Déblocage explicite : « passer à l'étape suivante ». L'étape atteinte ne
  // recule jamais ; on ne peut débloquer que l'étape immédiatement suivante.
  app.post('/api/preanalyse/dossiers/:dealId/etape-suivante', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { ETAPES, etapeMax } = await import('../deal/etapes.js');
    const brut = Records.findBy('Deal', 'deal_id', req.params.dealId);
    const courante = etapeMax(brut);
    // Une étape cible peut être demandée : y aller valide toutes les
    // précédentes d'un coup. Sans cible, on avance d'un cran. Jamais en arrière.
    const cible = Number(req.body?.etape);
    const suivante = Math.min(ETAPES.length, Math.max(courante, isFinite(cible) && cible > 0 ? cible : courante + 1));
    if (suivante <= courante) return ok(res, { etape_max: courante });
    Records.update('Deal', brut.id, { etape_max: suivante });
    const user = currentUser(req);
    ajouterSuiviDeal(Records.get('Deal', brut.id), {
      type: 'etape',
      detail: `Étape débloquée : ${ETAPES[suivante - 1].label}`,
    }, user);
    ok(res, { etape_max: suivante });
  }));

  // Revenir à une étape antérieure : le dossier redevient modifiable à partir
  // de là (le mail se rouvre, la pré-analyse se refait). Les données déjà
  // produites — lots, documents, conversations — ne sont jamais effacées.
  app.post('/api/preanalyse/dossiers/:dealId/revenir', wrap(async (req, res) => {
    const brut = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!brut) return res.status(404).json({ error: 'Dossier introuvable' });
    const { ETAPES } = await import('../deal/etapes.js');
    const demandee = Number(req.body?.etape);
    const cible = Math.min(ETAPES.length, Math.max(1, isFinite(demandee) && demandee > 0 ? demandee : 1));
    Records.update('Deal', brut.id, { etape_max: cible });
    ajouterSuiviDeal(Records.get('Deal', brut.id), {
      type: 'etape',
      detail: `Retour à l'étape ${cible} — ${ETAPES[cible - 1].label}`,
    }, currentUser(req));
    ok(res, { etape_max: cible });
  }));

  app.get('/api/preanalyse/pipeline', wrap((req, res) => {
    const dossiers = listerDossiers(200);
    const compteurs = {};
    for (const s of STATUTS) compteurs[s] = 0;
    let aRelancerTotal = 0;
    for (const d of dossiers) {
      compteurs[d.statut] = (compteurs[d.statut] || 0) + 1;
      if (d.a_relancer) aRelancerTotal++;
    }
    ok(res, { dossiers, compteurs, a_relancer: aRelancerTotal, libelles: LIBELLES_STATUTS });
  }));

  // Brouillon de mail d'intention (refus, demande de documents, relance,
  // abandon, présentation client). Rien n'est envoyé ici.
  app.post('/api/preanalyse/dossiers/:dealId/mail', wrap(async (req, res) => {
    const { intention, lot_index = 0, raisons } = req.body || {};
    if (!INTENTIONS.includes(intention)) {
      return res.status(400).json({ error: `Intention inconnue : ${intention}` });
    }
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { lotOuVide } = await import('../deal/index.js');
    const lot = lotOuVide(dossier, lot_index);

    const user = currentUser(req);
    const { engagementsOuverts } = await import('../deal/engagements.js');
    const mail = await redigerMailIntention(lot, intention, {
      signature: user?.full_name || user?.email,
      raisons,
      // Deal de test : texte de secours directement, aucun appel LLM.
      sansIA: !!dossier.test,
      // La relance sait ce que le registre attend — elle cite ses faits.
      engagements: engagementsOuverts(req.params.dealId),
    });
    ok(res, { ...mail, intention, destinataire: dossier.contact_agent_email || '' });
  }));

  // Dépôt d'un document sur le deal : extraction via le pipeline Alexis,
  // liaison Deal ↔ DossierDoc, avancement du statut et synthèse recalculée.
  app.post('/api/preanalyse/dossiers/:dealId/documents', upload.single('fichier'), wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    if (dossier.test) {
      return res.status(400).json({ error: 'Deal de test : utilisez « Simuler la réception des documents ».' });
    }
    if (!req.file) return res.status(400).json({ error: 'Fichier manquant' });

    const user = currentUser(req);
    const r = await analyserDocument(
      {
        buffer: fs.readFileSync(req.file.path),
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        url: `/uploads/${req.file.filename}`,
      },
      { dossierId: dossier.dossier_doc_id || undefined, typeForce: req.body?.type || undefined, user }
    );

    const patch = {};
    if (!dossier.dossier_doc_id) {
      patch.dossier_doc_id = r.dossier_id;
      // Le dossier documentaire porte le titre du deal pour s'y retrouver.
      const titre = dossier.lots?.[0]?.synthese?.titre;
      if (titre) renommerDossier(r.dossier_id, titre);
    }

    // La synthèse « points à vérifier » est recalculée à chaque dépôt.
    const dossierDoc = obtenirDossierDoc(r.dossier_id);
    const synthese = await syntheseDocuments(dossier.lots?.[0], dossierDoc);
    if (synthese) patch.synthese_documents = synthese;
    if (Object.keys(patch).length) Records.update('Deal', dossier.id, patch);

    // Avancement : demandes → reçus → extrait (les transitions invalides sont
    // ignorées, un dépôt sur un deal déjà extrait ne change rien).
    const enrichi = { ...dossier, ...patch };
    if (statutDe(enrichi) === 'documents_demandes' || statutDe(enrichi) === 'analyse') {
      changerStatut(enrichi, 'documents_recus', { user, note: `Document reçu : ${req.file.originalname}` });
      enrichi.statut = 'documents_recus';
      enrichi.suivi = Records.get('Deal', dossier.id)?.suivi || enrichi.suivi;
    }
    if (statutDe(enrichi) === 'documents_recus') {
      changerStatut(enrichi, 'depouille', { user, note: 'Extraction effectuée' });
    }

    ok(res, { ...r, deal: { deal_id: dossier.deal_id, statut: statutDe(Records.get('Deal', dossier.id)), dossier_doc_id: patch.dossier_doc_id || dossier.dossier_doc_id, synthese_documents: patch.synthese_documents || dossier.synthese_documents } });
  }));

  // Les fichiers du Drive qu'on peut rapatrier : le dossier du deal s'il existe,
  // sinon les documents récents du compte.
  app.get('/api/preanalyse/dossiers/:dealId/drive/fichiers', wrap(async (req, res) => {
    const compte = String(req.query?.compte || '');
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: "Ce compte ne vous appartient pas." });
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { listerFichiers } = await import('../google-drive.js');
    const fichiers = await listerFichiers(compte, {
      dossierId: dossier.drive_folder_id || null,
      recherche: String(req.query?.recherche || '').trim(),
    });
    ok(res, { fichiers, dossier_du_deal: !!dossier.drive_folder_id, folder_url: dossier.drive_folder_url || null });
  }));

  // Rapatrie des fichiers du Drive dans le dossier : mêmes pièces, même
  // extraction en tâche de fond qu'un dépôt manuel.
  app.post('/api/preanalyse/dossiers/:dealId/drive/importer', wrap(async (req, res) => {
    const compte = String(req.body?.compte || '');
    const ids = Array.isArray(req.body?.fichiers) ? req.body.fichiers.slice(0, 40) : [];
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: "Ce compte ne vous appartient pas." });
    if (!ids.length) return res.status(400).json({ error: 'Aucun fichier choisi' });
    const user = currentUser(req);
    const { telechargerFichier } = await import('../google-drive.js');
    const fs = await import('fs');
    const path = await import('path');
    const { randomUUID } = await import('crypto');

    const importes = [];
    const erreurs = [];
    for (const id of ids) {
      try {
        const f = await telechargerFichier(compte, id);
        const nomFichier = `${randomUUID()}${path.extname(f.nom || '') || ''}`;
        fs.writeFileSync(path.join(UPLOAD_DIR, nomFichier), f.buffer);
        const r = ajouterDocumentEspace(req.params.dealId, {
          nom: f.nom, url: `/uploads/${nomFichier}`, mime: f.mime, taille: f.buffer.length,
        }, user);
        if (!r.ok) { erreurs.push(`${f.nom} : ${r.error}`); continue; }
        importes.push(r.document);
      } catch (e) {
        erreurs.push(`${id} : ${e?.message || e}`);
      }
    }
    if (importes.length) {
      const { enfiler } = await import('../deal/file-extraction.js');
      enfiler(req.params.dealId, importes.map((d) => d.id), { uploadDir: UPLOAD_DIR, user });
    }
    ok(res, { importes, erreurs });
  }));

  // Classement des documents du deal dans le Drive du compte connecté.
  app.post('/api/preanalyse/dossiers/:dealId/drive', wrap(async (req, res) => {
    // Deal de test : classement simulé, aucun appel Google.
    const dossierTest = obtenirDossier(req.params.dealId);
    if (dossierTest?.test) {
      ajouterSuiviDeal(dossierTest, { type: 'documents_recus', detail: 'Classement Drive simulé (mode test)' }, currentUser(req));
      return ok(res, {
        simulated: true,
        envoyes: [{ nom: 'bail-commercial.pdf' }, { nom: 'pv-ag-2025.pdf' }, { nom: 'diagnostics.pdf' }],
        erreurs: [],
        folder_url: null,
      });
    }

    const { compte } = req.body || {};
    if (!compte) return res.status(400).json({ error: 'Compte manquant' });
    if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });

    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const fichiers = [];
    // Les documents extraits, plus la fiche commerciale d'origine.
    const dossierDoc = dossier.dossier_doc_id ? obtenirDossierDoc(dossier.dossier_doc_id) : null;
    for (const d of dossierDoc?.documents || []) {
      if (d.url) fichiers.push({ nom: d.nom_fichier, chemin: d.url });
    }
    if (dossier.source?.url) {
      fichiers.push({ nom: dossier.source.nom_fichier || 'fiche-commerciale', chemin: dossier.source.url });
    }
    // Aucun fichier n'empêche rien : le dossier Drive peut être créé en avance,
    // les documents s'y classeront au fil de l'eau.

    const titre = nomDossierDrive(dossier);
    const r = await classerDansDrive(compte, titre, fichiers, UPLOAD_DIR);

    Records.update('Deal', dossier.id, { drive_folder_id: r.folder_id, drive_folder_url: r.folder_url });
    const user = currentUser(req);
    const dealMaj = Records.get('Deal', dossier.id);
    ajouterSuiviDeal(dealMaj, { type: 'documents_recus', detail: `${r.envoyes.length} fichier(s) classé(s) dans le Drive` }, user);
    ok(res, r);
  }));

  // Présentation bancaire du lot : PPTX généré depuis les données du deal,
  // converti en Google Slides (modifiable) quand un compte Drive est fourni.
  // Le PPTX reste téléchargeable dans tous les cas.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/presentation', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const idx = Number(req.params.index) || 0;
    const { lotOuVide } = await import('../deal/index.js');
    const lot = lotOuVide(dossier, idx);

    const { genererPresentationBanque } = await import('../deal/presentation.js');
    const buffer = await genererPresentationBanque(dossier, lot);

    const nomFichier = `presentation-banque-${String(dossier.deal_id).replace(/[^a-zA-Z0-9_-]/g, '_')}-lot${idx}.pptx`;
    const dossierPres = path.join(UPLOAD_DIR, 'presentations');
    fs.mkdirSync(dossierPres, { recursive: true });
    fs.writeFileSync(path.join(dossierPres, nomFichier), buffer);
    const pptx_url = `/uploads/presentations/${nomFichier}`;

    const { compte } = req.body || {};
    let slides_url = null;
    let erreur_slides = null;
    if (compte) {
      if (!compteAutorise(req, compte)) return res.status(403).json({ error: 'Ce compte ne vous appartient pas.' });
      try {
        const { uploaderEnSlides } = await import('../google-drive.js');
        const r = await uploaderEnSlides(compte, {
          nom: `Présentation banque — ${lot.synthese?.titre || dossier.deal_id}`,
          buffer,
        });
        slides_url = r.slides_url;
      } catch (e) {
        erreur_slides = e?.message || String(e);
        console.error('[presentation] conversion Slides impossible :', erreur_slides);
      }
    }

    // On garde la trace sur le lot analysé ; une fiche vide de secours ne s'enregistre pas.
    if (!lot.vide && dossier.lots?.[idx]) {
      const lots = [...dossier.lots];
      lots[idx] = { ...lot, presentation: { slides_url, pptx_url, genere_le: new Date().toISOString() } };
      Records.update('Deal', dossier.id, { lots });
    }

    ok(res, { slides_url, pptx_url, erreur_slides });
  }));

  // Création d'un projet pré-rempli depuis un lot du deal.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/projet', wrap(async (req, res) => {
    const user = currentUser(req);
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    // Documents présents mais jamais extraits : on extrait d'abord, puis on
    // crée le projet avec les données relevées. Entrer le deal dans la plateforme
    // ne demande donc plus d'être passé par l'étape 3 à la main.
    let analyse = null;
    const aDesDocuments = (dossier.documents_espace || []).length > 0;
    if (aDesDocuments && !(dossier.extractions || []).length) {
      const r = await extraireDocuments(req.params.dealId, {
        documents: (dossier.documents_espace || []).map((d) => d.id),
        uploadDir: UPLOAD_DIR,
        user,
      });
      if (!r.ok) return res.status(400).json({ error: r.error });
      analyse = {
        documents: r.extractions.length,
        donnees: r.extractions.reduce((n, e) => n + (e.lignes || []).filter((l) => l.constat).length, 0),
      };
    }

    // Ce qui manque au dossier pour remplir les cases de la fiche — département,
    // région, chiffres du marché — se complète ici, avant la création.
    await completerAvantProjet(req.params.dealId, Number(req.params.index) || 0);

    const r = creerProjetDepuisDeal(req.params.dealId, Number(req.params.index), user);
    if (!r.ok) return res.status(r.project_id ? 409 : 400).json({ error: r.error, project_id: r.project_id });

    // Les images du bien et de la ville se cherchent toutes seules : devanture
    // Street View, quartier vu du ciel, plan de la ville. Jamais bloquant.
    let photos = { photos: [], raisons: [] };
    try {
      const { photosDuBien } = await import('../deal/photos-auto.js');
      photos = await photosDuBien({
        adresse: r.project.adresse_complete || null,
        lat: r.project.latitude ?? null,
        lon: r.project.longitude ?? null,
        ville: r.project.ville_secteur_champ1 || null,
      }, UPLOAD_DIR);
      if (photos.photos.length) Records.update('Project', r.project.id, { photos: photos.photos });
    } catch (e) {
      photos.raisons = [`images automatiques indisponibles : ${e?.message || e}`];
    }

    ok(res, {
      project_id: r.project.id,
      titre: r.project.titre,
      champs_remplis: r.champs_remplis,
      analyse,
      photos: photos.photos.length,
      photos_raisons: photos.raisons,
    });
  }));

  // À qui ce dossier pourrait correspondre, d'après les investisseurs de Monday :
  // budget, apport et zone face au prix du bien. Une piste, pas une attribution.
  // La matrice : documents × questions, la ligne de synthèse calculée, la revue
  // des anomalies et les livrables qui en sortent.
  app.get('/api/preanalyse/dossiers/:dealId/matrice', wrap(async (req, res) => {
    const { lireMatrice } = await import('../deal/matrice.js');
    const m = lireMatrice(req.params.dealId);
    if (!m) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, m);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/matrice/remplir', wrap(async (req, res) => {
    const { lancerRemplissage } = await import('../deal/matrice.js');
    const t = lancerRemplissage(req.params.dealId, {
      uploadDir: UPLOAD_DIR,
      user: currentUser(req),
      seulementColonnes: Array.isArray(req.body?.colonnes) ? req.body.colonnes : null,
      seulementDocuments: Array.isArray(req.body?.documents) ? req.body.documents : null,
    });
    ok(res, t);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/matrice/colonnes', wrap(async (req, res) => {
    const { ajouterColonne, lancerRemplissage } = await import('../deal/matrice.js');
    const user = currentUser(req);
    const r = ajouterColonne(req.params.dealId, req.body || {}, { enregistrerGabarit: !!req.body?.enregistrer_gabarit, user });
    if (!r.ok) return res.status(400).json({ error: r.error });
    // La nouvelle question tourne sur toutes les lignes, tout de suite.
    lancerRemplissage(req.params.dealId, { uploadDir: UPLOAD_DIR, user, seulementColonnes: [r.colonne.id] });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/matrice/revue/:colonneId', wrap(async (req, res) => {
    const { reviser } = await import('../deal/matrice.js');
    const r = reviser(req.params.dealId, req.params.colonneId, { verdict: req.body?.verdict ?? null, commentaire: req.body?.commentaire, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // La pré-analyse depuis les pièces : quand le dossier a sa data room mais
  // pas de teaser, la fiche se compose depuis les documents.
  app.post('/api/preanalyse/dossiers/:dealId/preanalyse-documents', wrap(async (req, res) => {
    const { lancerPreanalyseDocuments } = await import('../deal/preanalyse-documents.js');
    ok(res, lancerPreanalyseDocuments(req.params.dealId, { user: currentUser(req), uploadDir: UPLOAD_DIR }));
  }));

  app.get('/api/preanalyse/dossiers/:dealId/preanalyse-documents', wrap(async (req, res) => {
    const { etatPreanalyseDocuments } = await import('../deal/preanalyse-documents.js');
    ok(res, etatPreanalyseDocuments(req.params.dealId) || { etat: null });
  }));

  // L'analyse en trois étapes de lecture : l'étape 1 (bail et locataire) et le
  // passage à l'étape suivante, qui lit les pièces restantes.
  app.get('/api/preanalyse/dossiers/:dealId/etape1', wrap(async (req, res) => {
    const { lireEtape1 } = await import('../deal/etapes-analyse.js');
    const e = lireEtape1(req.params.dealId);
    if (!e) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, e);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/etape2', wrap(async (req, res) => {
    const { lireEtape2 } = await import('../deal/etapes-analyse.js');
    const e = lireEtape2(req.params.dealId);
    if (!e) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, e);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/etape3', wrap(async (req, res) => {
    const { lireEtape3 } = await import('../deal/etapes-analyse.js');
    const e = await lireEtape3(req.params.dealId);
    if (!e) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, e);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/risques/:id', wrap(async (req, res) => {
    const { reviserRisque } = await import('../deal/etapes-analyse.js');
    const r = reviserRisque(req.params.dealId, req.params.id, req.body?.verdict);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/leviers', wrap(async (req, res) => {
    const { cocherLeviers } = await import('../deal/etapes-analyse.js');
    const r = cocherLeviers(req.params.dealId, Array.isArray(req.body?.leviers) ? req.body.leviers : []);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/etape4', wrap(async (req, res) => {
    const { lireEtape4 } = await import('../deal/etapes-analyse.js');
    const e = await lireEtape4(req.params.dealId);
    if (!e) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, e);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/conclusion', wrap(async (req, res) => {
    const { conclure } = await import('../deal/etapes-analyse.js');
    const r = await conclure(req.params.dealId, { etat: req.body?.etat, motif: req.body?.motif, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Les notes de l'analyste et ce qu'il reste à faire, sur le dossier.
  app.get('/api/preanalyse/dossiers/:dealId/notes', wrap(async (req, res) => {
    const d = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, { notes: d.notes_analyse || '', taches: d.taches_analyse || [], maj_le: d.notes_maj_le || null, maj_par: d.notes_maj_par || null });
  }));

  app.post('/api/preanalyse/dossiers/:dealId/notes', wrap(async (req, res) => {
    const d = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
    const patch = { notes_maj_le: new Date().toISOString(), notes_maj_par: currentUser(req)?.email || null };
    if (typeof req.body?.notes === 'string') patch.notes_analyse = req.body.notes.slice(0, 20000);
    if (Array.isArray(req.body?.taches)) patch.taches_analyse = req.body.taches.slice(0, 200).map((t) => ({ id: String(t.id || Date.now().toString(36)), texte: String(t.texte || '').slice(0, 300), fait: !!t.fait, etape: t.etape || null }));
    Records.update('Deal', d.id, patch);
    ok(res, { ok: true });
  }));

  app.get('/api/preanalyse/dossiers/:dealId/grille/:id', wrap(async (req, res) => {
    const { lireGrilleFormatee } = await import('../deal/grilles.js');
    const g = await lireGrilleFormatee(req.params.dealId, req.params.id, { user: currentUser(req), force: req.query.force === '1' });
    if (!g) return res.status(404).json({ error: 'Grille ou dossier introuvable' });
    ok(res, g);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/grille/:id/valeur/:critere', wrap(async (req, res) => {
    const { corrigerValeur } = await import('../deal/grilles.js');
    const r = corrigerValeur(req.params.dealId, req.params.id, req.params.critere, req.body?.valeur ?? '', currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/grille/:id/statut/:critere', wrap(async (req, res) => {
    const { deciderStatut } = await import('../deal/grilles.js');
    const r = deciderStatut(req.params.dealId, req.params.id, req.params.critere, req.body?.statut || null, currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/grille/:id/note/:critere', wrap(async (req, res) => {
    const { noterCritere } = await import('../deal/grilles.js');
    const r = noterCritere(req.params.dealId, req.params.id, req.params.critere, req.body?.texte ?? '', currentUser(req));
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  // Data-B, valeurs locatives : la fourchette de loyer au m² d'une adresse.
  // Sur un lot, le résultat est gardé avec lui ; l'adresse peut être celle du
  // dossier ou une autre, saisie à la main.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/data-b/valeur-locative', wrap(async (req, res) => {
    const { valeurLocative } = await import('../data-b.js');
    const dossier = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const index = Number(req.params.index) || 0;
    const entree = dossier.lots?.[index];
    if (!entree) return res.status(404).json({ error: 'Lot introuvable' });
    const a = entree.lot?.adresse?.valeur;
    const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    const adresse = String(req.body?.adresse || adresseDossier).trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const r = await valeurLocative(adresse, { forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const lots = [...dossier.lots];
    lots[index] = { ...entree, valeur_locative: r.resultat };
    Records.update('Deal', dossier.id, { lots });
    ok(res, { resultat: r.resultat });
  }));

  // Alex : la recherche de marché complète, les trois services l'un après
  // l'autre. Elle dure deux minutes — la requête rend la main tout de suite et la
  // page vient demander où Alex en est.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/marche/alex', wrap(async (req, res) => {
    const { lancerRechercheMarche } = await import('../alex.js');
    const dossier = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const index = Number(req.params.index) || 0;
    if (!dossier.lots?.[index]) return res.status(404).json({ error: 'Lot introuvable' });
    // `sources` restreint la lecture aux connecteurs cochés ; absent, tout est lu.
    const sources = Array.isArray(req.body?.sources) ? req.body.sources.map(String).filter(Boolean) : null;
    const t = lancerRechercheMarche(req.params.dealId, index, { user: currentUser(req), forcer: !!req.body?.forcer, sources });
    // Les étapes viennent du serveur : la chaîne des sources est configurable,
    // l'écran ne peut plus les tenir en dur.
    ok(res, t);
  }));

  // Le Figaro Immobilier : les prix et loyers du résidentiel de la commune et du
  // quartier. C'est le point de comparaison du commerce — ce que coûterait un
  // appartement au même endroit, et ce qu'il rapporterait.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/figaro/prix', wrap(async (req, res) => {
    const { prixResidentiel } = await import('../figaro.js');
    const dossier = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const index = Number(req.params.index) || 0;
    const entree = dossier.lots?.[index];
    if (!entree) return res.status(404).json({ error: 'Lot introuvable' });
    const a = entree.lot?.adresse?.valeur;
    const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    const adresse = String(req.body?.adresse || adresseDossier).trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const r = await prixResidentiel(adresse, { forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const courant = Records.findBy('Deal', 'deal_id', req.params.dealId) || dossier;
    const lots = [...courant.lots];
    lots[index] = { ...lots[index], prix_residentiel: r.resultat };
    Records.update('Deal', courant.id, { lots });
    ok(res, { resultat: r.resultat });
  }));

  // Data-B, transactions de fonds : ce qui s'est vendu autour du bien, à quel
  // prix, pour quelles activités. La rue est comptée à part.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/data-b/transactions', wrap(async (req, res) => {
    const { transactionsFonds } = await import('../data-b-transactions.js');
    const dossier = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const index = Number(req.params.index) || 0;
    const entree = dossier.lots?.[index];
    if (!entree) return res.status(404).json({ error: 'Lot introuvable' });
    const a = entree.lot?.adresse?.valeur;
    const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    const adresse = String(req.body?.adresse || adresseDossier).trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const r = await transactionsFonds(adresse, { rayon: Number(req.body?.rayon) || 500, forcer: !!req.body?.forcer, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    const courant = Records.findBy('Deal', 'deal_id', req.params.dealId) || dossier;
    const lots = [...courant.lots];
    lots[index] = { ...lots[index], transactions_fonds: r.resultat };
    Records.update('Deal', courant.id, { lots });
    ok(res, { resultat: r.resultat });
  }));

  // Equimmox, analyse de loyer : les loyers observés à 500 m, pour des locaux de
  // surface comparable. Sur un lot, l'adresse et la surface du dossier servent
  // par défaut ; le résultat reste avec lui. Une recherche prend une minute.
  // La recherche dure une minute et demie : trop pour une requête HTTP, qui
  // meurt en chemin chez l'hébergeur. On répond tout de suite — le résultat gardé
  // s'il existe, sinon « en cours » — et la page revient demander où ça en est.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/equimmox/analyse-loyer', wrap(async (req, res) => {
    const { lancerAnalyseLoyer, analyseLoyerEnCache } = await import('../equimmox.js');
    const dossier = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const index = Number(req.params.index) || 0;
    const entree = dossier.lots?.[index];
    if (!entree) return res.status(404).json({ error: 'Lot introuvable' });
    const a = entree.lot?.adresse?.valeur;
    const adresseDossier = a ? [a.rue, [a.code_postal, a.ville].filter(Boolean).join(' ')].filter(Boolean).join(', ') : '';
    const adresse = String(req.body?.adresse || adresseDossier).trim();
    if (!adresse) return res.status(400).json({ error: 'Aucune adresse : renseignez-la dans la fiche ou saisissez-la.' });
    const surface = Number(req.body?.surface) > 0 ? Number(req.body.surface) : Number(entree.lot?.surface_m2?.valeur) > 0 ? Number(entree.lot.surface_m2.valeur) : null;

    // Le résultat trouvé sur le lot : on le repose là où la page le lit.
    const poser = (resultat) => {
      const courant = Records.findBy('Deal', 'deal_id', req.params.dealId);
      if (!courant) return;
      const lots = [...courant.lots];
      lots[index] = { ...lots[index], analyse_loyer: resultat };
      Records.update('Deal', courant.id, { lots });
    };

    if (!req.body?.forcer) {
      const garde = analyseLoyerEnCache(adresse, surface);
      if (garde) { poser(garde); return ok(res, { resultat: garde }); }
    }

    const t = lancerAnalyseLoyer(adresse, { surface, forcer: !!req.body?.forcer, user: currentUser(req), onFini: poser });
    if (t.etat === 'pret' && t.resultat) { poser(t.resultat); return ok(res, { resultat: t.resultat }); }
    if (t.etat === 'erreur') return res.status(400).json({ error: t.erreur });
    ok(res, { en_cours: true, cle: t.cle });
  }));

  // Ce qu'une relecture coûtera, avant de la lancer : jetons comptés par l'API,
  // prix appliqué au modèle courant. Rien n'est facturé par ce comptage.
  app.get('/api/preanalyse/dossiers/:dealId/estimation', wrap(async (req, res) => {
    const { estimerLecture } = await import('../deal/estimation.js');
    const r = await estimerLecture(req.params.dealId, { uploadDir: UPLOAD_DIR, grille: req.query.grille || null });
    if (!r) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, r);
  }));

  // Relancer l'analyse d'une seule grille : ses questions sont relues sur toutes
  // les pièces, les autres grilles ne bougent pas.
  app.post('/api/preanalyse/dossiers/:dealId/grille/:id/relancer', wrap(async (req, res) => {
    const { colonnesDeGrille } = await import('../deal/grilles.js');
    const { lancerRemplissage } = await import('../deal/matrice.js');
    const ids = colonnesDeGrille(req.params.id);
    if (!ids.length) return res.status(404).json({ error: 'Grille inconnue' });
    ok(res, lancerRemplissage(req.params.dealId, { uploadDir: UPLOAD_DIR, user: currentUser(req), seulementColonnes: ids, force: true }));
  }));

  app.get('/api/preanalyse/dossiers/:dealId/grille-bail', wrap(async (req, res) => {
    const { lireGrilleBail } = await import('../deal/grille-bail.js');
    const g = lireGrilleBail(req.params.dealId);
    if (!g) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, g);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/grille-bail/completer', wrap(async (req, res) => {
    const { colonnesNonLues } = await import('../deal/grilles.js');
    const { lancerRemplissage } = await import('../deal/matrice.js');
    const ids = colonnesNonLues(req.params.dealId);
    if (!ids.length) return ok(res, { ok: true, rien: true });
    ok(res, { ok: true, colonnes: ids, remplissage: lancerRemplissage(req.params.dealId, { uploadDir: UPLOAD_DIR, user: currentUser(req), seulementColonnes: ids }) });
  }));

  app.post('/api/preanalyse/dossiers/:dealId/relancer-analyse', wrap(async (req, res) => {
    const { lancerRemplissage } = await import('../deal/matrice.js');
    const d = Records.findBy('Deal', 'deal_id', req.params.dealId);
    if (!d) return res.status(404).json({ error: 'Dossier introuvable' });
    const ids = (d.documents_espace || []).map((x) => x.id);
    if (!ids.length) return res.status(400).json({ error: 'Aucune pièce à relire.' });
    ok(res, lancerRemplissage(req.params.dealId, { uploadDir: UPLOAD_DIR, user: currentUser(req), seulementDocuments: ids, force: true }));
  }));

  app.post('/api/preanalyse/dossiers/:dealId/relancer-preanalyse', wrap(async (req, res) => {
    const { relancerPreanalyse } = await import('../deal/preanalyse-documents.js');
    ok(res, relancerPreanalyse(req.params.dealId, { user: currentUser(req), uploadDir: UPLOAD_DIR }));
  }));

  app.post('/api/preanalyse/dossiers/:dealId/etape/:n', wrap(async (req, res) => {
    const { lancerEtape } = await import('../deal/etapes-analyse.js');
    const r = lancerEtape(req.params.dealId, Number(req.params.n), { user: currentUser(req), uploadDir: UPLOAD_DIR, relire: !!req.body?.relire });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/carte', wrap(async (req, res) => {
    const { lireCarteDeal } = await import('../deal/carte-deal.js');
    const c = lireCarteDeal(req.params.dealId);
    if (!c) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, c);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/matrice/fiche', wrap(async (req, res) => {
    const { lireFiche } = await import('../deal/matrice.js');
    const f = lireFiche(req.params.dealId);
    if (!f) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, f);
  }));

  app.post('/api/preanalyse/dossiers/:dealId/matrice/forcer/:colonneId', wrap(async (req, res) => {
    const { forcer } = await import('../deal/matrice.js');
    const r = forcer(req.params.dealId, req.params.colonneId, { document_id: req.body?.document_id || null, valeur: req.body?.valeur || null, user: currentUser(req) });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/matrice/livrables', wrap(async (req, res) => {
    const { livrables } = await import('../deal/matrice.js');
    const l = livrables(req.params.dealId);
    if (!l) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, l);
  }));

  app.get('/api/preanalyse/gabarit-matrice', wrap(async (req, res) => {
    const { gabarit, LIBELLE_STATUT } = await import('../deal/matrice.js');
    ok(res, { gabarit: gabarit(), statuts: LIBELLE_STATUT });
  }));

  // La lecture du dossier : le bien en huit lignes, les contradictions entre
  // documents, les pièces qui manquent, les points à trancher.
  app.get('/api/preanalyse/dossiers/:dealId/lecture', wrap(async (req, res) => {
    const { lireDossier } = await import('../deal/dossier-lecture.js');
    const r = lireDossier(req.params.dealId);
    if (!r) return res.status(404).json({ error: 'Dossier introuvable' });
    ok(res, r);
  }));

  app.get('/api/preanalyse/dossiers/:dealId/clients', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { mondayConfigure } = await import('../monday.js');
    if (!mondayConfigure() || dossier.test) return ok(res, { configure: !!mondayConfigure(), clients: [] });
    const { investisseursPourDeal } = await import('../deal/monday-sync.js');
    const candidats = await investisseursPourDeal(Records.findBy('Deal', 'deal_id', req.params.dealId));
    ok(res, {
      configure: true,
      clients: candidats.map((c) => ({
        nom: c.client.nom,
        email: c.client.email,
        budget: c.client.budget,
        statut: c.client.statut,
        raisons: c.raisons,
      })),
    });
  }));

  // Ce que l'extraction sait remplir dans la fiche projet, ligne par ligne :
  // l'onglet « Données extraites » de l'étape Analyse s'appuie dessus.
  app.get('/api/preanalyse/dossiers/:dealId/donnees-projet', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { donneesProjet } = await import('../deal/donnees-projet.js');
    ok(res, { lignes: donneesProjet(dossier) });
  }));

  // Vidéo de présentation client (~30 s, Remotion). Le rendu tourne en
  // arrière-plan ; le MP4 fini se télécharge depuis /uploads/videos/.
  app.post('/api/preanalyse/dossiers/:dealId/lots/:index/video', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { lancerVideoLot } = await import('../video/index.js');
    const r = lancerVideoLot(dossier, Number(req.params.index));
    if (r.error) return res.status(404).json(r);
    ok(res, r);
  }));

  // État du rendu (en_cours / pret / erreur / aucune) + URL du fichier.
  app.get('/api/preanalyse/dossiers/:dealId/lots/:index/video', wrap(async (req, res) => {
    const { statutVideo } = await import('../video/index.js');
    ok(res, statutVideo(req.params.dealId, Number(req.params.index)));
  }));

  // Changement de statut manuel (décision sans mail, réception de documents…).
  app.post('/api/preanalyse/dossiers/:dealId/statut', wrap((req, res) => {
    const { statut, note } = req.body || {};
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });

    const user = currentUser(req);
    const r = changerStatut(dossier, statut, { user, note });
    if (!r.ok) return res.status(400).json({ error: r.error });

    // Un abandon capitalise l'observation dans la base marché (hors deal de test).
    if (statut === 'abandonne' && statutDe(dossier) !== 'abandonne' && !dossier.test) {
      for (const lot of dossier.lots || []) alimenterBaseMarche(dossier, lot, user);
    }
    ok(res, { deal_id: dossier.deal_id, statut: r.deal.statut, suivi: r.deal.suivi });
  }));
}
