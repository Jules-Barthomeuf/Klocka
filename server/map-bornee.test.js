import test from 'node:test';
import assert from 'node:assert/strict';
import { MapBornee } from './map-bornee.js';

test('MapBornee : au-delà du maximum, la moins récemment servie sort', () => {
  const m = new MapBornee(2);
  m.set('a', 1); m.set('b', 2);
  assert.equal(m.get('a'), 1);
  m.set('c', 3);
  assert.deepEqual([...m.keys()], ['a', 'c']);
  assert.equal(m.has('b'), false);
  m.set('a', 4);
  assert.equal(m.size, 2);
  assert.equal(m.get('a'), 4);
  assert.equal(m.get('z'), undefined);
});
