// La lecture en avance (9 oct. 2026) : au raccrochage, la lecture faite pendant
// l'appel ne sert que si la fin ajoutée ne contient rien qui compte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lecture-avance-'));
const A = await import('./appel.js');

const T = (s) => `Transcription :\n${s}`;
const debut = "Bonjour, c'est Marc, le gérant. Pour l'instant rien en murs commerciaux, envoyez-moi vos critères.";

test("une courte fin de politesse reprend la lecture faite pendant l'appel", () => {
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nTrès bien, merci, bonne journée, au revoir.`)), true);
  assert.equal(A.finSansEnjeu(T(debut), T(debut)), true, 'rien de nouveau');
});

test("une fin qui dit quelque chose fait relire l'appel entier", () => {
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nMon mail c'est marc arobase riviera point fr.`)), false, 'une adresse');
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nRappelez-moi jeudi.`)), false, 'une date');
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nAh si, j'ai un local à Antibes.`)), false, 'un bien');
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nMon portable : 06 12 34 56 78.`)), false, 'un numéro');
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\n${'Oui oui, tout à fait, je comprends bien. '.repeat(8)}`)), false, 'une fin trop longue');
  assert.equal(A.finSansEnjeu(T(debut), T(`Allô ? ${debut}`)), false, "le début a changé (un morceau retranscrit au raccrochage)");
});

test('des notes changées depuis la lecture la rendent caduque', () => {
  const avec = (n) => `${T(debut)}\n\nNotes de l'analyste (elles font foi sur la transcription : email, numéro, nom, date) :\n${n}`;
  assert.equal(A.finSansEnjeu(avec('email : marc@riviera.fr'), avec('email : marc@riviera.fr')), true);
  assert.equal(A.finSansEnjeu(avec('email : marc@riviera.fr'), avec('email : marc.demo@riviera.fr')), false);
  assert.deepEqual(A.partsDuTexte(avec('x')).appel, T(debut));
});

test("« très bien » n'est pas un bien, « un bien » si", () => {
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nTrès bien, parfait.`)), true);
  assert.equal(A.finSansEnjeu(T(debut), T(`${debut}\nJ'aurai peut-être un bien bientôt.`)), false);
});
