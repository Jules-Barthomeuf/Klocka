import test from 'node:test';
import assert from 'node:assert/strict';
import { ligneChiffre, morceaux } from '../src/lib/chiffres-message.js';

test('deux puces « libellé : valeur — explication » font une carte', () => {
  const r = morceaux("Deux chiffres me gênent :\n- **Loyer annuel** : 1 035 € — Incohérent avec 683 à 1 025 €/m²/an dans la rue.\n- Échéance du bail : 31 mars 2016. Expiré depuis près de dix ans.\nSi tu me donnes la surface, je corrige.");
  assert.equal(r.length, 3);
  assert.deepEqual(r[1].chiffres.map((c) => [c.libelle, c.valeur]), [['Loyer annuel', '1 035 €'], ['Échéance du bail', '31 mars 2016']]);
  assert.equal(r[1].chiffres[1].detail, 'Expiré depuis près de dix ans.');
  assert.equal(r[2].texte, 'Si tu me donnes la surface, je corrige.');
});

test('un tableau perd son en-tête et devient une carte', () => {
  const r = morceaux('| Chiffre | Valeur | Pourquoi |\n|---|---|---|\n| Loyer | 1 035 € | trop bas |');
  assert.deepEqual(r, [{ chiffres: [{ libelle: 'Loyer', valeur: '1 035 €', detail: 'trop bas', tableau: true }] }]);
});

test('une seule puce, ou une puce sans chiffre, reste du texte', () => {
  assert.deepEqual(morceaux('- Loyer : 1 035 €'), [{ texte: '- Loyer : 1 035 €' }]);
  assert.equal(ligneChiffre('- Locataire : une boulangerie'), null);
});
