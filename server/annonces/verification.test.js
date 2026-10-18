import test from 'node:test';
import assert from 'node:assert/strict';
import { reglesRobots, verdictRobots, verdictTexte, liensLegaux, logicielDe, categorie, origineDe, collectable } from './verification.js';

test('robots.txt : notre groupe, sinon celui de tous ; annonces ou recherche fermées = interdit', () => {
  const t = 'User-agent: *\nDisallow: /admin/\nDisallow: /recherche/\n\nUser-agent: GPTBot\nDisallow: /';
  assert.deepEqual(reglesRobots(t).disallow, ['/admin/', '/recherche/']);
  assert.equal(verdictRobots(t).bloque, true);
  assert.equal(verdictRobots('User-agent: *\nDisallow: /admin/').bloque, false);
  assert.equal(verdictRobots('User-agent: *\nDisallow: /').bloque, true);
  assert.equal(verdictRobots('User-agent: *\nDisallow:').bloque, false);
  assert.equal(verdictRobots(null).absent, true);
});

test('les textes légaux : robots ou extraction interdits = interdit ; reproduction seule = douteux', () => {
  assert.equal(verdictTexte("Toute extraction de la base de données est interdite sans autorisation préalable.").verdict, 'interdit');
  assert.equal(verdictTexte("L'utilisation de robots ou d'aspirateurs de site est strictement interdite.").verdict, 'interdit');
  const d = verdictTexte("Toute reproduction, même partielle, du contenu de ce site est interdite. Bonne visite.");
  assert.equal(d.verdict, 'douteux');
  assert.equal(d.phrase, 'Toute reproduction, même partielle, du contenu de ce site est interdite.');
  assert.equal(verdictTexte("Le site est édité par l'agence X, SARL au capital de 8 000 €.").verdict, 'rien');
});

test('les liens légaux, le logiciel et la catégorie', () => {
  const html = '<a href="/mentions-legales">Mentions légales</a><a href="/contact">Contact</a><script src="https://cdn.apimo.pro/x.js"></script>';
  assert.deepEqual(liensLegaux(html, 'https://agence.fr/'), ['https://agence.fr/mentions-legales']);
  assert.equal(logicielDe(html).logiciel, 'apimo');
  assert.equal(categorie({ robots: { bloque: false }, textes: [{ verdict: 'douteux', phrase: 'p', page: 'u' }] }).categorie, 'douteux');
  assert.equal(categorie({ robots: { bloque: true, raison: 'r', lignes: ['/recherche'] }, textes: [] }).categorie, 'interdit');
  assert.equal(categorie({ robots: { bloque: false }, textes: [{ verdict: 'rien' }] }).categorie, 'autorise');
  assert.equal(origineDe('www.agence.fr/nos-biens'), 'https://www.agence.fr');
  assert.equal(collectable({ categorie: 'autorise', verifie_le: new Date().toISOString() }), true);
  assert.equal(collectable({ categorie: 'autorise', verifie_le: '2020-01-01' }), false);
});

test('le bruit des bandeaux de cookies ne fait pas une interdiction ; une page de rendez-vous fermée non plus', () => {
  assert.equal(verdictTexte("En l'absence d'une assignation à comparaître, les informations stockées ou extraites à cette seule fin ne peuvent généralement pas être utilisées pour vous identifier.").verdict, 'rien');
  assert.equal(verdictRobots('User-agent: *\nDisallow: /prendre_rdv_bien/').bloque, false);
  assert.equal(verdictRobots('User-agent: *\nDisallow: /annonces/f/').bloque, true);
});
