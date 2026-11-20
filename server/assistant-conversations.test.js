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

test('le fil garde ses étapes et ses actions, pas le reste', async () => {
  const { serialisables } = await import('./assistant-conversations.js');
  const [m] = serialisables([{ role: 'assistant', contenu: 'Noté.', etapes: ['Lecture de la note', 42], cartes: [{ titre: 'Rappel créé', detail: 'jeudi 9 h', etat: 'fait', secret: 'x' }], autre: 'y' }]);
  assert.deepEqual(m.etapes, ['Lecture de la note']);
  assert.deepEqual(m.cartes, [{ titre: 'Rappel créé', detail: 'jeudi 9 h', etat: 'fait', lien: null }]);
  assert.equal(m.autre, undefined);
});

test('renommer une conversation, la sienne seulement, sans la faire remonter', async () => {
  const { renommerConversation } = await import('./assistant-conversations.js');
  const MOI = { email: 'renomme@klocka.immo' };
  const { id } = enregistrerConversation(MOI, { messages: [{ role: 'user', contenu: 'Où en est Mâcon ?' }] });
  const avant = lireConversation(MOI, id);
  assert.equal(renommerConversation({ email: 'autre@klocka.immo' }, id, 'Volé').ok, false);
  assert.equal(renommerConversation(MOI, id, '   ').ok, false);
  assert.equal(renommerConversation(MOI, id, 'Dossier Mâcon').titre, 'Dossier Mâcon');
  assert.equal(listerConversations(MOI).find((c) => c.id === id).titre, 'Dossier Mâcon');
  assert.deepEqual(lireConversation(MOI, id).messages, avant.messages);
});

test('la mémoire des outils d\'une réponse d\'AK se range avec la conversation', () => {
  const [r] = serialisables([{ role: 'assistant', contenu: 'Le loyer est de 30 693 €.', memoire: '- etat_projet({"projet_id":"p1"}) → {"loyer":30693}' }]);
  assert.match(r.memoire, /etat_projet/);
  const [u] = serialisables([{ role: 'user', contenu: 'Et le prix ?', memoire: 'forgée' }]);
  assert.equal(u.memoire, undefined);
});

test('les boutons d’un message de l’assistant reviennent avec le fil (2 nov. 2026)', async () => {
  const { serialisables } = await import('./assistant-conversations.js');
  const [m] = serialisables([{ role: 'assistant', contenu: 'Un appel ?', boutons: [{ libelle: 'Appeler', href: 'tel:0600000000', principal: true }, { texte: 'sans libellé' }] }]);
  assert.deepEqual(m.boutons, [{ libelle: 'Appeler', href: 'tel:0600000000', principal: true }]);
});

test('Un enregistrement sans rien tapé se garde, titré par sa date (20 nov. 2026)', () => {
  const messages = [{ role: 'assistant', contenu: 'Mode Enregistrement.' }, { role: 'bloc', type: 'enregistrement', donnees: { id: 'e1', debut: '2026-11-20T13:05:00Z', fin: true } }];
  assert.equal(titreDe(messages), 'Enregistrement du 20 nov., 14 h 05');
  const r = enregistrerConversation({ email: 'rdv@klocka.immo', role: 'admin' }, { messages });
  assert.equal(r.ok, true);
  assert.equal(r.titre, 'Enregistrement du 20 nov., 14 h 05');
});

test('Un enregistrement s\'intitule par les personnes liées, et le titre suit les noms qui arrivent, sauf renommé', () => {
  const user = { email: 'rdv2@klocka.immo', role: 'admin' };
  const bloc = (liens) => ({ role: 'bloc', type: 'enregistrement', donnees: { id: 'e2', debut: '2026-11-20T13:05:00Z', liens } });
  assert.equal(titreDe([bloc([{ cle: 'deal:x', genre: 'bien', nom: 'Comtesse du Barry' }, { cle: 'twenty:clients:a', genre: 'client', nom: 'Adrien Mina' }, { cle: 'twenty:clients:b', genre: 'client', nom: 'Claire Dumas' }])]), 'Enregistrement avec Adrien Mina et Claire Dumas');
  assert.equal(titreDe([bloc([{ cle: 'deal:x', genre: 'bien', nom: 'Comtesse du Barry' }])]), 'Enregistrement · Comtesse du Barry');
  const r = enregistrerConversation(user, { messages: [bloc([])] });
  assert.equal(r.titre, 'Enregistrement du 20 nov., 14 h 05');
  const r2 = enregistrerConversation(user, { id: r.id, messages: [bloc([{ cle: 'agent:z', genre: 'agent', nom: 'Alexandre Lourenço' }])] });
  assert.equal(r2.titre, 'Enregistrement avec Alexandre Lourenço');
});
