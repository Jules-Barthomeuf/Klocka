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
    const { remplace, conversation, action_id: actionId, enregistrement_id: enrId } = req.body || {};
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
    // En flux (?flux=1) : les étapes arrivent une à une, puis le résultat.
    const flux = req.query.flux ? (await import('../flux.js')).ouvrirFlux(res) : null;
    try {
      const r = await (await import('../fiche-dossier/ranger.js')).proposer({ texte, liens, conversation, action_id: actionId ? String(actionId) : null, transcription: !!transcription }, user, { surEtape: (t) => flux?.etape(t) });
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
  // Les agents préférés (20 nov. 2026) : les étoiles de l'équipe, et l'étoile de la personne à mettre ou retirer.
  app.get('/api/fiche-dossier/agents-preferes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    ok(res, (await import('../fiche-dossier/preferes.js')).etoiles(user));
  }));
  app.post('/api/fiche-dossier/agents-preferes', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const P = await import('../fiche-dossier/preferes.js');
    const r = P.basculerPrefere(user, req.body?.cle);
    if (!r.ok) return refus(res, r);
    ok(res, { ...r, ...P.etoiles(user) });
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
    const v = m.ficheVue(String(req.query.cle || ''));
    if (!v) return res.status(404).json({ error: 'Fiche introuvable.' });
    // Une fiche ouverte devient une fiche récente de la personne (la pastille « Fiches » de l'accueil).
    m.noterOuverture(v.cle, user);
    ok(res, v);
  }));
  // « À faire » : ses actions ouvertes ; et la conversation où l'action est née, pour y revenir.
  app.get('/api/fiche-dossier/mes-actions', wrap(async (req, res) => {
    const user = equipe(req, res); if (!user) return;
    const actions = (await M()).mesActions(user);
    ok(res, { actions, dues: actions.filter((a) => a.du).length });
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
}
