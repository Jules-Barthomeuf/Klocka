import test from 'node:test';
import assert from 'node:assert/strict';
import { champDuTitre, montant, lireCsv, acquereurDeLigne, acquereursPour } from './acquereurs-mandataire.js';

test('champDuTitre : les titres courants', () => {
  assert.equal(champDuTitre('Nom'), 'nom');
  assert.equal(champDuTitre('Téléphone portable'), 'telephone');
  assert.equal(champDuTitre('E-mail'), 'email');
  assert.equal(champDuTitre('Budget max'), 'budget_max');
  assert.equal(champDuTitre('Budget minimum'), 'budget_min');
  assert.equal(champDuTitre('Villes recherchées'), 'villes');
  assert.equal(champDuTitre('Type de bien'), 'recherche');
  assert.equal(champDuTitre('Rendement'), 'rendement_min');
  assert.equal(champDuTitre('XYZ'), null);
});

test('montant : k€, M€, espaces', () => {
  assert.equal(montant('300 k€'), 300000);
  assert.equal(montant('1,2 M€'), 1200000);
  assert.equal(montant('450 000 €'), 450000);
  assert.equal(montant('6 %'), 6);
  assert.equal(montant('—'), null);
});

test('lireCsv puis acquereurDeLigne : point-virgule, guillemets, fourchette de budget', () => {
  const lignes = lireCsv('Nom;Tél;Budget;Villes\n"Dupont, SCI";06 12 34 56 78;300 - 500 k€;Lyon, Villeurbanne\n;;;\nMartin;;1 M€;Nice');
  const corr = Object.fromEntries(Object.keys(lignes[0]).map((t) => [t, champDuTitre(t)]));
  const [a, vide, b] = lignes.map((l) => acquereurDeLigne(l, corr));
  assert.equal(a.nom, 'Dupont, SCI');
  assert.deepEqual([a.budget_min, a.budget_max], [300000, 500000]);
  assert.deepEqual(a.villes, ['Lyon', 'Villeurbanne']);
  assert.equal(vide, null);
  assert.equal(b.budget_max, 1000000);
});

test('acquereursPour : la ville et le budget écartent, un critère absent non', () => {
  const liste = [
    { id: 1, nom: 'A', villes: ['Cannes'], budget_max: 500000, recherche: 'pharmacie' },
    { id: 2, nom: 'B', villes: ['Lyon'], budget_max: 500000 },
    { id: 3, nom: 'C', budget_max: 300000 },
    { id: 4, nom: 'D' },
  ];
  const r = acquereursPour({ ville: 'Cannes', prix: 450000, type: 'Pharmacie' }, liste);
  assert.deepEqual(r.map((x) => x.nom), ['A', 'D']);
  assert.deepEqual(r[0].pourquoi, ['la ville', 'le budget', 'ce qu’il cherche']);
});
