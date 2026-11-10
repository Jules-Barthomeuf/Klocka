import test from 'node:test';
import assert from 'node:assert/strict';
import { dateExcel, pointExcel, referencesDeLExport, ramenerSurface, sansDoublons, verdict, loyerDeMarche } from './loyers-reels.js';

const ligne = (x) => ({ ID: 'a', 'asset class': 'Commercial', rent: '24000', surface: '100', coordinates: '4.83611,45.76581', 'publication date': '46000', address: '1 rue X', city: 'Lyon', ...x });

test('dates et positions des exports Equimmox, dans leurs deux écritures', () => {
  assert.equal(dateExcel('45667.04166666667'), '2025-01-10');
  assert.equal(dateExcel('2026-03-01T00:00'), '2026-03-01');
  assert.equal(dateExcel(''), null);
  assert.deepEqual(pointExcel('4.83611,45.76581'), { lat: 45.76581, lon: 4.83611 });
  assert.deepEqual(pointExcel('[4,853939,45,727687]'), { lat: 45.727687, lon: 4.853939 });
  assert.equal(pointExcel('n/a'), null);
});

test("l'export ne garde que les commerces loués avec loyer, position et loyer au m² plausible", () => {
  const refs = referencesDeLExport([
    ligne({}),
    ligne({ ID: 'b', 'asset class': 'Office' }),
    ligne({ ID: 'c', rent: '' }),
    ligne({ ID: 'd', coordinates: '' }),
    ligne({ ID: 'e', rent: '2000' }), // 20 €/m²/an : un loyer mensuel pris pour annuel
  ]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].id, 'equimmox:a');
  assert.equal(refs[0].loyer_m2, 240);
  assert.equal(refs[0].publie_le, '2025-12-09');
});

test('la surface : un petit local se loue plus cher au m², environ 1,8 fois de 300 à 30 m²', () => {
  assert.equal(Math.round(ramenerSurface(100, 300, 30) * 100) / 100, 177.83);
  assert.equal(ramenerSurface(100, null, 30), 100);
});

test('le même local publié deux fois compte une fois', () => {
  const p = { lat: 45.76, lon: 4.83 };
  assert.equal(sansDoublons([{ point: p, surface: 50, loyer_m2: 200 }, { point: p, surface: 51, loyer_m2: 202 }, { point: p, surface: 80, loyer_m2: 200 }]).length, 2);
});

test('le verdict ne tranche qu’au-delà de 25 %', () => {
  assert.equal(verdict(260, 200).verdict, 'au-dessus');
  assert.equal(verdict(240, 200).verdict, 'dans la moyenne');
  assert.equal(verdict(140, 200).verdict, 'en dessous');
  assert.equal(verdict(null, 200), null);
});

test('la moyenne simple des loyers réels à 1 km, pas de chiffre sous 3 références', () => {
  const maintenant = Date.parse('2026-11-10');
  const ref = (lat, loyer_m2, le = '2026-01-01') => ({ source: 'murs_occupes', point: { lat, lon: 4.83 }, surface: 100, loyer_m2, publie_le: le });
  const cible = { lat: 45.76, lon: 4.83, surface: 100, loyer_m2: 300 };
  const r = loyerDeMarche(cible, [ref(45.761, 200), ref(45.762, 220), ref(45.763, 240), ref(45.80, 900), ref(45.7605, 500, '2020-01-01')], { maintenant });
  assert.equal(r.n, 3);
  assert.equal(r.rayon_m, 500);
  assert.equal(r.valeur, 220);
  assert.deepEqual([r.min, r.max], [200, 240]);
  assert.equal(r.verdict.verdict, 'au-dessus');
  assert.equal(r.references[0].distance_m < r.references[2].distance_m, true);
  const peu = loyerDeMarche(cible, [ref(45.761, 200)], { maintenant });
  assert.equal(peu.valeur, null);
  assert.match(peu.raison, /il en faut 3/);
});
