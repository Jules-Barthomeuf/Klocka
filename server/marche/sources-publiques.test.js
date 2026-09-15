// DVF et BODACC : ce qui doit être vrai pour que leurs chiffres se défendent.
//
// Ces deux sources sont gratuites et publiques, donc faciles à mal lire. Les
// pièges éprouvés ici sont ceux rencontrés sur des données réelles, pas des
// cas d'école : une mutation qui mélange un appartement et une boutique, une
// cession à l'euro symbolique, un département sans DVF.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-test-'));
const { ventesCommerciales, lireCsv, departementDe, distanceM } = await import('../dvf.js');
const { cleRue, adresseDe, evenementDe, motDeRue } = await import('../bodacc.js');

const ligne = (o) => ({
  id_mutation: '', date_mutation: '2024-05-02', nature_mutation: 'Vente', valeur_fonciere: '',
  adresse_numero: '12', adresse_suffixe: '', adresse_nom_voie: 'RUE GAZAN',
  type_local: 'Local industriel. commercial ou assimilé', surface_reelle_bati: '',
  latitude: '43.658', longitude: '6.924', ...o,
});

test('DVF : une mutation mixte n’a pas de prix au m² attribuable', () => {
  // Le prix porte sur l'acte entier. Un acte qui vend une boutique ET un
  // appartement ne dit pas ce que vaut la boutique — et diviser le tout par la
  // seule surface commerciale donnerait un chiffre faux, pas approximatif.
  const { ventes, ecartees } = ventesCommerciales([
    ligne({ id_mutation: 'A', valeur_fonciere: '500000', surface_reelle_bati: '80' }),
    ligne({ id_mutation: 'A', valeur_fonciere: '500000', surface_reelle_bati: '60', type_local: 'Appartement' }),
  ]);
  assert.equal(ventes.length, 0);
  assert.equal(ecartees.mixtes, 1);
});

test('DVF : un acte 100 % commercial en plusieurs lots additionne ses surfaces', () => {
  const { ventes } = ventesCommerciales([
    ligne({ id_mutation: 'B', valeur_fonciere: '600000', surface_reelle_bati: '90' }),
    ligne({ id_mutation: 'B', valeur_fonciere: '600000', surface_reelle_bati: '60' }),
  ]);
  assert.equal(ventes.length, 1);
  assert.equal(ventes[0].surface, 150);
  assert.equal(ventes[0].prix_m2, 4000, '600 000 / 150');
});

test('DVF : l’euro symbolique n’est pas un prix de marché', () => {
  // Vu en vrai sur Courbevoie : une mutation à 1 € pour 192 m². Gardée, elle
  // écrasait la médiane du secteur.
  const { ventes, ecartees } = ventesCommerciales([
    ligne({ id_mutation: 'C', valeur_fonciere: '1', surface_reelle_bati: '192' }),
  ]);
  assert.equal(ventes.length, 0);
  assert.equal(ecartees.symboliques, 1);
});

test('DVF : seules les ventes comptent, pas les échanges ni les VEFA', () => {
  const { ventes } = ventesCommerciales([
    ligne({ id_mutation: 'D', valeur_fonciere: '300000', surface_reelle_bati: '50', nature_mutation: 'Echange' }),
    ligne({ id_mutation: 'E', valeur_fonciere: '300000', surface_reelle_bati: '50', nature_mutation: "Vente en l'état futur d'achèvement" }),
  ]);
  assert.equal(ventes.length, 0);
});

test('DVF : le département se déduit du code INSEE, outre-mer compris', () => {
  assert.equal(departementDe('92026'), '92');
  assert.equal(departementDe('97411'), '974', 'trois chiffres outre-mer');
  // DVF range la Corse sous « 2A » et « 2B » (communes/2A/2A004.csv) : le
  // code à lettre est un vrai département, pas un code à rejeter.
  assert.equal(departementDe('2A004'), '2A', 'la Corse garde sa lettre');
  assert.equal(departementDe('2B033'), '2B');
  assert.equal(departementDe(''), null);
});

