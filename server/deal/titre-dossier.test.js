import test from 'node:test';
import assert from 'node:assert/strict';
import { titreDossier, activiteCourte, titreDuLot } from './titre-dossier.js';

test("l'activité et la ville quand on ne connaît pas l'enseigne", () => {
  assert.equal(titreDossier({ activite: 'restaurant', ville: 'Angers' }), 'Restaurant - Angers');
  assert.equal(titreDossier({ activite: 'Restauration traditionnelle (brasserie)', ville: '49000 Angers' }), 'Restauration traditionnelle - Angers');
});

test("l'enseigne passe avant l'activité", () => {
  assert.equal(titreDossier({ enseigne: 'Devred', activite: 'prêt-à-porter', ville: 'Firminy' }), 'Devred - Firminy');
});

test('ni enseigne ni activité : Murs commerciaux, avec la ville', () => {
  assert.equal(titreDossier({ ville: 'Angers' }), 'Murs commerciaux - Angers');
  assert.equal(titreDossier({ enseigne: 'Locataire non identifié', activite: 'non renseigné', ville: 'Lorient' }), 'Murs commerciaux - Lorient');
  assert.equal(titreDossier({}), 'Murs commerciaux');
});

test("la ville n'est pas répétée", () => {
  assert.equal(titreDossier({ enseigne: 'Boulangerie de Nantes', ville: 'Nantes' }), 'Boulangerie de Nantes');
  assert.equal(titreDossier({ enseigne: 'Nantaise Optique', ville: 'Nantes' }), 'Nantaise Optique - Nantes');
});

test("une activité trop longue est coupée, un faux libellé ignoré", () => {
  assert.equal(activiteCourte('commerce de détail de chaussures et maroquinerie de luxe'), 'Commerce de détail de');
  assert.equal(activiteCourte('Activité à qualifier'), null);
});

test('le titre se lit dans le lot d\'une fiche analysée', () => {
  const lot = { adresse: { valeur: { ville: 'Angers', code_postal: '49000' } }, locataire_nom: { valeur: null }, locataire_activite: { valeur: 'restaurant' } };
  assert.equal(titreDuLot(lot), 'Restaurant - Angers');
  assert.equal(titreDuLot({}, { commune: { nom: 'Lorient' } }), 'Murs commerciaux - Lorient');
});
