// L'historique du chat du dashboard : chacun ses conversations, rangées,
// rouvertes, élaguées au-delà du plafond.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-conv-'));
const { enregistrerConversation, listerConversations, lireConversation, supprimerConversation, serialisables, titreDe } = await import('./assistant-conversations.js');

const jules = { email: 'jules.b@klocka.immo' };
const nora = { email: 'nora.l@klocka.immo' };

test('une conversation naît, se complète, se rouvre — et reste à son auteur', () => {
  const r = enregistrerConversation(jules, { messages: [{ role: 'user', contenu: 'crée le dossier Mâcon' }, { role: 'assistant', contenu: 'fait' }] });
  assert.equal(r.ok, true);
  assert.equal(r.titre, 'crée le dossier Mâcon');
  const suite = enregistrerConversation(jules, { id: r.id, messages: [{ role: 'user', contenu: 'crée le dossier Mâcon' }, { role: 'assistant', contenu: 'fait' }, { role: 'user', contenu: 'et Vimoutiers' }] });
  assert.equal(suite.id, r.id, 'le même identifiant continue la même conversation');
  assert.equal(lireConversation(jules, r.id).messages.length, 3);
  assert.equal(lireConversation(nora, r.id), null, 'Nora ne lit pas les conversations de Jules');
  assert.equal(listerConversations(nora).length, 0);
  assert.equal(supprimerConversation(nora, r.id).ok, false);
  assert.equal(supprimerConversation(jules, r.id).ok, true);
});

test('les blocs sérialisables se gardent, le reste tombe sans perdre la conversation', () => {
  const messages = serialisables([
    { role: 'user', contenu: 'analyse' },
    { role: 'bloc', type: 'fiche', donnees: { deal_id: 'd1', titre: 'X' } },
    { role: 'bloc', type: 'fiche', donnees: { boucle: null } },
    { role: 'assistant', contenu: '' },
    { role: 'pense', contenu: 'x' },
  ]);
  assert.deepEqual(messages.map((m) => m.role), ['user', 'bloc', 'bloc']);
  assert.equal(titreDe([]), 'Conversation');
});

test('au-delà du plafond, la plus vieille part', () => {
  for (let i = 0; i < 32; i += 1) enregistrerConversation(jules, { messages: [{ role: 'user', contenu: `conversation ${i}` }] });
  assert.equal(listerConversations(jules).length, 30);
});
