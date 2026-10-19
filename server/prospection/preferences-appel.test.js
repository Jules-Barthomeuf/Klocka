import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-pref-appel-'));
const P = await import('./preferences-appel.js');

test("une étape retirée ne revient plus pour cette personne, rétablie elle revient ; Monday ne se retire pas (19 oct. 2026)", () => {
  const actions = [{ type: 'monday' }, { type: 'mail' }, { type: 'diffusion' }, { type: 'relance' }];
  assert.equal(P.retirer('Maxime.P@klocka.immo', 'diffusion').ok, true);
  assert.equal(P.retirer('maxime.p@klocka.immo', 'monday').ok, false);
  assert.deepEqual(P.sansRetirees(actions, P.retirees('maxime.p@klocka.immo')).map((a) => a.type), ['monday', 'mail', 'relance']);
  assert.equal(P.sansRetirees(actions, P.retirees('nora.l@klocka.immo')).length, 4, 'chacun ses préférences');
  P.retablir('maxime.p@klocka.immo', 'diffusion');
  assert.equal(P.retirees('maxime.p@klocka.immo').size, 0);
});
