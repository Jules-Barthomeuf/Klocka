// La liste de prospection (12 oct. 2026) : un ordre fixe que les appels ne bougent pas,
// et le mode appel qui reprend juste après mon dernier appel.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-reprise-'));
const MA = await import('./mode-appel.js');

const ligne = (id, nom, score, etat = 'jamais') => ({ id, nom, genre: 'agence', pertinence: { score }, annonces: 0, statut: { etat } });

test('l\'ordre fixe ne dépend pas des appels', () => {
  const avant = MA.ordreStable([ligne('a', 'Alpha', 5), ligne('b', 'Beta', 9), ligne('c', 'Gamma', 1)]).map((x) => x.id);
  const apres = MA.ordreStable([ligne('a', 'Alpha', 5, 'contact'), ligne('b', 'Beta', 9, 'morte'), ligne('c', 'Gamma', 1, 'relance')]).map((x) => x.id);
  assert.deepEqual(avant, ['b', 'a', 'c']);
  assert.deepEqual(apres, avant);
});

test('la file reprend juste après le dernier appel, et fait le tour', () => {
  const ordre = ['a', 'b', 'c', 'd', 'e'].map((id) => ({ id }));
  const file = ['a', 'c', 'd', 'e'].map((id) => ({ id }));
  assert.deepEqual(MA.reprendreApres(file, ordre, 'c').map((x) => x.id), ['d', 'e', 'a', 'c']);
  assert.deepEqual(MA.reprendreApres(file, ordre, 'b').map((x) => x.id), ['c', 'd', 'e', 'a'], 'b n\'est plus à appeler : on prend la suivante');
  assert.deepEqual(MA.reprendreApres(file, ordre, null).map((x) => x.id), ['a', 'c', 'd', 'e']);
});

test('le contact donné et les relances gardent la tête de file à la reprise', () => {
  const ordre = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const file = [{ id: 'd', place: 0 }, { id: 'b', place: 1 }, { id: 'a', place: 3 }, { id: 'c', place: 3 }];
  assert.deepEqual(MA.reprendreApres(file, ordre, 'a').map((x) => x.id), ['d', 'b', 'c', 'a']);
});

test('un contact donné ne remet pas l\'agence en tête le jour même', () => {
  const jour = '2026-10-12';
  const a = { id: 'x', nom: 'Agence', genre: 'agence', telephone: '0478000000', statut: { etat: 'contact', quand: `${jour}T10:00:00Z` }, prioritaire: { le: '2026-10-13', par: 'moi@k.fr' } };
  assert.equal(MA.placeDansLaFile(a, 'moi@k.fr', { jour }), null, 'appelée aujourd\'hui : elle ne revient pas');
  assert.equal(MA.placeDansLaFile(a, 'moi@k.fr', { jour: '2026-10-13' }), 0, 'le lendemain : en tête');
  assert.equal(MA.placeDansLaFile(a, 'moi@k.fr', { jour: '2026-10-14' }), 0, 'pas encore rappelée : toujours en tête');
  const rappelee = { ...a, statut: { ...a.statut, quand: '2026-10-13T09:00:00Z' } };
  assert.notEqual(MA.placeDansLaFile(rappelee, 'moi@k.fr', { jour: '2026-10-14' }), 0, 'rappelée depuis : plus prioritaire');
});

