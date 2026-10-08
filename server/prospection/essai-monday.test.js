// Le mode Essai peut écrire dans Monday (8 oct. 2026) : la ligne se reconnaît.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-essai-monday-'));
const MA = await import('./mode-appel.js');

test("une ligne écrite depuis l'essai porte « (Essai) » devant l'agence et « Essai » en tête de remarque, une seule fois", () => {
  const d = MA.marquerEssai({ agence: 'Agence Essai Commerces', remarque: "08/10/2026 · L'agent n'a pas de bien.", contact: 'Sophie Essai' });
  assert.equal(d.agence, '(Essai) Agence Essai Commerces');
  assert.equal(d.remarque, "Essai · 08/10/2026 · L'agent n'a pas de bien.");
  assert.equal(d.contact, 'Sophie Essai');
  assert.equal(MA.marquerEssai(d).agence, '(Essai) Agence Essai Commerces');
  assert.equal(MA.marquerEssai({ agence: 'X' }).remarque, 'Essai');
});
