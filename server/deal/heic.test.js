// Une photo HEIC (iPhone) : un refus clair, plus de boucle (12 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import { ingerer } from './ingest.js';

test('une photo HEIC est refusée tout de suite, avec la marche à suivre', async () => {
  const debut = Date.now();
  await assert.rejects(ingerer({ buffer: Buffer.from('faux heic'), filename: 'IMG_0001.HEIC', mimetype: 'image/heic' }), /HEIC[\s\S]*JPEG/);
  await assert.rejects(ingerer({ buffer: Buffer.from('x'), filename: 'photo.heic', mimetype: 'application/octet-stream' }), /HEIC/);
  assert.ok(Date.now() - debut < 1000);
});
