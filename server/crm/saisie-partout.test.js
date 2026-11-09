import test from 'node:test';
import assert from 'node:assert/strict';
import { valeurPourTwenty } from './ecran.js';

test("une adresse et une liste se tapent dans une case du CRM (8 nov. 2026)", () => {
  const a = valeurPourTwenty('ADDRESS', '12 rue Carnot, 69002 Lyon', { addressCountry: 'France' });
  assert.equal(a.addressStreet1, '12 rue Carnot');
  assert.equal(a.addressCity, 'Lyon');
  assert.equal(a.addressPostcode, '69002');
  assert.equal(a.addressCountry, 'France');
  assert.equal(valeurPourTwenty('ADDRESS', 'Antibes').addressCity, 'Antibes');
  assert.deepEqual(valeurPourTwenty('MULTI_SELECT', 'Lyon; Nice, Cannes'), ['Lyon', 'Nice', 'Cannes'], 'virgule ou point-virgule');
});

test("un client changé dans Twenty relance l'import ; un autre tableau, non (8 nov. 2026)", async () => {
  const { surClientTwenty } = await import('../mandataire-espace.js');
  assert.equal(surClientTwenty({ eventName: 'kpProspects.updated' }), false);
  assert.equal(surClientTwenty({}), false);
  // Un délai très long : le test vérifie la reconnaissance de l'événement, sans lancer d'import.
  assert.equal(surClientTwenty({ eventName: 'clients.updated' }, { delai: 3600000 }), true);
});
