// « Mon secteur » d'un mandataire : les villes cochées pour le secteur, plus les Villes Klocka de son contour
// (30 oct. 2026, Jules : « j'ai bien mis Antibes dans les villes Klocka »).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-villes-secteur-'));
const { Meta } = await import('./db.js');
const { unir, villesDuSecteurMandataire, communesALire } = await import('./villes-secteur.js');

// Un secteur fait de deux communes, sans appel réseau ; Antibes est une Ville Klocka.
const secteur = { id: null, unites: [{ niveau: 'commune', nom: 'Antibes', code: '06004' }, { niveau: 'commune', nom: 'Vallauris', code: '06155' }] };
Meta.set('villes-klocka', JSON.stringify([{ nom: 'Antibes', code: '06004' }, { nom: 'Lyon', code: '69123' }]));

test('unir : sans doublon, par code puis par nom', () => {
  assert.deepEqual(unir([{ nom: 'Antibes', code: '06004' }], [{ nom: 'Antibes', code: '06004' }, { nom: 'Nice', code: '06088' }]).map((c) => c.nom), ['Antibes', 'Nice']);
});

test('aucune ville cochée : la Ville Klocka du contour suffit', async () => {
  assert.deepEqual((await villesDuSecteurMandataire(secteur)).map((c) => c.nom), ['Antibes']);
});

test('des villes cochées : elles, plus la Ville Klocka, sans la compter deux fois', async () => {
  const s = { ...secteur, villes_choisies: [{ nom: 'Vallauris', code: '06155' }] };
  assert.deepEqual((await villesDuSecteurMandataire(s)).map((c) => c.nom), ['Vallauris', 'Antibes']);
  assert.deepEqual((await communesALire(s)).map((c) => c.nom), ['Vallauris', 'Antibes']);
  const avecAntibes = { ...secteur, villes_choisies: [{ nom: 'Antibes', code: '06004' }] };
  assert.deepEqual((await villesDuSecteurMandataire(avecAntibes)).map((c) => c.nom), ['Antibes']);
});
