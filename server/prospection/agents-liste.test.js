// La page Agents : la liste, et chaque appel en entier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { listerAgents, appelsDeLAgent } from './agents-liste.js';

const AGENTS = [
  { id: 'a', prenom: 'Sophie', nom_famille: 'Martin', agence: 'Riviera', ville: 'Nice', statut: 'en_discussion' },
  { id: 'b', nom: 'Marc Démo', agence: 'Port', statut: 'nouveau' },
  { id: 'c', nom: 'Essai', essai: true },
];
const APPELS = [
  { id: '1', agent_id: 'a', le: '2026-10-14T09:00:00Z', par: 'Nora.L@klocka.immo', issue: 'pas_de_murs', resume: 'Rien en ce moment.', duree_s: 120 },
  { id: '2', agent_id: 'a', le: '2026-10-15T09:00:00Z', par: 'maxime.p@klocka.immo', issue: 'a_des_murs', resume: 'Une pharmacie à Nice.', transcription_gardee: 'Bonjour…\nJ’ai une pharmacie.', citations: { biens: 'J’ai une pharmacie' } },
  { id: '3', agent_id: 'a', le: '2026-10-16T09:00:00Z', par: 'jules.b@klocka.immo', issue: 'pas_de_reponse', faux: true },
  { id: '4', agent_id: 'a', le: '2026-10-13T09:00:00Z', par: 'jules.b@klocka.immo', issue: 'repondeur', etat: 'remplace' },
];

test('la liste : les derniers contactés d’abord, sans les fiches d’essai, les faux appels ni les remplacés', () => {
  const l = listerAgents({ agents: AGENTS, appels: APPELS });
  assert.deepEqual(l.map((x) => x.id), ['a', 'b']);
  const a = l[0];
  assert.equal(a.nom, 'Sophie Martin');
  assert.equal(a.appels, 2);
  assert.equal(a.conversations, 2);
  assert.equal(a.dernier_contact, '2026-10-15T09:00:00Z');
  assert.equal(a.dernier_par, 'maxime.p@klocka.immo');
  assert.deepEqual(a.appelants.sort(), ['maxime.p@klocka.immo', 'nora.l@klocka.immo']);
  assert.equal(a.resume, 'Une pharmacie à Nice.');
});

test('les appels en entier : la transcription quand elle est gardée, sinon le résumé', () => {
  const t = appelsDeLAgent('a', { appels: APPELS });
  assert.deepEqual(t.map((x) => x.id), ['2', '1']);
  assert.equal(t[0].transcription, 'Bonjour…\nJ’ai une pharmacie.');
  assert.deepEqual(t[0].citations, [{ cle: 'biens', phrase: 'J’ai une pharmacie' }]);
  assert.equal(t[1].transcription, null);
  assert.equal(t[1].resume, 'Rien en ce moment.');
  assert.equal(t[1].par, 'nora.l@klocka.immo');
});