test('la phrase libre d\'AK part en tête de la remarque Monday, avec un statut grossier', () => {
  const d = MA.donneesMonday({ appel: { le: '2026-10-12T10:00:00Z', passe: 'Le secrétariat transmet à la direction, rappeler jeudi', resume: 'L\'assistante prend le message.', compris: {} }, agence: { nom: 'Agence du Port' }, fiche: null, issue: 'a_rappeler', user: { email: 'maxime@klocka.immo' } });
  assert.match(d.remarque, /Le secrétariat transmet à la direction, rappeler jeudi\. L'assistante prend le message\./);
  assert.doesNotMatch(d.remarque, /Pas de bien/);
  assert.equal(d.statut, 'À rappeler');
});

test('Monday : une ligne « À préciser » prend le nom sûr et son prénom ; sans nom, la case Contact reste à remplir', async () => {
  const MON = await import('./monday-agents.js');
  const cols = { prenom: { id: 'p' }, ville: { id: 'v' } };
  const ligne = { id: '1', nom: 'À préciser · Agence du Port', ville: 'Lyon' };
  const avec = MON.valeursPour(ligne, cols, { contact: 'Sophie Martin', ville: 'Lyon' });
  assert.equal(avec.valeurs.name, 'Sophie Martin');
  assert.equal(avec.valeurs.p, 'Sophie');
  const sans = MON.valeursPour(ligne, cols, { contact: null, ville: 'Lyon' });
  assert.equal(sans.valeurs.name, undefined);
  assert.ok(sans.apercu.some((x) => x.titre === 'Contact'));
});

test('« Prénom Nom - Arthur Loyd » : la même agence, chaque agent nommé', async () => {
  const IA = await import('./agent-ia.js');
  assert.deepEqual(IA.agenceDuLibelle('Yasmina Zabar - Arthur Loyd'), { agence: 'Arthur Loyd', agent: 'Yasmina Zabar' });
  assert.deepEqual(IA.agenceDuLibelle('Agence du Port'), { agence: 'Agence du Port', agent: null });
  assert.equal(IA.agenceDuLibelle('Guy Hoquet - Nice Ouest').agent, null, 'un réseau au nom de personne');
  assert.equal(IA.agenceDuLibelle('Century 21 - Agence du Port').agent, null);
  assert.equal(IA.agenceDuLibelle('Lamotte Entreprises - Lyon').agent, null);
});

test('reparerListe fond les coquilles Equimmox d\'une même agence en une ligne', async () => {
  const IA = await import('./agent-ia.js');
  const { Records } = await import('../db.js');
  const l = Records.create('ListeAgences', { ville: 'Lyon' });
  const coq = (nom, tel) => Records.create('AgenceProspect', { liste_id: l.id, nom, sources: ['Equimmox'], agents: [{ telephone: tel, annonces: 2 }] });
  coq('Yasmina Zabar - Arthur Loyd', '0611111111'); coq('Paul Durand - Arthur Loyd', '0622222222'); coq('Agence du Port', '0633333333');
  IA.reparerListe(l.id);
  const vives = Records.list('AgenceProspect').filter((a) => a.liste_id === l.id && !a.hors_cible);
  const al = vives.find((a) => a.nom === 'Arthur Loyd');
  assert.ok(al, 'une seule ligne Arthur Loyd');
  assert.equal(vives.length, 2);
  assert.deepEqual(al.agents.map((x) => x.nom).sort(), ['Paul Durand', 'Yasmina Zabar']);
});

test('les numéros : indicatif contre le département, numéro écarté, standard d\'abord', () => {
  assert.equal(MA.indicatifCoherent('02 40 00 00 00', '69'), false, 'un 02 à Lyon');
  assert.equal(MA.indicatifCoherent('04 78 00 00 00', '69'), true);
  assert.equal(MA.indicatifCoherent('06 12 34 56 78', '69'), true);
  assert.equal(MA.indicatifCoherent('+33 7 12 34 56 78', '29'), true);
  assert.equal(MA.indicatifCoherent('01 42 00 00 00', '75'), true);
  const a = { code_postal: '69002', telephone: null, agents: [{ nom: 'Siège', telephone: '0240000000' }, { telephone: '0478000000' }] };
  assert.equal(MA.numeroDe(a), '0478000000', 'le numéro de la région passe devant');
  assert.equal(MA.numerosDe(a)[1].autre_region, true);
  const ecarte = { ...a, numeros_ecartes: [{ telephone: '04 78 00 00 00' }] };
  assert.equal(MA.numeroDe(ecarte), '0240000000', 'le mauvais numéro ne revient plus, l\'agence reste');
  assert.equal(MA.numeroDe({ ...ecarte, numeros_ecartes: [{ telephone: '0478000000' }, { telephone: '0240000000' }] }), null);
  assert.equal(MA.numeroDe({ telephone: '0493000000', agents: [{ telephone: '0611111111' }] }), '0493000000', 'le standard d\'abord');
});

test('les faux agents : nom de ville à droite, mot d\'agence à gauche, trois parties', async () => {
  const IA = await import('./agent-ia.js');
  assert.equal(IA.agenceDuLibelle('Ft Riviera - Nice Massena', { ville: 'Nice' }).agent, null);
  assert.equal(IA.agenceDuLibelle('Oste Conciergerie - Location Airbnb').agent, null);
  assert.deepEqual(IA.agenceDuLibelle('Signature Authentick - Aurelia Leys - Keller Williams'), { agence: 'Keller Williams', agent: 'Aurelia Leys' });
  assert.deepEqual(IA.agenceDuLibelle('Xavier Francois - Arthur Loyd', { ville: 'Rennes' }), { agence: 'Arthur Loyd', agent: 'Xavier Francois' });
});
