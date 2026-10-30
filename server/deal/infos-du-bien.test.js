import test from 'node:test';
import assert from 'node:assert/strict';
import { adresseConnue, valeurDuChamp, OBLIGATOIRES } from './infos-du-bien.js';

test('adresseConnue : la fiche du bien d\'abord, puis l\'aperçu, puis le dossier du mandataire', () => {
  const fiche = { lots: [{ lot: { adresse: { absent: false, valeur: { rue: '12 rue Carnot', code_postal: '71000', ville: 'Mâcon' } } } }] };
  assert.equal(adresseConnue(fiche).texte, '12 rue Carnot, 71000 Mâcon');
  assert.equal(adresseConnue({ lots: [], apercu: { rue: '3 rue Neuve', ville: 'Lyon' } }).texte, '3 rue Neuve, Lyon');
  assert.equal(adresseConnue({ deal_id: 'd1', lots: [] }, [{ deal_id: 'd1', adresse: '1 quai X, Lyon' }]).texte, '1 quai X, Lyon');
});

test('adresseConnue : rien de connu, il faut la demander', () => {
  assert.equal(adresseConnue({ lots: [{ lot: { adresse: { absent: true, valeur: { rue: null, code_postal: null, ville: null } } } }] }), null);
});

test('valeurDuChamp : un champ absent ou à zéro manque', () => {
  const lot = { surface_m2: { absent: false, valeur: 85 }, loyer_annuel_ht_hc: { absent: false, valeur: 0 }, prix_fai: { absent: true, valeur: null } };
  assert.equal(valeurDuChamp(lot, 'surface_m2'), 85);
  assert.equal(valeurDuChamp(lot, 'loyer_annuel_ht_hc'), null);
  assert.equal(valeurDuChamp(lot, 'prix_fai'), null);
  assert.equal(OBLIGATOIRES.length, 4);
});
