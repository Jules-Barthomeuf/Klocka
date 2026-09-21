// K-Data : les questions posées avant de lancer un outil.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kdq-'));
const {
  QUESTIONS, valeursParDefaut, nettoyerReglages, nettoyerLot, manquantes,
  formulaireEntame, conditionRemplie, outilsAvecQuestions,
} = await import('./kdata-questions.js');
const { CLES_OUTILS } = await import('./kdata.js');

test('chaque outil de K-Data a sa liste de questions, même vide', () => {
  for (const cle of CLES_OUTILS) {
    assert.ok(Array.isArray(QUESTIONS[cle]), `${cle} n'a pas de liste de questions`);
  }
  // Ceux à qui l'adresse suffit, et ceux qui demandent autre chose.
  assert.deepEqual(QUESTIONS.kfoncier, []);
  assert.deepEqual(QUESTIONS['valeur-locative'], []);
  assert.deepEqual(outilsAvecQuestions(['kfoncier', 'kvacance', 'valeur-locative']), ['kvacance']);

  // Les options ne sont pas recopiées : elles viennent des barèmes des outils.
  const statut = QUESTIONS.kestimation.find((q) => q.cle === 'statut');
  assert.deepEqual(statut.options.map((o) => o.valeur), ['loue', 'vacant']);
  const criteres = QUESTIONS.kprospective.find((q) => q.cle === 'criteres');
  assert.ok(criteres.groupes.length >= 10, 'les onze groupes de critères de K-Prospective');
});

test('les valeurs de départ sont celles que les pastilles montrent', () => {
  assert.equal(valeursParDefaut('kvacance').rayon, 400);
  assert.equal(valeursParDefaut('ktransactions').annees, 5);
  assert.equal(valeursParDefaut('kzoning').rayon_m, 300);
  assert.equal(valeursParDefaut('kestimation').statut, 'loue');
  assert.equal(valeursParDefaut('kestimation').emplacement, 'n1bis');
  assert.deepEqual(valeursParDefaut('kprospective').criteres, {});
  assert.deepEqual(valeursParDefaut('kfoncier'), {});
});

test('les réponses sont ramenées à ce que l\'outil accepte', () => {
  // Ce qui n'est pas une question de cet outil disparaît.
  assert.deepEqual(nettoyerReglages('kvacance', { rayon: 800, annees: 10, nimporte: 'quoi' }), { rayon: 800 });
  // Une pastille inconnue retombe sur la valeur de départ plutôt que de partir telle quelle.
  assert.deepEqual(nettoyerReglages('kvacance', { rayon: 9999 }), { rayon: 400 });
  // Le nombre se lit avec la virgule française et les espaces.
  assert.equal(nettoyerReglages('kestimation', { loyer_annuel: '42 000,50' }).loyer_annuel, 42000.5);
  assert.equal(nettoyerReglages('kestimation', { loyer_annuel: 'beaucoup' }).loyer_annuel, undefined);
  // Un texte vide ne vaut pas une réponse.
  assert.equal(nettoyerReglages('kexpertise', { activite: '   ' }).activite, undefined);
  assert.equal(nettoyerReglages('kexpertise', { activite: ' Boulangerie ' }).activite, 'Boulangerie');

  // Une question masquée par sa condition ne laisse rien derrière elle :
  // renseigner un loyer puis basculer en vacant ne doit pas l'envoyer quand même.
  const vacant = nettoyerReglages('kestimation', { statut: 'vacant', loyer_annuel: 30000, surface_m2: 80 });
  assert.equal(vacant.loyer_annuel, undefined, 'un local vacant n\'a pas de loyer');
  assert.equal(vacant.surface_m2, 80);
  assert.equal(nettoyerReglages('kestimation', { statut: 'loue', loyer_annuel: 30000 }).loyer_annuel, 30000);

  // Les critères de K-Prospective : une option indisponible ou inventée tombe.
  const c = nettoyerReglages('kprospective', { criteres: { contacts: ['telephone', 'fax'], solvabilite: ['procedure'], inconnu: ['x'] } });
  assert.deepEqual(c.criteres, { contacts: ['telephone'] });
  assert.equal(nettoyerReglages('kprospective', { criteres: {} }).criteres, undefined);
});

test('une condition se lit sur les réponses déjà données', () => {
  assert.equal(conditionRemplie(null, {}), true);
  assert.equal(conditionRemplie({ cle: 'statut', vaut: 'loue' }, { statut: 'loue' }), true);
  assert.equal(conditionRemplie({ cle: 'statut', vaut: 'loue' }, { statut: 'vacant' }), false);
  assert.equal(conditionRemplie({ cle: 'statut', vaut: 'loue' }, {}), false);
});

test('le formulaire de valorisation ne s\'impose qu\'une fois entamé', () => {
  // Vierge, ou avec les seules valeurs de départ : K-Data lance la lecture de
  // marché comme avant, sans rien exiger.
  assert.equal(formulaireEntame('kestimation', {}), false);
  assert.equal(formulaireEntame('kestimation', { statut: 'loue', ville: 'grande', emplacement: 'n1bis' }), false);
  assert.deepEqual(manquantes('kestimation', {}), []);
  // Demander une activité n'engage pas le formulaire : sans cela, préciser
  // « boulangerie » obligerait à donner un loyer.
  assert.equal(formulaireEntame('kestimation', { activite: 'Boulangerie' }), false);
  assert.deepEqual(manquantes('kestimation', { activite: 'Boulangerie' }), []);

  // Entamé, il réclame ce qui lui manque.
  assert.equal(formulaireEntame('kestimation', { surface_m2: 90 }), true);
  assert.deepEqual(manquantes('kestimation', { statut: 'loue', surface_m2: 90 }).map((m) => m.cle), ['loyer_annuel']);
  assert.deepEqual(manquantes('kestimation', { statut: 'loue', loyer_annuel: 30000 }), []);
  // Un local vacant demande sa surface, jamais son loyer.
  assert.deepEqual(manquantes('kestimation', { statut: 'vacant' }).map((m) => m.cle), ['surface_m2']);
  assert.deepEqual(manquantes('kestimation', { statut: 'vacant', surface_m2: 90 }), []);

  // Les outils sans question obligatoire ne bloquent jamais.
  assert.deepEqual(manquantes('kvacance', {}), []);
  assert.deepEqual(manquantes('kfoncier', {}), []);
});

test('un lot garde les réglages outil par outil, et laisse de côté ceux qui n\'en ont pas', () => {
  const lot = nettoyerLot(['kvacance', 'kfoncier', 'ktransactions'], {
    kvacance: { rayon: 1500 },
    ktransactions: { annees: 10 },
    kfoncier: { rayon: 999 },
  });
  assert.deepEqual(lot, { kvacance: { rayon: 1500 }, ktransactions: { annees: 10 } });
  assert.deepEqual(nettoyerLot([], {}), {});
  assert.deepEqual(nettoyerLot(['kvacance'], null), { kvacance: { rayon: 400 } });
});
