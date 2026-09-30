// Le garde-fou de l'extraction : une citation retrouvable garde la valeur,
// une citation réécrite la fait tomber, et un nombre arrivé en texte est
// remis en nombre plutôt que de traverser le pipeline en chaîne.

import test from 'node:test';
import assert from 'node:assert/strict';
import { citationPresente, verifierLot, enNombre } from './extract.js';

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
