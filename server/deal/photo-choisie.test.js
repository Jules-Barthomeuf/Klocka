// La photo d'un dossier choisie à la main par le menu ⋯ (26 nov. 2026, Jules : « changer les photos des dossiers comme
// on veut ») : elle passe devant celle du projet et de la ville, et ne cède pas sa place à une voisine.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-photo-choisie-'));
const { Records } = await import('../db.js');
const { listerDossiers } = await import('./index.js');

test('la photo choisie passe devant celle du projet et de la ville', () => {
  const projet = Records.create('Project', { titre: 'P', photos: ['/uploads/projet.jpg'] });
  Records.create('Deal', { deal_id: 'PC1', nom: 'Avec projet', projet_id: projet.id, photo_choisie: '/uploads/choisie.jpg', photo_ville: '/uploads/ville.jpg' });
  Records.create('Deal', { deal_id: 'PC2', nom: 'Sans choix', projet_id: projet.id });
  const l = listerDossiers(50);
  const un = l.find((d) => d.deal_id === 'PC1');
  assert.equal(un.photo, '/uploads/choisie.jpg');
  assert.equal(un.photo_choisie, true);
  assert.equal(un.photo_secours, null);
  assert.equal(l.find((d) => d.deal_id === 'PC2').photo, '/uploads/projet.jpg');
});
