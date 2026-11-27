// Les portefeuilles d'agents dans l'écran CRM (27 nov. 2026, Jules : « on arrive sur Mes agents, puis les agents de Nora,
// de Maxime…, puis Tout ; Paul voit Tout d'abord »).
import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTEFEUILLES, vuesPortefeuille } from './ecran.js';

const equipe = { JulesB: 'jules.b@klocka.immo', 'Maxime Pama': 'maxime.p@klocka.immo', 'Nora LORINQUER': 'nora.l@klocka.immo', 'Coralie GUILLAUD': 'coralie.g@klocka.immo', 'Paul De Zulueta': 'paul.dz@klocka.immo' };
const reglages = {
  portefeuilles: ['nora.l@klocka.immo', 'maxime.p@klocka.immo', 'coralie.g@klocka.immo', 'jules.b@klocka.immo'],
  toutDabord: ['paul.dz@klocka.immo'],
  spoc: [{ nom: 'Jules Barthomeuf', email: 'jules.b@klocka.immo' }, { nom: 'Nora Lorinquer', email: 'nora.l@klocka.immo' }, { nom: 'Maxime Pama', email: 'maxime.p@klocka.immo' }, { nom: 'Coralie Guillaud', email: 'coralie.g@klocka.immo' }],
};
const vues = [{ id: 'v-tout', nom: 'Tout', colonnes: ['name', 'spoc'], filtres: [], tri: null }, { id: 'v-relance', nom: 'À relancer', colonnes: ['name'], filtres: [], tri: null }];

test('Maxime : Tout à gauche, puis ses agents (où il arrive), ceux des autres, puis les vues de Twenty', () => {
  const v = vuesPortefeuille(vues, 'maxime.p@klocka.immo', equipe, reglages);
  assert.deepEqual(v.map((x) => x.nom), ['Tout', 'Mes agents', 'Agents de Nora', 'Agents de Coralie', 'Agents de Jules', 'À relancer']);
  assert.equal(v[0].id, 'v-tout');
  assert.deepEqual(v.filter((x) => x.defaut).map((x) => x.nom), ['Mes agents']);
  assert.deepEqual(v[1].filtres, [{ champ: 'spoc', op: 'contient', valeur: 'Maxime Pama' }]);
  assert.deepEqual(v[4].filtres, [{ champ: 'spoc', op: 'contient', valeur: 'JulesB' }]);
  assert.deepEqual(v[1].colonnes, ['name', 'spoc']);
});

test('Paul arrive sur Tout ; ses agents restent à portée, à la fin', () => {
  const v = vuesPortefeuille(vues, 'paul.dz@klocka.immo', equipe, reglages);
  assert.deepEqual(v.map((x) => x.nom), ['Tout', 'Agents de Nora', 'Agents de Maxime', 'Agents de Coralie', 'Agents de Jules', 'Mes agents', 'À relancer']);
  assert.ok(!v.some((x) => x.defaut));
});

test("quelqu'un hors de l'équipe des appels arrive sur Tout, sans « Mes agents »", () => {
  const v = vuesPortefeuille(vues, 'hugo.r@kpartners.immo', equipe, reglages);
  assert.equal(v[0].nom, 'Tout');
  assert.ok(!v.some((x) => x.nom === 'Mes agents'));
});

test('les Fiches (ex-Propriétés Klocka) : Tout, Mes fiches, Fiches de Nora…, sur leur champ Personnes', () => {
  const v = vuesPortefeuille(vues, 'nora.l@klocka.immo', equipe, reglages, PORTEFEUILLES.proprietesKlocka);
  assert.deepEqual(v.map((x) => x.nom), ['Tout', 'Mes fiches', 'Fiches de Maxime', 'Fiches de Coralie', 'Fiches de Jules', 'À relancer']);
  assert.deepEqual(v[1].filtres, [{ champ: 'personnes', op: 'contient', valeur: 'Nora LORINQUER' }]);
  assert.equal(PORTEFEUILLES.proprietesKlocka.nom, 'Fiches');
});
