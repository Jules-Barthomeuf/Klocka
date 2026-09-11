// « Je repasserai plus tard » : deux reprises, puis on laisse la main.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Le journal ouvre la base au chargement : on la déroute avant d'importer.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-test-'));
const { planifier, annuler, DELAIS_MIN, reprisesArmees } = await import('./replanification.js');

const minutesAvant = (iso) => Math.round((Date.parse(iso) - Date.now()) / 60000);

test('la première reprise est à une demi-heure, la seconde à deux heures', () => {
  const un = planifier({ dealId: 'd1', index: 0, essai: 1 });
  assert.equal(minutesAvant(un), DELAIS_MIN[0]);
  annuler('d1', 0);

  const deux = planifier({ dealId: 'd2', index: 0, essai: 2 });
  assert.equal(minutesAvant(deux), DELAIS_MIN[1]);
  annuler('d2', 0);
});

test('au troisième échec on arrête de repasser : ce n’est plus un hoquet', () => {
  assert.equal(planifier({ dealId: 'd3', index: 0, essai: 3 }), null);
  assert.equal(planifier({ dealId: 'd3', index: 0, essai: 9 }), null);
  assert.deepEqual(reprisesArmees().filter((c) => c.startsWith('d3')), []);
});

test('une reprise s’annule quand la lecture finit par aboutir', () => {
  planifier({ dealId: 'd4', index: 0, essai: 1 });
  assert.ok(reprisesArmees().includes('d4|0'));
  annuler('d4', 0);
  assert.ok(!reprisesArmees().includes('d4|0'));
});

test('replanifier un même lot ne laisse qu’une reprise armée', () => {
  planifier({ dealId: 'd5', index: 0, essai: 1 });
  planifier({ dealId: 'd5', index: 0, essai: 1 });
  assert.equal(reprisesArmees().filter((c) => c === 'd5|0').length, 1);
  annuler('d5', 0);
});
