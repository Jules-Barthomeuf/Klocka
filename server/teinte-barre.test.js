// La couleur personnalisée de la barre (19 oct. 2026) : la teinte et l'intensité, la clarté tenue par le mode.
import test from 'node:test';
import assert from 'node:assert/strict';
import { barreDepuisTeinte, teinteDeBarre, TEINTE_DEPART } from '../src/lib/teinte-barre.js';

const clarte = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return (Math.max(r, g, b) + Math.min(r, g, b)) / 2 / 255; };

test('une barre personnalisée reste sombre en sombre, claire en clair, quelle que soit la teinte', () => {
  for (const h of [0, 120, 210, 300]) {
    for (const i of [0, 50, 100]) {
      assert.ok(clarte(barreDepuisTeinte(h, i, 'sombre')) < 0.16, `sombre ${h}/${i}`);
      assert.ok(clarte(barreDepuisTeinte(h, i, 'clair')) > 0.88, `clair ${h}/${i}`);
    }
  }
  assert.match(barreDepuisTeinte(210, 45, 'sombre'), /^#[0-9a-f]{6}$/);
});

test('la teinte de départ se voit, et les curseurs se replacent sur une barre déjà choisie', () => {
  assert.notEqual(barreDepuisTeinte(TEINTE_DEPART.teinte, TEINTE_DEPART.intensite, 'sombre'), barreDepuisTeinte(0, 0, 'sombre'));
  const r = teinteDeBarre(barreDepuisTeinte(140, 70, 'sombre'), 'sombre');
  assert.ok(Math.abs(r.teinte - 140) <= 3, JSON.stringify(r));
  assert.ok(Math.abs(r.intensite - 70) <= 4, JSON.stringify(r));
  assert.deepEqual(teinteDeBarre('origine'), TEINTE_DEPART);
});
