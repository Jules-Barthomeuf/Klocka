import test from 'node:test';
import assert from 'node:assert/strict';
import { choixPour, nomDeSortie, secteurSous, typeDe } from '../src/lib/conversions.js';

test('le type se lit au nom, sinon au type MIME', () => {
  assert.equal(typeDe('Bail.PDF'), 'pdf');
  assert.equal(typeDe('photo.jpeg'), 'image');
  assert.equal(typeDe('note.docx'), 'docx');
  assert.equal(typeDe('liste.csv'), 'texte');
  assert.equal(typeDe('fichier', 'application/pdf'), 'pdf');
  assert.equal(typeDe('scan.heic', 'image/heic'), null);
  assert.equal(typeDe('tableur.xlsx'), null);
});

test("la roue d'un PDF : DOCX, JPG, PNG, TXT ; une image ne se convertit pas vers son propre format", () => {
  assert.deepEqual(choixPour('Bail.pdf').map((c) => c.libelle), ['DOCX', 'JPG', 'PNG', 'TXT']);
  const jpg = choixPour('photo.jpeg').map((c) => c.libelle);
  assert.ok(!jpg.includes('JPG'));
  assert.ok(jpg.includes('Compresser') && jpg.includes('PDF'));
  assert.deepEqual(choixPour('x.zip'), []);
});

test('le nom produit reprend celui de départ ; plusieurs pages en images font une archive', () => {
  const [docx, jpg] = choixPour('Bail 2024.pdf');
  assert.equal(nomDeSortie('Bail 2024.pdf', docx), 'Bail 2024.docx');
  assert.equal(nomDeSortie('Bail 2024.pdf', jpg, { pages: 3 }), 'Bail 2024 (3 pages, JPG).zip');
  assert.equal(nomDeSortie('Bail 2024.pdf', jpg, { pages: 1 }), 'Bail 2024.jpg');
  const compresser = choixPour('vue.png').find((c) => c.cle === 'image-compresser');
  assert.equal(nomDeSortie('vue.png', compresser), 'vue compressé.jpg');
});

test('le secteur sous le curseur : le moyeu, le haut, la droite, hors de la roue', () => {
  assert.equal(secteurSous(0, 0, 4), -1);
  assert.equal(secteurSous(0, -120, 4), 0);
  assert.equal(secteurSous(120, 0, 4), 1);
  assert.equal(secteurSous(0, 120, 4), 2);
  assert.equal(secteurSous(-120, 0, 4), 3);
  assert.equal(secteurSous(300, 0, 4), null);
});
