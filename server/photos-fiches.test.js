// Les photos des fiches : la photo d'un agent trouvée par son nom dans les pages équipe, et ce qui se refuse.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-photos-fiches-'));
const { photoParNom, poserPhoto } = await import('./photos-fiches.js');
const { cleNom } = await import('./prospection/photos-equipe.js');

test('la photo d\'un agent par son nom ; à homonymes, celle de son agence', () => {
  const agences = [
    { nom: 'Foncia Antibes', photos_equipe: { par_nom: { 'sophie martin': '/a.jpg' } } },
    { nom: 'Arthur Loyd Nice', photos_equipe: { par_nom: { 'sophie martin': '/b.jpg', 'paul durand': '/c.jpg' } } },
    { nom: 'Sans photos' },
  ];
  assert.equal(photoParNom(agences, 'Sophie Martin', 'Arthur Loyd', cleNom), '/b.jpg');
  assert.equal(photoParNom(agences, 'Sophie MARTIN', '', cleNom), '/a.jpg');
  assert.equal(photoParNom(agences, 'Paul Durand', 'Foncia', cleNom), '/c.jpg');
  assert.equal(photoParNom(agences, 'Inconnu Total', '', cleNom), null);
  // Un nom seul ne suffit pas : trop d'homonymes.
  assert.equal(photoParNom(agences, 'Sophie', '', cleNom), null);
});

test('une photo se pose sur un agent ou un client, pas ailleurs', () => {
  assert.equal(poserPhoto('projet:1', '/x.jpg').ok, false);
  assert.equal(poserPhoto('agent:1', '').ok, false);
});

test('plusieurs photos sur une fiche : ajouter, remplacer l\'une, retirer, la première pour les listes (23 nov. 2026)', async () => {
  const { photosDe, photoDe, retirerPhoto, toutesLesPhotos } = await import('./photos-fiches.js');
  const c = 'client:duo';
  assert.equal(poserPhoto(c, '/un.jpg').ok, true);
  const deux = poserPhoto(c, '/deux.jpg', { ajouter: true });
  assert.equal(deux.ok, true);
  assert.deepEqual(photosDe(c).map((p) => p.url), ['/un.jpg', '/deux.jpg']);
  assert.equal(poserPhoto(c, '/deux-bis.jpg', { id: deux.id }).ok, true);
  assert.deepEqual(photosDe(c).map((p) => p.url), ['/un.jpg', '/deux-bis.jpg']);
  // Sans id ni ajout : la première est remplacée, comme avant.
  poserPhoto(c, '/un-bis.jpg');
  assert.equal(photoDe(c).url, '/un-bis.jpg');
  assert.equal(toutesLesPhotos()[c], '/un-bis.jpg');
  assert.equal(retirerPhoto(c, photosDe(c)[0].id).ok, true);
  assert.equal(photoDe(c).url, '/deux-bis.jpg');
  assert.equal(retirerPhoto(c, 'inconnue').ok, false);
  assert.equal(poserPhoto(c, '/x.jpg', { id: 'inconnue' }).ok, false);
  for (let i = 0; i < 5; i++) poserPhoto(c, `/p${i}.jpg`, { ajouter: true });
  assert.equal(poserPhoto(c, '/trop.jpg', { ajouter: true }).ok, false);
});
