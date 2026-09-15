// Le titre d'un projet créé depuis un dossier : « Nom du local - Adresse ».

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-titre-'));
const { titreProjet, nomDuLocal } = await import('./projet.js');

test("le nom du local : l'activité puis l'enseigne, sans forme juridique", () => {
  assert.equal(nomDuLocal('Chez Truc', 'Pizzeria'), 'Pizzeria Chez Truc');
  assert.equal(nomDuLocal('Pizzeria Da Mario', 'pizzeria'), 'Pizzeria Da Mario');
  assert.equal(nomDuLocal('SARL RIMEL', 'Import/Export, achat en gros, demi-gros, détail de meubles'), 'RIMEL');
  assert.equal(nomDuLocal('', 'Boulangerie'), 'Boulangerie');
  assert.equal(nomDuLocal(null, null), '');
});

test("le titre : nom du local, espace, tiret, espace, adresse", () => {
  assert.equal(titreProjet('Chez Truc', '12 rue de la Paix, 75002 Paris', 'Pizzeria'), 'Pizzeria Chez Truc - 12 rue de la Paix, 75002 Paris');
  assert.equal(titreProjet(null, '12 rue de la Paix, 75002 Paris'), 'Murs commerciaux - 12 rue de la Paix, 75002 Paris');
  assert.equal(titreProjet('SAS Patounes', null), 'Patounes - Murs commerciaux');
});
