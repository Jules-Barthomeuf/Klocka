// Le coach : un tuto ciblé après un blocage, un quiz le lendemain.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-coaching-'));
const C = await import('./coaching.js');
const { Records } = await import('./db.js');

const nora = { email: 'nora.l@klocka.immo', role: 'admin' };
const TUTO = {
  titre: 'Négocier avec un DAF', accroche: 'Un DAF parle chiffres.',
  etapes: [{ titre: 'Préparer', texte: 'Ayez le rendement en tête.' }, { titre: 'Écouter', texte: 'Laissez-le poser ses conditions.' }, { titre: '', texte: 'vide' }],
  phrases: ['Quel rendement visez-vous ?'], piege: 'Parler avant de savoir.',
  quiz: [
    { question: 'Q1', choix: ['a', 'b', 'c', 'd'], bonne: 1, explication: 'parce que' },
    { question: 'Q2', choix: ['a', 'b'], bonne: 0 },
    { question: 'Q3 mal formée', choix: ['a'], bonne: 0 },
    { question: 'Q4', choix: ['a', 'b', 'c'], bonne: 2 },
  ],
};
const invoke = async () => TUTO;

test('le lendemain, 8 h à Paris (été et hiver)', () => {
  assert.equal(C.lendemainHuitHeures(new Date('2026-10-16T15:00:00Z')), '2026-10-17T06:00:00.000Z');
  assert.equal(C.lendemainHuitHeures(new Date('2026-12-01T22:30:00Z')), '2026-12-02T07:00:00.000Z', '23 h 30 à Paris le 1er : le lendemain est le 2, 8 h (UTC+1)');
  assert.equal(C.lendemainHuitHeures(new Date('2026-12-01T23:30:00Z')), '2026-12-03T07:00:00.000Z', '0 h 30 à Paris le 2 : le lendemain est le 3');
});

test('le tuto nettoyé : les étapes vides et les questions mal formées tombent', () => {
  const t = C.nettoyerTuto(TUTO);
  assert.equal(t.etapes.length, 2);
  assert.deepEqual(t.quiz.map((q) => q.question), ['Q1', 'Q2', 'Q4']);
});

test('un tuto par sujet dans la semaine ; le quiz attend le lendemain, puis prévient une fois', async () => {
  const maintenant = new Date('2026-10-16T15:00:00Z');
  const r = await C.creerTuto({ par: 'Nora.L@klocka.immo', sujet: 'Comment négocier avec un DAF', invoke, maintenant });
  assert.equal(r.ok, true);
  assert.equal(r.tuto.par, 'nora.l@klocka.immo');
  assert.equal((await C.creerTuto({ par: nora.email, sujet: 'comment negocier avec un daf', invoke, maintenant })).deja, true);
  assert.equal((await C.creerTuto({ par: nora.email, sujet: 'ok', invoke })).ok, false);
  const avant = C.mesTutos(nora, maintenant);
  assert.equal(avant.a_lire.length, 1);
  assert.equal(avant.quiz.length, 0, 'pas avant le lendemain');
  const demain = new Date('2026-10-17T07:00:00Z');
  assert.equal(C.mesTutos(nora, demain).quiz.length, 1);
  assert.equal(await C.prevenirQuiz(demain), 1);
  assert.equal(await C.prevenirQuiz(demain), 0, 'une seule fois');
  assert.ok(Records.list('Notification').some((n) => n.pour === nora.email && /petit quiz/.test(n.titre)));
});

test('le quiz corrigé, et il ne revient plus', async () => {
  const { tuto } = await C.creerTuto({ par: nora.email, sujet: 'Relancer un agent qui ne répond plus', invoke, maintenant: new Date('2026-10-16T09:00:00Z') });
  const r = C.repondreQuiz(tuto.id, nora, [1, 1, 2]);
  assert.equal(r.score, 2);
  assert.equal(r.sur, 3);
  assert.equal(r.corrections[1].juste, false);
  assert.equal(C.mesTutos(nora, new Date('2026-10-18T09:00:00Z')).quiz.some((t) => t.id === tuto.id), false);
  assert.equal(C.repondreQuiz(tuto.id, { email: 'maxime.p@klocka.immo' }, [0]).ok, false, 'pas le quiz d’un autre');
});
