import test from 'node:test';
import assert from 'node:assert/strict';
import { lignesOds, lireTarifs, lireSecteurs, lireCoefficients, secteurDeSection, coefficientDe, pointDans, valeurDesSections, fourchetteDataB, departementDeCommune } from './rvllp.js';

const cellule = (v) => `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`;
const ligne = (...v) => `<table:table-row>${v.map(cellule).join('')}</table:table-row>`;

test('ODS : colonnes répétées, ligne auto-fermée et colonnes vides de fin', () => {
  const xml = `<table:table-row table:number-rows-repeated="3"/>${ligne('a', 'b')}<table:table-row><table:table-cell table:number-columns-repeated="2" office:value="7"/><table:table-cell table:number-columns-repeated="1024"/></table:table-row>`;
  assert.deepEqual(lignesOds(xml), [['a', 'b'], ['7', '7']]);
});

test('la grille tarifaire suit les colonnes annoncées par son en-tête', () => {
  const t = lireTarifs([{ A: 'Catégories', B: 'Tarifs' }, { B: 'secteur 1', C: 'secteur 2' }, { A: 'MAG1', B: 100.5, C: '200' }, { A: 'note' }]);
  assert.deepEqual(t, { MAG1: { 1: 100.5, 2: 200 } });
});

test('secteur : section exacte, écriture sans zéro, commune entière', () => {
  const s = lireSecteurs([['Code', 'Nom', 'Préfixe', 'Section', 'Secteur'], ['4', 'ANTIBES', '', 'AB', '4'], ['4', 'ANTIBES', '', 'A', '2'], ['1', 'AIGLUN', '', '', '1']]);
  assert.equal(secteurDeSection(s['004'], { prefixe: '000', code: 'AB' }), 4);
  assert.equal(secteurDeSection(s['004'], { prefixe: '', code: '0A' }), 2);
  assert.equal(secteurDeSection(s['001'], { prefixe: '', code: 'ZZ' }), 1);
  assert.equal(secteurDeSection(s['004'], { prefixe: '', code: 'ZZ' }), null);
});

test('coefficient : la parcelle prime sur la section, 1 si rien', () => {
  const c = lireCoefficients([['note'], ['Département', 'Code commune'], ['6', '69', 'GRASSE', '', 'CL', '', '0.85'], ['6', '69', 'GRASSE', '', 'CL', '109', '1.15']])['069'];
  assert.equal(coefficientDe(c, { prefixe: '', section: 'CL', parcelle: '0109' }), 1.15);
  assert.equal(coefficientDe(c, { prefixe: '', section: 'CL', parcelle: '110' }), 0.85);
  assert.equal(coefficientDe(c, { prefixe: '', section: 'AA', parcelle: '1' }), 1);
});

test('un point dans une section, polygone simple ou multiple', () => {
  const carre = [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]];
  assert.equal(pointDans(1, 1, { type: 'Polygon', coordinates: carre }), true);
  assert.equal(pointDans(3, 1, { type: 'Polygon', coordinates: carre }), false);
  assert.equal(pointDans(1, 1, { type: 'MultiPolygon', coordinates: [carre] }), true);
});

test('la valeur de ville est le tarif du meilleur secteur, sans réglage', () => {
  const v = valeurDesSections([1, 1, 2, 3, 9], { 1: 100, 2: 150, 3: 300 });
  assert.equal(v.centre, 300);
  assert.equal(v.secteur_max, 3);
  assert.equal(v.sections, 4);
  assert.equal(valeurDesSections([9], { 1: 100 }), null);
});

test('la fourchette reproduit celle de Data-B : haut = 1,5 × bas', () => {
  const f = fourchetteDataB(200);
  assert.deepEqual(f, { centre: 200, basse: 160, haute: 240 });
  assert.equal(f.haute / f.basse, 1.5);
});

test('département : métropole, outre-mer, Corse', () => {
  assert.equal(departementDeCommune('06088'), '06');
  assert.equal(departementDeCommune('97411'), '974');
  assert.equal(departementDeCommune('2A004'), '20a');
});
