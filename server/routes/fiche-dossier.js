// La fiche du dossier (19 nov. 2026) : chercher de quoi lier une note, la faire lire, la ranger au OK ou l'annuler,
// lire une fiche, le jour de chacun, cocher une action. Réservé à l'équipe ; server/fiche-dossier fait le travail.

import { Records } from '../db.js';
import fs from 'fs';
import { ok, wrap, currentUser, upload } from '../contexte.js';

export function monterFicheDossier(app) {
  const equipe = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const M = () => import('../fiche-dossier/modele.js');
  const refus = (res, r) => res.status(400).json({ error: r.error || 'Impossible.' });

  app.get('/api/fiche-dossier/chercher', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, await (await import('../fiche-dossier/chercher.js')).chercher(String(req.query.q || ''), user));
  }));

  // Les liens proposés en ouvrant « Lier » : ce que la note et la conversation importée nomment.
  // Ce qui se lie tout seul pendant qu'on écrit, et ce qui se choisit d'un tap.
  app.post('/api/fiche-dossier/liens-auto', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const { texte, liens } = req.body || {};
    const { suggererPourLier } = await import('../fiche-dossier/chercher.js');
    const { equipe: lEquipe } = await import('../fiche-dossier/modele.js');
    ok(res, await suggererPourLier({ texte: String(texte || '').slice(0, 6000), liens: Array.isArray(liens) ? liens.slice(0, 8).map(String) : [] }, user, { equipe: lEquipe().map((p) => p.prenom) }));
  }));
  app.post('/api/fiche-dossier/suggestions', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const { texte, noms } = req.body || {};
    const { suggerer } = await import('../fiche-dossier/chercher.js');
    const { equipe: lEquipe } = await import('../fiche-dossier/modele.js');
    ok(res, { suggestions: await suggerer({ texte: String(texte || '').slice(0, 6000), noms: Array.isArray(noms) ? noms.slice(0, 10) : [] }, user, { equipe: lEquipe().map((p) => p.prenom) }) });
  }));
  // La note lue par l'assistant : une proposition, rien de rangé. `remplace` : la proposition d'avant (un lien ajouté).
  app.post('/api/fiche-dossier/notes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    // `conversation` : un export WhatsApp importé (le .txt, ou celui du .zip), lu à part du texte tapé.
    // `action_id` : la note prise depuis la fiche d'appel d'une relance ; `transcription` : l'appel enregistré (20 nov. 2026).
    // `libre` (22 nov. 2026) : une note collée sans « Lier » ; l'assistant devine les fiches et n'y range que ce qui en parle.
    // `envoye` (27 nov. 2026) : un message du Brouillon copié puis dit « envoyé » ; il entre dans l'historique au OK.
    const { remplace, conversation, action_id: actionId, enregistrement_id: enrId, libre, envoye } = req.body || {};
    let { texte, transcription, liens } = req.body || {};
    // Le mode Enregistrement : ce qui a été dit (gardé ici, morceau par morceau), puis les notes tapées pendant.
    if (enrId) {
      const E = await import('../fiche-dossier/enregistrement.js');
      const e = E.lire(enrId, user);
      if (!e) return refus(res, { error: 'Enregistrement introuvable.' });
      // `direct` : la transcription en direct, plus à jour que les morceaux de trente secondes (une fin de sujet).
      const direct = typeof req.body?.direct === 'string' ? req.body.direct.trim() : '';
      const dit = E.lisible(direct || E.texteDe(e));
      if (!dit.trim() && !String(texte || '').trim()) return refus(res, { error: "Rien n'a encore été transcrit." });
      texte = [dit, String(texte || '').trim() ? `Notes prises pendant :\n${String(texte).trim()}` : null].filter(Boolean).join('\n\n');
      transcription = true;
      // Les fiches dont la conversation parle, reconnues sans qu'on ait rien lié : les noms sûrs (une personne connue,
      // le bien d'une ville), à côté de ce qui est lié à la main.
      const lies = Array.isArray(liens) ? liens : [];
      const { suggererPourLier } = await import('../fiche-dossier/chercher.js');
      const { equipe: lEquipe } = await import('../fiche-dossier/modele.js');
      const extrait = texte.length > 12000 ? `${texte.slice(0, 6000)}\n${texte.slice(-6000)}` : texte;
      try {
        const { surs } = await suggererPourLier({ texte: extrait, liens: lies.map((l) => String(l?.cle || l)).slice(0, 8) }, user, { equipe: lEquipe().map((p) => p.prenom) });
        liens = [...lies, ...surs.filter((x) => !lies.some((l) => (l?.cle || l) === x.cle)).map((x) => ({ cle: x.cle, genre: x.genre, nom: x.nom }))].slice(0, 8);
      } catch { liens = lies; }
    }
    // Dite depuis la barre d'une fiche (27 nov. 2026, Jules : « sur la carte d'un client, dire : il va revenir vers nous plus
    // tard, on lui a déjà présenté un truc ; ça modifie le résumé, le dossier, l'historique, les notes ») : la fiche est
    // liée, et les fiches que la note nomme sûrement (« le Basic Fit de Lorient ») s'y ajoutent, comme pour un enregistrement.
    if (req.body?.depuis_fiche && !enrId && Array.isArray(liens) && liens.length && String(texte || '').trim()) {
      try {
        const { suggererPourLier } = await import('../fiche-dossier/chercher.js');
        const { equipe: lEquipe } = await import('../fiche-dossier/modele.js');
        const { surs } = await suggererPourLier({ texte: String(texte).slice(0, 6000), liens: liens.map((l) => String(l?.cle || l)).slice(0, 8) }, user, { equipe: lEquipe().map((p) => p.prenom) });
        liens = [...liens, ...surs.filter((x) => !liens.some((l) => (l?.cle || l) === x.cle)).map((x) => ({ cle: x.cle, genre: x.genre, nom: x.nom }))].slice(0, 8);
      } catch { /* la fiche seule suffit */ }
    }
    // En flux (?flux=1) : les étapes arrivent une à une, puis le résultat.
    const flux = req.query.flux ? (await import('../flux.js')).ouvrirFlux(res) : null;
    try {
      const r = await (await import('../fiche-dossier/ranger.js')).proposer({ texte, liens, conversation, action_id: actionId ? String(actionId) : null, transcription: !!transcription, libre: !!libre, envoye: !!envoye }, user, { surEtape: (t) => flux?.etape(t) });
      if (!r.ok) return flux ? flux.erreur(new Error(r.error)) : refus(res, r);
      if (remplace) {
        const avant = Records.get('NoteDossier', String(remplace));
        if (avant?.etat === 'proposee' && avant.par === user.email) Records.update('NoteDossier', avant.id, { etat: 'remplacee', remplacee_par: r.note_id || null });
      }
      return flux ? flux.fin(r) : ok(res, r);
    } catch (e) {
      if (flux) return flux.erreur(e);
      throw e;
    }
  }));
  // Le récap de la semaine (27 nov. 2026) : mis en forme, relu, envoyé ; vu par chacun à partir du lundi suivant.
  app.get('/api/recap-semaine/destinataires', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { personnes: (await import('../fiche-dossier/recap-semaine.js')).destinatairesPossibles(user) });
  }));
  app.post('/api/recap-semaine/structurer', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = await (await import('../fiche-dossier/recap-semaine.js')).structurer({ texte: req.body?.texte, avant: req.body?.avant || null }, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/recap-semaine', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await import('../fiche-dossier/recap-semaine.js')).envoyer(req.body || {}, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.get('/api/recap-semaine/recus', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { recaps: (await import('../fiche-dossier/recap-semaine.js')).recus(user) });
  }));
  app.post('/api/recap-semaine/:id/lu', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await import('../fiche-dossier/recap-semaine.js')).marquerLu(req.params.id, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Le Brouillon (27 nov. 2026) : la page de texte libre de la personne, lue et écrite telle quelle.
  app.get('/api/fiche-dossier/brouillon', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, (await import('../fiche-dossier/brouillon.js')).lire(user));
  }));
  app.put('/api/fiche-dossier/brouillon', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await import('../fiche-dossier/brouillon.js')).ecrire(user, req.body || {});
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Les agents préférés (20 nov. 2026) : les étoiles de l'équipe, et l'étoile de la personne à mettre ou retirer.
  app.get('/api/fiche-dossier/agents-preferes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, (await import('../fiche-dossier/preferes.js')).etoiles(user));
  }));
  app.post('/api/fiche-dossier/agents-preferes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const P = await import('../fiche-dossier/preferes.js');
    const r = P.basculerPrefere(user, (await import('../fiche-dossier/une-cle.js')).cleUnique(req.body?.cle));
    if (!r.ok) return refus(res, r);
    // Un agent mis en préféré a sa photo (22 nov. 2026, Jules) : cherchée d'elle-même s'il n'en a pas.
    if (r.etoile) (await import('../photos-fiches.js')).photoAuto((await import('../fiche-dossier/une-cle.js')).cleUnique(req.body?.cle));
    ok(res, { ...r, ...P.etoiles(user) });
  }));

  // Les photos des fiches (22 nov. 2026, Jules) : toutes d'un coup pour les listes, et l'import d'une photo.
  app.get('/api/fiche-dossier/photos', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const P = await import('../photos-fiches.js');
    // Une fiche : toutes ses photos (plusieurs personnes, 23 nov. 2026) ; sinon la première de chaque fiche.
    ok(res, req.query.cle ? { photos: P.photosDe((await import('../fiche-dossier/une-cle.js')).cleUnique(req.query.cle)) } : P.toutesLesPhotos());
  }));
  app.delete('/api/fiche-dossier/photo/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await import('../photos-fiches.js')).retirerPhoto((await import('../fiche-dossier/une-cle.js')).cleUnique(req.query.cle), req.params.id);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/fiche-dossier/photo', upload.single('fichier'), wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    if (!req.file) return res.status(400).json({ error: 'Aucune photo reçue.' });
    if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(req.file.mimetype || '')) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'Une photo : JPEG, PNG ou WebP.' }); }
    const r = (await import('../photos-fiches.js')).poserPhoto((await import('../fiche-dossier/une-cle.js')).cleUnique(req.body?.cle), `/uploads/${req.file.filename}`, { par: user.email, id: req.body?.id || null, ajouter: req.body?.ajouter === '1' });
    if (!r.ok) { fs.unlink(req.file.path, () => {}); return refus(res, r); }
    ok(res, r);
  }));
  // Le mode Enregistrement (20 nov. 2026) : un enregistrement ouvert, ses morceaux de trente secondes, sa fin.
  const ENR = () => import('../fiche-dossier/enregistrement.js');
  app.post('/api/fiche-dossier/enregistrements', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const E = await ENR();
    ok(res, { enregistrement: E.vue(E.creer(user)) });
  }));
  app.get('/api/fiche-dossier/enregistrements/en-cours', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const E = await ENR();
    ok(res, { enregistrement: E.vue(E.enCoursDe(user)) || null });
  }));
  app.post('/api/fiche-dossier/enregistrements/:id/morceau', upload.single('audio'), wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const E = await ENR();
    const e = E.lire(req.params.id, user);
    if (!e) return refus(res, { error: 'Enregistrement introuvable.' });
    if (!req.file) return res.status(400).json({ error: 'Morceau vide.' });
    const audio = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    try {
      const texte = await (await import('../prospection/appel.js')).transcrire(audio);
      const apres = E.poserMorceau(e, req.body?.i, texte);
      ok(res, { ok: true, texte, enregistrement: E.vue(apres) });
    } catch (err) {
      res.status(502).json({ error: `Morceau non transcrit : ${err?.message || err}` });
    }
  }));
  // La fin d'un sujet : `passage` (ce que la transcription en direct a écrit depuis la dernière mise à jour), ou, sans
  // direct, `depuis` (le rang du caractère où commence la suite dans le texte des morceaux).
  app.post('/api/fiche-dossier/enregistrements/:id/sujet', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const E = await ENR();
    const e = E.lire(req.params.id, user);
    if (!e) return refus(res, { error: 'Enregistrement introuvable.' });
    const { passage, depuis } = req.body || {};
    const t = typeof passage === 'string' && passage.trim() ? passage : E.texteDe(e).slice(Math.max(0, Number(depuis) || 0));
    ok(res, await E.sujetClos(t, user));
  }));
  app.post('/api/fiche-dossier/enregistrements/:id/fin', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const E = await ENR();
    const e = E.lire(req.params.id, user);
    if (!e) return refus(res, { error: 'Enregistrement introuvable.' });
    ok(res, { enregistrement: E.vue(E.finir(e, { abandon: !!req.body?.abandon })) });
  }));
  // Mes notes : toutes celles de la personne, une recherche ; une note ouverte avec ce qui en a été rangé.
  app.get('/api/fiche-dossier/mes-notes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { notes: (await M()).mesNotes(user, { q: String(req.query.q || '').slice(0, 120) }) });
  }));
  app.get('/api/fiche-dossier/notes/:id/rangement', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).noteEtRangement(req.params.id);
    if (!r) return res.status(404).json({ error: 'Note introuvable.' });
    ok(res, r);
  }));
  app.get('/api/fiche-dossier/notes/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const n = Records.get('NoteDossier', req.params.id);
    if (!n) return res.status(404).json({ error: 'Note introuvable.' });
    ok(res, { note_id: n.id, texte: n.texte, etat: n.etat, liens: n.liens, proposition: n.proposition, le: n.le });
  }));
  app.post('/api/fiche-dossier/notes/:id/ranger', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).rangerNote(Records.get('NoteDossier', req.params.id), req.body || {}, user);
    if (!r.ok) return refus(res, r);
    // Les règles de travail que la note énonce partent au Cerveau, à valider (22 nov. 2026).
    try { r.regles = (await (await import('../fiche-dossier/import.js')).garderRegles(Records.get('NoteDossier', req.params.id), user)).regles; } catch { r.regles = 0; }
    ok(res, r);
  }));
  app.post('/api/fiche-dossier/notes/:id/annuler', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).annulerNote(Records.get('NoteDossier', req.params.id), user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Une réponse d'un trait aux questions d'une note : répartie entre elles (20 nov. 2026, Jules).
  app.post('/api/fiche-dossier/notes/:id/reponses', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const n = Records.get('NoteDossier', req.params.id);
    if (!n || n.etat !== 'proposee') return refus(res, { error: 'Cette note est déjà rangée.' });
    const { repartirReponses } = await import('../fiche-dossier/ranger.js');
    ok(res, await repartirReponses({ ...n, reponses: req.body?.deja || {} }, req.body?.texte, user));
  }));
  // Une proposition laissée sans OK, écartée : elle ne revient plus dans « Aujourd'hui ».
  app.post('/api/fiche-dossier/notes/:id/ecarter', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const n = Records.get('NoteDossier', req.params.id);
    if (!n || n.etat !== 'proposee') return refus(res, { error: 'Rien à écarter.' });
    Records.update('NoteDossier', n.id, { etat: 'ecartee', ecartee_le: new Date().toISOString(), ecartee_par: user.email });
    ok(res, { ok: true });
  }));

  app.get('/api/fiche-dossier/fiche', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const m = await M();
    // La clé qui fait foi (25 nov. 2026, Jules : « une seule fiche par bien, la même dans l'assistant et le CRM »).
    const cle = (await import('../fiche-dossier/une-cle.js')).cleUnique(req.query.cle);
    // Une fiche du CRM ouverte d'un clic sur son nom (22 nov. 2026, Jules) : sa fiche de Klocka prend ce nom, au même format.
    const nom = String(req.query.nom || '').trim().slice(0, 120);
    if (nom && /^twenty:(agentImmobilier|clients):/.test(cle)) {
      const genre = cle.startsWith('twenty:agentImmobilier:') ? 'agent' : 'client';
      const propre = genre === 'agent' ? (await import('../nom-agent.js')).nomAgent(nom) || nom : nom;
      const f = m.fiche(cle, { nom: propre, genre });
      if (!f.nom || ['Fiche du CRM', 'Sans nom'].includes(f.nom)) Records.update('FicheDossier', f.id, { nom: propre });
    }
    // Les appels du mode appel sur la fiche de l'agent, sans IA (26 nov. 2026, Jules : « quand on a eu un premier contact,
    // ce qu'il s'est passé ») : ceux d'aujourd'hui compris, sans attendre un import.
    if (cle.startsWith('agent:')) (await import('../fiche-dossier/import.js')).historiqueDesAppels({ agentId: cle.slice(6) });
    // L'activité d'un client sur la plateforme (27 nov. 2026, Jules) : ses connexions dans l'historique, avant la lecture.
    let activite = null;
    const fc = Records.findBy('FicheDossier', 'cle', cle);
    let transactions = null;
    if (fc?.genre === 'client') {
      // Quand il est entré (27 nov. 2026, Jules) : la date de Monday gardée dans Twenty, dans l'historique.
      try { await (await import('../fiche-dossier/clients-twenty.js')).entreeALOuverture(fc); } catch (e) { console.error('[fiche] entrée', e?.message || e); }
      try { activite = await (await import('../fiche-dossier/activite-client.js')).activiteDuClient(fc); } catch (e) { console.error('[fiche] activité', e?.message || e); }
      // Ses transactions de Twenty (27 nov. 2026, Jules : « est-ce qu'il négocie, finance, signe le compromis »).
      try { transactions = await (await import('../fiche-dossier/transactions-client.js')).transactionsDuClient(fc); } catch (e) { console.error('[fiche] transactions', e?.message || e); }
    }
    let v = m.ficheVue(cle);
    if (!v) return res.status(404).json({ error: 'Fiche introuvable.' });
    if (activite) v.activite = activite;
    const entre = Records.findBy('FicheDossier', 'cle', v.cle)?.entre_le;
    if (entre) v.entre_le = entre;
    if (transactions) v.transactions = transactions;
    // À qui le bien a été présenté (27 nov. 2026, Jules) : les clients assignés à ses projets, et s'ils l'ont ouvert.
    if (v.genre === 'bien') { try { const p = (await import('../fiche-dossier/activite-client.js')).presenteA(v.cle); if (p.length) v.presente_a = p; } catch (e) { console.error('[fiche] présenté à', e?.message || e); } }
    // Les fiches qu'il nous a envoyées, une ligne par mail dans l'historique (27 nov. 2026, Jules) ; rien d'autre ne bouge.
    if (v.genre === 'agent' && (await import('../fiche-dossier/fiches-envoyees.js')).historiqueDesEnvois(v.cle, { nom: v.nom })) v = m.ficheVue(cle);
    // Une fiche ouverte devient une fiche récente de la personne (la pastille « Fiches » de l'accueil).
    m.noterOuverture(v.cle, user);
    ok(res, v);
  }));
  // Une note écrite dans l'onglet Notes d'une fiche, gardée telle quelle.
  app.post('/api/fiche-dossier/fiche/notes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).noterSurLaFiche(req.body?.cle, req.body?.texte, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // « À faire » : ses actions ouvertes ; et la conversation où l'action est née, pour y revenir.
  app.get('/api/fiche-dossier/mes-actions', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const actions = (await M()).mesActions(user);
    // Les comptes rendus de transfert fermés sans être ouverts (23 nov. 2026, Jules) : une ligne qui ouvre leur conversation.
    const { comptesRendusAFaire } = await import('../haka/compte-rendu-transfert.js');
    // Et les notifications gardées qu'on a fermées sans les ouvrir (23 nov. 2026, Jules).
    const { aFaire } = await import('../notifications.js');
    ok(res, { actions: [...comptesRendusAFaire(user.email), ...aFaire(user), ...actions], dues: actions.filter((a) => a.du).length });
  }));
  app.get('/api/fiche-dossier/actions/:id/conversation', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const a = Records.get('ActionDossier', req.params.id);
    if (!a) return res.status(404).json({ error: 'Action introuvable.' });
    const { conversationDeLaNote } = await import('../assistant-conversations.js');
    ok(res, { conversation_id: conversationDeLaNote(user, a.note_id) });
  }));
  app.get('/api/fiche-dossier/recentes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { fiches: (await M()).fichesRecentesDe(user, { limite: 10 }) });
  }));
  app.get('/api/fiche-dossier/aujourdhui', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const m = await M();
    ok(res, { ...m.aujourdhui(user), recentes: m.fichesRecentes({ limite: 6 }) });
  }));
  app.patch('/api/fiche-dossier/actions/:id', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).changerAction(req.params.id, req.body || {}, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // La relecture des fiches remplies par l'import (22 nov. 2026, Jules : « valider par fiche, pas fait par fait ») : celles
  // de la personne d'abord ; OK fait tomber l'étiquette « importé ».
  app.get('/api/fiche-dossier/a-relire', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, { fiches: (await M()).aRelire(user) });
  }));
  app.post('/api/fiche-dossier/fiche/valider', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).validerFiche(req.body?.cle, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // Délier deux fiches d'une croix (24 nov. 2026, Jules : « retirer un bien d'un agent, cliquer sur une croix pour le
  // délier d'Alexis ») ; « Annuler » les relie tels qu'ils étaient.
  app.post('/api/fiche-dossier/delier', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const r = (await M()).delier(req.body?.de, req.body?.vers);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/fiche-dossier/relier', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const avant = (Array.isArray(req.body?.avant) ? req.body.avant : []).filter((x) => x && typeof x.de === 'string' && typeof x.vers === 'string').slice(0, 4);
    ok(res, (await M()).relier(avant));
  }));

  // L'import des fiches (22 nov. 2026, Paramètres > Import des fiches) : Jules seul le lance.
  const I = () => import('../fiche-dossier/import.js');
  const gerant = async (req, res) => {
    const user = equipe(req, res); if (!user) return null;
    const { estSuperAdmin } = await import('../acces-pages.js');
    if (!estSuperAdmin(user)) { res.status(403).json({ error: "Réservé à qui gère l'équipe." }); return null; }
    return user;
  };
  app.get('/api/fiche-dossier/import', wrap(async (req, res) => {
    if (!(await gerant(req, res))) return;
    ok(res, (await I()).etatImport());
  }));
  app.post('/api/fiche-dossier/import/squelette', wrap(async (req, res) => {
    if (!(await gerant(req, res))) return;
    const m = await I();
    const r = m.squelette();
    let clients = null;
    try { clients = await m.clientsDeTwenty(); } catch (e) { clients = { erreur: e?.message || String(e) }; }
    // L'activité sur la plateforme et les transactions de Twenty de chaque client, d'habitude écrites à l'ouverture de
    // sa fiche, passées ici pour toutes (27 nov. 2026, Jules : « que toutes les fiches soient prêtes lundi ») ; en fond,
    // un client après l'autre : le compte de chacun se cherche dans Twenty.
    const fichesClients = Records.filter('FicheDossier', { genre: 'client' });
    if (!process.env.NODE_TEST_CONTEXT) setImmediate(async () => {
      const [{ activiteDuClient }, { transactionsDuClient }] = await Promise.all([import('../fiche-dossier/activite-client.js'), import('../fiche-dossier/transactions-client.js')]);
      let actifs = 0; let enTransaction = 0;
      for (const f of fichesClients) {
        try { if (await activiteDuClient(f)) actifs += 1; } catch (e) { console.error('[fiche] activité', f.cle, e?.message || e); }
        try { if (await transactionsDuClient(Records.get('FicheDossier', f.id))) enTransaction += 1; } catch (e) { console.error('[fiche] transactions', f.cle, e?.message || e); }
      }
      console.log(`[fiche] squelette clients : ${fichesClients.length} fiches, ${actifs} comptes liés, ${enTransaction} avec transactions`);
    });
    ok(res, { ...r, clients, clients_suivis: fichesClients.length });
  }));
  app.get('/api/fiche-dossier/import/chat/espaces', wrap(async (req, res) => {
    if (!(await gerant(req, res))) return;
    try { ok(res, { espaces: await (await I()).espacesChat(String(req.query.compte || '')) }); } catch (e) { refus(res, { error: e?.message }); }
  }));
  app.post('/api/fiche-dossier/import/chat', wrap(async (req, res) => {
    const user = await gerant(req, res); if (!user) return;
    const { compte, espace, titre, depuis, auteurs } = req.body || {};
    if (!compte || !espace) return refus(res, { error: 'Choisissez le compte et la conversation.' });
    try { ok(res, await (await I()).lancerGoogleChat({ compte: String(compte), espace: String(espace), titre: titre || null, depuis: depuis || null, auteurs: Array.isArray(auteurs) ? auteurs : [] }, user)); } catch (e) { refus(res, { error: e?.message }); }
  }));
  app.post('/api/fiche-dossier/import/whatsapp', wrap(async (req, res) => {
    const user = await gerant(req, res); if (!user) return;
    const r = (await I()).lancerWhatsapp(Array.isArray(req.body?.fichiers) ? req.body.fichiers.slice(0, 200) : [], user, { exportePar: req.body?.exporte_par || null });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/fiche-dossier/import/textes', wrap(async (req, res) => {
    const user = await gerant(req, res); if (!user) return;
    const r = (await I()).lancerTextes(Array.isArray(req.body?.textes) ? req.body.textes.slice(0, 200) : [], user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/fiche-dossier/import/appels', wrap(async (req, res) => {
    const user = await gerant(req, res); if (!user) return;
    const r = await (await I()).lancerAppels(user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
}
