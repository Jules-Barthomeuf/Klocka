// Les versions d'un projet (14 oct. 2026) : poser, lister, restaurer.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-projet-versions-'));
const V = await import('./projet-versions.js');
const { Records } = await import('./db.js');

test('une version garde la fiche ; la restaurer la remet, et garde d\'abord l\'état remplacé', () => {
  const p = Records.create('Project', { titre: 'Libourne', sim_loyer_initial_ht: 30693, photos: ['a.jpg', 'b.jpg'] });
  const v1 = V.creerVersion(p.id, { par: 'jules@klocka.immo' });
  assert.equal(v1.ok, true);
  Records.update('Project', p.id, { sim_loyer_initial_ht: 33000, photos: ['b.jpg', 'a.jpg'], bail_duree_ferme_ans: 6 });
  const r = V.restaurerVersion(p.id, v1.version.id, { par: 'jules@klocka.immo' });
  assert.equal(r.ok, true);
  const lu = Records.get('Project', p.id);
  assert.equal(lu.sim_loyer_initial_ht, 30693);
  assert.deepEqual(lu.photos, ['a.jpg', 'b.jpg']);
  assert.equal(lu.bail_duree_ferme_ans, null, 'un champ apparu depuis est vidé');
  const liste = V.versionsDu(p.id);
  assert.equal(liste.length, 2);
  assert.equal(liste[0].nom, 'Avant restauration');
  assert.equal(liste[0].auto, true);
  assert.equal(liste[0].donnees, undefined, 'la liste ne porte pas le contenu');
  assert.equal(V.restaurerVersion('autre', v1.version.id).ok, false, 'une version d\'un autre projet ne se restaure pas');
});
