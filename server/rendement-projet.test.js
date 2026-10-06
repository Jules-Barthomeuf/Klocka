// Le rendement de la page projet : le rendement global net du simulateur,
// pas le loyer de la première année sur le prix de revient.

import test from 'node:test';
import assert from 'node:assert/strict';
import { rendementGlobalNetDuProjet, parametresDuProjet, calculerTableauAnnuel } from '../src/components/simulator/CalculFinancier.js';

const PROJET = { sim_prix_bien_negocie: 300000, sim_prix_bien_fai: 300000, sim_surface: 80, sim_loyer_initial_ht: 24000, sim_taxe_fonciere: 1500, sim_taxe_refacturable: false, sim_apport: 60000 };

test('le rendement global net est celui du simulateur, sur les mêmes paramètres', () => {
  const r = rendementGlobalNetDuProjet(PROJET);
  const attendu = Number(calculerTableauAnnuel(parametresDuProjet(PROJET)).indicateurs.rendementLocatifGlobalNet);
  assert.equal(r, attendu);
  assert.ok(r > 0);
  // Ce n'est pas le loyer de la 1re année sur le prix de revient.
  const prixRevient = calculerTableauAnnuel(parametresDuProjet(PROJET)).prixRevient;
  assert.notEqual(r.toFixed(1), (24000 / prixRevient * 100).toFixed(1));
});

test('sans prix ou sans loyer, pas de rendement inventé', () => {
  assert.equal(rendementGlobalNetDuProjet({ sim_loyer_initial_ht: 24000 }), null);
  assert.equal(rendementGlobalNetDuProjet({ sim_prix_bien_negocie: 300000 }), null);
  assert.equal(rendementGlobalNetDuProjet({}), null);
});

test("les travaux enregistrés et l'apport par défaut suivent le simulateur", () => {
  const p = parametresDuProjet({ ...PROJET, sim_apport: 0, sim_travaux_annee1: 3, sim_travaux_montant1: 8000 });
  assert.equal(p.travauxBailleur[2], 8000);
  assert.ok(p.apport > 0);
});
