// Une seule session Data-B par compte : les appels HTTP passent ensemble,
// un parcours du navigateur passe seul (sinon l'un déconnecte l'autre).

import test from 'node:test';
import assert from 'node:assert/strict';
import { enPartage, enExclusifDataB } from './data-b.js';

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

test('un parcours du navigateur attend l\'appel en cours, et l\'appel suivant attend le parcours', async () => {
  const journal = [];
  const appel1 = enPartage(async () => { journal.push('appel 1 début'); await pause(30); journal.push('appel 1 fin'); });
  await pause(5);
  const parcours = enExclusifDataB(async () => { journal.push('parcours début'); await pause(30); journal.push('parcours fin'); return 'ok'; });
  await pause(5);
  const appel2 = enPartage(async () => { journal.push('appel 2'); });
  assert.equal(await parcours, 'ok');
  await Promise.all([appel1, appel2]);
  assert.deepEqual(journal, ['appel 1 début', 'appel 1 fin', 'parcours début', 'parcours fin', 'appel 2']);
});

test('deux appels passent ensemble ; un parcours qui échoue libère le compte', async () => {
  const journal = [];
  await Promise.all([
    enPartage(async () => { journal.push('a'); await pause(20); journal.push('a fin'); }),
    enPartage(async () => { journal.push('b'); await pause(5); journal.push('b fin'); }),
  ]);
  assert.deepEqual(journal, ['a', 'b', 'b fin', 'a fin']);
  await assert.rejects(enExclusifDataB(async () => { throw new Error('déconnecté'); }), /déconnecté/);
  assert.equal(await enPartage(async () => 'libre'), 'libre');
});
