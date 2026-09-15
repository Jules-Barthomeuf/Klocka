// Le scorer JavaScript : la descente d'arbres, à la main puis contre Python.
//
// Le premier test fabrique une forêt minuscule et vérifie chaque chemin —
// seuil, trou, direction par défaut. Le second est le fichier d'or : dix
// lignes réelles du dataset avec la probabilité que Python leur a donnée ;
// si la descente diverge d'un dix-millième, il casse. Il se saute proprement
// tant qu'aucun entraînement n'a tourné.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { modeleDe, confianceDe } from './score-ml.js';

const ICI = path.dirname(fileURLToPath(import.meta.url));

// Un arbre : x0 < 10 ? feuille +1 : feuille -1, trou → droite.
// Un second : x1 < 0.5 ? -0.5 : +0.5, trou → gauche.
const FORET = {
  learner: {
    learner_model_param: { base_score: '0.5' },
    gradient_booster: {
      model: {
        trees: [
          { left_children: [1, -1, -1], right_children: [2, -1, -1], split_indices: [0, 0, 0], split_conditions: [10, 1, -1], default_left: [0, 0, 0] },
          { left_children: [1, -1, -1], right_children: [2, -1, -1], split_indices: [1, 0, 0], split_conditions: [0.5, -0.5, 0.5], default_left: [1, 0, 0] },
        ],
      },
    },
  },
};

const sigmoide = (x) => 1 / (1 + Math.exp(-x));

test('la descente suit les seuils, et les trous suivent la branche par défaut', () => {
  const m = modeleDe(FORET, ['x0', 'x1']);
  // x0=5 (<10 → +1), x1=1 (≥0.5 → +0.5) : marge 1.5.
  assert.ok(Math.abs(m.predire({ x0: 5, x1: 1 }) - sigmoide(1.5)) < 1e-9);
  // x0=20 (→ -1), x1=0 (→ -0.5) : marge -1.5.
  assert.ok(Math.abs(m.predire({ x0: 20, x1: 0 }) - sigmoide(-1.5)) < 1e-9);
  // x0 absent : défaut à droite (-1) ; x1 absent : défaut à gauche (-0.5).
  assert.ok(Math.abs(m.predire({}) - sigmoide(-1.5)) < 1e-9);
  // Le biais suit base_score : à 0,9, tout se décale.
  const biaise = modeleDe({ learner: { ...FORET.learner, learner_model_param: { base_score: '0.9' } } }, ['x0', 'x1']);
  assert.ok(Math.abs(biaise.predire({ x0: 5, x1: 1 }) - sigmoide(Math.log(9) + 1.5)) < 1e-6);
});

test('la confiance pèse les variables connues par leur importance', () => {
  const poids = [
    { feature: 'a', poids_pct: 60 },
    { feature: 'b', poids_pct: 30 },
    { feature: 'c', poids_pct: 10 },
  ];
  assert.equal(confianceDe({ a: 1, b: 2, c: 3 }, poids), 1);
  assert.equal(confianceDe({ a: 1 }, poids), 0.6, 'la variable qui pèse 60 % vaut 60 % de la confiance');
  assert.equal(confianceDe({}, poids), 0);
});

test('le fichier d’or : la descente JavaScript rend les probabilités de Python', (t) => {
  const dossier = path.join(ICI, 'data', 'ml');
  const fichiers = ['modele.json', 'modele-colonnes.json', 'modele-verification.json'].map((f) => path.join(dossier, f));
  if (!fichiers.every((f) => fs.existsSync(f))) {
    t.skip('aucun entraînement : lancez ml/train_explainer.py');
    return;
  }
  const m = modeleDe(JSON.parse(fs.readFileSync(fichiers[0], 'utf-8')), JSON.parse(fs.readFileSync(fichiers[1], 'utf-8')).features);
  const or = JSON.parse(fs.readFileSync(fichiers[2], 'utf-8'));
  assert.ok(or.length >= 5, 'au moins cinq lignes de vérification');
  for (const ligne of or) {
    const p = m.predire(ligne.features);
    assert.ok(Math.abs(p - ligne.proba) < 1e-4, `attendu ${ligne.proba}, obtenu ${p.toFixed(6)}`);
  }
});
