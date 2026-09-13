// Les leçons des rues : les semblables, les règles, leur application. Pur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ruesSemblables, reglesApprises, appliquerLecons, traitsDe } from './apprentissage.js';

const SEUILS = { loyer_emplacement_1: 800, loyer_emplacement_1bis: 550, loyer_emplacement_2: 250 };
const rue = (nom, classe, loyer, commerces, longueur_m, type, flux = 2) => ({ nom, classe, loyer, commerces, longueur_m, type, flux_estime: { note: flux } });

const RUES = [
  rue('Rue Calme', 1.5, [560, 840], 6, 300, 'residential', 1.5),
  rue('Rue Tranquille', 1.5, [570, 850], 5, 280, 'residential', 1.5),
  rue('Rue Vivante', 1.5, [580, 870], 40, 300, 'pedestrian', 4),
  rue('Boulevard Large', 1, [900, 1300], 60, 900, 'primary', 4.5),
];

test('les semblables d’une rue résidentielle rétrogradée sont les rues du même genre, pas la rue vivante', () => {
  const s = ruesSemblables(RUES[0], RUES, 'residentielle');
  assert.deepEqual(s.map((x) => x.nom), ['Rue Tranquille']);
  assert.deepEqual(ruesSemblables(RUES[0], RUES, 'autre'), [], 'une raison libre ne généralise pas');
});

test('deux rétrogradations pour loyer trop haut font une décote médiane sur la ville', () => {
  const lecons = [
    { ville_id: 'v', de: 1.5, vers: 2, motif_cle: 'loyer_surestime', traits: traitsDe(RUES[0]) },
    { ville_id: 'v', de: 1.5, vers: 2, motif_cle: 'loyer_surestime', traits: traitsDe(RUES[1]) },
  ];
  const r = reglesApprises(lecons, SEUILS);
  assert.ok(r.decotes.v > 0.2 && r.decotes.v < 0.25, `décote ${r.decotes.v}`);
  assert.equal(reglesApprises(lecons.slice(0, 1), SEUILS).decotes.v, undefined, 'une seule leçon ne fait pas une règle');
});

test('un plafond appris rétrograde une rue qui ressemble, et laisse la rue vivante', () => {
  const lecons = [
    { ville_id: 'v', de: 1.5, vers: 2, motif_cle: 'residentielle', traits: traitsDe(RUES[0]) },
    { ville_id: 'w', de: 1.5, vers: 2, motif_cle: 'residentielle', traits: traitsDe(RUES[1]) },
  ];
  const regles = reglesApprises(lecons, SEUILS);
  const autre = rue('Rue Paisible', 1.5, [600, 900], 5, 320, 'residential', 1.5);
  const a = appliquerLecons(autre, regles, 'x', SEUILS);
  assert.equal(a.classe, 2);
  assert.match(a.motif, /d'après vos corrections/);
  assert.equal(appliquerLecons(RUES[2], regles, 'x', SEUILS).classe, 1.5, 'la rue vivante reste');
});
