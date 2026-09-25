// La prospection : la liste d'appels de chacun, l'appel noté, les mails prêts,
// l'ajout d'agents (fichier, Equimmox, à la main) et les réglages. Réservé à
// l'équipe. Le carnet est dans Monday ; ces routes le lisent et l'écrivent
// par server/prospection/.

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

  app.get('/api/prospection/appels', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const { mondayConfigure } = await import('../prospection/monday.js');
    const jour = await p.appelsDuJour({ pour: user.email });
    ok(res, { ...jour, monday: mondayConfigure(), mails_prets: p.mailsPrets().length, reglages: p.reglages(), etat: p.etatProspection() });
  }));

  app.post('/api/prospection/appel', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const { item_id, statut, remarque = null, relance = null } = req.body || {};
    if (/^(dossier|retour):/.test(String(item_id))) return ok(res, p.noterAppelHorsTableau({ id: item_id, remarque, par: user.email }));
    const r = await p.noterAppel({ item_id, statut, remarque, relance, par: user.email });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/prospection/mails', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    ok(res, { mails: p.mailsPrets(), criteres: !!String(p.reglages().criteres || '').trim() });
  }));

  app.post('/api/prospection/mails/preparer', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const retours = await p.preparerRetours({ max: 10 });
    const criteres = await p.preparerCriteres(await p.prospects().catch(() => []));
    ok(res, { retours, criteres, mails: p.mailsPrets() });
  }));

  app.post('/api/prospection/mails/envoyer', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String).slice(0, 100) : [];
    if (!ids.length) return res.status(400).json({ error: 'Aucun mail choisi.' });
    const p = await P();
    ok(res, await p.envoyerMails(ids, user));
  }));

  app.post('/api/prospection/mails/:id', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const r = p.modifierMail(req.params.id, req.body || {});
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/prospection/mails/:id/ecarter', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const r = p.ecarterMail(req.params.id, user.email);
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.get('/api/prospection/reglages', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const { etatDesAlertes } = await import('../prospection/alertes.js');
    // Les villes des dossiers, pour proposer des villes cibles d'un clic.
    const { casse } = await import('../prospection/sources.js');
    const villes = new Map();
    for (const d of Records.list('Deal')) {
      // « Paris 18 », « Paris 8ème » et « PARIS » sont Paris.
      const brut = String(d.lots?.[0]?.lot?.adresse?.valeur?.ville || '').replace(/\s+\d+.*$/, '').trim();
      if (!brut || d.test) continue;
      const v = casse(brut.toLowerCase());
      villes.set(v, (villes.get(v) || 0) + 1);
    }
    // L'équipe : les comptes Klocka de l'équipe, et les collègues de Monday
    // (quelqu'un qui prospecte sans compte Klocka reçoit quand même sa liste en privé).
    const parEmail = new Map();
    // Les adresses de l'équipe seulement : pas les comptes de test ni les boîtes personnelles.
    for (const u of Records.filter('User', { role: 'admin' })) { const e = String(u.email || '').toLowerCase(); if (e.endsWith('@klocka.immo')) parEmail.set(e, { email: e, nom: u.full_name || e }); }
    try {
      const { utilisateursMonday, mondayConfigure } = await import('../monday.js');
      if (mondayConfigure()) for (const u of await utilisateursMonday()) { const e = String(u.email || '').toLowerCase(); if (e.endsWith('@klocka.immo') && !parEmail.has(e)) parEmail.set(e, { email: e, nom: u.name }); }
    } catch { /* Monday injoignable : les comptes Klocka suffisent */ }
    const equipe = [...parEmail.values()];
    ok(res, {
      reglages: p.reglages(),
      equipe,
      villes_des_dossiers: [...villes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([v]) => v),
      nuit: p.derniereNuit(),
      alertes: etatDesAlertes(),
      recherche: p.rechercheEnCours(),
      etat: p.etatProspection(),
    });
  }));

  app.post('/api/prospection/reglages', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    ok(res, { reglages: p.enregistrerReglages(req.body || {}, user.email) });
  }));

  // Un fichier d'agents : un export Apollo, une Google Sheet ou un Excel (CSV
  // ou .xlsx). Les colonnes sont reconnues par leur nom.
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
    const { candidats, sansContact, colonnes } = candidatsDuFichier(lignes, { source });
    if (!candidats.length) return res.status(400).json({ error: `Aucun agent avec un mail ou un téléphone dans ce fichier (${lignes.length} lignes lues). Colonnes reconnues : ${Object.entries(colonnes).filter(([, v]) => v).map(([k, v]) => `${k} = ${v}`).join(', ') || 'aucune'}.` });
    const p = await P();
    const r = await p.importerCandidats(candidats, { max: 500 });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, { ...r, lignes: lignes.length, sans_contact: sansContact });
  }));

  app.post('/api/prospection/ajouter', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const b = req.body || {};
    const { normEmail, normTel, telAffiche } = await import('../prospection/regles.js');
    const c = { nom: String(b.nom || '').trim().slice(0, 120), agence: String(b.agence || '').trim().slice(0, 120) || null, email: normEmail(b.email), telephone: normTel(b.telephone) ? telAffiche(b.telephone) : null, ville: String(b.ville || '').trim().slice(0, 60) || null, source: 'Ajouté à la main', annonces: 0, remarque: String(b.remarque || '').trim().slice(0, 500) || null };
    if (!c.nom && !c.agence) return res.status(400).json({ error: 'Un nom ou une agence.' });
    if (!c.email && !c.telephone) return res.status(400).json({ error: 'Un mail ou un téléphone, pour pouvoir l\'appeler.' });
    const p = await P();
    const r = await p.importerCandidats([c], { max: 1 });
    if (!r.ok) return res.status(400).json({ error: r.error });
    ok(res, r);
  }));

  app.post('/api/prospection/equimmox', wrap(async (req, res) => {
    const user = admin(req, res);
    if (!user) return;
    const p = await P();
    const villes = (Array.isArray(req.body?.villes) ? req.body.villes : p.reglages().villes).map((v) => String(v).trim()).filter(Boolean).slice(0, 10);
    if (!villes.length) return res.status(400).json({ error: 'Aucune ville : ajoutez vos villes cibles dans les réglages.' });
    ok(res, p.lancerRecherche(villes, { par: user.email }));
  }));

  app.get('/api/prospection/equimmox', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    ok(res, { recherche: p.rechercheEnCours() });
  }));

  app.post('/api/prospection/synchroniser', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    ok(res, await p.synchroniser());
  }));

  app.get('/api/prospection/semaine', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const p = await P();
    const { pointDeLaSemaine } = await import('../prospection/matin.js');
    ok(res, pointDeLaSemaine({ fiches: await p.fichesDepuisLaRemiseAZero(), appels: p.appels() }));
  }));
}
