// Choisir la bonne adresse parmi les propositions de la Base Adresse Nationale.

import test from 'node:test';
import assert from 'node:assert/strict';

import { motsDe, typeDeVoie, numeroDe, concordance, classer, redemanderSansCodePostal } from './adresse.js';

// Les propositions réelles de la BAN pour « place de bethune 59000 lille »,
// telles qu'elle les a rendues. C'est le cas qui a motivé ce module.
const PLACE = { label: 'Place de Béthune 59800 Lille', street: 'Place de Béthune', city: 'Lille', postcode: '59800', score: 0.7769 };
const FAUBOURG = { label: 'Rue du Faubourg de Béthune 59000 Lille', street: 'Rue du Faubourg de Béthune', city: 'Lille', postcode: '59000', score: 0.4688 };
const RUE_BETHUNE = { label: 'Rue de Béthune 59800 Lille', street: 'Rue de Béthune', city: 'Lille', postcode: '59800', score: 0.6751 };

test('les mots se lisent sans accent ni abréviation', () => {
  assert.deepEqual(motsDe('9 Place de Béthune'), ['9', 'place', 'de', 'bethune']);
  assert.deepEqual(motsDe('12 BD Gambetta'), ['12', 'boulevard', 'gambetta']);
  assert.deepEqual(motsDe('3 av. du Gal Leclerc'), ['3', 'avenue', 'du', 'gal', 'leclerc']);
  assert.deepEqual(motsDe(''), []);
});

test('le type de voie et le numéro se reconnaissent', () => {
  assert.equal(typeDeVoie(motsDe('place de Béthune')), 'place');
  assert.equal(typeDeVoie(motsDe('Rue du Faubourg de Béthune')), 'rue');
  assert.equal(typeDeVoie(motsDe('bd Gambetta')), 'boulevard', 'les abréviations comptent');
  assert.equal(typeDeVoie(motsDe('Béthune')), null);

  assert.equal(numeroDe(motsDe('49 rue Dabray')), '49');
  assert.equal(numeroDe(motsDe('31 bis rue Michel Ange')), '31');
  // Seulement en tête : la date dans « Rue du 8 Mai 1945 » nomme la voie.
  assert.equal(numeroDe(motsDe('rue du 8 mai 1945')), null);
  assert.equal(numeroDe(motsDe('59000 Lille')), null, 'un code postal n\'est pas un numéro');
  assert.equal(numeroDe([]), null);
});

test('une place demandée n\'est pas une rue, même si le nom s\'y retrouve', () => {
  const requete = 'place de bethune 59000 lille';
  const place = concordance(requete, PLACE);
  const faubourg = concordance(requete, FAUBOURG);

  // Le nom « Béthune » est dans les deux : la part ne les sépare pas.
  assert.equal(place.part, 1);
  assert.equal(faubourg.part, 1);
  // C'est le type de voie qui tranche, et le mot « Faubourg » en trop.
  assert.equal(place.type_contredit, false);
  assert.equal(faubourg.type_contredit, true);
  assert.equal(place.bruit, 0);
  assert.ok(faubourg.bruit > 0, 'le Faubourg ajoute un mot qui n\'a pas été demandé');
  // Le code postal tapé était celui du Faubourg : il ne doit pas décider.
  assert.equal(place.code_postal_contredit, true);
  assert.equal(faubourg.code_postal_contredit, false);
});

test('le classement rend la Place de Béthune malgré le code postal du Faubourg', () => {
  const requete = 'place de bethune 59000 lille';
  const classees = classer(requete, [FAUBOURG, RUE_BETHUNE, PLACE]);
  assert.equal(classees[0].label, 'Place de Béthune 59800 Lille');
  // Le Faubourg passe derrière la rue de Béthune : type contredit et mot en trop.
  assert.ok(classees.findIndex((x) => x.label === FAUBOURG.label) > 0);
  assert.deepEqual(classer('x', []), []);
});

test('un numéro demandé fait préférer la proposition qui le porte', () => {
  const requete = '49 rue Dabray 06000 Nice';
  const voie = { label: 'Rue Dabray 06000 Nice', street: 'Rue Dabray', city: 'Nice', postcode: '06000', score: 0.8 };
  const point = { label: '49 Rue Dabray 06000 Nice', street: 'Rue Dabray', city: 'Nice', postcode: '06000', housenumber: '49', score: 0.8 };
  assert.equal(classer(requete, [voie, point])[0].housenumber, '49');

  // Une adresse juste ne doit lever aucun doute : le numéro et la ville ne
  // sont pas des mots de la voie, et ne peuvent pas manquer à l'appel.
  const k = concordance(requete, point);
  assert.equal(k.part, 1);
  assert.equal(k.bruit, 0);
  assert.equal(k.code_postal_contredit, false);
  assert.equal(k.numero_contredit, false);

  // « 31 » et « 31 bis » ne se contredisent pas : l'un précise l'autre.
  const bis = concordance('31 bis rue Michel Ange 06100 Nice', { street: 'Rue Michel Ange', city: 'Nice', postcode: '06100', housenumber: '31bis', score: 0.9 });
  assert.equal(bis.numero_contredit, false);
  assert.equal(bis.part, 1, '« bis » précise le numéro, ce n\'est pas un mot de la rue');
});

test('on repose la question sans le code postal quand il mène à côté', () => {
  const requete = 'place de bethune 59000 lille';
  const mauvais = classer(requete, [FAUBOURG])[0];
  assert.equal(redemanderSansCodePostal(requete, mauvais), 'place de bethune lille');

  // Une proposition fidèle ne déclenche aucune seconde question.
  const bon = classer(requete, [PLACE])[0];
  assert.equal(redemanderSansCodePostal(requete, bon), null);
  // Sans code postal dans la demande, il n'y a rien à retirer.
  assert.equal(redemanderSansCodePostal('place de bethune lille', mauvais), null);
});
