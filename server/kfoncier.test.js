// K-Foncier : les locaux d'une section regroupés par parcelle et par propriétaire.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kfoncier-'));
const { grouperProprietaires, listerRecherches } = await import('./kfoncier.js');

test('les lots se regroupent par parcelle puis par propriétaire, et un SIREN fantaisiste ne passe pas pour un SIREN', () => {
  const g = grouperProprietaires([
    { num_plan: '0002', bat_local: 'A', entree_local: '01', niveau_local: '00', porte_local: '95001', siren_proprietaire: '789129590', denomination_proprietaire: 'EDEN', label_forme_juridique_proprietaire: 'SAS', label_code_droit: 'Propriétaire' },
    { num_plan: '0002', bat_local: 'A', entree_local: '01', niveau_local: '01', porte_local: '01015', siren_proprietaire: '789129590', denomination_proprietaire: 'EDEN' },
    { num_plan: '0002', bat_local: 'A', entree_local: '01', niveau_local: '02', porte_local: '01023', siren_proprietaire: 'U15411573', denomination_proprietaire: 'CABINET X', label_code_droit: 'Syndic de copropriété' },
    { num_plan: '14', bat_local: 'B', siren_proprietaire: '342480076', denomination_proprietaire: 'TABONI' },
    { num_plan: '0099', siren_proprietaire: null, denomination_proprietaire: null },
  ]);

  assert.deepEqual(Object.keys(g).sort(), ['0002', '0014'], 'un numéro court se complète à quatre chiffres, une ligne sans propriétaire est écartée');
  assert.equal(g['0002'].length, 2);
  const eden = g['0002'].find((p) => p.nom === 'EDEN');
  assert.equal(eden.siren, '789129590');
  assert.equal(eden.lots.length, 2, 'deux locaux, un seul propriétaire');
  assert.equal(eden.lots[0].porte, '95001');
  assert.equal(g['0002'].find((p) => p.nom === 'CABINET X').siren, null, 'un identifiant MAJIC « U… » n\'est pas un SIREN');
  assert.deepEqual(listerRecherches(), []);
});
