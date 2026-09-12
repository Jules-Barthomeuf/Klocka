// Monday : les tableaux de l équipe.
//
// Sorti de index.js, qui portait cent soixante-quatorze routes dans un seul
// fichier de près de trois mille lignes.

import { Records } from '../db.js';
import { obtenirDossier } from '../deal/index.js';
import { currentUser, ok, wrap } from '../contexte.js';

/** Monte les routes « monday » sur l'application. */
export function monterMonday(app) {
  // Monday : découverte des tableaux et de leurs colonnes. Sans les identifiants
  // de colonnes, impossible d'écrire quoi que ce soit — chacune est adressée par
  // son id, pas par son titre.
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
    if (r?.ignore) return res.status(400).json({ error: 'Monday non configuré' });
    ok(res, r);
  }));

  // Pousser un dossier dans « Propriétés Klocka » sans attendre sa clôture.
  app.post('/api/monday/dossiers/:dealId', wrap(async (req, res) => {
    const dossier = obtenirDossier(req.params.dealId);
    if (!dossier) return res.status(404).json({ error: 'Dossier introuvable' });
    const { pousserBien } = await import('../deal/monday-sync.js');
    const r = await pousserBien(Records.filter('Deal', { deal_id: req.params.dealId })[0], {
      motif: req.body?.motif,
      par: currentUser(req),
    });
    if (r?.ignore) return res.status(400).json({ error: 'Monday non configuré' });
    ok(res, r);
  }));
}
