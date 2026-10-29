// La trace des outils et la garde du banc d'essai (12 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import { tracer, resultatGarde, enEchec } from './trace.js';
import { auBanc, SIMULES_AK, simule } from './banc/garde.js';

test('chaque outil appelé est noté, avec ses arguments, son résultat et son échec', async () => {
  const trace = [];
  const onTool = tracer(async ({ name }) => (name === 'casse' ? { ok: false, error: 'non' } : { ok: true, n: 1 }), trace);
  await onTool({ name: 'lire', input: { a: 1 } });
  await onTool({ name: 'casse', input: {} });
  assert.deepEqual(trace.map((t) => [t.outil, t.echec]), [['lire', false], ['casse', true]]);
  assert.equal(trace[0].resultat, '{"ok":true,"n":1}');
});

test('une exception est notée puis relancée', async () => {
  const trace = [];
  await assert.rejects(tracer(async () => { throw new Error('boum'); }, trace)({ name: 'x', input: {} }));
  assert.equal(trace[0].erreur, 'boum');
});

test('un long résultat est tronqué', () => {
  assert.match(resultatGarde('a'.repeat(5000)), /… \(5000 caractères\)$/);
  assert.equal(enEchec({ ok: true }), false);
});

test('hors banc, rien n’est simulé ; au banc, Sunday CRM et Drive le sont', () => {
  const avant = process.env.KLOCKA_BANC;
  delete process.env.KLOCKA_BANC;
  assert.equal(auBanc(), false);
  process.env.KLOCKA_BANC = '1';
  assert.equal(auBanc(), true);
  assert.ok(SIMULES_AK.has('pousser_dossier_monday') && SIMULES_AK.has('ranger_drive'));
  assert.equal(simule('ranger_drive').simule, true);
  if (avant == null) delete process.env.KLOCKA_BANC; else process.env.KLOCKA_BANC = avant;
});
