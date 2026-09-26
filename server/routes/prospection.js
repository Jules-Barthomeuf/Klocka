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

  app.post('/api/prospection/appels/:id/valider', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const b = req.body || {};
    const r = await p.validerAppel({ appel_id: req.params.id, choix: Array.isArray(b.choix) ? b.choix : [], mail: b.mail || null, sms: b.sms || null, envoyer: !!b.envoyer, user });
    if (!r.ok) return refus(res, r);
    ok(res, r);
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
    const r = p.integrer([{ nom: b.nom, agence: b.agence, email: b.email, telephone: b.telephone, ville: b.ville, source: 'Ajouté à la main', remarque: b.remarque || null }]);
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
    for (const k of ['nom', 'agence', 'ville', 'remarques']) if (b[k] !== undefined) champs[k] = String(b[k] || '').slice(0, 2000) || null;
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

  app.post('/api/prospection/tour', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    ok(res, await (await P()).tour());
  }));
}
