// « Ouvre la fiche de X » (23 nov. 2026) : laquelle ouvrir.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ouvrir-fiche-'));
const { choisirFiche } = await import('./ouvrir.js');

test('le nom exact l\'emporte, la fiche suivie avant celle du CRM ; sinon une seule suffit ; sinon on demande', () => {
  const rachel = { cle: 'twenty:clients:r1', nom: 'Rachel PEYRABOUT', genre: 'client' };
  const rachel2 = { cle: 'twenty:clients:r2', nom: 'Rachel Peyrabout', genre: 'client' };
  const autre = { cle: 'deal:d1', nom: 'Murs Rachel - Dieppe', genre: 'bien' };
  assert.equal(choisirFiche('rachel peyrabout', [autre, rachel]).ouvrir.cle, 'twenty:clients:r1');
  assert.equal(choisirFiche('Rachel Peyrabout', [rachel, rachel2], { suivies: new Set(['twenty:clients:r2']) }).ouvrir.cle, 'twenty:clients:r2');
  assert.equal(choisirFiche('Rachel Peyrabout', [rachel, rachel2]).candidats.length, 2);
  assert.equal(choisirFiche('Dieppe', [autre]).ouvrir.cle, 'deal:d1');
  assert.equal(choisirFiche('Rachel', [rachel, autre]).candidats.length, 2);
  assert.equal(choisirFiche('Personne', []).aucune, true);
});
