import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXPLICATIONS_BAIL, explicationDe } from '../src/lib/explications-bail.js';

// Les clauses de l'écran, lues dans SECTIONS_BAIL (src/components/projet/CasesProjet.jsx) : chacune a son explication.
const source = readFileSync(new URL('../src/components/projet/CasesProjet.jsx', import.meta.url), 'utf8');
const bloc = source.match(/export const SECTIONS_BAIL = \[([\s\S]*?)\n\];/)[1];
const ids = [...bloc.matchAll(/\["([a-z_]+)"/g)].map((m) => m[1]);

test('chaque clause du bail a son explication', () => {
  assert.ok(ids.length >= 14);
  for (const id of ids) assert.ok(explicationDe(id), `pas d'explication pour ${id}`);
});

test('une explication a sa question, son titre et son texte', () => {
  for (const [id, e] of Object.entries(EXPLICATIONS_BAIL)) {
    assert.match(e.question, /\?$/, id);
    assert.ok(e.titre && !e.retenir, id);
    assert.ok(e.texte.length >= 2 && e.texte.every((t) => t.length > 40), id);
  }
  assert.equal(explicationDe('inconnue'), null);
});
