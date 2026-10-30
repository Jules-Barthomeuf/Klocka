import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliser, resumerEtRepartir } from './memoire-routes.js';

test('une route sans ses identifiants : cent dossiers font une seule ligne', () => {
  assert.equal(normaliser('/api/mandataire/dossiers/a1b2c3d4e5/vente?x=1'), '/api/mandataire/dossiers/:id/vente');
  assert.equal(normaliser('/api/health'), '/api/health');
});

test('sans appel lourd, le relevé ne cite aucune route', () => {
  assert.equal(resumerEtRepartir(), '');
});
