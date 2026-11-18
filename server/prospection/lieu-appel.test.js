// La rue dite pendant l'appel : l'adresse lue dans la conversation, la ville vérifiée, la caméra tournée vers le local.

import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseDite } from '../../src/lib/adresse-dite.js';
import { cap, pointLePlusProche, urlStreetView, villeDite } from './lieu-appel.js';

test('l\'adresse dite : numéro en chiffres ou en lettres, dit avant ou après, la ville qui suit ; la dernière l\'emporte', () => {
  assert.equal(adresseDite("Oui alors le local est au 12 rue de la République à Lyon, c'est un KFC.").cle, '12 rue de la république lyon');
  assert.equal(adresseDite("C'est au douze avenue Jean Médecin à Nice.").texte, '12 avenue Jean Médecin');
  assert.equal(adresseDite('On a un commerce rue Paradis, au numéro 40, il est loué.').texte, '40 rue Paradis');
  const cp = adresseDite('Il est situé 3 bis place du Marché 69002 Lyon.');
  assert.equal(cp.numero, '3 bis');
  assert.equal(cp.code_postal, '69002');
  assert.equal(adresseDite(['Au 8 rue Neuve.', 'Non pardon, au 14 rue Neuve.']).numero, '14');
  assert.equal(adresseDite('Dans la rue principale il y a du passage.'), null);
  assert.equal(adresseDite('oui la rue est commerçante'), null);
  // Tapé en minuscules, « rues » mal transcrit : la ville reste dans la suite, le serveur la vérifie.
  const bas = adresseDite('20 rue de la république à lyon');
  assert.equal(bas.texte, '20 rue de la République');
  assert.match(bas.suite, /lyon/);
  assert.equal(adresseDite('20 rues de la République à Antibes').ville, 'Antibes');
});

test('la ville de la réponse doit avoir été dite ; la caméra sur la chaussée, tournée vers le local', () => {
  assert.ok(villeDite({ ville: 'Lyon', code_postal: '69002' }, 'à lyon'));
  assert.ok(villeDite({ ville: 'Antibes', code_postal: '06600' }, 'Antibes'));
  assert.ok(!villeDite({ ville: 'Villeurbanne', code_postal: '69100' }, 'à lyon'));
  assert.ok(villeDite({ ville: 'Lyon', code_postal: '69002' }, '69002'));
  // Une rue est-ouest au sud du local : la caméra s'y pose et regarde au nord.
  const rue = { type: 'LineString', coordinates: [[7.12, 43.58, 0], [7.13, 43.58, 0]] };
  const p = pointLePlusProche({ lat: 43.5801, lon: 7.125 }, rue);
  assert.ok(Math.abs(p.lat - 43.58) < 1e-9 && Math.abs(p.lon - 7.125) < 1e-9);
  assert.equal(p.distance_m, 11);
  assert.equal(cap(p, { lat: 43.5801, lon: 7.125 }), 0);
  assert.equal(cap({ lat: 43.58, lon: 7.125 }, { lat: 43.58, lon: 7.126 }), 90);
  assert.equal(urlStreetView({ lat: 43.58, lon: 7.125 }, 0), 'https://maps.google.com/maps?layer=c&cbll=43.580000,7.125000&cbp=11,0,0,0,0&output=svembed');
});

test('une autre adresse dite plus tard déplace la rue, même si la première est dans les notes ; une adresse redite revient', async () => {
  const { adressesDites, adresseRetenue } = await import('../../src/lib/adresse-dite.js');
  const notes = 'Local au 20 rue de la République à Antibes';
  let r = adresseRetenue(adressesDites(['Bonjour madame', notes]));
  assert.equal(r.cle, '20 rue de la république antibes');
  // L'agent parle d'un autre local : la transcription passe avant les notes dans les textes, il doit pourtant l'emporter.
  r = adresseRetenue(adressesDites(['Bonjour madame', "J'ai aussi le 12 boulevard Victor Hugo à Nice", notes]), r.comptes, r.cle);
  assert.equal(r.cle, '12 boulevard Victor Hugo nice'.toLowerCase());
  // Rien de neuf : la rue ne bouge pas.
  r = adresseRetenue(adressesDites(['Bonjour madame', "J'ai aussi le 12 boulevard Victor Hugo à Nice", notes]), r.comptes, r.cle);
  assert.equal(r.cle, '12 boulevard victor hugo nice');
  // « Non, finalement le 20 rue de la République à Antibes » : redite, elle revient.
  r = adresseRetenue(adressesDites(['Bonjour madame', "J'ai aussi le 12 boulevard Victor Hugo à Nice", 'Non finalement le 20 rue de la République à Antibes', notes]), r.comptes, r.cle);
  assert.equal(r.cle, '20 rue de la république antibes');
});
