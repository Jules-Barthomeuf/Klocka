import test from 'node:test';
import assert from 'node:assert/strict';
import { repereDuTexte, requetesPour } from './repere.js';

test('le repère annoncé par « à proximité de » est retenu', () => {
  assert.equal(repereDuTexte('Le Groupe POINT DE VENTE vous propose, à proximité du métro Rambuteau, un local de 45 m²'), 'métro Rambuteau');
  assert.equal(repereDuTexte('Local situé face à la gare Saint-Charles, idéal restauration'), 'gare Saint-Charles');
  assert.equal(repereDuTexte('Emplacement n°1 au pied de la place de la République'), 'place de la République');
});

test('un repère de proximité passe devant une rue citée en passant', () => {
  assert.equal(repereDuTexte('Ancien magasin rue Montorgueil. Le local est à deux pas du métro Sentier.'), 'métro Sentier');
});

test("une adresse numérotée n'est pas un repère ; rien à trouver donne null", () => {
  assert.equal(repereDuTexte('12 rue de Rivoli, 75004 Paris'), null);
  assert.equal(repereDuTexte('Beau local lumineux, bon état général'), null);
  assert.equal(repereDuTexte(''), null);
});

test('les requêtes OSM : une station se cherche comme station, puis par son nom', () => {
  assert.deepEqual(requetesPour('métro Rambuteau', 'Paris'), ['station Rambuteau, Paris', 'Rambuteau, Paris']);
  assert.deepEqual(requetesPour('place de la République', 'Paris'), ['place de la République, Paris']);
  assert.deepEqual(requetesPour('', 'Paris'), []);
});

test('le repère perd ses mots de liaison, la ville son arrondissement', async () => {
  const { repereNet, villeDeRecherche, requetesPour } = await import('./repere.js');
  assert.equal(repereNet('à proximité du métro Rambuteau'), 'métro Rambuteau');
  assert.equal(repereNet('face à la gare Saint-Charles'), 'gare Saint-Charles');
  assert.equal(villeDeRecherche('PARIS 4E'), 'Paris');
  assert.equal(villeDeRecherche('Lyon 3ème'), 'Lyon');
  assert.equal(villeDeRecherche('75004 Paris'), 'Paris');
  assert.deepEqual(requetesPour('à proximité du métro Rambuteau', 'PARIS 4E'), ['station Rambuteau, Paris', 'Rambuteau, Paris']);
});
