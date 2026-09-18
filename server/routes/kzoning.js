// K-Zoning : les zones d'étude, leurs dossiers, et ce qu'on lit dedans.
//
// Réservé à l'équipe : la garde globale de index.js range « kzoning » parmi
// les préfixes d'équipe, et chaque route revérifie le rôle — une garde qui
// vit à un seul endroit finit par sauter lors d'un remaniement.

import { Records } from '../db.js';
import { currentUser, ok, wrap } from '../contexte.js';
import {
  listerZones, listerDossiers, creerZoneCercle, renommerZone, deplacerZone,
  supprimerZone, creerDossier, renommerDossier, supprimerDossier,
} from '../kzoning.js';
import { listerMetiers, filtresDe, TOUS_LES_COMMERCES, nomMetierDe } from '../kzoning-metiers.js';
import { commercesDeLaZone, equipementsDeLaZone } from '../kzoning-commerces.js';
import { habitantsDeLaZone } from '../kzoning-insee.js';
import { societe } from '../kzoning-societe.js';

/** Monte les routes « kzoning » sur l'application. */
export function monterKZoning(app) {
  const admin = (req, res) => {
    const user = currentUser(req);
    if (user?.role !== 'admin') {
      res.status(403).json({ error: 'Réservé à l\'équipe.' });
      return null;
    }
    return user;
  };

  // Le verdict d'un module : ok, ou l'erreur qu'il a formulée. Les erreurs de
  // K-Zoning sont des phrases pour l'équipe, pas des codes.
  const rendre = (res, r) => (r.ok ? ok(res, r) : res.status(400).json({ error: r.error }));

  // --- Les zones et leur rangement ----------------------------------------

  app.get('/api/kzoning/zones', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { zones: listerZones(), dossiers: listerDossiers() });
  }));

  app.post('/api/kzoning/zones', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    rendre(res, creerZoneCercle(req.body || {}, user));
  }));

  app.patch('/api/kzoning/zones/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    const { nom, dossier_id } = req.body || {};
    // Renommer et ranger sont deux gestes : on n'en fait qu'un par appel, et
    // le nom passe d'abord s'il est là.
    if (nom !== undefined) return rendre(res, renommerZone(req.params.id, nom));
    if (dossier_id !== undefined) return rendre(res, deplacerZone(req.params.id, dossier_id));
    res.status(400).json({ error: 'Rien à changer.' });
  }));

  app.delete('/api/kzoning/zones/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    rendre(res, supprimerZone(req.params.id));
  }));

  app.post('/api/kzoning/dossiers', wrap((req, res) => {
    const user = admin(req, res);
    if (!user) return;
    rendre(res, creerDossier(req.body?.nom, user));
  }));

  app.patch('/api/kzoning/dossiers/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    rendre(res, renommerDossier(req.params.id, req.body?.nom));
  }));

  app.delete('/api/kzoning/dossiers/:id', wrap((req, res) => {
    if (!admin(req, res)) return;
    rendre(res, supprimerDossier(req.params.id));
  }));

  /**
   * La société derrière une devanture : son identité, son siège, ses
   * établissements, ses dirigeants, ses comptes déposés. On l'interroge par le
   * SIRET que porte le commerce dans OpenStreetMap, ou à défaut par son nom.
   */
  app.get('/api/kzoning/societe', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const r = await societe({
      siret: req.query.siret || null,
      nom: req.query.nom || null,
      forcer: req.query.forcer === '1',
    });
    if (!r.ok) return res.status(r.error?.includes('Aucune') ? 404 : 502).json({ error: r.error });
    ok(res, r);
  }));

  // --- Ce qu'on lit dans une zone -----------------------------------------

  // Le référentiel des métiers, tel que la barre de recherche le montre.
  app.get('/api/kzoning/metiers', wrap((req, res) => {
    if (!admin(req, res)) return;
    ok(res, { tous: TOUS_LES_COMMERCES.nom, metiers: listerMetiers() });
  }));

  /**
   * La lecture d'une zone : ses habitants d'après l'INSEE, ses équipements
   * d'après OpenStreetMap. Les deux sources partent ensemble ; l'une qui tombe
   * n'empêche pas l'autre d'être rendue.
   */
  app.get('/api/kzoning/zones/:id/lecture', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const zone = Records.get('ZoneKData', req.params.id);
    if (!zone) return res.status(404).json({ error: 'Cette zone n\'existe plus.' });
    const z = { lat: Number(zone.centre_lat), lon: Number(zone.centre_lon), rayon_m: Number(zone.rayon_m), forcer: req.query.forcer === '1' };
    // `source` : l'écran demande les deux séparément. L'INSEE répond en trois
    // secondes, OpenStreetMap parfois en deux minutes à froid : les onglets
    // d'habitants n'ont pas à attendre les transports.
    const source = String(req.query.source || '');
    const veutInsee = source !== 'equipements';
    const veutEquipements = source !== 'insee';
    const [h, e] = await Promise.all([
      veutInsee ? habitantsDeLaZone(z) : null,
      veutEquipements ? equipementsDeLaZone(z) : null,
    ]);
    ok(res, {
      ...(h ? { insee: h.ok ? h.insee : null, insee_erreur: h.ok ? null : h.error, insee_garde_le: h.ok ? h.garde_le : null } : {}),
      ...(e ? { equipements: e.ok ? e.equipements : null, equipements_erreur: e.ok ? null : e.error, equipements_garde_le: e.ok ? e.garde_le : null } : {}),
    });
  }));

  /**
   * Les commerces d'une zone pour les métiers demandés.
   * `metiers` vide vaut « tous les commerces ».
   */
  app.post('/api/kzoning/zones/:id/commerces', wrap(async (req, res) => {
    if (!admin(req, res)) return;
    const zone = Records.get('ZoneKData', req.params.id);
    if (!zone) return res.status(404).json({ error: 'Cette zone n\'existe plus.' });
    const metiers = Array.isArray(req.body?.metiers) ? req.body.metiers : [];
    const r = await commercesDeLaZone({
      lat: Number(zone.centre_lat),
      lon: Number(zone.centre_lon),
      rayon_m: Number(zone.rayon_m),
      filtres: filtresDe(metiers),
      forcer: !!req.body?.forcer,
    });
    if (!r.ok) return res.status(502).json({ error: r.error });
    // Le nom français du métier voyage avec le commerce : la fiche société
    // l'affiche à côté du code NAF, que l'œil ne sait pas lire.
    const nomDe = nomMetierDe();
    const commerces = (r.commerces || []).map((c) => ({ ...c, metier: nomDe(c.genre) }));
    ok(res, { ...r, commerces, metiers });
  }));
}
