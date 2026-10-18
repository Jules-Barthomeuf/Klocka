import test from 'node:test';
import assert from 'node:assert/strict';
import { parserIlc, trimestreDe, facteurIlc, actualiserReferences } from './ilc.js';

const XML = '<Series IDBANK="001532540"><Obs TIME_PERIOD="2026-Q2" OBS_VALUE="137.16" DATE_JO="2026-09-25"/><Obs TIME_PERIOD="2024-Q2" OBS_VALUE="130.00"/><Obs TIME_PERIOD="2026-Q1" OBS_VALUE="135.26"/></Series>';

test("l'ILC se lit dans la réponse SDMX de l'INSEE, trié", () => {
  const i = parserIlc(XML);
  assert.deepEqual(i.map((x) => x.periode), ['2024-Q2', '2026-Q1', '2026-Q2']);
  assert.equal(i[2].valeur, 137.16);
  assert.equal(trimestreDe('2024-05-10T00:00:00Z'), '2024-Q2');
});

test('un loyer de 2024 se ramène au dernier indice publié ; un loyer récent ou non daté ne bouge pas', () => {
  const i = parserIlc(XML);
  const f = facteurIlc('2024-05-10', i);
  assert.equal(f.actualise, true);
  assert.equal(f.facteur, Math.round((137.16 / 130) * 10000) / 10000);
  assert.equal(facteurIlc('2026-08-01', i).actualise, false);
  assert.equal(facteurIlc(null, i).actualise, false);
  const [r] = actualiserReferences([{ loyer_m2: 300, le: '2024-05-10' }], i);
  assert.equal(r.loyer_m2_brut, 300);
  assert.equal(r.loyer_m2, 316.5);
});
