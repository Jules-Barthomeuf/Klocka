// De la visite à l'avis (29 oct. 2026) : ce que la visite dit, montré à confirmer, sans rien écrire dans l'avis avant le oui.

import test from 'node:test';
import assert from 'node:assert/strict';
import { reponsesDeLaVisite, messageDeLaVisite } from './mandataire-avis.js';

const fiche = {
  nom: 'M. Dupont', commerce: 'Boulangerie Martin', activite: 'Boulangerie', adresse: '12 rue Carnot', ville: 'Mâcon',
  biens: { visite: { faite_le: '2026-10-28T10:00:00Z' }, compte_rendu: { bien: { surface: 85, loyer_annuel: 24000, fin_bail: '2032', refacturees: true, charges: null }, etat: { local: 'bon état' } } },
};

test('reponsesDeLaVisite : la fiche et le compte rendu en réponses du questionnaire', () => {
  const r = reponsesDeLaVisite(fiche);
  assert.equal(r.adresse, '12 rue Carnot, Mâcon');
  assert.equal(r.demandeur, 'M. Dupont');
  assert.equal(r.occupe, true);
  assert.equal(r.surface_utile, 85);
  assert.equal(r.loyer_annuel_hc, 24000);
  assert.equal(r.echeance, '2032');
  assert.equal(r.charges, 'refacturées au locataire');
  assert.equal(r.etat, 'bon état');
  assert.match(r.date_visite, /octobre 2026/);
  assert.ok(!('taxe_fonciere' in r));
});

test('messageDeLaVisite : « De ce que je sais », puis la question', () => {
  const m = messageDeLaVisite({ bien: 'Boulangerie Martin · Mâcon', de_la_visite: { reponses: reponsesDeLaVisite(fiche) } });
  assert.match(m, /De ce que je sais/);
  assert.match(m, /Surface utile : 85 m²/);
  assert.match(m, /Loyer annuel HT HC : 24[\s\u202f\u00a0]000 €/);
  assert.match(m, /Vous me le confirmez \?/);
});

test('messageDeLaVisite : sans adresse dans la fiche, la première question est l\'adresse', () => {
  const m = messageDeLaVisite({ bien: 'Bien', de_la_visite: { reponses: { type_bien: 'murs_commerce' } } });
  assert.match(m, /quelle est l'adresse du bien \?/);
  assert.doesNotMatch(m, /Vous me le confirmez/);
});
