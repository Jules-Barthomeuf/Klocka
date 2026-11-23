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
  assert.equal(agentPour({ name: 'Martin', eMail: { primaryEmail: 'LEA@agence.fr' } }, agents).id, 'a1');
  assert.equal(agentPour({ name: 'P. DURAND', telephone: { primaryPhoneNumber: '0711223344' } }, agents).id, 'a2');
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

test('le nom de Twenty fait foi sur la fiche d\'un agent né d\'une adresse mail (23 nov. 2026)', async () => {
  const { Records } = await import('../db.js');
  const { ficheKlocka, nomTwenty } = await import('./klocka.js');
  const { ficheVue } = await import('../fiche-dossier/modele.js');
  assert.equal(nomTwenty({ name: '  Alexis  Petit ' }), 'Alexis Petit');
  assert.equal(nomTwenty({ name: { firstName: 'Léa', lastName: 'Martin' } }), 'Léa Martin');
  assert.equal(nomTwenty({}), null);

  const a = Records.create('AgentImmo', { nom: 'apetit.agducentre@orpi.com', emails: ['apetit.agducentre@orpi.com'] });
  Records.create('FicheDossier', { cle: `agent:${a.id}`, genre: 'agent', nom: 'Apetit Agducentre', liees: [] });
  assert.equal(ficheVue(`agent:${a.id}`).nom, 'Apetit Agducentre');
  const lire = async () => ({ id: 't9', name: 'Alexis Petit', eMail: { primaryEmail: 'apetit.agducentre@orpi.com' } });
  assert.deepEqual(await ficheKlocka('agentImmobilier', 't9', { lire }), { type: 'agent', id: a.id });
  assert.equal(ficheVue(`agent:${a.id}`).nom, 'Alexis Petit');
  // Le carnet garde son nom ; seul le nom du CRM s'ajoute.
  assert.equal(Records.get('AgentImmo', a.id).nom, 'apetit.agducentre@orpi.com');

  const d = Records.create('DemandeClient', { client_nom: 'dupont', twenty_id: 'c1' });
  await ficheKlocka('clients', 'c1', { lire: async () => ({ id: 'c1', name: 'Jean Dupont' }) });
  assert.equal(ficheVue(`client:${d.id}`).nom, 'Jean Dupont');
});

test('un numéro ou une adresse d\'agence partagés ne rattachent pas un collègue (23 nov. 2026)', () => {
  const carnet = [
    { id: 's', nom: 'Sophie Martin', telephones: ['04 93 00 00 00'], emails: ['contact@agence.fr'] },
    { id: 'p', nom: 'Madame PICOT', emails: ['m.picot@adresse.fr'] },
    { id: 'e', nom: 'apetit.agducentre@orpi.com', emails: ['apetit.agducentre@orpi.com'] },
  ];
  assert.equal(agentPour({ name: 'Claire Vasseur', telephone: { primaryPhoneNumber: '0493000000' } }, carnet), null);
  assert.equal(agentPour({ name: 'AC Invest group', eMail: { primaryEmail: 'contact@agence.fr' } }, carnet), null);
  assert.equal(agentPour({ name: 'Sophie MARTIN', telephone: { primaryPhoneNumber: '0493000000' } }, carnet).id, 's');
  assert.equal(agentPour({ name: 'Mélanie Picot', eMail: { primaryEmail: 'm.picot@adresse.fr' } }, carnet).id, 'p');
  assert.equal(agentPour({ name: 'Alexis Petit', eMail: { primaryEmail: 'apetit.agducentre@orpi.com' } }, carnet).id, 'e');
  assert.equal(agentPour({ mondayId: '7', name: 'Autre' }, [{ id: 'm', nom: 'Paul', monday_ligne_id: '7' }]).id, 'm');
});

test('tous les agents rattachés prennent le nom de Twenty, sans clic', async () => {
  const { Records } = await import('../db.js');
  const { nommerDepuisTwenty } = await import('./klocka.js');
  const a = Records.create('AgentImmo', { nom: 'Olivier Predial', telephones: ['06 99 88 77 66'] });
  const autre = Records.create('AgentImmo', { nom: 'Sophie Martin', telephones: ['04 93 11 11 11'] });
  const lignes = { agentImmobilierListe: [{ id: 'x1', name: 'Olivier PRÉDIAL', telephone: { primaryPhoneNumber: '0699887766' } }, { id: 'x2', name: 'Claire Vasseur', telephone: { primaryPhoneNumber: '0493111111' } }], clientsListe: [] };
  const r = await nommerDepuisTwenty({ lister: async (p) => lignes[p] });
  assert.equal(r.agents, 1);
  assert.equal(Records.get('AgentImmo', a.id).nom_crm, 'Olivier PRÉDIAL');
  assert.equal(Records.get('AgentImmo', autre.id).nom_crm, undefined);
  assert.equal((await nommerDepuisTwenty({ lister: async (p) => lignes[p] })).agents, 0);
});
