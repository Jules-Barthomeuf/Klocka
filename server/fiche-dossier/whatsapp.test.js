import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conversationLisible, cotes, lireConversation } from './whatsapp.js';

const ANDROID = `12/11/2026 09:14 - Les messages et les appels sont chiffrés de bout en bout.
12/11/2026 09:15 - Maxime Klocka: Bonjour Alexandre, tu as pu avoir la taxe foncière ?
12/11/2026 10:02 - Alexandre Lourenço: Pas encore, le vendeur me la renvoie
avant vendredi normalement
12/11/2026 10:03 - Alexandre Lourenço: <Médias omis>
13/11/2026 18:40 - Maxime Klocka: Top merci, et les charges de copro ?`;

test('Une conversation exportée d\'Android : messages, suite sur la ligne d\'après, médias, ligne système', () => {
  const c = lireConversation(ANDROID);
  assert.ok(c);
  assert.equal(c.messages.length, 4);
  assert.equal(c.messages[1].de, 'Alexandre Lourenço');
  assert.equal(c.messages[1].texte, 'Pas encore, le vendeur me la renvoie\navant vendredi normalement');
  assert.equal(c.messages[2].texte, '[média]');
  assert.equal(c.du, '2026-11-12T09:15:00.000Z');
  assert.equal(c.au, '2026-11-13T18:40:00.000Z');
  assert.deepEqual(c.participants.map((p) => p.nom).sort(), ['Alexandre Lourenço', 'Maxime Klocka']);
});

test('Les formats iPhone et WhatsApp Web, avec leurs caractères invisibles', () => {
  const ios = '‎[12/11/2026 09:15:02] Maxime: Bonjour\n[12/11/2026 10:02:40] Alexandre: Salut\n[12/11/26, 10:05:00] Alexandre: Je te dis demain';
  assert.equal(lireConversation(ios)?.messages.length, 3);
  const web = '[09:15, 12/11/2026] Maxime: Bonjour\n[10:02, 12/11/2026] Alexandre: Salut\n[10:05, 12/11/2026] Alexandre: Je te dis demain';
  const c = lireConversation(web);
  assert.equal(c.messages.length, 3);
  assert.equal(c.messages[2].le, '2026-11-12T10:05:00.000Z');
});

test('Une note ordinaire n\'est pas une conversation, même avec une date dedans', () => {
  assert.equal(lireConversation('Appel avec Alexandre : taxe foncière promise pour vendredi.\n12/11/2026 14:03 - à rappeler'), null);
  assert.equal(lireConversation('12/11/2026 09:15 - Maxime: Bonjour\n12/11/2026 09:16 - Alexandre: Salut'), null);
});

test('Trop longue, la conversation garde la fin, le plus récent', () => {
  const lignes = Array.from({ length: 400 }, (_, i) => `12/11/2026 ${String(8 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')} - ${i % 2 ? 'Alexandre' : 'Maxime'}: message numéro ${i} ${'x'.repeat(40)}`);
  const c = lireConversation(lignes.join('\n'));
  const l = conversationLisible(c, 3000);
  assert.ok(l.omis > 0);
  assert.match(l.texte, /message numéro 399/);
  assert.doesNotMatch(l.texte, /message numéro 0 /);
  assert.match(l.texte, /^\(\d+ messages plus anciens non repris\)/);
});

test('Qui est qui : l\'équipe d\'un côté, la personne liée en face', () => {
  const c = lireConversation(ANDROID);
  const r = cotes(c, { equipe: ['Maxime', 'Paul'], liens: [{ genre: 'agent', nom: 'Alexandre Lourenço' }] });
  assert.deepEqual(r, { nous: ['Maxime Klocka'], eux: ['Alexandre Lourenço'], autres: [] });
});
