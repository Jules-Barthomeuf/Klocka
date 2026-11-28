import test from 'node:test';
import assert from 'node:assert/strict';
import { mentionHorsTaxe, prixHorsTaxe, prixFai, prixEtTva, prixDeLaFiche } from './prix.js';
import { notesDuLot } from './notes-bien.js';

const champ = (valeur, citation) => ({ valeur, citation, confiance: 'haute', absent: false });

test('prix HT : la mention se lit dans la citation du prix, pas dans un loyer', () => {
  assert.equal(mentionHorsTaxe('Prix : 450 000 € FAI HT'), true);
  assert.equal(mentionHorsTaxe('450 000 € H.T. FAI'), true);
  assert.equal(mentionHorsTaxe('1 200 000 € hors taxes'), true);
  assert.equal(mentionHorsTaxe('300 000 € FAI, TVA en sus'), true);
  assert.equal(mentionHorsTaxe('Prix 500 000 € HAI'), false);
  assert.equal(mentionHorsTaxe('600 000 € TTC'), false);
  assert.equal(mentionHorsTaxe('Loyer 30 000 € HT HC, prix 500 000 €'), false);
});

test('prix HT : la TVA de 20 % s\'ajoute, tout se calcule sur le TTC', () => {
  const lot = { prix_fai: champ(450000, 'Prix : 450 000 € FAI HT') };
  assert.equal(prixHorsTaxe(lot), true);
  assert.equal(prixFai(lot), 540000);
  assert.deepEqual(prixEtTva(lot), { ht: 450000, tva: 90000, ttc: 540000 });
  assert.equal(prixDeLaFiche(lot, 540000), 450000);
});

test('prix HT : le champ prix_ht l\'emporte sur la citation, et se retire à la main', () => {
  assert.equal(prixFai({ prix_fai: champ(450000, 'Prix : 450 000 €'), prix_ht: champ(true, 'TVA en sus') }), 540000);
  assert.equal(prixFai({ prix_fai: champ(450000, 'Prix : 450 000 € FAI HT'), prix_ht: { valeur: false, absent: false, saisi_a_la_main: true } }), 450000);
  assert.equal(prixEtTva({ prix_fai: champ(450000, 'Prix : 450 000 € FAI') }), null);
});

test('prix HT : net vendeur et honoraires, puis la TVA', () => {
  const lot = { prix_fai: champ(400000, '400 000 € HT net vendeur'), honoraires_inclus: champ(false, 'honoraires en sus'), montant_honoraires: champ(20000, '20 000 €') };
  assert.equal(prixFai(lot), 504000);
  assert.equal(prixDeLaFiche(lot, 504000), 400000);
});

test('prix HT : la fiche du bien le signale', () => {
  const n = notesDuLot({ lot: { prix_fai: champ(450000, 'Prix : 450 000 € FAI HT') } });
  assert.equal(n.prix.a_verifier, true);
  assert.match(n.prix.textes[0], /hors taxe/);
  assert.match(n.prix.textes[0], /540\s000/);
});
