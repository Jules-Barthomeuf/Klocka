// Le site de l'agence lu pour la carte d'appel : les liens rangés, le texte des pages.

import test from 'node:test';
import assert from 'node:assert/strict';
import { consigneSite, liensDuSite, texteDeLaPage } from './site-agence.js';

test('les liens du site : la page équipe, la présentation, les offres ; jamais un autre site', () => {
  const html = '<a href="/equipe">Équipe</a><a href="/page-le-cabinet-azurea">Le cabinet</a><a href="/offres-immobilier/location/bureaux/nice-06000/">x</a>'
    + '<a href="https://facebook.com/equipe">fb</a><a href="/equipe/164">fiche</a><a href="mailto:a@b.fr">m</a>';
  const l = liensDuSite(html, 'https://www.agence.fr/');
  assert.deepEqual(l.equipe, ['https://www.agence.fr/equipe']);
  assert.deepEqual(l.qui, ['https://www.agence.fr/page-le-cabinet-azurea']);
  assert.deepEqual(l.offres, ['/offres-immobilier/location/bureaux/nice-06000/']);
});

test('le texte d\'une page garde les numéros des liens ; la consigne dit le standard', () => {
  const t = texteDeLaPage('<script>x()</script><p>Beryle KAÇA</p><a href="tel:06 84 76 29 54">Appeler</a>');
  assert.match(t, /Beryle KAÇA/);
  assert.match(t, /06 84 76 29 54/);
  assert.doesNotMatch(t, /x\(\)/);
  assert.match(consigneSite('Azurea', [{ url: 'u', texte: 't' }], [], '04 93 35 08 68'), /standard de l'agence est le 04 93 35 08 68/);
});

test('un portrait trouvé sur internet : l\'image à son nom, ou l\'image de partage de SA page ; jamais celle d\'un article qui le cite', async () => {
  const { portraitDeLaPage, adressesParPersonne } = await import('./photos-equipe.js');
  const article = '<title>Maxime Douce et Luckymmo : un T5 à Nice</title><meta property="og:image" content="https://x.fr/bien.jpg"><p>Maxime Douce</p>';
  assert.equal(portraitDeLaPage(article, 'Maxime Douce', 'https://x.fr/realisations/t5-nice'), null);
  assert.equal(portraitDeLaPage(article, 'Maxime Douce', 'https://x.fr/equipe/maxime-douce'), 'https://x.fr/bien.jpg');
  const fiche = '<img src="/p/maxime-douce.jpg" alt="Maxime Douce"><p>Maxime Douce, fondateur</p>';
  assert.equal(portraitDeLaPage(fiche, 'Maxime Douce', 'https://y.fr/a'), 'https://y.fr/p/maxime-douce.jpg');
  assert.equal(portraitDeLaPage('<p>Autre personne</p><img src="/z.jpg">', 'Maxime Douce', 'https://y.fr/'), null);
  assert.deepEqual(adressesParPersonne('1. https://a.fr/x https://b.fr/y\n2. aucune', 2), [['https://a.fr/x', 'https://b.fr/y'], []]);
});
