import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-reinit-'));
const { Records, DATA_DIR } = await import('./db.js');
const { reinitialiserAvis } = await import('./reinit-avis.js');

test("les avis de valeur s'effacent une seule fois, après une sauvegarde complète ; le reste ne bouge pas (1er nov. 2026)", () => {
  Records.create('EstimationMandataire', { mandataire_email: 'a@kpartners.fr', bien: 'Murs · A', avis: { version: 1 } });
  Records.create('EstimationMandataire', { mandataire_email: 'b@kpartners.fr', bien: 'Murs · B' });
  const fiche = Records.create('ProprietaireMandataire', { mandataire_email: 'a@kpartners.fr', commerce: 'A' });
  const r = reinitialiserAvis();
  assert.equal(r.effaces, 2);
  assert.equal(Records.list('EstimationMandataire').length, 0);
  assert.ok(Records.get('ProprietaireMandataire', fiche.id), 'les fiches restent');
  const sauvee = JSON.parse(fs.readFileSync(r.sauvegarde, 'utf8'));
  assert.equal(sauvee.avis.length, 2);
  assert.ok(r.sauvegarde.startsWith(DATA_DIR));
  // Une deuxième fois : rien n'est effacé, même un avis neuf.
  Records.create('EstimationMandataire', { mandataire_email: 'a@kpartners.fr', bien: 'Murs · neuf' });
  assert.ok(reinitialiserAvis().deja);
  assert.equal(Records.list('EstimationMandataire').length, 1);
});
