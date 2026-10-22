import test from 'node:test';
import assert from 'node:assert/strict';

test('passe des scores : le délai va jusqu\'au prochain 1 h 30 UTC', async () => {
  const { delaiJusqua } = await import('./passe-scores.js');
  assert.equal(delaiJusqua(1, 30, new Date('2026-10-22T01:00:00Z')), 30 * 60 * 1000);
  assert.equal(delaiJusqua(1, 30, new Date('2026-10-22T02:00:00Z')), 23.5 * 3600 * 1000);
});
