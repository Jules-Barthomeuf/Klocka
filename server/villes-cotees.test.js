import test from 'node:test';
import assert from 'node:assert/strict';
import { estVilleCotee, resumeVillesCotees, TOUTES_VILLES_COTEES } from './villes-cotees.js';

test('« Toute la France » se lit comme les villes cotées', () => {
  assert.ok(estVilleCotee('Paris 8e'));
  assert.ok(estVilleCotee('Lyon 6e Arrondissement'));
  assert.ok(estVilleCotee('st-tropez'));
  assert.ok(estVilleCotee('Juan-les-Pins'), 'un quartier d\'usage compte pour sa ville');
  assert.equal(estVilleCotee('Le Havre'), false);
  assert.equal(estVilleCotee(''), false);
  assert.equal(resumeVillesCotees(), `Paris, Lyon, Bordeaux +${TOUTES_VILLES_COTEES.length - 3} villes`);
});
