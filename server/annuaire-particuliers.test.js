// L'annuaire des particuliers : le choix du candidat ne prend jamais un
// homonyme d'ailleurs, et l'adresse du siège départage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { choisirCandidat, lireAdresse, lireResultats } from './annuaire-particuliers.js';

const CANDIDATS = [
  { nom: 'Lascroux', telephone: '0979401566', rue: '', code_postal: '71430', ville: 'SAINT BONNET DE VIEILLE VIGNE' },
  { nom: 'Lascroux', telephone: '0471471222', rue: '20 RUE PIERRE MOUSSARIE', code_postal: '15130', ville: 'ST SIMON' },
  { nom: 'LASCROUX', telephone: '0345479313', rue: '25 RUE DES CHANAUX', code_postal: '71850', ville: 'CHARNAY LES MACON' },
];

test('le bon Lascroux : celui du code postal du siège, pas le cousin de Charnay', () => {
  const c = choisirCandidat(CANDIDATS, { nom: 'Georges Lascroux', ...lireAdresse('FOUGERE 71430 ST BONNET-DE-VIEILLE-VIGNE') });
  assert.equal(c.telephone, '0979401566');
});

test('aucun candidat sur place : pas de numéro, jamais un homonyme', () => {
  assert.equal(choisirCandidat(CANDIDATS, { nom: 'Georges Lascroux', code_postal: '75001', ville: 'PARIS' }), null);
  assert.equal(choisirCandidat([{ nom: 'Barthod-Michel', telephone: '03', rue: '', code_postal: '71000', ville: 'MACON' }], { nom: 'Daniel Michel', code_postal: '71000', ville: 'MACON' }), null, 'Barthod-Michel n\'est pas Daniel Michel');
});

test('deux candidats dans la même ville : la rue du siège tranche, sinon rien', () => {
  const deux = [
    { nom: 'Michel', telephone: '0101', rue: '113 RUE RAMBUTEAU', code_postal: '71000', ville: 'MACON' },
    { nom: 'Michel', telephone: '0202', rue: '4 QUAI LAMARTINE', code_postal: '71000', ville: 'MACON' },
  ];
  assert.equal(choisirCandidat(deux, { nom: 'Daniel Michel', ...lireAdresse('113 RUE RAMBUTEAU 71000 MACON') }).telephone, '0101');
  assert.equal(choisirCandidat(deux, { nom: 'Daniel Michel', code_postal: '71000', ville: 'MACON' }), null);
});

test('lireAdresse et lireResultats tiennent la route', () => {
  assert.deepEqual(lireAdresse('11 PLACE GARDON 71000 MACON'), { rue: '11 PLACE GARDON', code_postal: '71000', ville: 'MACON' });
  assert.deepEqual(lireAdresse('FOUGERE'), { rue: 'FOUGERE', code_postal: null, ville: null });
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"ItemList","itemListElement":[{"item":{"@type":"LocalBusiness","name":"Lascroux","telephone":"+33979401566","address":{"streetAddress":"","postalCode":"71430","addressLocality":"SAINT BONNET"}}},{"item":{"name":"Sans numéro"}}]}]}</script>';
  assert.deepEqual(lireResultats(html), [{ nom: 'Lascroux', telephone: '0979401566', rue: '', code_postal: '71430', ville: 'SAINT BONNET' }]);
  assert.deepEqual(lireResultats('<html>rien</html>'), []);
});
