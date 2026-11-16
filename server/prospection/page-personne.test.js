// La page de la personne de l'appel : la page équipe parmi les pages lues, l'adresse d'une réponse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { pageEquipe, premiereUrl } from './page-personne.js';

test('la page équipe parmi les pages lues du site, puis qui sommes-nous', () => {
  assert.equal(pageEquipe(['https://a.fr/', 'https://a.fr/qui-sommes-nous/', 'https://a.fr/notre-equipe/']), 'https://a.fr/notre-equipe/');
  assert.equal(pageEquipe(['https://a.fr/', 'https://a.fr/qui-sommes-nous/']), 'https://a.fr/qui-sommes-nous/');
  assert.equal(pageEquipe(['https://a.fr/contact']), null);
  assert.equal(premiereUrl('La page : https://www.agence.fr/equipe/martin-durand.'), 'https://www.agence.fr/equipe/martin-durand');
  assert.equal(premiereUrl('aucune'), null);
});
