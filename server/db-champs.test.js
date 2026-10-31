// Records.champs (31 oct. 2026) : un objet ou une liste revient décodé, comme le rend Records.get ; la géographie d'une
// ville arrivait en texte JSON, et aucun client cherchant par département n'avait de ville.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-champs-'));
const { Records } = await import('./db.js');
const { geoDe, zoneCouvre } = await import('./mandataire-agent.js');

test('champs rend les objets et les listes décodés, les valeurs simples telles quelles', async () => {
  const v = Records.create('Ville', { nom: 'Antibes', geo: { departement: 'Alpes-Maritimes', region: "Provence-Alpes-Côte d'Azur" }, rues: ['a', 'b'], cachee: false });
  const x = Records.champs('Ville', ['nom', 'geo', 'rues', 'cachee', 'absent']).find((r) => r.id === v.id);
  assert.deepEqual(x.geo, { departement: 'Alpes-Maritimes', region: "Provence-Alpes-Côte d'Azur" });
  assert.deepEqual(x.rues, ['a', 'b']);
  assert.equal(x.nom, 'Antibes');
  assert.equal(x.absent, null);
  // Un client des Alpes-Maritimes trouve Antibes.
  assert.equal(zoneCouvre('Alpes-Maritimes', { ville: 'Antibes', ...(await geoDe('Antibes')) }), true);
});
