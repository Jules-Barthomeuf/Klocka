import test from 'node:test';
import assert from 'node:assert/strict';
import { cleDe, lienMaps } from './photo-commerce.js';

test("la clé de la photo : l'identifiant Google d'abord, sinon le nom et l'adresse sans accents", () => {
  assert.equal(cleDe({ placeId: 'abc', nom: 'X', adresse: 'Y' }), 'place:abc');
  assert.equal(cleDe({ nom: 'Boulangerie Élise', adresse: '3, rue Mercière' }), 'texte:boulangerie elise|3 rue merciere');
  assert.equal(cleDe({ nom: 'Sans adresse' }), null);
});

test('le lien Google Maps porte le lieu quand il est connu', () => {
  assert.equal(lienMaps({ nom: 'Chez Paul', adresse: 'Lyon' }), 'https://www.google.com/maps/search/?api=1&query=Chez%20Paul%20Lyon');
  assert.match(lienMaps({ placeId: 'ChIJ1', nom: 'Chez Paul', adresse: 'Lyon' }), /&query_place_id=ChIJ1$/);
});
