// Qui AK prévient en privé quand une fiche arrive : AK_FICHES_POUR, plus qui
// l'a demandé dans Personnalisation, moins qui l'a refusé.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-prevenir-'));
const { destinatairesDuMoment } = await import('./fiches.js');

test('AK_FICHES_POUR, plus les volontaires, moins ceux qui refusent', () => {
  const r = destinatairesDuMoment({
    brut: 'jules@klocka.immo, nora@klocka.immo',
    profils: [
      { email: 'Paul@Klocka.immo', prevenir_fiches: true },
      { email: 'nora@klocka.immo', prevenir_fiches: false },
      { email: 'max@klocka.immo' },
    ],
  });
  assert.deepEqual(r.sort(), ['jules@klocka.immo', 'paul@klocka.immo']);
});
