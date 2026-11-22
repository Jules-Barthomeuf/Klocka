// Les photos des fiches : la photo d'un agent trouvée par son nom dans les pages équipe, et ce qui se refuse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { photoParNom, poserPhoto } from './photos-fiches.js';
import { cleNom } from './prospection/photos-equipe.js';

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
