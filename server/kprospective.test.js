// K-Prospective : les critères, appliqués à ce qu'on sait d'un commerce.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kprospective-'));
const { correspond, typologieRue, CRITERES, ETAPES, lancerProspection } = await import('./kprospective.js');

const annee = new Date().getFullYear();
const commerce = {
  id: 'node/1', nom: 'Chez Lulu', telephone: '+33 4 93 00 00 00', email: null, rue_typologie: 'commercante',
  foncier: { proprietaire_exploitant: true, proprietaire_foncier: true, copropriete: false },
  societe: { entrepreneur_individuel: false, nombre_etablissements_ouverts: 1, effectif: '02', creation: `${annee - 5}-03-01`, ca: 420000, etat: 'A', annee_naissance_gerant: String(annee - 63), etablissements_gerant: 3 },
};

test('dans un groupe une option suffit, entre les groupes il faut tout', () => {
  assert.equal(correspond(commerce, {}), true, 'sans critère, tout passe');
  assert.equal(correspond(commerce, { type_entreprise: ['independant'] }), true);
  assert.equal(correspond(commerce, { type_entreprise: ['enseigne', 'entrepreneur_individuel'] }), false);
  assert.equal(correspond(commerce, { effectif: ['01', '02'] }), true);
  assert.equal(correspond(commerce, { creation: ['3-6'] }), true);
  assert.equal(correspond(commerce, { creation: ['<1'] }), false);
  assert.equal(correspond(commerce, { ca: ['300-500'] }), true);
  assert.equal(correspond(commerce, { ca: ['5000+'] }), false);
  assert.equal(correspond(commerce, { age_gerant: ['60+'] }), true);
  assert.equal(correspond(commerce, { age_gerant: ['<45'] }), false);
  assert.equal(correspond(commerce, { etab_gerant: ['2-4'] }), true);
  assert.equal(correspond(commerce, { immobilier: ['proprietaire_exploitant'] }), true);
  assert.equal(correspond(commerce, { immobilier: ['copropriete'] }), false);
  assert.equal(correspond(commerce, { contacts: ['telephone'] }), true);
  assert.equal(correspond(commerce, { contacts: ['email'] }), false);
  assert.equal(correspond(commerce, { rue: ['commercante', 'n1'] }), true);
  assert.equal(correspond(commerce, { solvabilite: ['cessation'] }), false);
  assert.equal(correspond(commerce, { type_entreprise: ['independant'], contacts: ['email'] }), false, 'un groupe qui rate fait rater le tout');
  // Sans société identifiée, les critères d'entreprise excluent : on ne devine rien.
  assert.equal(correspond({ ...commerce, societe: null }, { effectif: ['02'] }), false);
});

test('la typologie de rue suit les seuils, et les critères indisponibles sont écartés au lancement', () => {
  assert.equal(typologieRue(45), 'n1');
  assert.equal(typologieRue(20), 'tres_commercante');
  assert.equal(typologieRue(10), 'commercante');
  assert.equal(typologieRue(4), 'semi');
  assert.equal(typologieRue(1), 'residentielle');
  assert.equal(ETAPES.length, 7);
  const solv = CRITERES.find((g) => g.cle === 'solvabilite');
  assert.ok(solv.options.find((op) => op.valeur === 'risque_avere').indisponible, 'la solvabilité chiffrée n\'a pas de source ouverte');
  assert.ok(!solv.options.find((op) => op.valeur === 'cessation').indisponible);
  assert.match(lancerProspection({ adresse: 'Nice' }).error, /adresse précise/);
});
