// Les règles d'écart : ce qu'un « non » de l'équipe généralise, et sur qui.
// Pur : on teste la reconnaissance, pas la base.

import test from 'node:test';
import assert from 'node:assert/strict';
import { regleTouche, criteresDe } from './ecarts.js';

const photomaton = { enseigne: 'Photomaton', activite: 'Électronique', proprietaire: { nom: 'SCI DU 6 RUE MEYNADIER', siren: '111' } };
const regle = (sur) => ({ sur, criteres: criteresDe(photomaton), motif: 'pas une vitrine' });

test('une règle sur l’activité touche la même activité, pas une autre', () => {
  const r = regle({ activite: true });
  assert.match(regleTouche(r, { enseigne: 'Boulanger', activite: 'électronique' }) || '', /même activité/);
  assert.equal(regleTouche(r, { enseigne: 'Boulanger', activite: 'Boulangerie' }), null);
});

test('une règle sur le propriétaire suit le SIREN, ou le nom à défaut', () => {
  const r = regle({ proprietaire: true });
  assert.match(regleTouche(r, { proprietaire: { siren: '111', nom: 'AUTRE ÉCRITURE' } }) || '', /même propriétaire/);
  assert.equal(regleTouche(r, { proprietaire: { siren: '222', nom: 'SCI DU 6 RUE MEYNADIER' } }), null, 'un autre SIREN est un autre propriétaire');
  const sansSiren = { sur: { proprietaire: true }, criteres: criteresDe({ proprietaire: { nom: 'SCI Samige' } }), motif: null };
  assert.match(regleTouche(sansSiren, { proprietaire: { nom: 'SCI SAMIGE' } }) || '', /même propriétaire/);
});

test('une règle sur l’enseigne ignore la casse et les accents', () => {
  const r = regle({ enseigne: true });
  assert.match(regleTouche(r, { enseigne: 'PHOTOMATON' }) || '', /même enseigne/);
  assert.equal(regleTouche(r, { enseigne: 'Photo Service' }), null);
});

test('une règle qui ne généralise rien ne touche personne', () => {
  assert.equal(regleTouche(regle({}), photomaton), null);
});
