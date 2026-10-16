import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-note-carnet-'));
const { Records } = await import('./db.js');
const { agentDeLaNote, inscrireAuCarnet, dossiersDejaOuverts } = await import('./deal/appels.js');
const { trouver } = await import('./prospection/carnet.js');
const { listerAgents } = await import('./prospection/agents-liste.js');

const LOUIS = { nom: 'Louis de LARROCHE BARON', ville: 'Bordeaux', villes: ['Bordeaux'], telephones: ['06 25 19 88 09'], emails: ['louis@immobilieredlb.fr'] };

test("l'agent de la note se retrouve par son nom tel que dicté", () => {
  const liste = [{ id: 'a', ...LOUIS }, { id: 'b', nom: 'Marc Dupont', ville: 'Lyon', emails: ['marc@x.fr'] }];
  assert.equal(agentDeLaNote({ prenom: 'Louis', nom: 'de la Roche Baron', ville: 'Bordeaux' }, liste, trouver)?.id, 'a');
  assert.equal(agentDeLaNote({ prenom: 'Paul', nom: 'Inconnu', email: 'louis@immobilieredlb.fr' }, liste, trouver)?.id, 'a');
  assert.equal(agentDeLaNote({ prenom: 'Zoé', nom: 'Personne' }, liste, trouver), null);
});

test("la note d'appel inscrit l'appel au carnet : la page Agents le montre", async () => {
  const a = Records.create('AgentImmo', { ...LOUIS, nom: 'Louis Essai Carnet', emails: ['louis.essai@carnet.test'], telephones: ['06 99 88 77 66'] });
  const r = await inscrireAuCarnet({ prenom: 'Louis', nom: 'Essai Carnet', email: 'louis.essai@carnet.test', resume: 'Deux locaux rue de Cheverus.', issue: 'a_des_murs', prochaine_relance: '2026-10-19' }, { texte: 'note', par: { email: 'jules.b@klocka.immo' } });
  assert.equal(r.ok, true);
  assert.equal(r.agent_id, a.id);
  const ligne = listerAgents().find((x) => x.id === a.id);
  assert.equal(ligne.appels, 1);
  assert.ok(ligne.dernier_contact);
  assert.equal(Records.get('AgentImmo', a.id).prochaine.le, '2026-10-19');
});

test('un agent inconnu avec un numéro est ajouté au carnet ; sans mail ni numéro, rien', async () => {
  const r = await inscrireAuCarnet({ prenom: 'Nina', nom: 'Nouvelle Carnet', telephone: '06 11 22 33 44', resume: 'r' }, { par: null });
  assert.equal(r.ok, true);
  assert.equal(r.cree, true);
  const sans = await inscrireAuCarnet({ prenom: 'Sans', nom: 'Coordonnees Zz', resume: 'r' }, {});
  assert.equal(sans.ok, false);
});

test("une note sans bien précis n'ouvre pas de dossier à côté de ceux de l'agent", () => {
  const deals = [{ deal_id: 'd1', nom: 'Pequera', contact_agent_email: 'louis@immobilieredlb.fr' }];
  assert.equal(dossiersDejaOuverts({ nom: 'Disquaire et coiffeur - Bordeaux' }, ['louis@immobilieredlb.fr'], deals).length, 1);
  assert.equal(dossiersDejaOuverts({ nom: 'X', rue: '30 rue de Cheverus' }, ['louis@immobilieredlb.fr'], deals).length, 0);
  assert.equal(dossiersDejaOuverts({ nom: 'X' }, ['autre@x.fr'], deals).length, 0);
});

test("le rattrapage inscrit une fois les notes d'avant, à leur date", async () => {
  const { rattraperNotesAuCarnet } = await import('./deal/appels.js');
  const a = Records.create('AgentImmo', { nom: 'Louis Rattrape Carnet', ville: 'Bordeaux', emails: ['louis.rattrape@carnet.test'] });
  const le = new Date(Date.now() - 3600000).toISOString();
  const x = Records.create('AssistantAction', { type: 'note_appel', par: 'jules.b@klocka.immo', le, texte: 'note', note: { prenom: 'Louis', nom: 'Rattrape Carnet', email: 'louis.rattrape@carnet.test', resume: 'Deux locaux.', issue: 'a_des_murs' } });
  assert.equal((await rattraperNotesAuCarnet()).inscrites >= 1, true);
  assert.equal(Records.get('AssistantAction', x.id).agent_carnet_id, a.id);
  assert.equal(Records.get('AgentImmo', a.id).dernier_contact_le, le);
  assert.deepEqual(await rattraperNotesAuCarnet(), { deja: true });
});
