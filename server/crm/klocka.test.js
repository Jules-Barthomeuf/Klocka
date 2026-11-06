// Les fiches de Klocka retrouvées depuis une ligne de Twenty (6 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-crm-klocka-'));
const { agentPour, clientPour, pointClient } = await import('./klocka.js');

const agents = [
  { id: 'a1', prenom: 'Léa', nom_famille: 'Martin', emails: ['lea@agence.fr'], telephones: ['06 12 34 56 78'] },
  { id: 'a2', nom: 'Paul Durand', emails: [], telephones: ['+33 7 11 22 33 44'] },
  { id: 'a3', nom: 'Agence du Port', monday_ligne_id: '42' },
];

test('un agent se retrouve par son id Monday, son mail, son téléphone, puis son nom', () => {
  assert.equal(agentPour({ mondayId: '42', name: 'X' }, agents).id, 'a3');
  assert.equal(agentPour({ name: 'Autre', eMail: { primaryEmail: 'LEA@agence.fr' } }, agents).id, 'a1');
  assert.equal(agentPour({ name: 'Autre', telephone: { primaryPhoneNumber: '0711223344' } }, agents).id, 'a2');
  assert.equal(agentPour({ name: 'Martin', prenom: 'Léa' }, agents).id, 'a1');
  assert.equal(agentPour({ name: 'Inconnu' }, agents), null);
});

test('un client se retrouve par son id Twenty, sinon par son id Monday', () => {
  const demandes = [{ id: 'd1', twenty_id: 't1' }, { id: 'd2', monday_id: '99' }];
  assert.equal(clientPour({ id: 't1' }, demandes).id, 'd1');
  assert.equal(clientPour({ id: 'tx', mondayId: '99' }, demandes).id, 'd2');
  assert.equal(clientPour({ id: 'ty' }, demandes), null);
});

test('le point d\'un client : sa ville et son statut en clair', () => {
  const p = pointClient({ id: 't1', name: 'Dupont', statutClient: 'PROJET_SIGNE', localisation: { addressCity: 'Lorient' } }, { lat: 47.7, lon: -3.4 }, 'd1');
  assert.deepEqual(p, { id: 't1', lat: 47.7, lon: -3.4, titre: 'Dupont', sous: 'Lorient · Projet Signé', klocka: 'd1' });
  assert.equal(pointClient({ id: 't2' }, null), null);
});
