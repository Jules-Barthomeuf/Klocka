// La page « Emplacement et commercialité » se remplit depuis la seule adresse (1er nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import { resumeEmplacement, lireEmplacement, lieuxGoogle, voiesDe } from './emplacement-auto.js';

test('les lieux Google : noms et types, sans doublon', () => {
  assert.deepEqual(lieuxGoogle([{ displayName: { text: 'Cordeliers' }, primaryType: 'bus_stop' }, { displayName: { text: 'Cordeliers' }, primaryType: 'bus_stop' }, { primaryType: 'parking' }]), [{ nom: 'Cordeliers', type: 'bus_stop' }]);
});

test('la synthèse : voisins, transports par genre, voie de la rue, vacance', () => {
  const r = resumeEmplacement({
    rue: 'Rue de la République',
    voies: voiesDe([{ tags: { highway: 'service' } }, { tags: { highway: 'pedestrian', name: 'Rue de la République' } }]),
    voisinsGoogle: [{ nom: 'Printemps', type: 'department_store' }, { nom: 'Café du Coin', type: 'cafe' }],
    transportsGoogle: [{ nom: 'Cordeliers', type: 'subway_station' }, { nom: 'Parking Grolée', type: 'parking_garage' }],
    commerces: [{ nom: 'Levi’s', enseigne: "Levi's", genre: 'clothes' }, { vacant: true }],
    vacance: { verdict: 'Vacance faible' },
  });
  assert.equal(r.voie.type, 'rue piétonne');
  assert.equal(r.voisins_les_plus_proches.restauration, 1);
  assert.deepEqual(r.transports_300m.métro, ['Cordeliers']);
  assert.deepEqual(r.transports_300m.parking, ['Parking Grolée']);
  assert.equal(r.commerces_150m.nombre, 1);
  assert.equal(r.commerces_150m.vides_releves, 1);
  assert.deepEqual(r.commerces_150m.enseignes, ["Levi's"]);
  assert.equal(r.vacance.verdict, 'Vacance faible');
});

test('une lecture qui échoue ne retient pas les autres ; sans position, rien', async () => {
  const r = await lireEmplacement('x', { lieu: { lat: 45.76, lon: 4.83 }, outils: {
    voisinsGoogle: async () => [{ nom: 'Printemps', type: 'store' }],
    transportsGoogle: async () => { throw new Error('quota'); },
    voies: async () => [], commerces: async () => [], equipements: async () => null, vacance: async () => null,
  } });
  assert.deepEqual(r.voisins_les_plus_proches.noms, ['Printemps (store)']);
  assert.equal(r.transports_300m, undefined);
  assert.deepEqual(await lireEmplacement('x', { lieu: null }), {});
});

test('la ligne Vacance : un chiffre seul, « taux estimé »', async () => {
  const { vacanceEstimee } = await import('./mandataire-avis.js');
  assert.equal(vacanceEstimee({ vacance: { taux_estime: 15.3 } }).replace(/\u202f/g, ' '), '15,3 % (taux estimé)');
  assert.equal(vacanceEstimee({ vacance: { taux_estime: null } }), null);
  assert.equal(vacanceEstimee({}), null);
});
