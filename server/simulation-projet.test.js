// Le simulateur lu côté serveur : les mêmes chiffres que sa page, apport par défaut compris.

import test from 'node:test';
import assert from 'node:assert/strict';
import { simulationDuProjet, simulationEnTexte } from './simulation-projet.js';

const projet = { sim_prix_bien_negocie: 335000, sim_prix_bien_fai: 367500, sim_loyer_initial_ht: 30693, sim_surface: 55, sim_taux_interet: 3.7, sim_duree_credit: 20, sim_frais_divers_acquisition: 2000, sim_apport: 0 };

test('sans apport enregistré, celui que le simulateur affiche : 15 % du prix de revient', () => {
  const s = simulationDuProjet(projet);
  assert.equal(s.apport_enregistre, false);
  assert.equal(s.apport, 59565, 'le chiffre que la page Simulateur montre pour le projet de Libourne');
  assert.equal(s.emprunt, s.prix_revient - s.apport);
  assert.equal(s.taux_interet, 3.7);
  assert.ok(s.mensualite > 0 && s.cash_flow_moyen_mois != null);
  assert.match(simulationEnTexte(s), /15 % du prix de revient que le simulateur affiche par défaut/);
});

test('un apport enregistré fait foi ; sans prix, pas de simulation', () => {
  assert.equal(simulationDuProjet({ ...projet, sim_apport: 80000 }).apport, 80000);
  assert.equal(simulationDuProjet({ ...projet, sim_apport: 80000 }).apport_enregistre, true);
  assert.equal(simulationDuProjet({}), null);
  assert.match(simulationEnTexte(null), /aucun/);
});
