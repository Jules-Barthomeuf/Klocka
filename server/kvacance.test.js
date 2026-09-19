// K-Vacance : le taux de vacance, rue par rue, et le rythme des fermetures.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kvac-'));
const { tauxDeVacance, turnOver, lireFermeture, normaliserRue, MINIMUM_PAR_RUE } = await import('./kvacance.js');

const local = (adresse, vacant = false) => ({ adresse, vacant, lat: 43.7, lon: 7.25, genre: vacant ? 'vacant' : 'bakery' });

test('le taux se calcule sur la zone et rue par rue, et une rue trop courte est écartée', () => {
  const v = tauxDeVacance([
    local('1 Rue Dabray'), local('3 Rue Dabray', true), local('5 Rue Dabray'), local('7 Rue Dabray', true),
    local('2 Avenue Jean Médecin'), local('4 Avenue Jean Médecin'), local('6 Avenue Jean Médecin'), local('8 Avenue Jean Médecin'),
    local('1 Rue Courte', true), local('3 Rue Courte'),
  ]);

  assert.equal(v.total, 10);
  assert.equal(v.vides, 3);
  assert.equal(v.taux, 30);
  const dabray = v.rues.find((r) => r.rue === 'dabray');
  assert.equal(dabray.total, 4);
  assert.equal(dabray.vides, 2);
  assert.equal(dabray.taux, 50);
  assert.equal(dabray.points.length, 2, 'les locaux vides portent leur point, pour la carte');
  // Deux devantures ne font pas une statistique : la rue est écartée, et on le dit.
  assert.equal(v.rues.find((r) => r.rue === 'courte'), undefined);
  assert.equal(v.rues_ecartees, 1);
  assert.equal(v.minimum_par_rue, MINIMUM_PAR_RUE);
  // Les rues les plus en tension d'abord.
  assert.equal(v.rues[0].rue, 'dabray');
  assert.equal(tauxDeVacance([]).taux, null);
});

test('une fermeture porte sa durée d\'exploitation, et sans point elle est écartée', () => {
  const centre = { lat: 43.7, lon: 7.25 };
  const f = lireFermeture(
    { nom_complet: 'V.N.RESTAURATION', etat_administratif: 'C', activite_principale: '56.10A' },
    { siret: '43405555400019', etat_administratif: 'F', date_creation: '2000-12-29', date_fermeture: '2008-09-15', latitude: '43.70372', longitude: '7.26327', adresse: '19 RUE ALSACE LORRAINE 06000 NICE' },
    centre,
  );
  assert.equal(f.siret, '43405555400019');
  assert.equal(f.annee_fermeture, 2008);
  assert.ok(Math.abs(f.duree_ans - 7.7) < 0.2, `durée ${f.duree_ans}`);
  assert.equal(f.societe_cessee, true);
  assert.ok(f.distance_m > 0);
  // Sans coordonnées ou sans date de fermeture, rien à en tirer.
  assert.equal(lireFermeture({}, { siret: '1', date_fermeture: '2020-01-01' }, centre), null);
  assert.equal(lireFermeture({}, { siret: '1', latitude: '43.7', longitude: '7.25' }, centre), null);
});

test('le turn-over rend la durée médiane et la part des enseignes qui ne tiennent pas', () => {
  const t = turnOver([
    { duree_ans: 2, annee_fermeture: 2023 }, { duree_ans: 4, annee_fermeture: 2023 },
    { duree_ans: 6, annee_fermeture: 2024 }, { duree_ans: 12, annee_fermeture: 2025 },
    { duree_ans: null, annee_fermeture: 2025 },
  ]);
  assert.equal(t.n, 5);
  assert.equal(t.duree_mediane, 5, 'la fermeture sans durée ne fausse pas la médiane');
  assert.equal(t.part_moins_3_ans, 25);
  assert.deepEqual(t.par_annee, [{ annee: 2023, n: 2 }, { annee: 2024, n: 1 }, { annee: 2025, n: 2 }]);
  assert.equal(turnOver([]).duree_mediane, null);
});

test('les rues se rapprochent sans leur type de voie', () => {
  assert.equal(normaliserRue('Boulevard de Cessole'), 'de cessole');
  assert.equal(normaliserRue('Bd de Cessole'), 'de cessole');
  assert.equal(normaliserRue('Avenue Jean Médecin'), 'jean medecin');
});
