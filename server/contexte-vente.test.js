import test from 'node:test';
import assert from 'node:assert/strict';
import { consigneContexte, nettoyer, redigerContexte } from './contexte-vente.js';

test('le contexte de la vente : la consigne porte le texte actuel, les échanges et la demande ; rien d’inventé, pas de nom (25 nov. 2026)', () => {
  const c = consigneContexte({ projet: { titre: 'Murs Libération', ville: 'Lorient' }, actuel: '## Pourquoi\nRetraite.', demande: 'enlève la partie sur le prix', historique: [{ role: 'equipe', texte: 'le propriétaire part à la retraite' }] });
  assert.match(c, /N'invente rien/);
  assert.match(c, /Jamais le nom d'une personne/);
  assert.match(c, /Le texte actuel :\n## Pourquoi\nRetraite\./);
  assert.match(c, /Équipe : le propriétaire part à la retraite/);
  assert.match(c, /« enlève la partie sur le prix »/);
});

test('le texte rendu est nettoyé : titres sans « # » ni gras, puces « - », sans tiret long', () => {
  assert.equal(nettoyer('## Pourquoi\n* Retraite — après **30 ans**\n\n\n\nFin'), 'Pourquoi\n- Retraite, après 30 ans\n\nFin');
});

test('rédiger : sans message, rien ; avec, le texte du modèle et sa réponse', async () => {
  assert.equal((await redigerContexte({ projet: {}, demande: '  ' })).ok, false);
  const r = await redigerContexte({ projet: { id: 'p1' }, demande: 'retraite' }, { lire: async (prompt) => { assert.match(prompt, /retraite/); return { texte: '## Pourquoi le propriétaire vend\nIl part à la retraite.', reponse: 'Écrit en une partie.' }; } });
  assert.deepEqual(r, { ok: true, texte: 'Pourquoi le propriétaire vend\nIl part à la retraite.', reponse: 'Écrit en une partie.' });
});
