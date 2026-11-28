import test from 'node:test';
import assert from 'node:assert/strict';
import { dateEcheance, resteDuBail } from './reste-du-bail.js';

const iso = (d) => d?.toISOString().slice(0, 10) ?? null;

test('bail : les échéances telles que les fiches les écrivent', () => {
  assert.equal(iso(dateEcheance('30 juin 2023')), '2023-06-30');
  assert.equal(iso(dateEcheance('1er août 2031')), '2031-08-01');
  assert.equal(iso(dateEcheance('2033-04-22')), '2033-04-22');
  assert.equal(iso(dateEcheance('30/06/2029')), '2029-06-30');
  assert.equal(iso(dateEcheance('2031')), '2031-12-31');
  assert.equal(dateEcheance('à voir'), null);
});

test('bail : échu, il est en tacite prolongation ; sinon, ce qu\'il reste', () => {
  const le = new Date(Date.UTC(2026, 10, 27));
  const echu = resteDuBail('30 juin 2023', le);
  assert.equal(echu.echu, true);
  assert.match(echu.texte, /échu depuis 3 ans et 4 mois/);
  assert.match(echu.texte, /tacite prolongation/);
  const long = resteDuBail('2033-04-22', le);
  assert.equal(long.echu, false);
  assert.equal(long.court, false);
  assert.match(long.texte, /^6 ans et 4 mois avant/);
  assert.equal(resteDuBail('30/06/2028', le).court, true);
  assert.equal(resteDuBail('', le), null);
});
