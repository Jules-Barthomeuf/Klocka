// Le manuel du mandataire (31 oct. 2026, PLAN 2.2) : les principes de docs/haka-principes.md sont dans la consigne
// de Haka côté mandataire, tels quels, et la fiche ouverte lui dit ce qu'elle sait déjà, avec ses sources.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-principes-'));
const { consigne, principesMandataire, ceQueDitLaFiche } = await import('../mandataire.js');

test('les neuf principes du manuel sont dans la consigne du mandataire, avant le reste', () => {
  const doc = fs.readFileSync(new URL('../../docs/haka-principes.md', import.meta.url), 'utf8');
  const principes = doc.split('\n').filter((l) => /^\d\. /.test(l));
  assert.equal(principes.length, 9);
  const c = consigne();
  for (const p of principes) assert.ok(c.includes(p), `absent de la consigne : ${p}`);
  assert.ok(c.indexOf(principes[0]) < c.indexOf('COMMENT LES TENIR'));
  assert.ok(!principesMandataire().startsWith('#'));
});

test("la fiche ouverte dit ce qu'elle sait déjà, avec la source", () => {
  const t = ceQueDitLaFiche({
    corrections: { exploitant: 'Mme Roux' }, sources: { exploitant: { source: 'le mandataire' }, 'section:loyer': { source: "l'exploitante", a_confirmer: true } },
    sections: [{ titre: 'Loyer', texte: '24 000 € HT par an' }], prochaine_action: 'Appeler M. Bernard', prochaine_action_le: '2026-11-02T09:00:00.000Z',
  });
  assert.match(t, /exploitant : Mme Roux \(source : le mandataire\)/);
  assert.match(t, /partie « Loyer » : 24 000 € HT par an \(source : l'exploitante, à confirmer\)/);
  assert.match(t, /prochaine action : Appeler M\. Bernard le 2026-11-02T09:00/);
  assert.equal(ceQueDitLaFiche({}), '');
});
