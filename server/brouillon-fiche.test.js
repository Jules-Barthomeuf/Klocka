import test from 'node:test';
import assert from 'node:assert/strict';
import { ajouterAuBrouillon, champsEnAttente, dossierAvecBrouillon } from '../src/lib/brouillon-fiche.js';

test('le brouillon s’accumule par lot, sans rien envoyer', () => {
  let b = {};
  b = ajouterAuBrouillon(b, 0, { prix_fai: 400000 });
  b = ajouterAuBrouillon(b, 0, { surface_m2: '82,5' });
  b = ajouterAuBrouillon(b, 1, { occupe: false });
  b = ajouterAuBrouillon(b, 0, { prix_fai: 380000 });
  assert.deepEqual(b, { 0: { prix_fai: 380000, surface_m2: '82,5' }, 1: { occupe: false } });
  assert.equal(champsEnAttente(b), 3);
});

test('la fiche montre le brouillon tout de suite, l’original reste intact', () => {
  const dossier = { lots: [{ index: 0, lot: { prix_fai: { valeur: 500000 }, surface_m2: { valeur: 90 }, adresse: { valeur: { rue: 'x' } } } }] };
  const vu = dossierAvecBrouillon(dossier, { 0: { prix_fai: 380000, surface_m2: '82,5', adresse: '30 rue de Cheverus, 33000 Bordeaux', locataire_nom: '' } });
  assert.equal(vu.lots[0].lot.prix_fai.valeur, 380000);
  assert.equal(vu.lots[0].lot.surface_m2.valeur, 82.5);
  assert.equal(vu.lots[0].lot.adresse.valeur.rue, '30 rue de Cheverus, 33000 Bordeaux');
  assert.equal(vu.lots[0].lot.locataire_nom.absent, true);
  assert.equal(vu.lots[0].lot.prix_fai.saisi_a_la_main, true);
  assert.equal(dossier.lots[0].lot.prix_fai.valeur, 500000);
  assert.equal(dossierAvecBrouillon(dossier, {}), dossier);
  const vide = { lots: [{ index: 0, lot: { rendement_annonce: { absent: true, valeur: null } } }] };
  assert.equal(dossierAvecBrouillon(vide, { 0: { rendement_annonce: '7' } }).lots[0].lot.rendement_annonce.absent, false, 'un champ vide rempli au brouillon s’affiche');
});
