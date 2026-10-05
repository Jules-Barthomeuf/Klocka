// L'adresse d'un projet sur la carte : complétée de sa ville quand elle ne la
// dit pas (« 53 Rue de la République » partait à Toulouse pour une pharmacie
// de Marseille), et un résultat d'une autre ville refusé.

import test from 'node:test';
import assert from 'node:assert/strict';
import { villeDuProjet, adresseAChercher, memeVille } from '../src/lib/adresse-projet.js';

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
