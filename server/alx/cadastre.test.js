// Le pont vitrine → parcelle : la géométrie, sur des carrés fabriqués.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cadastre-'));
const { indexerParcelles } = await import('./cadastre.js');

// Deux parcelles voisines : un carré autour de (44.84, -0.57), un autre juste à l'est.
const carre = (id, lat, lon, cote = 0.0004) => ({
  id,
  c: [[lat, lon], [lat + cote, lon], [lat + cote, lon + cote], [lat, lon + cote], [lat, lon]],
});

test('un point retrouve sa parcelle, pas celle du voisin', () => {
  const index = indexerParcelles([carre('33063000AB0001', 44.84, -0.57), carre('33063000AB0002', 44.84, -0.5696)]);
  assert.equal(index.parcelleDe(44.8402, -0.5698), '33063000AB0001');
  assert.equal(index.parcelleDe(44.8402, -0.5694), '33063000AB0002');
  assert.equal(index.parcelleDe(44.9, -0.57), null, 'hors de tout : null, pas la plus proche');
  assert.equal(index.taille, 2);
});

test('une vitrine posée sur le trottoir retrouve la parcelle d’à côté', () => {
  const index = indexerParcelles([carre('33063000AB0001', 44.84, -0.57)]);
  // Le point est cinq mètres au sud du carré : hors parcelle, mais à dix mètres.
  assert.equal(index.parcelleDe(44.83996, -0.5698), null);
  assert.equal(index.parcelleProche(44.83996, -0.5698), '33063000AB0001');
  assert.equal(index.parcelleProche(44.9, -0.57), null, 'vraiment loin : toujours null');
});

test('la grille ne perd pas une parcelle à cheval sur plusieurs carreaux', () => {
  // Une grande parcelle qui couvre plusieurs carreaux de 0,001 degré.
  const index = indexerParcelles([carre('grande', 44.84, -0.57, 0.0035)]);
  assert.equal(index.parcelleDe(44.8434, -0.5666), 'grande', 'le coin opposé est dans un autre carreau');
});
