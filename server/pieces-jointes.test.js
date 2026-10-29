// Plusieurs pièces jointes à un même message : le texte au modèle et la pièce visée par un outil.

import test from 'node:test';
import assert from 'node:assert/strict';

import { lotDePieces, texteAvecPieces, choisirPiece } from './pieces-jointes.js';

const BAIL = { nom: 'Bail Martin.pdf', texte: 'Bail commercial 3-6-9' };
const KBIS = { nom: 'kbis.png', texte: '' };

test('une pièce seule garde le texte d’avant', () => {
  assert.equal(texteAvecPieces('Range ça', [BAIL]), "Range ça\n\n(pièce jointe : Bail Martin.pdf. Ce qu'on y lit : Bail commercial 3-6-9)");
  assert.equal(texteAvecPieces('', [KBIS]), 'Voici une pièce.\n\n(pièce jointe : kbis.png, illisible)');
});

test('un lot : une ligne par pièce, le budget partagé', () => {
  const t = texteAvecPieces('', [BAIL, KBIS]);
  assert.match(t, /^Voici des pièces\./);
  assert.match(t, /Bail Martin\.pdf\. Ce qu'on y lit/);
  assert.match(t, /kbis\.png, illisible/);
  const long = { nom: 'a.pdf', texte: 'x'.repeat(20000) };
  const quatre = texteAvecPieces('', [long, long, long, long], 5000);
  assert.equal((quatre.match(/x+/g) || []).map((s) => s.length)[0], 2500);
  const dix = texteAvecPieces('', Array(10).fill(long), 5000);
  assert.equal((dix.match(/x+/g) || [])[0].length, 1500, 'jamais sous 1 500 signes');
});

test('la pièce visée : par son nom, seule, sinon ambigu', () => {
  assert.equal(choisirPiece([], 'x'), null);
  assert.equal(choisirPiece([BAIL]), BAIL);
  assert.equal(choisirPiece([BAIL], 'autre.pdf'), BAIL, 'une pièce seule se prend même mal nommée');
  assert.equal(choisirPiece([BAIL, KBIS], 'KBIS.PNG'), KBIS);
  assert.equal(choisirPiece([BAIL, KBIS], 'bail'), BAIL);
  assert.equal(choisirPiece([BAIL, KBIS]), 'ambigu');
  assert.equal(choisirPiece([BAIL, KBIS], 'quittance'), 'ambigu');
});

test('le lot : pieces d’abord, sinon la pièce seule', () => {
  assert.deepEqual(lotDePieces({ piece: BAIL }), [BAIL]);
  assert.deepEqual(lotDePieces({ piece: BAIL, pieces: [KBIS] }), [KBIS]);
  assert.deepEqual(lotDePieces({}), []);
});
