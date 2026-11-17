// L'équipe d'une agence chez Apollo pour la carte d'appel : sans la location, rangée, sans rien révéler.

import test from 'node:test';
import assert from 'node:assert/strict';
import { equipeRangee, nomCourt, posteFrancais, rangPoste } from './agences-apollo.js';

test('la location et la gestion écartées ; le commerce, la transaction, la direction puis l\'administratif', () => {
  assert.equal(rangPoste('Rental Management Officer'), null);
  assert.equal(rangPoste('Gestionnaire locatif'), null);
  assert.equal(rangPoste('Responsable gestion locative'), null);
  assert.equal(rangPoste('Négociateur immobilier d\'entreprise et commerce'), 0);
  assert.equal(rangPoste('Conseillère en transaction'), 1);
  assert.equal(rangPoste('Founder'), 2);
  assert.equal(rangPoste('Responsable administrative'), 3);
  assert.equal(rangPoste('Business and Marketing Director'), null);
  assert.equal(rangPoste('Responsable E-commerce & Croissance'), null);
  assert.equal(rangPoste('Coordinateur Travaux et Logistique d Entreprise'), null);
  assert.equal(rangPoste('Community Manager'), null);
  assert.equal(rangPoste('Négociateur location et transaction'), 1);
  assert.equal(rangPoste('Negociatrice en Immobilier'), 1);
  assert.equal(posteFrancais('Founder'), 'Fondateur');
  assert.equal(posteFrancais('Chargée de Projets Immobiliers'), 'Chargée de Projets Immobiliers');
  assert.equal(nomCourt('Maxime', 'Do***e'), 'Maxime D.');
  const e = equipeRangee([
    { id: '1', first_name: 'Maxime', last_name_obfuscated: 'Do***e', title: 'Founder' },
    { id: '2', first_name: 'Clara', last_name_obfuscated: 'Au***u', title: 'Chargée de Projets Immobiliers' },
    { id: '3', first_name: 'Faiza', last_name_obfuscated: 'Fr***a', title: 'Rental Management Officer' },
  ]);
  assert.deepEqual(e.map((x) => x.nom), ['Clara A.', 'Maxime D.']);
  assert.equal(e[1].poste, 'Fondateur');
  assert.ok(e.every((x) => !('email' in x) && !('telephone' in x)));
});
