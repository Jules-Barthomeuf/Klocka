// Les mandataires, tableau du CRM (6 nov. 2026) : la colonne Villes se corrige en texte.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-crm-mandataires-'));
const M = await import('./mandataires.js');

test('les villes écrites « Lyon, Villeurbanne » : ce qui s\'ajoute et ce qui part, sans doublon ni accent qui compte', () => {
  const avant = [{ nom: 'Lyon', cle: '69123' }, { nom: 'Caluire-et-Cuire', cle: '69034' }];
  const d = M.differenceVilles(avant, 'lyon ; Villeurbanne, Villeurbanne');
  assert.deepEqual(d.ajouts, ['Villeurbanne']);
  assert.deepEqual(d.retraits.map((v) => v.cle), ['69034']);
  assert.deepEqual(M.differenceVilles(avant, '').retraits.length, 2);
});

test('chaque champ est une colonne ; les vues Tout, Sans ville, À relancer', () => {
  const o = M.objet();
  assert.deepEqual(o.vues[0].colonnes, o.champs.map((c) => c.nom));
  assert.deepEqual(o.vues.map((v) => v.nom), ['Tout', 'Sans ville', 'À relancer']);
  assert.ok(o.champs.find((c) => c.nom === 'villes').modifiable);
});
