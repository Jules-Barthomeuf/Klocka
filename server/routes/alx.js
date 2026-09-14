// ALX, la prospection off-market : les routes.
//
// Réservées à l'équipe par la garde globale (préfixe dans PREFIXES_EQUIPE).
// Les actions qui interrogent une source externe répondent avec ce qu'elles
// ont obtenu, ou avec une erreur lisible quand la source n'est pas configurée.

import { Records } from '../db.js';
import { ok, wrap, currentUser } from '../contexte.js';
import {
  etatDesOutils, listerVilles, obtenirVille, creerVille, classerRue, retirerRue, reclasserRues,
  listerCibles, obtenirCible, creerCible, mettreAJourCible, reclasser, supprimerCible,
  enregistrerApproche, qualifierApproche, creerDossierDepuisCible, aFaire, bilan, PILES,
} from '../alx/index.js';
import { REGLES, LIBELLES_PILES } from '../alx/classement.js';

const erreur = (res, e, statut = 400) => res.status(statut).json({ error: String(e?.message || e) });

/** Monte les routes « alx » sur l'application. */
export function monterAlx(app) {
  import('../alx/parcours.js').then((m) => m.reprendreAuDemarrage()).catch((e) => console.error('[alx] reprise au démarrage :', e.message));
  // Les explications des signaux et des drapeaux, pour que la fiche puisse
  // dire pourquoi un signal compte, avec les mots de signaux.json.
  const explications = Object.fromEntries([...(REGLES.signaux_forts || []), ...(REGLES.signaux_patients || []), ...(REGLES.drapeaux || []), ...(REGLES.knock_outs || [])].map((s) => [s.cle, s.detail || null]));
  app.get('/api/alx/etat', wrap(async (req, res) => {
    const { MOTIFS } = await import('../alx/apprentissage.js');
    ok(res, { outils: await etatDesOutils(), piles: PILES, libelles: LIBELLES_PILES, regles_version: REGLES.version, explications, seuils: REGLES.parcours || null, motifs_rue: MOTIFS, a_faire: aFaire() });
  }));

  // Les clients actifs de Monday, et ceux qu'une fourchette de prix concerne.
  app.get('/api/alx/clients', wrap(async (req, res) => {
    const { clientsActifs, fourchetteBudgets } = await import('../alx/clients.js');
    ok(res, { clients: await clientsActifs(), fourchette: await fourchetteBudgets() });
  }));

  // --- Villes ---------------------------------------------------------------
  // L'emplacement d'une adresse, pour l'analyse de marché : le rang de sa rue
  // dans sa ville, ses vitrines, son loyer. Gratuit, et gardé trente jours.
  app.get('/api/alx/emplacement', wrap(async (req, res) => {
    const { emplacementDeLAdresse } = await import('../alx/emplacement.js');
    const r = await emplacementDeLAdresse(req.query.adresse, { forcer: req.query.forcer === '1' });
    if (!r) return erreur(res, "Adresse incomplète : il faut au moins « rue, ville ».", 400);
    ok(res, r);
  }));

  app.get('/api/alx/villes', wrap((req, res) => ok(res, listerVilles())));
  app.post('/api/alx/villes', wrap((req, res) => {
    const r = creerVille({ ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.get('/api/alx/villes/:id', wrap((req, res) => {
    const v = obtenirVille(req.params.id);
    if (!v) return res.status(404).json({ error: 'Ville introuvable.' });
    ok(res, { ...v, cibles_liste: listerCibles({ ville_id: v.id }) });
  }));
  // Le parcours automatique d'une ville, en tâche de fond ; l'écran suit sur la Ville.
  app.post('/api/alx/villes/:id/lancer', wrap(async (req, res) => {
    const { lancer } = await import('../alx/parcours.js');
    const r = lancer(req.params.id, { user: currentUser(req), rayon_km: req.body?.rayon_km ? Number(req.body.rayon_km) : undefined, limite_par_rue: req.body?.limite_par_rue ? Number(req.body.limite_par_rue) : null, rediger: req.body?.rediger === true, tout: req.body?.tout === true });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));
  app.post('/api/alx/villes/:id/parcourir', wrap(async (req, res) => {
    const { parcourir } = await import('../alx/parcours.js');
    const r = parcourir(req.params.id, req.body?.rues || [], { user: currentUser(req), limite_par_rue: req.body?.limite_par_rue ? Number(req.body.limite_par_rue) : null });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));
  app.post('/api/alx/villes/:id/rediger', wrap(async (req, res) => {
    const { redigerPour } = await import('../alx/parcours.js');
    const r = redigerPour(req.params.id, req.body?.cibles || [], { user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));
  app.post('/api/alx/villes/:id/arreter', wrap(async (req, res) => {
    const { arreter } = await import('../alx/parcours.js');
    const r = arreter(req.params.id);
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, { ...r, ville: Records.get('Ville', req.params.id) });
  }));
  app.post('/api/alx/villes/:id/rues/:nom/parcourir', wrap(async (req, res) => {
    const { parcourirRue } = await import('../alx/parcours.js');
    const r = parcourirRue(req.params.id, decodeURIComponent(req.params.nom), { user: currentUser(req), limite_par_rue: req.body?.limite_par_rue ? Number(req.body.limite_par_rue) : null, rediger: req.body?.rediger !== false });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));

  app.post('/api/alx/villes/:id/rues/:nom/flux', wrap(async (req, res) => {
    const { lireFluxRue } = await import('../alx/index.js');
    const r = await lireFluxRue(req.params.id, decodeURIComponent(req.params.nom), { user: currentUser(req), forcer: !!req.body?.forcer });
    if (!r.ok) return erreur(res, r.error, 409);
    ok(res, r);
  }));
  // Le chat de la ville : une phrase, un geste (prospecter une rue, analyser un commerce).
  app.post('/api/alx/villes/:id/commande', wrap(async (req, res) => {
    const { executerCommande } = await import('../alx/commande.js');
    const r = await executerCommande(req.params.id, req.body?.texte || '', { user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error, 400);
    ok(res, r);
  }));
  // Reclasse les rues avec la règle du jour, sans relire les sources.
  app.post('/api/alx/villes/:id/reclasser-rues', wrap(async (req, res) => {
    const r = await reclasserRues(req.params.id);
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));
  app.post('/api/alx/villes/:id/rues', wrap(async (req, res) => {
    const r = await classerRue(req.params.id, { ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.delete('/api/alx/villes/:id/rues/:nom', wrap((req, res) => ok(res, retirerRue(req.params.id, decodeURIComponent(req.params.nom, currentUser(req))))));
  app.delete('/api/alx/villes/:id', wrap((req, res) => {
    for (const c of Records.filter('Cible', { ville_id: req.params.id })) supprimerCible(c.id);
    Records.delete('Ville', req.params.id);
    ok(res, { ok: true });
  }));

  // --- Cibles ---------------------------------------------------------------
  app.get('/api/alx/cibles', wrap((req, res) => ok(res, listerCibles({ ville_id: req.query.ville || null, pile: req.query.pile || null }))));
  app.post('/api/alx/cibles', wrap((req, res) => {
    const r = creerCible({ ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.get('/api/alx/cibles/:id', wrap((req, res) => {
    const c = obtenirCible(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    ok(res, c);
  }));
  app.put('/api/alx/cibles/:id', wrap((req, res) => {
    const r = mettreAJourCible(req.params.id, req.body || {}, currentUser(req));
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));
  app.delete('/api/alx/cibles/:id', wrap((req, res) => ok(res, supprimerCible(req.params.id))));
  app.post('/api/alx/cibles/:id/classer', wrap((req, res) => {
    const c = reclasser(req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    ok(res, { ok: true, cible: c });
  }));

  // --- Les connecteurs, un par geste ----------------------------------------

  // La devanture : photo datée et lecture par le modèle, à valider.
  app.post('/api/alx/cibles/:id/devanture', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.lireDevanture(c.id, { user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // La société : l'annuaire des entreprises, par SIREN ou par le nom lu sur
  // Data-B. Gratuit, sans clé. Le code postal de la ville filtre les homonymes.
  // Le propriétaire par l'adresse : Data Foncier (Data-B), puis l'annuaire des
  // entreprises pour la société, puis le classement. Un seul geste.
  app.post('/api/alx/cibles/:id/proprietaire', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.trouverProprietaire(c.id, { siren: req.body?.siren || null, user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // Le vendeur d'un dossier : le propriétaire des murs et pourquoi il vend.
  // Data Foncier, annuaire, BODACC, DVF, loyer de la rue : aucun crédit.
  app.post('/api/alx/vendeur', wrap(async (req, res) => {
    const { vendeurDe } = await import('../alx/vendeur.js');
    try {
      ok(res, await vendeurDe({ ...(req.body || {}), user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));
  app.get('/api/alx/vendeur/raisons', wrap(async (req, res) => {
    const { RAISONS_REELLES, resumeEtude } = await import('../alx/vendeur.js');
    ok(res, { raisons: RAISONS_REELLES, etude: resumeEtude() });
  }));
  app.post('/api/alx/vendeur/:id/raison', wrap(async (req, res) => {
    const { poserRaisonReelle } = await import('../alx/vendeur.js');
    const r = poserRaisonReelle(req.params.id, { raison_cle: req.body?.raison_cle, raison: req.body?.raison || null, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error, 400);
    ok(res, r);
  }));

  // Écarter, avec un retour qui devient une règle, et les semblables à écarter aussi.
  app.post('/api/alx/cibles/:id/ecarter', wrap(async (req, res) => {
    const { ecarter } = await import('../alx/ecarts.js');
    const r = ecarter(req.params.id, { motif: req.body?.motif || null, sur: req.body?.sur || {}, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));
  app.post('/api/alx/cibles/ecarter-plusieurs', wrap(async (req, res) => {
    const { ecarterPlusieurs } = await import('../alx/ecarts.js');
    ok(res, ecarterPlusieurs(req.body?.ids || [], { motif: req.body?.motif || null, regle_id: req.body?.regle_id || null, user: currentUser(req) }));
  }));
  app.post('/api/alx/cibles/:id/reprendre', wrap(async (req, res) => {
    const { reprendre } = await import('../alx/ecarts.js');
    const r = reprendre(req.params.id, { user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));
  app.get('/api/alx/regles', wrap(async (req, res) => {
    const { reglesActives } = await import('../alx/ecarts.js');
    ok(res, { regles: reglesActives() });
  }));
  app.delete('/api/alx/regles/:id', wrap(async (req, res) => {
    const { retirerRegle } = await import('../alx/ecarts.js');
    const r = retirerRegle(req.params.id);
    if (!r.ok) return erreur(res, r.error, 404);
    ok(res, r);
  }));

  app.post('/api/alx/cibles/:id/societe', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.lireSociete(c.id, { siren: req.body?.siren || null, nom: req.body?.nom || null, user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // Les événements : BODACC par SIREN.
  app.post('/api/alx/cibles/:id/evenements', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.lireEvenements(c.id, { user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // La dernière mutation : DVF autour de l'adresse, la vente la plus proche.
  app.post('/api/alx/cibles/:id/mutation', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.lireMutation(c.id, { user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // Le loyer de marché de la rue : les connecteurs existants.
  app.post('/api/alx/cibles/:id/loyer', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, await enrichir.lireLoyer(c.id, { user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // Qui, parmi les clients actifs, cette fourchette concernerait.
  app.get('/api/alx/cibles/:id/clients', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const f = c.valorisation?.fourchette;
    if (!f) return ok(res, { clients: [], attente: 'Calculez la fourchette de prix d’abord.' });
    const { clientsPourFourchette } = await import('../alx/clients.js');
    ok(res, { clients: await clientsPourFourchette(f) });
  }));

  // La fourchette de prix : loyer × surface ÷ rendement, croisée avec DVF.
  app.post('/api/alx/cibles/:id/prix', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, enrichir.calculerPrix(c.id, { surface: req.body?.surface ?? null, taux: req.body?.taux ?? null, user: currentUser(req) }));
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // Le message : rédigé par le modèle, relu par l'équipe, jamais envoyé d'ici.
  app.post('/api/alx/cibles/:id/message', wrap(async (req, res) => {
    const c = Records.get('Cible', req.params.id);
    if (!c) return res.status(404).json({ error: 'Cible introuvable.' });
    const enrichir = await import('../alx/enrichir.js');
    try {
      ok(res, (await enrichir.redigerBrouillon(c.id, { canal: req.body?.canal === 'courrier' ? 'courrier' : 'mail', user: currentUser(req) })).brouillon);
    } catch (e) {
      return erreur(res, e, e.statut || 400);
    }
  }));

  // --- Approches --------------------------------------------------------------
  app.post('/api/alx/cibles/:id/approches', wrap((req, res) => {
    const r = enregistrerApproche({ ...req.body, cible_id: req.params.id, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));
  app.post('/api/alx/approches/:id/issue', wrap((req, res) => {
    const r = qualifierApproche(req.params.id, { ...req.body, user: currentUser(req) });
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));

  // --- Le passage en dossier ----------------------------------------------------
  app.post('/api/alx/cibles/:id/dossier', wrap(async (req, res) => {
    const r = await creerDossierDepuisCible(req.params.id, currentUser(req));
    if (!r.ok) return erreur(res, r.error);
    ok(res, r);
  }));

  // --- Le bilan --------------------------------------------------------------
  app.get('/api/alx/bilan', wrap((req, res) => ok(res, bilan())));
}
