import { test } from 'node:test';
import assert from 'node:assert/strict';

test('« Déjà renseigné » garde les réponses courtes quand le questionnaire est long', async () => {
  const { dejaRenseigne } = await import('./mandataire-avis.js');
  const q = { environnement: 'x'.repeat(5000), description: 'y'.repeat(5000), rang_rue: 'n1', taux_base: 6.5, occupe: true, vide: null };
  const t = dejaRenseigne(q, 800);
  assert.match(t, /rang_rue: n1/);
  assert.match(t, /taux_base: 6.5/);
  assert.match(t, /occupe: true/);
  assert.doesNotMatch(t, /vide/);
});
