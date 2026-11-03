// Avant le parcours : les données test, créées par l'API comme le ferait un admin.
// Un compte mandataire (secteur Antibes), un client test, deux commerces test.

import { test as preparer, expect, request } from '@playwright/test';
import { ANTIBES, CLIENT, COMMERCE, COMMERCE_TEL, MANDATAIRE, URL_ECRAN, commerce } from './donnees.mjs';
import { appeler, ecrireEtat, sessionAdmin } from './outils.mjs';

preparer('données test : mandataire Antibes, client, commerces', async () => {
  const admin = await sessionAdmin();
  const creer = (entite, donnees) => appeler(admin, 'POST', `/api/entities/${entite}`, donnees);
  const etat = { crees: [] };
  const noter = (entite, r) => { etat.crees.push({ entite, id: r.id }); return r; };

  // Antibes : celle de la base si elle existe, sinon une ville test, marquée lue (aucune lecture SIRENE en fond).
  const villes = await appeler(admin, 'POST', '/api/entities/Ville/filter', { query: { nom: ANTIBES.nom } });
  const ville = villes[0] || noter('Ville', await creer('Ville', {
    nom: ANTIBES.nom, code_insee: ANTIBES.code, centre: { lat: ANTIBES.lat, lon: ANTIBES.lon },
    geo: { departement: 'Alpes-Maritimes', region: "Provence-Alpes-Côte d'Azur" }, simple: { lu_le: new Date().toISOString() },
  }));
  etat.ville_id = ville.id;

  for (const [cle, c] of [['commerce', COMMERCE], ['commerce_tel', COMMERCE_TEL]]) {
    const r = noter('CommerceSimple', await creer('CommerceSimple', { ...commerce(c.nom, c), ville_id: ville.id }));
    etat[`${cle}_id`] = r.id;
  }

  // Le compte mandataire : créé, passé mandataire, son mot de passe posé (sans lien d'invitation, l'adresse suffit).
  const u = noter('User', await creer('User', { email: MANDATAIRE.email, full_name: MANDATAIRE.full_name }));
  await appeler(admin, 'PUT', `/api/entities/User/${u.id}`, { role: 'mandataire' });
  const autre = await request.newContext({ baseURL: URL_ECRAN });
  await appeler(autre, 'POST', '/api/auth/definir-mot-de-passe', { email: MANDATAIRE.email, mot_de_passe: MANDATAIRE.mot_de_passe });
  await autre.dispose();
  etat.mandataire_id = u.id;

  // Son secteur : un rectangle autour d'Antibes, la ville cochée.
  const anneau = [[43.62, 7.05], [43.62, 7.18], [43.53, 7.18], [43.53, 7.05]];
  noter('SecteurMandataire', await creer('SecteurMandataire', {
    nom: '[TEST] Secteur Antibes', mandataire_email: MANDATAIRE.email, polygones: [anneau], points: anneau,
    unites: [{ niveau: 'commune', code: ANTIBES.code, nom: ANTIBES.nom }], villes_choisies: [{ nom: ANTIBES.nom, code: ANTIBES.code }],
  }));

  const client = noter('DemandeClient', await creer('DemandeClient', { ...CLIENT, ouverte_le: new Date().toISOString() }));
  etat.client_id = client.id;

  ecrireEtat(etat);
  expect(etat.crees.length).toBeGreaterThanOrEqual(5);
  await admin.dispose();
});
