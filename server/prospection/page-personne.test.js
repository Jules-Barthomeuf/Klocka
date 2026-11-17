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

test('la personne de l\'appel : son nom dans son mail, la même personne écrite autrement', async () => {
  const { nomDuMail, memePersonne, cleNom, consigneReperage } = await import('./page-personne.js');
  assert.equal(nomDuMail('paul.martin@cw-rennes.fr'), 'Paul Martin');
  assert.equal(nomDuMail('yveslaurent.martin@cw-rennes.fr'), 'Yveslaurent Martin');
  assert.equal(nomDuMail('contact@cw-rennes.fr'), null);
  assert.equal(nomDuMail('agence.rennes@x.fr'), null);
  assert.equal(nomDuMail('pmartin@x.fr'), null);
  assert.equal(cleNom('Stéphane  DAUPHIN'), 'stephane dauphin');
  assert.ok(memePersonne('Martin', 'Paul Martin'));
  assert.ok(memePersonne('Stéphane Dauphin', 'stephane dauphin'));
  assert.ok(!memePersonne('Paul Martin', 'Pierre Durand'));
  assert.ok(memePersonne('Philippe Menouri', 'Philippe Menoury'));
  assert.ok(!memePersonne('Paul Martin', 'Paul Morin'));
  assert.ok(!memePersonne('', 'Paul'));
  const c = consigneReperage({ texte: 'Oui, c\'est Paul Martin.', notes: 'paul.martin@x.fr', agence: 'Agence X' });
  assert.match(c, /Agence X/);
  assert.match(c, /paul\.martin@x\.fr/);
});
