// L'adresse d'un projet sur la carte : complétée de sa ville quand elle ne la
// dit pas (« 53 Rue de la République » partait à Toulouse pour une pharmacie
// de Marseille), et un résultat d'une autre ville refusé.

import test from 'node:test';
import assert from 'node:assert/strict';
import { villeDuProjet, adresseAChercher, memeVille, resultatPlausible, adressesAEssayer } from '../src/lib/adresse-projet.js';

test('la ville du projet : celle du secteur, sinon la fin du titre', () => {
  assert.equal(villeDuProjet({ ville_secteur_champ1: 'Non disponible', titre: 'Pharmacie Du Passage - Marseille' }), 'Marseille');
  assert.equal(villeDuProjet({ ville_secteur_champ1: 'Toulon' }), 'Toulon');
  assert.equal(villeDuProjet({ titre: '55 rue des Poteaux - Paris 1er Arrondissement' }), 'Paris');
  assert.equal(villeDuProjet({ titre: 'Murs commerciaux' }), null);
});

test("l'adresse cherchée : la ville ajoutée seulement quand elle manque", () => {
  assert.equal(adresseAChercher({ adresse_complete: '53 Rue de la République', ville_secteur_champ1: 'Non disponible', titre: 'Pharmacie Du Passage - Marseille' }), '53 Rue de la République, Marseille');
  assert.equal(adresseAChercher({ adresse_complete: '9 place Pierre Puget, 83000 Toulon', ville_secteur_champ1: 'Toulon' }), '9 place Pierre Puget, 83000 Toulon');
  assert.equal(adresseAChercher({ adresse_complete: '55 rue des Poteaux, Paris', ville_secteur_champ1: 'Paris' }), '55 rue des Poteaux, Paris');
  assert.equal(adresseAChercher({ adresse_complete: '' }), null);
});

test("un résultat d'une autre ville est refusé", () => {
  const p = { titre: 'Pharmacie Du Passage - Marseille' };
  assert.equal(memeVille(p, 'Toulouse'), false);
  assert.equal(memeVille(p, 'Marseille'), true);
  assert.equal(memeVille({ titre: 'Murs' }, 'Toulouse'), true, 'sans ville connue, rien à refuser');
});

test("la ville ou le code postal écrits dans l'adresse font foi, pas l'enseigne du titre", () => {
  // Le titre « Murs - Bisou Volé » faisait de l'enseigne la ville du projet :
  // Lille était refusée, et Street View retombait au centre de la commune.
  const p = { adresse_complete: '1 rue du Nord, 59800 Lille', titre: 'Murs - Bisou Volé' };
  assert.equal(memeVille(p, 'Lille', '59800'), true);
  assert.equal(memeVille(p, 'Lille'), true);
  assert.equal(memeVille(p, 'Toulouse', '31500'), false);
});

test("un résultat de la BAN : une rue sûre, dans la bonne ville ou près de la commune du dossier", () => {
  const f = (city, postcode, lat, lon, score = 0.97, type = 'housenumber') => ({ properties: { city, postcode, score, type }, geometry: { coordinates: [lon, lat] } });
  const sansVille = { adresse_complete: '1 rue du Nord', titre: 'Murs - Bisou Volé' };
  const lille = { lat: 50.63, lon: 3.06 };
  assert.equal(resultatPlausible(sansVille, f('Lille', '59800', 50.6467, 3.0545), lille), true, 'près de la commune du dossier');
  assert.equal(resultatPlausible(sansVille, f('Toulouse', '31500', 43.6, 1.44), lille), false, 'à 700 km');
  assert.equal(resultatPlausible(sansVille, f('Lille', '59800', 50.6467, 3.0545, 0.97, 'municipality'), lille), false, 'une commune, pas une rue');
  assert.deepEqual(adressesAEssayer(sansVille), ['1 rue du Nord, Bisou Volé', '1 rue du Nord']);
});

test("une adresse en fin de titre n'est pas prise pour la ville", () => {
  // « Bisou Volé - 1 Rue du Havre, Lille » : « 1 Rue du Havre, Lille » n'est pas une ville.
  assert.equal(villeDuProjet({ titre: 'Bisou Volé - 1 Rue du Havre, Lille' }), null);
  assert.equal(villeDuProjet({ titre: 'Boulangerie - 12 bis, avenue Jean Médecin' }), null);
  assert.equal(villeDuProjet({ titre: 'Boulangerie - Nice' }), 'Nice');
});
