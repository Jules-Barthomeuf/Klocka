// Qui parle, lu au sens : la consigne et la lecture des étiquettes.

import test from 'node:test';
import assert from 'node:assert/strict';
import { consigneEtiquettes, lireEtiquettes } from './etiqueter-voix.js';

test('la consigne numérote les phrases, garde le contexte ; seules les phrases sans nom reçoivent une étiquette', () => {
  const lignes = [{ cle: 'r0', texte: 'Bonjour, Maxime Pama de Klocka.', qui: 'vous' }, { cle: 'r1', texte: 'Moi, j\'aurais pas l\'information.', qui: null }, { cle: 'r2', texte: 'Un numéro de téléphone ?', qui: null }];
  const c = consigneEtiquettes(lignes, { analyste: 'Maxime' });
  assert.match(c, /1\. \[ANALYSTE\] Bonjour/);
  assert.match(c, /2\. \[\?\] Moi/);
  assert.deepEqual(lireEtiquettes({ lettres: '2G 3A 1G 9A' }, lignes), { r1: 'autre', r2: 'vous' });
  assert.deepEqual(lireEtiquettes({ lettres: '3G' }, lignes), { r2: 'autre' });
});
