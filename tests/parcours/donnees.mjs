// Les données du test du parcours mandataire, et où il tourne.
//
// Tout ce que le test crée porte le préfixe « [TEST] » ou l'adresse du compte
// de test. Le champ `test` existe déjà, mais un compte mandataire ne voit
// jamais ce qui le porte (mandataire-espace.js, estTest) : le client test
// serait invisible du carrousel. Le préfixe tient lieu de marqueur jusqu'à la
// fusion de L0 (voir PLAN.md, ligne T.1).

import os from 'os';
import path from 'path';

export const PREFIXE = '[TEST]';

// Une base vierge, hors du dépôt : jamais la base réelle.
export const DOSSIER = path.join(os.tmpdir(), 'klocka-test-parcours');
export const PORTS = { modele: 3996, serveur: 3997, ecran: 5197 };
export const URL_ECRAN = `http://localhost:${PORTS.ecran}`;

export const ADMIN = { email: 'admin.parcours@klocka.test', mot_de_passe: 'parcours-admin-2026' };
export const MANDATAIRE = { email: 'mandataire.parcours@klocka.test', mot_de_passe: 'parcours-mandataire-2026', full_name: `Mandataire Antibes ${PREFIXE}` };

export const ANTIBES = { nom: 'Antibes', code: '06004', lat: 43.5808, lon: 7.1251 };

export const CLIENT = {
  client_nom: `${PREFIXE} Client Alpes-Maritimes`,
  type_commerce: 'Alimentaire',
  zones: ['Alpes-Maritimes'],
  budget_min: 300000,
  budget_max: 500000,
  rendement_min: 6,
  active: true,
  visible: true,
};

/** Un commerce test à Antibes : un signal, un propriétaire et un exploitant connus. */
export const commerce = (nom, { lat, lon, rue }) => ({
  classe: 'commerce',
  siret: null,
  nom,
  enseigne: nom,
  activite: 'Alimentation générale',
  numero: '12',
  rue,
  code_postal: '06600',
  ville: 'Antibes',
  adresse: `12 ${rue}, 06600 Antibes`,
  lat,
  lon,
  actif: true,
  etat_recherche: 'fait',
  lien: 'tiers',
  exploitant: { nom: `${PREFIXE} SARL Exploitante`, gerants: [{ nom: 'Claire Exploitante', tranche_age: '70+' }] },
  proprietaire: { nom: `${PREFIXE} SCI des Remparts`, forme: 'SCI' },
  drapeaux: [{ cle: 'gerant_age', texte: 'Gérant de 70 ans et plus', source: 'Registre des entreprises' }],
  // Un prix posé : la préparation ne demande rien à Data-B.
  estimation: { prix: { basse: 360000, moyenne: 400000, haute: 440000 }, loyer: { annuel: 24000 } },
});

// Deux commerces : l'ordinateur et le téléphone ne se marchent pas dessus.
export const COMMERCE = { nom: `${PREFIXE} Épicerie du Safranier`, lat: 43.5785, lon: 7.1290, rue: 'rue du Safranier' };
export const COMMERCE_TEL = { nom: `${PREFIXE} Fromagerie Thuret`, lat: 43.5815, lon: 7.1235, rue: 'rue Thuret' };

// Les phrases dictées, et ce que le faux modèle y répond (faux-modele.mjs).
export const DICTEES = {
  contact: "Vu l'exploitante, j'ai le numéro du propriétaire",
  rdv: 'Rendez-vous fixé jeudi 10 h avec le propriétaire',
  visite: "Visite faite avec le propriétaire. Loyer de 24 000 euros par an hors charges, bail commercial signé en 2019, surface de 80 mètres carrés. Le propriétaire pense à 420 000 euros et veut vendre dans l'année.",
};
export const PRIX_ACCORD = 410000;
