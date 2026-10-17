// Les dossiers récemment ouverts : en tête, sans doublon, bornés ; les archivés ne s'affichent pas.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-recents-'));
const { Records } = await import('../db.js');
const R = await import('./recents.js');

test('noterDans : le dernier ouvert en tête, une seule fois, borné', () => {
  let l = [];
  for (const id of ['a', 'b', 'a', 'c']) l = R.noterDans(l, { deal_id: id, le: id }, 2);
  assert.deepEqual(l.map((x) => x.deal_id), ['c', 'a']);
  assert.deepEqual(R.noterDans(l, { deal_id: null }), l);
});

test('recents : titres, archivés et dossiers de test écartés', () => {
  Records.create('Deal', { deal_id: 'd1', nom: 'Project Atlas' });
  Records.create('Deal', { deal_id: 'd2', nom: 'Ancien', archived: true });
  Records.create('Deal', { deal_id: 'd3', lots: [{ synthese: { titre: 'Tiger CIM' } }] });
  for (const id of ['d1', 'd2', 'd3', 'inconnu']) R.noterOuverture(id, { email: 'Nora@klocka.immo' });
  const r = R.recents();
  assert.deepEqual(r.map((x) => x.titre), ['Tiger CIM', 'Project Atlas']);
  assert.equal(r[0].par, 'nora@klocka.immo');
});
