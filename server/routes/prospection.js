// La prospection : la liste du jour, l'appel et ce qu'AK propose après, « À
// envoyer », les décisions Oui ou Non, le carnet des agents, le tableau de
// bord et les réglages. Réservé à l'équipe. La plateforme fait foi ;
// server/prospection/ fait le travail.

import fs from 'fs';
import { Records } from '../db.js';
import { ok, wrap, currentUser, upload } from '../contexte.js';

export function monterProspection(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') { res.status(403).json({ error: 'Réservé à l\'équipe.' }); return null; }
    return user;
  };
  const P = () => import('../prospection/index.js');
  const refus = (res, r) => res.status(400).json({ error: r.error || 'Impossible.' });

  // --- La journée ------------------------------------------------------------

  app.get('/api/prospection/jour', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const jour = p.listeDuJour({ pour: user.email });
    const aValider = p.appelAValider(user.email)[0] || null;
    const r = p.reglages();
    const { listeDeDecisions } = await import('../prospection/decisions.js');
    ok(res, {
      ...jour,
      villes_cibles: r.villes,
      criteres: !!String(r.criteres || '').trim(),
      appel_a_valider: aValider,
      a_envoyer: p.aEnvoyer().length,
      decisions: (await listeDeDecisions()).length,
      recherche: p.rechercheEnCours(),
      etat: p.etatProspection(),
    });
  }));

  app.post('/api/prospection/villes-du-jour', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const villes = Array.isArray(req.body?.villes) ? req.body.villes : [];
    const r = p.reglages();
    const suite = p.enregistrerReglages({ villes_du_jour: villes, villes: [...new Set([...r.villes, ...villes.map((v) => String(v).trim()).filter(Boolean)])] }, user.email);
    ok(res, { villes: suite.villes_du_jour.villes });
  }));

  app.post('/api/prospection/agents/:id/prendre', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const r = p.verrouiller(req.params.id, user.email);
    if (!r.ok) return res.status(409).json({ error: r.error });
    ok(res, { ok: true, agent: p.agentDe(req.params.id) });
  }));

  app.post('/api/prospection/agents/:id/lacher', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    (await P()).liberer(req.params.id, user.email);
    ok(res, { ok: true });
  }));

  // L'appel terminé : l'enregistrement (WAV), un récit, ou « pas de réponse ».
  app.post('/api/prospection/agents/:id/appel', upload.single('audio'), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const audio = req.file ? fs.readFileSync(req.file.path) : null;
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    const p = await P();
    const r = await p.analyserAppel({
      agent_id: req.params.id, audio, par: user.email,
      recit: String(req.body?.recit || '').trim().slice(0, 4000) || null,
      sans_reponse: /^(1|true)$/.test(String(req.body?.sans_reponse || '')),
      duree_s: Number(req.body?.duree_s) || null,
    });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // --- Le mode appel : une ville, une file, une issue en un geste ------------
  const MA = () => import('../prospection/mode-appel.js');
  app.get('/api/prospection/mode-appel/file', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const liste = String(req.query.liste || '');
    // Le croisement avec Monday a plus de six heures : on le refait avant de
    // présenter la file (qui, quand, relance due), sans bloquer si Monday tombe.
    const lignes = Records.list('AgenceProspect').filter((a) => a.liste_id === liste);
    const plusVieux = lignes.reduce((m, a) => (!a.monday_verifie_le ? 0 : Math.min(m, Date.parse(a.monday_verifie_le))), Infinity);
    if (lignes.length && (plusVieux === 0 || Date.now() - plusVieux > 6 * 3600 * 1000)) {
      try { await (await import('../prospection/monday-connus.js')).marquerListe(liste); } catch { /* la file part avec ce qu'on sait */ }
    }
    const r = (await MA()).fileDAppel(liste, user);
    if (!r.ok) return refus(res, r);
    // Le cahier des charges clients, sous les yeux avant d'appeler.
    const cahier = await (await import('../prospection/modeles-appel.js')).cahierDesCharges();
    ok(res, { ...r, cahier, issues: (await MA()).ISSUES_APPEL, raisons_passer: (await MA()).RAISONS_PASSER });
  }));
  // --- Le Suivi : les règles contrôlées chaque nuit, la qualité d'AK (9 oct. 2026) ---
  const CT = () => import('../prospection/controles.js');
  app.get('/api/monitoring/regles', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { rapport: (await CT()).dernierRapport() });
  }));
  // Lancer le contrôle maintenant, et recevoir le rapport (en local : redirigé ou simulé, sous le garde-fou des envois).
  app.post('/api/monitoring/regles', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, await (await CT()).controlerEtEnvoyer({ envoyer: req.body?.envoyer !== false, testeur: user.email }));
  }));
  // Le Suivi des appels : l'usage de chacun en Prospection, Relances et Rappel (9 oct. 2026).
  app.get('/api/monitoring/appels', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { suiviAppels, SOURCES } = await import('../prospection/suivi-appels.js');
    const source = SOURCES[req.query.source] ? String(req.query.source) : null;
    ok(res, suiviAppels({ jours: Math.min(365, Math.max(1, Number(req.query.jours) || 30)), source }));
  }));
  // Remettre le Suivi des appels à zéro, ou tout réafficher : rien ne s'efface.
  app.post('/api/monitoring/appels/remettre-a-zero', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { ok: true, remise_a_zero: (await import('../prospection/suivi-appels.js')).remettreAZero(user.email) });
  }));
  app.post('/api/monitoring/appels/tout-afficher', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    (await import('../prospection/suivi-appels.js')).toutAfficher();
    ok(res, { ok: true });
  }));
  app.get('/api/monitoring/qualite-ak', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, (await CT()).qualiteAK({ semaines: Math.min(26, Number(req.query.semaines) || 8) }));
  }));

  // --- « Il me rappelle » : un agent rappelle (spec du 8 oct. 2026) ----------
  const RP = () => import('../prospection/rappels.js');
  const reponse = (res, r) => (r.ok ? ok(res, r) : refus(res, r));
  app.get('/api/prospection/rappels/en-cours', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { rappels: (await RP()).enCours(user) });
  }));
  app.post('/api/prospection/rappels', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RP()).ouvrir(user));
  }));
  app.get('/api/prospection/rappels/chercher', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { resultats: (await RP()).chercher(String(req.query.q || '')) });
  }));
  app.get('/api/prospection/rappels/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, (await RP()).lire(req.params.id, user));
  }));
  // Stop : les morceaux transcrits pendant l'appel, et ceux qui ne l'étaient pas encore (en audio, à leur place).
  app.post('/api/prospection/rappels/:id/fin', upload.array('audio', 80), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    let morceaux = [];
    try { morceaux = JSON.parse(req.body?.morceaux || '[]'); } catch { morceaux = []; }
    const audios = (req.files || []).map((f) => f.buffer || (f.path ? fs.readFileSync(f.path) : null)).filter(Boolean);
    for (const f of req.files || []) if (f.path) fs.unlink(f.path, () => {});
    reponse(res, await (await RP()).finir(req.params.id, { morceaux, audios, notes: req.body?.notes ?? null, duree_s: Number(req.body?.duree_s) || null }, user));
  }));
  app.post('/api/prospection/rappels/:id/notes', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, (await RP()).noter(req.params.id, req.body?.notes, user));
  }));
  app.post('/api/prospection/rappels/:id/identifier', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    reponse(res, await (await RP()).identifier(req.params.id, { agent_id: b.agent_id || null, agence_id: b.agence_id || null, nouveau: b.nouveau || null }, user));
  }));
  app.post('/api/prospection/rappels/:id/lever', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, await (await RP()).lever(req.params.id, user));
  }));
  app.post('/api/prospection/rappels/:id/analyser', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const flux = req.query.flux === '1' ? (await import('../flux.js')).ouvrirFlux(res) : null;
    let r;
    try { r = await (await RP()).analyser(req.params.id, { remplace: req.body?.remplace || null, issue: req.body?.issue || 'auto', surEtape: flux?.etape || null }, user); } catch (e) { if (flux) return flux.erreur(e); throw e; }
    if (!flux) return reponse(res, r);
    if (!r.ok) return flux.erreur({ message: r.error || 'Impossible.' });
    flux.fin(r);
  }));
  app.post('/api/prospection/rappels/:id/titre', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, (await RP()).titrer(req.params.id, req.body?.titre, user));
  }));
  app.post('/api/prospection/rappels/:id/rien-de-nouveau', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, await (await RP()).rienDeNouveau(req.params.id, user));
  }));
  app.post('/api/prospection/rappels/:id/terminer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, (await RP()).terminer(req.params.id, user));
  }));
  app.post('/api/prospection/rappels/:id/abandonner', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    reponse(res, (await RP()).abandonner(req.params.id, user));
  }));

  // --- Les relances (page Relances, spec du 8 oct. 2026) ---------------------
  const RL = () => import('../prospection/relances.js');
  // La liste partagée et le tableau de bord.
  app.get('/api/prospection/relances', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { ...(await (await RL()).relances()), moi: String(user.email || '').toLowerCase() });
  }));
  // « Pris par » : relu toutes les secondes et demie par chaque écran, tenu en mémoire.
  app.get('/api/prospection/relances/prises', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const rl = await RL();
    ok(res, { prises: rl.prises(), version: rl.version() });
  }));
  app.post('/api/prospection/relances/prendre', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await RL()).prendre(String(req.body?.cle || ''), user);
    if (!r.ok) return res.status(409).json({ error: r.error, prise_par: r.prise_par || null });
    ok(res, r);
  }));
  app.post('/api/prospection/relances/garder', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RL()).garder(String(req.body?.cle || ''), user));
  }));
  app.post('/api/prospection/relances/lacher', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RL()).lacher(String(req.body?.cle || ''), user));
  }));
  // La fiche du mode appel pour la ligne prise.
  app.get('/api/prospection/relances/fiche', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await RL()).ficheDeRelance(String(req.query.agence || ''), user);
    if (!r.ok) return refus(res, r);
    const cahier = await (await import('../prospection/modeles-appel.js')).cahierDesCharges();
    ok(res, { ...r, cahier, issues: (await MA()).ISSUES_APPEL, raisons_passer: {} });
  }));
  app.post('/api/prospection/relances/session', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RL()).ouvrirSession(user));
  }));
  // Des lignes de la Prospection envoyées dans Relances.
  app.post('/api/prospection/relances/envoyer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 500) : [];
    if (!ids.length) return res.status(400).json({ error: 'Cochez au moins une agence.' });
    ok(res, await (await RL()).envoyer(ids, user));
  }));
  // Les mails de relance à valider : Envoyer, Modifier, Ignorer. Rien ne part sans un clic.
  const mailDeRelance = async (id) => (await RL()).mailsAValider().some((m) => m.id === id);
  app.post('/api/prospection/relances/mails/:id/envoyer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    if (!(await mailDeRelance(req.params.id))) return res.status(404).json({ error: 'Mail introuvable ou déjà parti.' });
    const r = await (await import('../prospection/mails.js')).envoyerMails([req.params.id], user);
    const x = r.resultats?.[0];
    if (!x?.ok) return res.status(400).json({ error: x?.error || "Le mail n'est pas parti." });
    ok(res, x);
  }));
  app.post('/api/prospection/relances/mails/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    if (!(await mailDeRelance(req.params.id))) return res.status(404).json({ error: 'Mail introuvable ou déjà parti.' });
    const r = (await import('../prospection/mails.js')).modifierMail(req.params.id, { objet: req.body?.objet, corps: req.body?.corps, a: req.body?.a });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/relances/mails/:id/ignorer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    if (!(await mailDeRelance(req.params.id))) return res.status(404).json({ error: 'Mail introuvable ou déjà parti.' });
    const r = (await import('../prospection/mails.js')).ecarterMail(req.params.id, user.email);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // La liste des relances, lignes cochées (8 oct. 2026) : supprimer, ou renvoyer en prospection.
  app.post('/api/prospection/relances/retirer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RL()).retirerDesRelances(req.body?.cles, user));
  }));
  app.post('/api/prospection/relances/prospection', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await RL()).renvoyerEnProspection(req.body?.cles, user));
  }));
  // L'agence à l'écran : tenue pour soi, renouvelée tant qu'elle y reste.
  app.post('/api/prospection/mode-appel/reserver', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await MA()).reserver(req.body?.agence_id, user);
    if (!r.ok) return res.status(409).json({ error: r.error, prise: !!r.prise });
    ok(res, r);
  }));
  // « Passer », avec sa raison : fermée, pas pertinente, plus tard.
  app.post('/api/prospection/mode-appel/passer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await MA()).passer(req.body?.agence_id, String(req.body?.raison || ''), user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // L'agent qui rappelle : retrouvé par son nom ou son numéro.
  app.get('/api/prospection/mode-appel/chercher', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, (await MA()).chercher(String(req.query.q || '').slice(0, 80)));
  }));
  app.post('/api/prospection/mode-appel/sessions', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await MA()).ouvrirSession(req.body?.liste_id, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Le mode essai : quatre agences fictives remises à zéro, rien ne sort (ni Monday, ni mail).
  app.post('/api/prospection/mode-appel/essai', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await MA()).ouvrirEssai(user));
  }));
  app.get('/api/prospection/mode-appel/sessions/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await MA()).recapSession(req.params.id);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Appeler : l'agence entre au carnet et se verrouille trente minutes.
  app.post('/api/prospection/mode-appel/prendre', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await MA()).prendre(req.body?.agence_id, user);
    if (!r.ok) return res.status(409).json({ error: r.error });
    // L'appel commence : Monday se relit maintenant, pour que sa ligne soit prête au raccrochage.
    (await import('../prospection/monday-agents.js')).prechauffer();
    ok(res, r);
  }));
  // La lecture en avance (9 oct. 2026) : pendant l'appel, la transcription du
  // moment (et les notes) est lue par AK ; au raccrochage, si la fin n'y change
  // rien, cette lecture sert et l'écran d'actions s'ouvre aussitôt.
  app.post('/api/prospection/mode-appel/pre-lecture', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const agentId = String(req.body?.agent_id || '');
    if (!agentId) return res.status(400).json({ error: 'Agent manquant.' });
    (await import('../prospection/monday-agents.js')).prechauffer();
    let textes = [];
    try { textes = JSON.parse(String(req.body?.morceaux || '[]')); } catch { textes = []; }
    let transcription = (Array.isArray(textes) ? textes : []).map((t) => String(t || '')).filter(Boolean).join('\n').trim() || null;
    const notes = String(req.body?.notes || '').trim().slice(0, 4000) || null;
    if (notes) transcription = (await import('../prospection/rappels.js')).texteAAnalyser(transcription, notes);
    const r = await (await import('../prospection/appel.js')).lireEnAvance({ agent_id: agentId, transcription_texte: transcription, par: user.email });
    ok(res, r);
  }));
  // L'issue tapée en raccrochant, avec le vocal pour les vraies conversations.
  // La transcription en direct (7 oct. 2026) : un morceau de quelques
  // secondes, transcrit et rendu tout de suite. L'audio n'est pas gardé.
  app.post('/api/prospection/mode-appel/morceau', upload.single('audio'), wrap(async (req, res) => {
    if (!admin(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Morceau vide.' });
    const audio = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    try {
      const texte = await (await import('../prospection/appel.js')).transcrire(audio);
      ok(res, { ok: true, i: Number(req.body?.i) || 0, texte });
    } catch (e) {
      res.status(502).json({ error: `Morceau non transcrit : ${e?.message || e}` });
    }
  }));
  // La fin de l'appel : la transcription faite en direct ; les morceaux restés
  // sans texte (réseau, transcription ratée) arrivent en audio, dans l'ordre.
  app.post('/api/prospection/mode-appel/issue', upload.array('audio', 80), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    // `?flux=1` : chaque étape part au moment où elle se fait (comme le chat), puis le résultat.
    const flux = req.query.flux === '1' ? (await import('../flux.js')).ouvrirFlux(res) : null;
    const fichiers = req.files || [];
    const audios = fichiers.map((f) => fs.readFileSync(f.path));
    for (const f of fichiers) fs.promises.unlink(f.path).catch(() => {});
    let transcription = String(req.body?.transcription || '').trim() || null;
    let audio = null;
    let morceaux = null;
    try { morceaux = req.body?.morceaux ? JSON.parse(req.body.morceaux) : null; } catch { morceaux = null; }
    if (Array.isArray(morceaux)) {
      const A = await import('../prospection/appel.js');
      let k = 0;
      const textes = [];
      if (morceaux.some((m) => typeof m !== 'string')) flux?.etape("Je transcris la fin de l'appel");
      for (const m of morceaux) {
        if (typeof m === 'string') { textes.push(m); continue; }
        const b = audios[k++];
        if (b) { try { textes.push(await A.transcrire(b)); } catch { textes.push(''); } }
      }
      transcription = textes.filter(Boolean).join('\n').trim() || null;
    } else if (audios.length) audio = audios[0];
    // Les notes tapées pendant l'appel : AK les lit après la transcription, elles l'emportent (email, numéro, nom, date).
    const notesAppel = String(req.body?.notes || '').trim().slice(0, 4000) || null;
    if (notesAppel) { const avecTranscription = !!transcription; transcription = (await import('../prospection/rappels.js')).texteAAnalyser(transcription, notesAppel); flux?.etape(avecTranscription ? 'Je lis vos notes : elles l\'emportent sur la transcription' : 'Je lis votre résumé de l\'appel'); }
    let r;
    try {
      r = await (await MA()).noterIssue({
        agence_id: req.body?.agence_id, agent_id: req.body?.agent_id || null, issue: req.body?.issue, notes: notesAppel,
        session_id: req.body?.session_id || null, audio, transcription, remplace: req.body?.remplace || null,
        recit: String(req.body?.recit || '').trim().slice(0, 4000) || null,
        numero: req.body?.numero || null, motif: req.body?.motif || null, surEtape: flux?.etape || null, mondayEssai: req.body?.monday_essai === '1' || req.body?.monday_essai === true, dureeS: req.body?.duree_s || null, source: req.body?.source || null, user,
      });
    } catch (e) {
      if (flux) return flux.erreur(e);
      throw e;
    }
    if (!r.ok) return flux ? flux.erreur({ message: r.error || 'Impossible.' }) : refus(res, r);
    if (flux) return flux.fin({ ...r, transcription });
    ok(res, { ...r, transcription });
  }));
  app.post('/api/prospection/mode-appel/appels/:id/valider', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    const r = await (await MA()).validerIssue({
      appel_id: req.params.id, choix: Array.isArray(b.choix) ? b.choix : [], mail: b.mail || null,
      relance_le: b.relance_le || null, relance2_le: b.relance2_le || null, monday_ligne: b.monday_ligne || null, note: String(b.note || '').slice(0, 2000),
      cle: b.cle ? String(b.cle).slice(0, 80) : null, session_id: b.session_id || null, issue: b.issue || null,
      depuisFenetre: !!b.depuis_fenetre, etapesVues: Array.isArray(b.etapes_vues) ? b.etapes_vues.slice(0, 30) : null,
      corrections: Array.isArray(b.corrections) ? b.corrections : [], user,
    });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // « Annuler », dans les dix secondes qui suivent la validation.
  app.post('/api/prospection/mode-appel/appels/:id/annuler', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await MA()).annulerValidation(req.params.id, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // « C'est bien cette ligne ? » : la ligne Monday choisie après coup.
  app.post('/api/prospection/mode-appel/appels/:id/ligne-monday', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await (await MA()).choisirLigneMonday(req.params.id, req.body?.ligne_id || 'nouvelle');
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Réessayer Monday tout de suite, depuis le récapitulatif.
  app.post('/api/prospection/mode-appel/appels/:id/reessayer', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    await (await MA()).reessayerAttentes({ max: 50 });
    const r = (await MA()).recu(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/prospection/mode-appel/appels/:id/brouillon', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await MA()).brouillonOuvert(req.params.id);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // L'appel resté sans issue (application fermée) : rendu à la réouverture.
  app.get('/api/prospection/mode-appel/en-suspens', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    // Un rappel entrant a son propre bandeau (« Rappel à terminer ») : il ne revient pas ici.
    const appel = Records.list('AppelAgent').filter((x) => x.par === user.email && x.etat === 'a_valider' && x.agence_id && !x.essai_archive && !x.rappel_id && Date.now() - Date.parse(x.le) < 2 * 86400000).sort((x, y) => String(y.le).localeCompare(String(x.le)))[0] || null;
    ok(res, { appel: appel ? { id: appel.id, agence_id: appel.agence_id, agence: Records.get('AgenceProspect', appel.agence_id)?.nom || appel.agent, issue: appel.issue_tapee || appel.issue, le: appel.le, propositions: appel.propositions, compris: appel.compris, resume: appel.resume } : null });
  }));
  app.post('/api/prospection/mode-appel/appels/:id/renvoyer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await MA()).renvoyerMail(req.params.id, user);
    if (!r.recu) return refus(res, r);
    ok(res, r);
  }));
  app.get('/api/prospection/mode-appel/appels/:id/recu', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await MA()).recu(req.params.id);
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));

  // L'appel raconté en trente secondes : noté sur la fiche et dans Monday d'un coup.
  app.post('/api/prospection/agents/:id/raconter', upload.single('audio'), wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const audio = req.file ? fs.readFileSync(req.file.path) : null;
    if (req.file) fs.promises.unlink(req.file.path).catch(() => {});
    const r = await (await P()).raconterAppel({ agent_id: req.params.id, audio, par: user.email, duree_s: Number(req.body?.duree_s) || null });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // Ma journée : la ville, qui appeler, l'avancement, « À envoyer », la fiabilité d'AK.
  app.get('/api/prospection/ma-journee', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, await (await P()).maJournee({ ville: req.query.ville || null, pour: user.email }));
  }));
  // Corriger la carte de confirmation d'un appel (statut, date, prochaine action).
  app.post('/api/prospection/appels/:id/corriger', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { corrigerAppel } = await import('../prospection/appel.js');
    const r = await corrigerAppel({ appel_id: req.params.id, champ: req.body?.champ, valeur: req.body?.valeur, user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/appels/:id/valider', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const b = req.body || {};
    const r = await p.validerAppel({ appel_id: req.params.id, choix: Array.isArray(b.choix) ? b.choix : [], mail: b.mail || null, sms: b.sms || null, envoyer: !!b.envoyer, user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // --- La grille -------------------------------------------------------------
  //
  // Le carnet en tableau, comme l'ancienne Google Sheet : un onglet par
  // ville, les colonnes de l'équipe, et « à appeler aujourd'hui » qui
  // réduit l'onglet à la liste du jour de cette ville.

  app.get('/api/prospection/grille', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const { ongletDe } = await import('../prospection/carnet.js');
    const R = await import('../prospection/regles.js');
    const tous = p.agents();
    const compte = {};
    for (const a of tous) { const o = ongletDe(a); compte[o] = (compte[o] || 0) + 1; }
    const onglets = Object.entries(compte).sort((a, b) => b[1] - a[1]).map(([nom, n]) => ({ nom, n }));
    const onglet = String(req.query.onglet || '');
    const dansOnglet = onglet ? tous.filter((a) => ongletDe(a) === onglet) : tous;
    // La liste du jour de l'onglet : ses relances, ses publieurs réguliers, ses nouveaux.
    const villes = onglet ? [onglet, ...new Set(dansOnglet.map((a) => a.ville).filter(Boolean))] : p.villesDuJour();
    const jour = R.listeDuJour(dansOnglet, { villes, nouveauxParJour: onglet ? 0 : 10 });
    const raisons = new Map(jour.map((a) => [a.id, { raison: a.raison, rang: a.rang }]));
    const seulementJour = req.query.jour === '1';
    const lignes = (seulementJour ? jour.map((a) => tous.find((x) => x.id === a.id)) : dansOnglet)
      .filter(Boolean)
      .map(({ journal, ...a }) => ({ ...a, onglet: ongletDe(a), a_appeler: raisons.get(a.id) || null, verrou: R.verrouTenu(a.verrou) ? a.verrou : null, journal: (journal || []).slice(0, 5) }));
    if (!seulementJour) lignes.sort((x, y) => (x.a_appeler ? 0 : 1) - (y.a_appeler ? 0 : 1) || String(x.nom).localeCompare(String(y.nom)));
    const { EQUIPE } = await import('../prospection/equipe.js');
    ok(res, { onglets, total: tous.length, onglet, a_appeler: jour.length, equipe: EQUIPE, lignes: lignes.slice(0, 1500) });
  }));

  app.post('/api/prospection/import-sheet', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const { importerSheet } = await import('../prospection/carnet.js');
    const r = await importerSheet(req.body?.lien, user.email);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  app.get('/api/prospection/appels/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const a = Records.get('AppelAgent', req.params.id);
    if (!a) return res.status(404).json({ error: 'Appel introuvable.' });
    ok(res, { appel: a });
  }));

  // --- Le carnet --------------------------------------------------------------

  app.get('/api/prospection/agents', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const q = String(req.query.q || '').trim();
    const tous = p.agents();
    const liste = (q ? p.trouver(tous, q).concat(tous.filter((a) => `${a.nom} ${a.agence || ''} ${a.ville || ''}`.toLowerCase().includes(q.toLowerCase()))) : tous)
      .filter((a, i, l) => l.findIndex((x) => x.id === a.id) === i)
      .sort((x, y) => (y.score || 0) - (x.score || 0) || String(y.dernier_contact_le || '').localeCompare(String(x.dernier_contact_le || '')) || String(x.nom).localeCompare(String(y.nom)));
    ok(res, { total: tous.length, agents: liste.slice(0, 300).map(({ journal, ...a }) => ({ ...a, journal_n: (journal || []).length })) });
  }));

  app.get('/api/prospection/agents/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const a = p.agentDe(req.params.id);
    if (!a) return res.status(404).json({ error: 'Agent introuvable.' });
    ok(res, { agent: a, appels: p.appels().filter((x) => x.agent_id === a.id).sort((x, y) => String(y.le).localeCompare(String(x.le))).slice(0, 20) });
  }));

  app.post('/api/prospection/agents', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const b = req.body || {};
    if (!String(b.nom || b.agence || '').trim()) return res.status(400).json({ error: 'Un nom ou une agence.' });
    if (!b.email && !b.telephone) return res.status(400).json({ error: 'Un mail ou un téléphone, pour pouvoir l\'appeler.' });
    const p = await P();
    const r = p.integrer([{ nom: b.nom, agence: b.agence, email: b.email, telephone: b.telephone, ville: b.ville, onglet: b.onglet || null, source: 'Ajouté à la main', remarque: b.remarque || null }]);
    ok(res, { cree: r.crees[0] || null, deja_connu: !r.crees.length });
  }));

  app.post('/api/prospection/agents/:id', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const a = p.agentDe(req.params.id);
    if (!a) return res.status(404).json({ error: 'Agent introuvable.' });
    const b = req.body || {};
    const R = await import('../prospection/regles.js');
    const champs = {};
    const { CHAMPS_LIBRES } = await import('../prospection/carnet.js');
    for (const k of ['nom', 'agence', 'ville', 'remarques', ...CHAMPS_LIBRES]) if (b[k] !== undefined) champs[k] = String(b[k] || '').slice(0, 2000) || null;
    if (b.telephones !== undefined) champs.telephones = [...new Set([].concat(b.telephones).map(R.telAffiche).filter(Boolean))];
    if (b.emails !== undefined) champs.emails = [...new Set([].concat(b.emails).map(R.normEmail).filter(Boolean))];
    if (b.secteurs !== undefined) champs.secteurs = [...new Set([].concat(b.secteurs).map((s) => String(s).trim()).filter(Boolean))];
    if (b.statut !== undefined && R.STATUTS[b.statut]) champs.statut = b.statut;
    if (b.referent !== undefined) champs.referent = b.referent || null;
    if (b.prochaine !== undefined) champs.prochaine = b.prochaine?.le ? { quoi: String(b.prochaine.quoi || 'rappeler').slice(0, 200), le: b.prochaine.le } : null;
    p.majAgent(a.id, champs);
    p.journal(a.id, { type: 'note', texte: `Fiche modifiée : ${Object.keys(champs).join(', ')}`, par: user.email });
    ok(res, { agent: p.agentDe(a.id) });
  }));

  // --- À envoyer --------------------------------------------------------------

  app.get('/api/prospection/envois', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    ok(res, { mails: p.aEnvoyer(), programmes: p.programmes() });
  }));

  app.post('/api/prospection/envois/envoyer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    if (!ids.length) return res.status(400).json({ error: 'Rien de choisi.' });
    ok(res, await (await P()).envoyerMails(ids, user));
  }));

  app.post('/api/prospection/envois/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await P()).modifierMail(req.params.id, req.body || {});
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  app.post('/api/prospection/envois/:id/ecarter', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await P()).ecarterMail(req.params.id, user.email);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // --- Les décisions ------------------------------------------------------------

  app.get('/api/prospection/decisions', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const { listeDeDecisions } = await import('../prospection/decisions.js');
    const p = await P();
    ok(res, { dossiers: await listeDeDecisions(), raisons: p.RAISONS_NON });
  }));

  app.post('/api/prospection/decisions/:deal', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const b = req.body || {};
    if (!['oui', 'non'].includes(b.decision)) return res.status(400).json({ error: 'Oui ou Non.' });
    const r = await (await P()).decider(req.params.deal, { decision: b.decision, raison: b.raison || null, sans_mail: !!b.sans_mail, user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  // --- Tableau de bord et réglages ----------------------------------------------

  app.get('/api/prospection/tableau', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await (await P()).tableauDeBord());
  }));

  app.get('/api/prospection/reglages', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const { etatDesAlertes } = await import('../prospection/alertes.js');
    const { tableaux } = await import('../prospection/monday.js');
    const { casse } = await import('../prospection/sources.js');
    const villes = new Map();
    for (const d of Records.list('Deal')) {
      const brut = String(d.lots?.[0]?.lot?.adresse?.valeur?.ville || '').replace(/\s+\d+.*$/, '').trim();
      if (!brut || d.test) continue;
      const v = casse(brut.toLowerCase());
      villes.set(v, (villes.get(v) || 0) + 1);
    }
    ok(res, {
      reglages: p.reglages(),
      villes_des_dossiers: [...villes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v]) => v),
      nuit: p.derniereNuit(),
      alertes: etatDesAlertes(),
      monday: tableaux(),
      carnet: p.agents().length,
      etat: p.etatProspection(),
    });
  }));

  app.post('/api/prospection/reglages', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, { reglages: (await P()).enregistrerReglages(req.body || {}, user.email) });
  }));

  // Un fichier d'agents : un export Apollo, une Google Sheet ou un Excel.
  app.post('/api/prospection/import', upload.single('fichier'), wrap(async (req, res) => {
    if (!admin(req, res)) return;
    if (!req.file) return res.status(400).json({ error: 'Aucun fichier.' });
    const nom = String(req.file.originalname || '');
    const buffer = fs.readFileSync(req.file.path);
    fs.promises.unlink(req.file.path).catch(() => {});
    const { candidatsDuFichier, lireCsv } = await import('../prospection/sources.js');
    let lignes;
    try {
      if (/\.xlsx$/i.test(nom)) { const { lireXlsx } = await import('../xlsx.js'); lignes = lireXlsx(buffer); }
      else lignes = lireCsv(buffer.toString('utf8'));
    } catch (e) { return res.status(400).json({ error: e?.message || 'Fichier illisible.' }); }
    const source = String(req.body?.source || '').trim().slice(0, 40) || (/apollo/i.test(nom) ? 'Apollo' : 'Import');
    const { candidats, sansContact } = candidatsDuFichier(lignes, { source });
    if (!candidats.length) return res.status(400).json({ error: `Aucun agent avec un mail ou un téléphone dans ce fichier (${lignes.length} lignes lues).` });
    const r = (await P()).integrer(candidats);
    ok(res, { lignes: lignes.length, crees: r.crees.length, completes: r.completes, sans_contact: sansContact });
  }));

  app.post('/api/prospection/equimmox', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const villes = (Array.isArray(req.body?.villes) ? req.body.villes : p.villesDuJour()).map((v) => String(v).trim()).filter(Boolean).slice(0, 10);
    if (!villes.length) return res.status(400).json({ error: 'Choisis d\'abord les villes du jour.' });
    ok(res, p.lancerRecherche(villes, { par: user.email }));
  }));

  app.get('/api/prospection/equimmox', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { recherche: (await P()).rechercheEnCours() });
  }));

  app.post('/api/prospection/import-monday', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await (await P()).importerDepuisMonday();
    ok(res, { lus: r.lus, crees: r.crees.length, completes: r.completes });
  }));

  // --- L'agent IA : les agences immobilières d'une ville, en listes partagées ---
  const IA = () => import('../prospection/agent-ia.js');
  app.get('/api/prospection/agent-ia/listes', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { listes: (await IA()).listes() });
  }));
  app.get('/api/prospection/agent-ia/listes/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const l = (await IA()).liste(req.params.id);
    if (!l) return res.status(404).json({ error: 'Liste introuvable.' });
    ok(res, l);
  }));
  // Revérifier dans Monday qui est déjà en contact, sans relancer la recherche.
  app.post('/api/prospection/agent-ia/listes/:id/monday', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const I = await IA();
    const l = I.liste(req.params.id);
    if (!l) return res.status(404).json({ error: 'Liste introuvable.' });
    const { contactsMonday } = await import('../prospection/monday-connus.js');
    await contactsMonday({ forcer: true });
    const r = await I.verifierMonday({ id: req.params.id });
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // À qui est une ligne : l'équipe qu'on peut nommer, et nommer ou retirer.
  app.get('/api/prospection/agent-ia/equipe', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, { equipe: (await IA()).equipe(), moi: String(currentUser(req)?.email || '').toLowerCase() });
  }));
  app.post('/api/prospection/agent-ia/agences/retirer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    ok(res, (await IA()).retirerAgences(Array.isArray(req.body?.ids) ? req.body.ids.slice(0, 500) : [], user, req.body?.motif || null));
  }));
  app.get('/api/prospection/agent-ia/listes/:id/retirees', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const I = await IA();
    ok(res, { retirees: I.retirees(req.params.id), regles: I.reglesApprises().map((r) => ({ cle: r.cle, motif: r.motif, libelle: I.METIERS_EXCLUS.find((m) => m.cle === r.cle)?.libelle || r.cle })) });
  }));
  app.post('/api/prospection/agent-ia/agences/:id/remettre', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await IA()).remettreAgence(req.params.id);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/agent-ia/agences/:id/pour', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await IA()).attribuer(req.params.id, { email: req.body?.email || null, retirer: !!req.body?.retirer }, currentUser(req));
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Compléter les colonnes vides (adresse, site, fiche Maps, numéro, gérants,
  // agents), sans rien remplacer de ce qui est rempli. En fond.
  app.post('/api/prospection/agent-ia/listes/:id/completer', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await IA()).completer(req.params.id, currentUser(req));
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.delete('/api/prospection/agent-ia/listes/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = (await IA()).supprimerListe(req.params.id);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/agent-ia/lancer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = (await IA()).lancer(req.body?.ville, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Monday (« Prospection Agent Immo ») : les agences cochées, ou la note dite après un appel.
  const MC = () => import('../prospection/monday-contacts.js');
  app.post('/api/prospection/agent-ia/monday', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ error: 'Cochez au moins une agence.' });
    const r = await (await MC()).agencesVersMonday(ids, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/monday/note', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await MC()).noteVersMonday(String(req.body?.texte || '').slice(0, 3000), user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  // Le mail d'une agence : son brouillon (nos critères), puis l'envoi d'un clic.
  app.get('/api/prospection/agent-ia/agences/:id/mail', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await (await MC()).brouillon(req.params.id, { agent: req.query.agent || null });
    if (!r.ok) return res.status(404).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/prospection/agent-ia/mail', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await MC()).envoyerMail(req.body || {}, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/agent-ia/agences/:id/appeler', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await IA()).pourAppeler(req.params.id, { agent: req.body?.agent ?? null }, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));
  app.post('/api/prospection/agent-ia/agences/:id/carnet', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const r = await (await IA()).auCarnet(req.params.id, { agent: req.body?.agent ?? null }, user);
    if (!r.ok) return refus(res, r);
    ok(res, r);
  }));

  app.post('/api/prospection/tour', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await (await P()).tour());
  }));
}