test('DVF : le CSV se lit avec ses en-têtes', () => {
  const r = lireCsv('a,b,c\n1,2,3\n4,5,6\n');
  assert.deepEqual(r, [{ a: '1', b: '2', c: '3' }, { a: '4', b: '5', c: '6' }]);
  assert.deepEqual(lireCsv(''), []);
});

test('DVF : la distance est celle du terrain, pas celle de la carte', () => {
  // 93 avenue Marceau → 89 avenue Marceau, mesuré sur les coordonnées DVF.
  const d = distanceM(48.902438, 2.242742, 48.902, 2.2429);
  assert.ok(d > 40 && d < 80, `59 m attendus, ${Math.round(d)} obtenus`);
});

test('BODACC : deux écritures d’une même rue se reconnaissent', () => {
  // La BAN écrit « Avenue Marceau », le BODACC « Avenue » + « Marceau », et un
  // greffe écrira « AV. MARCEAU ». C'est la même rue.
  assert.equal(cleRue('Avenue Marceau'), cleRue('AV MARCEAU'));
  assert.equal(cleRue('Rue de la République'), cleRue('RUE DE LA REPUBLIQUE'));
  assert.notEqual(cleRue('Avenue Marceau'), cleRue('Rue Marceau Dupont'));
  assert.equal(motDeRue('Avenue Marceau'), 'marceau');
});

test('BODACC : l’adresse du FONDS prime sur celle du siège', () => {
  // Un siège à La Défense et une boutique avenue Marceau : c'est la boutique
  // qui appartient à la rue.
  const a = adresseDe({
    listeetablissements: JSON.stringify({ etablissement: { adresse: { numeroVoie: '52', typeVoie: 'Avenue', nomVoie: 'Marceau', codePostal: '92400', ville: 'Courbevoie' } } }),
    listepersonnes: JSON.stringify({ personne: { adresseSiegeSocial: { numeroVoie: '1', typeVoie: 'Place', nomVoie: 'de la Défense', codePostal: '92800', ville: 'Puteaux' } } }),
  });
  assert.equal(a.voie, 'Avenue Marceau');
  assert.equal(a.numero, '52');
  // Sans établissement, le siège fait foi.
  const b = adresseDe({ listepersonnes: JSON.stringify({ personne: { adresseSiegeSocial: { typeVoie: 'Rue', nomVoie: 'Gazan', ville: 'Grasse' } } }) });
  assert.equal(b.voie, 'Rue Gazan');
  assert.equal(adresseDe({}), null);
});

test('BODACC : une liquidation ferme, un redressement non', () => {
  const liquidation = evenementDe({ familleavis: 'collective', dateparution: '2025-04-02', jugement: JSON.stringify({ nature: 'Jugement de liquidation judiciaire' }) });
  assert.equal(liquidation.ferme, true);
  const redressement = evenementDe({ familleavis: 'collective', dateparution: '2025-04-02', jugement: JSON.stringify({ nature: 'Jugement d\'ouverture d\'une procédure de redressement judiciaire' }) });
  assert.equal(redressement.ferme, false, 'un redressement tente de continuer : la rue n’a pas perdu son commerce');
  assert.equal(evenementDe({ familleavis: 'radiation', dateparution: '2025-01-01' }).ferme, true);
});

test('BODACC : le prix d’une cession se lit dans l’origine du fonds', () => {
  // Data-B vend cette information ; le BODACC la publie en clair.
  const e = evenementDe({
    familleavis: 'vente', dateparution: '2026-08-21',
    listeetablissements: JSON.stringify({ etablissement: { origineFonds: 'siège et établissement principal acquis par achat au prix stipulé de 140000.00 euros', activite: 'restauration' } }),
  });
  assert.equal(e.prix, 140000);
  assert.equal(e.activite, 'restauration');
  assert.equal(evenementDe({ familleavis: 'creation', dateparution: '2026-01-01' }).prix, null);
});
