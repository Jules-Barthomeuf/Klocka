// Le journal des incidents : ce qu'il garde, et ce qu'il refuse de casser.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-incidents-'));
const { noterIncident, derniersIncidents, CHEMIN } = await import('./incidents.js');

test('une erreur garde sa date, son message et sa pile', () => {
  noterIncident('exception', new Error('Playwright a fermé la page'));
  const [i] = derniersIncidents();
  assert.equal(i.type, 'exception');
  assert.equal(i.message, 'Playwright a fermé la page');
  assert.match(i.pile, /Error: Playwright a fermé la page/);
  assert.match(i.le, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(i.pid, process.pid);
});

test('un rejet sans erreur se note quand même', () => {
  noterIncident('rejet', 'Data-B a répondu 502');
  noterIncident('demarrage', 'Klocka démarre sur le port 3001');
  const tout = derniersIncidents();
  // Du plus récent au plus ancien.
  assert.deepEqual(tout.map((i) => i.type), ['demarrage', 'rejet', 'exception']);
  assert.equal(tout[1].pile, null);
});

test('le fichier ne grossit pas sans fin', () => {
  for (let i = 0; i < 600; i++) noterIncident('rejet', `essai ${i}`);
  const lignes = fs.readFileSync(CHEMIN, 'utf-8').split('\n').filter(Boolean);
  assert.ok(lignes.length <= 500, `${lignes.length} lignes gardées`);
  assert.equal(derniersIncidents({ limite: 1 })[0].message, 'essai 599', 'le plus récent survit');
});

test('une ligne illisible ne fait pas tomber la lecture', () => {
  fs.appendFileSync(CHEMIN, 'ceci n’est pas du JSON\n');
  noterIncident('rejet', 'après la ligne cassée');
  assert.equal(derniersIncidents({ limite: 1 })[0].message, 'après la ligne cassée');
});
