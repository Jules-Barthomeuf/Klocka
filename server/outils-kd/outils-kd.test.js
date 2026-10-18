import test from 'node:test';
import assert from 'node:assert/strict';
import { indiceDeFlux, poidsGare, classerEmplacement } from './emplacement.js';
import { rangerRisques, lireUrbanisme, rapprocherGares } from './sources-ouvertes.js';

test("l'indice de flux : composantes notées sur 100, poids répartis sur celles qui ont une donnée", () => {
  const f = indiceDeFlux({ habitants: 9000, emplois: 600, gares: [{ voyageurs: 5_600_000, distance_m: 622 }], arrets: [{ distance_m: 34 }, { distance_m: 400 }], generateurs: 10, commerces_troncon: 20 });
  assert.equal(f.composantes.find((c) => c.cle === 'habitants').note, 100);
  assert.equal(f.composantes.find((c) => c.cle === 'arrets').valeur, 1);
  assert.ok(f.indice > 50 && f.indice <= 100);
  const partiel = indiceDeFlux({ commerces_troncon: 10 });
  assert.equal(partiel.sur, '1 composantes sur 6');
  assert.equal(partiel.indice, 50);
  assert.equal(indiceDeFlux({}).indice, null);
  assert.equal(poidsGare(200), 1);
  assert.equal(poidsGare(2000), 0);
});

test('le classement : n°1 sur un flux et une commercialité forts, secondaire sinon ; réserves et activités', () => {
  const fort = classerEmplacement({ flux: indiceDeFlux({ habitants: 9000, emplois: 1200, arrets: Array(10).fill({ distance_m: 50 }), commerces_troncon: 20, generateurs: 25 }), risques: { lourds: ['Inondation'] } });
  assert.equal(fort.classement, 'n1');
  assert.match(fort.reserves[0], /Inondation/);
  assert.ok(fort.activites.adaptees.some((a) => /prêt-à-porter/.test(a)));
  const faible = classerEmplacement({ flux: indiceDeFlux({ habitants: 800, commerces_troncon: 1 }), revenu_vs_france: 25 });
  assert.equal(faible.classement, 'secondaire');
  assert.ok(faible.activites.adaptees.some((a) => /proximité/.test(a)));
  assert.equal(classerEmplacement({}).classement, null);
});

test('les sources : risques rangés, urbanisme lu, gares rapprochées par le code UIC', () => {
  const r = rangerRisques([{ libelle_risque_long: 'Inondation' }, { libelle_risque_long: 'Radon' }]);
  assert.deepEqual([r.lourds, r.autres], [['Inondation'], ['Radon']]);
  const u = lireUrbanisme({ zones: [{ properties: { libelle: 'UBa', typezone: 'U' } }], lineaires: [{ properties: { libelle: 'Linéaire commercial à protéger' } }] });
  assert.equal(u.zone.code, 'UBa');
  assert.equal(u.lineaire_commercial, true);
  const g = rapprocherGares([{ nom: 'Cannes', position_geographique: { lat: 43.55, lon: 7.01 }, codes_uic: '87757625' }], [{ code_uic_complet: '0087757625', total_voyageurs_2024: 5622415 }]);
  assert.equal(g[0].voyageurs, 5622415);
});
