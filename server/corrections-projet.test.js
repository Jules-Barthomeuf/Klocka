import test from 'node:test';
import assert from 'node:assert/strict';
import { appliquerRegle, changements, genreCorrection, libelleChamp, reglesDesCorrections } from './corrections-projet.js';

test('le genre d\'une correction', () => {
  assert.equal(genreCorrection('restauration rapide', 'Restauration rapide'), 'majuscule');
  assert.equal(genreCorrection('Boulangerie', 'boulangerie'), 'minuscule');
  assert.equal(genreCorrection('LYON', 'Lyon'), 'casse');
  assert.equal(genreCorrection('rue de la Paix,', 'rue de la Paix'), 'forme');
  assert.equal(genreCorrection(180, '175'), 'chiffre');
  assert.equal(genreCorrection(null, 'KFC'), 'ajout');
  assert.equal(genreCorrection('KFC', ''), 'retrait');
  assert.equal(genreCorrection('Pharmacie', 'Restauration'), 'texte');
});

test('ce qui a changé, cases du résumé comprises', () => {
  const avant = { activite_locataire: 'restauration rapide', surface_m2: 180, champs_masques: [], cases_forcees: {} };
  const patch = { activite_locataire: 'Restauration rapide', surface_m2: 180, updated_date: 'x', cases_forcees: { 'bien.activite': { valeur: 'Fast-food' } } };
  const c = changements(avant, patch, { affiche: (champ) => (champ === 'cases_forcees.bien.activite.valeur' ? 'Restauration rapide' : undefined) });
  assert.deepEqual(c.map((x) => [x.champ, x.genre]), [['activite_locataire', 'majuscule'], ['cases_forcees.bien.activite.valeur', 'texte']]);
  assert.equal(libelleChamp('cases_forcees.bien.activite.valeur'), 'Bien › activite');
  assert.equal(libelleChamp('activite_locataire'), 'Activité du locataire');
});

test('une majuscule remise sur trois projets devient une règle', () => {
  const le = new Date().toISOString();
  const c = (p, genre = 'majuscule') => ({ project_id: p, champ: 'activite_locataire', genre, avant: 'x', apres: 'X', le });
  const deux = reglesDesCorrections([c('a'), c('b')]);
  assert.equal(deux.regles.length, 0);
  assert.equal(deux.observations[0].projets, 2);
  // Trois corrections du même projet ne font pas une règle.
  assert.equal(reglesDesCorrections([c('a'), c('a'), c('a')]).regles.length, 0);
  const trois = reglesDesCorrections([c('a'), c('b'), c('c')]);
  assert.equal(trois.regles[0].type, 'majuscule');
  assert.equal(trois.regles[0].active, true);
  assert.equal(reglesDesCorrections([c('a'), c('b'), c('c')], { coupees: new Set(['majuscule:activite_locataire']) }).regles[0].active, false);
  // Une correction contraire empêche la règle.
  assert.equal(reglesDesCorrections([c('a'), c('b'), c('c'), c('d', 'minuscule')]).regles.length, 0);
});

test('un même remplacement sur deux projets devient une règle, et les règles s\'appliquent', () => {
  const le = new Date().toISOString();
  const c = (p) => ({ project_id: p, champ: 'nom_locataire', genre: 'texte', avant: 'KFC France', apres: 'KFC', le });
  const { regles } = reglesDesCorrections([c('a'), c('b')]);
  assert.equal(regles[0].type, 'remplacement');
  assert.equal(appliquerRegle(regles[0], 'KFC France'), 'KFC');
  assert.equal(appliquerRegle(regles[0], 'Burger King'), undefined);
  assert.equal(appliquerRegle({ type: 'majuscule' }, 'restauration rapide'), 'Restauration rapide');
  assert.equal(appliquerRegle({ type: 'majuscule' }, 'Restauration rapide'), undefined);
});
