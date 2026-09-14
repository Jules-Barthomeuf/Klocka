// Les leçons des rues : les semblables, les règles, leur application. Pur.

import test from 'node:test';
import assert from 'node:assert/strict';
import { ruesSemblables, reglesApprises, appliquerLecons, traitsDe, motifsPour } from './apprentissage.js';

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

test('un plafond appris rétrograde une rue qui ressemble, et laisse la rue vivante', () => {
  const lecons = [
    { ville_id: 'v', de: 1.5, vers: 2, motif_cle: 'residentielle', traits: traitsDe(RUES[0]) },
    { ville_id: 'w', de: 1.5, vers: 2, motif_cle: 'residentielle', traits: traitsDe(RUES[1]) },
  ];
  const regles = reglesApprises(lecons);
  const autre = rue('Rue Paisible', 1.5, [600, 900], 5, 320, 'residential', 1.5);
  const a = appliquerLecons(autre, regles);
  assert.equal(a.classe, 2);
  assert.match(a.motif, /d'après vos corrections/);
  assert.equal(appliquerLecons(RUES[2], regles).classe, 1.5, 'la rue vivante reste');
});

test('les motifs proposés suivent le sens de la correction', () => {
  const baisse = motifsPour(1.5, 2).map((m) => m.cle);
  const hausse = motifsPour(1.5, 1).map((m) => m.cle);
  assert.ok(baisse.includes('loyer_surestime') && !baisse.includes('loyer_sousestime'));
  assert.ok(hausse.includes('loyer_sousestime') && hausse.includes('artere') && !hausse.includes('loyer_surestime'));
  assert.ok(baisse.includes('autre') && hausse.includes('autre'));
});

test('une artère montée en 1 fait monter les rues aussi longues et garnies', () => {
  const croisette = rue('Boulevard de la Croisette', 1.5, [700, 1000], 45, 1800, 'primary', 4);
  const regles = reglesApprises([{ ville_id: 'v', de: 1.5, vers: 1, motif_cle: 'artere', traits: traitsDe(croisette) }]);
  assert.equal(regles.planchers.length, 1);
  assert.equal(appliquerLecons(rue('Boulevard Carnot', 1.5, [500, 800], 50, 2000, 'primary', 3), regles).classe, 1);
  assert.equal(appliquerLecons(RUES[0], regles).classe, 1.5, 'la petite rue calme ne bouge pas');
  assert.deepEqual(ruesSemblables(croisette, [croisette, RUES[3], RUES[0]], 'artere').map((x) => x.nom), [], 'le boulevard large est déjà en 1, la rue calme trop courte');
});
