import test from 'node:test';
import assert from 'node:assert/strict';
import { nomDuSite, nomDuDomaine } from '../src/lib/nom-du-site.js';

test('une plateforme connue garde son nom, « Voir sur … »', () => {
  assert.deepEqual(nomDuSite('https://www.ubereats.com/fr/store/kfc-lyon', { type: 'site_web' }), { nom: 'Uber Eats', libelle: 'Voir sur Uber Eats', plateforme: true });
  assert.equal(nomDuSite('https://www.instagram.com/kfcfrance', { type: 'instagram' }).libelle, 'Voir sur Instagram');
  assert.equal(nomDuSite('https://maps.google.com/?q=kfc', { type: 'google_avis' }).libelle, 'Voir les avis Google');
});

test('le site du locataire reste « Site web », « Voir le site »', () => {
  assert.deepEqual(nomDuSite('https://www.kfc.fr', { type: 'site_web' }), { nom: 'Site web', libelle: 'Voir le site', plateforme: false });
  assert.equal(nomDuSite('pas une adresse').nom, 'Site web');
});

test('une autre page prend son nom saisi, sinon celui du domaine', () => {
  assert.deepEqual(nomDuSite('https://app.lebonbail.fr/annonce/12', { type: 'autre' }), { nom: 'Lebonbail', libelle: 'Voir sur Lebonbail', plateforme: false });
  assert.equal(nomDuSite('https://exemple.fr', { type: 'autre', label: 'Guide Michelin' }).libelle, 'Voir sur Guide Michelin');
  assert.equal(nomDuSite('https://exemple.fr', { type: 'autre', label: 'Autre' }).nom, 'Exemple');
});

test('le domaine sans son extension, même en deux morceaux', () => {
  assert.equal(nomDuDomaine('mon-commerce.co.uk'), 'Mon-commerce');
  assert.equal(nomDuDomaine('localhost'), 'Localhost');
  assert.equal(nomDuDomaine(''), '');
});
