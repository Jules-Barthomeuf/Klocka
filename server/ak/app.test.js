// Ce que l'écran montre au moment de la question (14 oct. 2026) : le cadre qu'AK en reçoit.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ak-app-'));
const { cadreEcran } = await import('./app.js');

test('l\'écran : le texte affiché fait foi, l\'élément cliqué désigne « ça », la saisie en attente est dite', () => {
  assert.equal(cadreEcran(null), '');
  assert.equal(cadreEcran({ texte: '   ' }), '');
  const c = cadreEcran({ onglet: 'Simulateur', mode: 'edition', texte: 'Rendement net\n9,4 %\nPrix de revient\n397 100 €', designe: { texte: '9,4 %', champ: 'valeurs_forcees.rendement_net' }, non_enregistre: { sim_apport: 50000 } });
  assert.match(c, /onglet Simulateur, mode edition/);
  assert.match(c, /ils font foi\. Ne les recalcule pas/);
  assert.match(c, /CLIQUÉ EN DERNIER : « 9,4 % » \(champ valeurs_forcees\.rendement_net\)/);
  assert.match(c, /PAS ENCORE ENREGISTRÉ.*"sim_apport":50000/);
  assert.match(c, /<<<ÉCRAN\nRendement net\n9,4 %/);
  assert.ok(cadreEcran({ texte: 'x'.repeat(20000) }).length < 11000, 'l\'écran est borné');
});
