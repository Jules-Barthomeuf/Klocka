import { test } from 'node:test';
import assert from 'node:assert/strict';

// CRM=twenty (30 oct. 2026) : les personnes Monday viennent du fichier figé, sans appel à Monday.
process.env.CRM = 'twenty';
const { utilisateursMonday } = await import('../monday.js');

test('en CRM=twenty, les personnes Monday sont lues dans crm/utilisateurs-monday.json', async () => {
  const avant = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Monday ne doit pas être appelé'); };
  try {
    const l = await utilisateursMonday();
    assert.ok(l.length > 0);
    assert.ok(l.every((u) => u.id && u.name && 'email' in u));
    assert.ok(l.some((u) => u.email === 'paul.dz@klocka.immo'));
  } finally {
    globalThis.fetch = avant;
  }
});

test('en CRM=twenty, un ancien id Monday donne le lien de Klocka qui retrouve la fiche Twenty', async () => {
  const { lienMonday } = await import('../monday.js');
  assert.match(lienMonday(2110621760, '5091573479'), /\/api\/crm\/fiche\/2110621760\/5091573479$/);
});
