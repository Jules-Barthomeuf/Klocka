import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateurDuDossier, travauxDuDossier } from './projet.js';

// 26 nov. 2026 : « Créer le projet » cassait en production sur un dossier sans simulateur enregistré (lot.simulateur à
// null, « Cannot read properties of null (reading 'travauxBailleur') »).
test('un dossier sans simulateur donne des réglages et des travaux par défaut, sans erreur', () => {
  assert.doesNotThrow(() => travauxDuDossier(null));
  assert.doesNotThrow(() => simulateurDuDossier(null));
  assert.equal(simulateurDuDossier(null).sim_commission_agent_active, true);
});
