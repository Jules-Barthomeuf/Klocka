// Le garde-fou de l'extraction : une citation retrouvable garde la valeur,
// une citation réécrite la fait tomber, et un nombre arrivé en texte est
// remis en nombre plutôt que de traverser le pipeline en chaîne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { citationPresente, verifierLot, enNombre, verifierCommerces, consigneCible } from './extract.js';

const TEXTE = 'Prix d’acquisition total 488 050 €\nPRIX DE VENTE\n430 000 € NV — honoraires en sus';

test('citationPresente plie apostrophes courbes, tirets longs et espaces insécables', () => {
  assert.ok(citationPresente("Prix d'acquisition total 488 050 €", TEXTE));
  assert.ok(citationPresente('430 000 € NV - honoraires en sus', TEXTE));
  assert.ok(!citationPresente('Prix de vente : 430 000 € NV', TEXTE), 'une citation réécrite tombe');
});

test('verifierLot : un nombre en texte est remis en nombre, un illisible tombe', () => {
  const brut = {
    prix_fai: { valeur: '430 000 €', citation: '430 000 € NV', confiance: 'haute', absent: false },
    surface_m2: { valeur: 'cent', citation: '430 000 € NV', confiance: 'haute', absent: false },
  };
  const { lot, incidents } = verifierLot(brut, TEXTE);
  assert.equal(lot.prix_fai.valeur, 430000);
  assert.equal(lot.prix_fai.absent, false);
  assert.equal(lot.surface_m2.absent, true);
  assert.deepEqual(incidents.map((i) => `${i.champ}:${i.motif}`), ['surface_m2:valeur_illisible']);
});

test('enNombre : virgule décimale, pourcent, euro', () => {
  assert.equal(enNombre('8,72 %'), 8.72);
  assert.equal(enNombre(430000), 430000);
  assert.equal(enNombre(''), null);
});

// 24 nov. 2026 (Jules) : un portefeuille, trois locataires et une cellule vacante, reste un lot mais garde ses cellules.
const ETAT_LOCATIF = 'Etat Locatif\nJules 155 01/07/2016 40 135€\nNocibé France 251 01/10/2021 46 216€\nOrange Store 250 18/06/2025 30 000€\nVacant 91 - - -\nTotal 747 116 351€';

test('les cellules d\'un portefeuille : un locataire lu dans le document, une vacante dite vacante, rien en dessous de deux', () => {
  const c = verifierCommerces([
    { locataire: 'Jules', surface_m2: 155, loyer_annuel: '40 135 €' },
    { locataire: 'Nocibé France', surface_m2: 251, loyer_annuel: 46216 },
    { locataire: 'Orange Store', surface_m2: 250, loyer_annuel: 30000 },
    { locataire: '', surface_m2: 91, vacant: true },
    { locataire: 'Sephora', surface_m2: 80, loyer_annuel: 20000 },
  ], ETAT_LOCATIF);
  assert.deepEqual(c.map((x) => x.locataire), ['Jules', 'Nocibé France', 'Orange Store', null], 'Sephora n\'est pas dans le document');
  assert.equal(c[0].loyer_annuel, 40135);
  assert.equal(c[3].vacant, true);
  assert.equal(c[3].loyer_annuel, null);
  assert.deepEqual(verifierCommerces([{ locataire: 'Jules', surface_m2: 155 }], ETAT_LOCATIF), [], 'un seul locataire : pas un portefeuille');
  assert.deepEqual(verifierCommerces(null, ETAT_LOCATIF), []);
  const { lot } = verifierLot({ commerces: [{ locataire: 'Jules' }, { locataire: 'Orange Store' }] }, ETAT_LOCATIF);
  assert.equal(lot.commerces.length, 2);
  assert.equal(verifierLot({}, ETAT_LOCATIF).lot.commerces, undefined);
  assert.match(consigneCible({ locataire: 'Nocibé France', surface_m2: 251 }), /louée à « Nocibé France » \(251 m²\)/);
});
