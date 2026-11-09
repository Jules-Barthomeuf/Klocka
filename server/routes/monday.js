// Monday : les tableaux de l équipe.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { obtenirDossier } from '../deal/index.js';
import { currentUser, ok, upload, wrap } from '../contexte.js';

/** Monte les routes « monday » sur l'application. */
export function monterMonday(app) {
  // Le lien d'une fiche connue par son ancien id Monday (30 oct. 2026) : en CRM=twenty ou double (31 oct.), la fiche
  // Twenty qui porte cet id (mondayId) ; sinon, ou si Twenty ne l'a pas encore, la fiche Monday. Ouvert dans un nouvel onglet.
  app.get('/api/crm/fiche/:tableau/:id', wrap(async (req, res) => {
    const { tableau, id } = req.params;
    if (!/^\d+$/.test(tableau) || !/^\d+$/.test(id)) return res.status(400).send('Lien de fiche invalide');
    const M = await import('../monday.js');
    let lien = null;
    if (M.crmTwenty() || M.crmDouble()) lien = await (await import('../crm/monday-sur-twenty.js')).lienDepuisMonday(tableau, id);
    res.redirect(302, lien || M.lienMondayDirect(tableau, id));
  }));

  // Twenty CRM dans Klocka (5 nov. 2026, Jules) : la barre, les fiches, une fiche, un champ, une note ; selon le rôle Twenty.
  const ecran = () => import('../crm/ecran.js');
  // Qui regarde : un mandataire, ou Jules dans l'espace mandataire (?espace=mandataire), a les droits de K Partners.
  const quiDe = (u, req) => ({ email: u.email, admin: u.role === 'admin', mandataire: u.role === 'mandataire' || (u.role === 'admin' && req.query.espace === 'mandataire') });
  const crm = (fn) => wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Connexion requise.' });
    try { ok(res, await fn(u, req)); } catch (e) { res.status(e.status || 502).json({ error: e.status ? e.message : `Twenty ne répond pas : ${e.message}`.slice(0, 300) }); }
  });
  app.get('/api/crm/ecran', crm(async (u, req) => (await ecran()).barre(quiDe(u, req))));
  // Les fiches de Klocka depuis le CRM, et la carte des clients de Twenty (6 nov. 2026) : l'équipe seule.
  const equipe = (fn) => wrap(async (req, res) => {
    const u = currentUser(req);
    if (u?.role !== 'admin') return res.status(403).json({ error: "Réservé à l'équipe Klocka." });
    try { ok(res, await fn(u, req)); } catch (e) { res.status(e.status || 502).json({ error: `Twenty ne répond pas : ${e.message}`.slice(0, 300) }); }
  });
  app.get('/api/crm/klocka/carte', equipe(async (u, req) => (await import('../crm/klocka.js')).carteClients({ frais: req.query.frais === '1' })));
  app.get('/api/crm/klocka/:objet/:id', equipe(async (u, req) => ({ fiche: await (await import('../crm/klocka.js')).ficheKlocka(req.params.objet, req.params.id) })));
  app.put('/api/crm/ecran-ordre', crm(async (u, req) => (await ecran()).poserOrdre(quiDe(u, req), req.body?.espace, req.body?.pages)));
  const filtresDe = (req) => { try { const f = JSON.parse(String(req.query.filtres || '[]')); return Array.isArray(f) ? f.slice(0, 20) : []; } catch { return []; } };
  app.get('/api/crm/ecran-photo/:id', wrap(async (req, res) => {
    if (!currentUser(req)) return res.status(401).end();
    const image = await (await ecran()).photoMembre(String(req.params.id)).catch(() => null);
    if (!image) return res.status(404).end();
    res.set('Content-Type', image.type);
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(image.octets);
  }));
  app.get('/api/crm/ecran-modeles', crm(async (u, req) => (await ecran()).modeles(quiDe(u, req))));
  app.patch('/api/crm/ecran-taches/:id', crm(async (u, req) => (await ecran()).cocherTache(quiDe(u, req), req.params.id, !!req.body?.faite)));
  app.get('/api/crm/ecran/:objet', crm(async (u, req) => (await ecran()).page(quiDe(u, req), req.params.objet, { q: String(req.query.q || ''), tri: req.query.tri || null, sens: req.query.sens === 'desc' ? 'desc' : 'asc', apres: req.query.apres || null, filtres: filtresDe(req) })));
  app.get('/api/crm/ecran/:objet/chercher', crm(async (u, req) => (await ecran()).chercherLien(quiDe(u, req), req.params.objet, String(req.query.q || ''))));
  app.post('/api/crm/ecran/:objet', crm(async (u, req) => (await ecran()).ajouter(quiDe(u, req), req.params.objet, req.body?.nom, req.body?.valeurs)));
  app.post('/api/crm/ecran/:objet/lot', crm(async (u, req) => (await ecran()).lot(quiDe(u, req), req.params.objet, req.body || {})));
  app.get('/api/crm/ecran/:objet/export', wrap(async (req, res) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: 'Connexion requise.' });
    try {
      const r = await (await ecran()).exporter(quiDe(u, req), req.params.objet, { q: String(req.query.q || ''), tri: req.query.tri || null, sens: req.query.sens === 'desc' ? 'desc' : 'asc', filtres: filtresDe(req), colonnes: String(req.query.colonnes || '').split(',').filter(Boolean) });
      res.set('Content-Type', 'text/csv; charset=utf-8');
      res.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(r.nom)}`);
      res.send(r.csv);
    } catch (e) { res.status(e.status || 502).json({ error: e.message }); }
  }));
  app.post('/api/crm/ecran/:objet/vues', crm(async (u, req) => (await ecran()).creerVue(quiDe(u, req), req.params.objet, req.body || {})));
  app.patch('/api/crm/ecran/:objet/vues/:vue', crm(async (u, req) => (await ecran()).majVue(quiDe(u, req), req.params.objet, req.params.vue, req.body || {})));
  app.delete('/api/crm/ecran/:objet/vues/:vue', crm(async (u, req) => (await ecran()).supprimerVue(quiDe(u, req), req.params.objet, req.params.vue)));
  app.get('/api/crm/ecran/:objet/:id', crm(async (u, req) => (await ecran()).fiche(quiDe(u, req), req.params.objet, req.params.id)));
  app.patch('/api/crm/ecran/:objet/:id', crm(async (u, req) => (await ecran()).changer(quiDe(u, req), req.params.objet, req.params.id, req.body?.champ, req.body?.valeur)));
  app.post('/api/crm/ecran/:objet/:id/notes', crm(async (u, req) => (await ecran()).noterFiche(quiDe(u, req), req.params.objet, req.params.id, req.body?.texte, u.full_name || u.email)));
  app.get('/api/crm/ecran/:objet/:id/historique', crm(async (u, req) => (await ecran()).historique(quiDe(u, req), req.params.objet, req.params.id)));
  app.post('/api/crm/ecran/:objet/:id/fichiers', upload.single('fichier'), crm(async (u, req) => {
    if (!req.file) throw Object.assign(new Error('Aucun fichier.'), { status: 400 });
    const fs = await import('fs');
    try {
      return await (await ecran()).deposer(quiDe(u, req), req.params.objet, req.params.id, { chemin: req.file.path, nom: Buffer.from(req.file.originalname, 'latin1').toString('utf8'), taille: req.file.size, type: req.file.mimetype });
    } finally { fs.promises.unlink(req.file.path).catch(() => {}); }
  }));
  app.post('/api/crm/ecran/:objet/:id/taches', crm(async (u, req) => (await ecran()).ajouterTache(quiDe(u, req), req.params.objet, req.params.id, req.body || {})));
  app.post('/api/crm/ecran/:objet/:id/mail', crm(async (u, req) => (await ecran()).envoyerMail(u, req.params.objet, req.params.id, req.body || {}, quiDe(u, req))));

  // Monday : découverte des tableaux et de leurs colonnes. Sans les identifiants
  // de colonnes, impossible d'écrire quoi que ce soit — chacune est adressée par
  // son id, pas par son titre.
  // Qui voit quoi dans Twenty CRM (1er nov. 2026, Jules) : l'administration seule lit et règle les accès.
  const adminCrm = (req, res) => {
    const u = currentUser(req);
    if (u?.role !== 'admin') { res.status(403).json({ error: 'Réservé aux administrateurs.' }); return null; }
    return u;
  };
  app.get('/api/admin/crm/acces', wrap(async (req, res) => {
    if (!adminCrm(req, res)) return;
    const r = await (await import('../crm/acces.js')).lireAcces();
    if (!r.ok) return res.status(503).json({ error: r.error });
    ok(res, r);
  }));
  app.post('/api/admin/crm/acces/niveau', wrap(async (req, res) => {
    if (!adminCrm(req, res)) return;
    const { role_id, objet_id, niveau } = req.body || {};
    try { ok(res, await (await import('../crm/acces.js')).poserNiveau(role_id, objet_id, niveau)); } catch (e) { res.status(400).json({ error: e.message }); }
  }));
  app.post('/api/admin/crm/acces/champ', wrap(async (req, res) => {
    if (!adminCrm(req, res)) return;
    const { role_id, objet_id, champ_id, cache } = req.body || {};
    try { ok(res, await (await import('../crm/acces.js')).cacherChamp(role_id, objet_id, champ_id, !!cache)); } catch (e) { res.status(400).json({ error: e.message }); }
  }));

  app.get('/api/monday/tableaux', wrap(async (req, res) => {
    const { mondayConfigure, listerTableaux, TABLEAUX } = await import('../monday.js');
    if (!mondayConfigure()) {
      return ok(res, { configure: false, tableaux: [], vises: TABLEAUX });
    }
    const tableaux = await listerTableaux();
    ok(res, {
      configure: true,
      vises: TABLEAUX,
      tableaux: tableaux.map((t) => ({
        id: t.id,
        nom: t.name,
        colonnes: (t.columns || []).map((c) => ({ id: c.id, titre: c.title, type: c.type })),
      })),
    });
  }));

  // La carte de Klocka (22 oct. 2026) : projets, prospection, clients et deals, pour l'équipe.
  app.get('/api/carte', wrap(async (req, res) => {
    if (currentUser(req)?.role !== 'admin') return res.status(403).json({ error: "Réservé à l'équipe." });
    ok(res, await (await import('../carte.js')).carte({ frais: req.query.frais === '1' }));
  }));

  // À qui correspond chaque projet, d'après les investisseurs tenus dans Monday.
  // Un seul appel pour toute la page : la liste des investisseurs est en cache,
  // une requête par projet la relirait pour rien.
  app.get('/api/monday/projets/clients', wrap(async (req, res) => {
    const { mondayConfigure } = await import('../monday.js');
    if (!mondayConfigure()) return ok(res, { configure: false, par_projet: {} });

    const { investisseursPourProjet } = await import('../deal/monday-sync.js');
    const projets = Records.list('Project').filter((p) => !p.archived);

    const parProjet = {};
    for (const projet of projets) {
      const candidats = await investisseursPourProjet(projet);
      if (candidats.length) {
        parProjet[projet.id] = candidats.map((c) => ({
          nom: c.client.nom,
          budget: c.client.budget,
          statut: c.client.statut,
          raisons: c.raisons,
        }));
      }
    }
    ok(res, { configure: true, par_projet: parProjet });
  }));

  // Pousser un projet de la plateforme dans Monday.
  app.post('/api/monday/projets/:id', wrap(async (req, res) => {
    const projet = Records.get('Project', req.params.id);
    if (!projet) return res.status(404).json({ error: 'Projet introuvable' });
    const { pousserProjet } = await import('../deal/monday-sync.js');
    const r = await pousserProjet(projet, { motif: req.body?.motif, par: currentUser(req) });
    if (r?.ignore) return res.status(400).json({ error: 'Twenty CRM non configuré' });
    ok(res, r);
  }));

  // Pousser un dossier dans « Propriétés Klocka » sans attendre sa clôture.
  app.post('/api/monday/dossiers/:dealId', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { pousserBien } = await import('../deal/monday-sync.js');
    const r = await pousserBien(Records.findBy('Deal', 'deal_id', req.params.dealId), {
      motif: req.body?.motif,
      par: currentUser(req),
    });
    if (r?.ignore) return res.status(400).json({ error: 'Twenty CRM non configuré' });
    ok(res, r);
  }));

  // Twenty : le webhook des modifications (scripts/crm/deplacer-twenty.mjs). Public, ouvert par la signature de Twenty.
  // Réponse immédiate (Twenty coupe à 5 s) ; un « Déplacer vers » rempli déplace la fiche juste après.
  app.post('/api/crm/webhook', wrap(async (req, res) => {
    const D = await import('../crm/deplacer.js');
    if (!D.signatureValide(req.body, req.get('x-twenty-webhook-timestamp'), req.get('x-twenty-webhook-signature'))) return res.status(403).json({ error: 'Signature refusée.' });
    const S = await import('../crm/synchro.js');
    const L = await import('../layer-sources.js');
    const Mails = await import('../crm/mails.js');
    const E = await import('../mandataire-espace.js');
    ok(res, { deplacement: D.recevoirEvenement(req.body), synchro: S.depuisTwenty(req.body), layer: L.depuisTwenty(req.body), mail: Mails.depuisTwenty(req.body), clients: E.surClientTwenty(req.body) });
  }));

  // Monday : les webhooks des tableaux migrés (scripts/crm/synchro-monday.mjs), pour que Twenty suive ce que l'équipe
  // fait dans Monday (CRM=double). Public, ouvert par le jeton CRM_MONDAY_JETON ; Monday vérifie l'adresse par un défi.
  app.post('/api/crm/monday', wrap(async (req, res) => {
    const jeton = String(process.env.CRM_MONDAY_JETON || '');
    if (!jeton || String(req.query.jeton || '') !== jeton) return res.status(403).json({ error: 'Jeton refusé.' });
    if (req.body?.challenge) return res.json({ challenge: req.body.challenge });
    const S = await import('../crm/synchro.js');
    ok(res, S.depuisMonday(req.body?.event));
  }));
}
