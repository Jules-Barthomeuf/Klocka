// Le Layer, phase 9 : les mails et Monday entrent comme sources.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-sources-'));
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_BOARD_AGENTS = '111';
process.env.MONDAY_BOARD_PROPRIETES = '222';
process.env.MONDAY_WEBHOOK_JETON = 'secret';
const { Records } = await import('./db.js');
const S = await import('./layer-sources.js');

const agence = Records.create('AgenceProspect', { nom: 'Agence Durand', ville: 'Antibes' });
const agent = Records.create('AgentImmo', { prenom: 'Paul', nom_famille: 'Durand', agence: 'AGENCE DURAND', ville: 'Antibes', emails: ['P.Durand@agence.fr'], monday_ligne_id: '9001' });
Records.create('Deal', { deal_id: 'd-9', nom: 'Murs Antibes', monday_item_id: '7001' });
const projet = Records.create('Project', { titre: 'Projet Antibes', monday_item_id: '7001' });
const liensDe = (s) => s.liens.map((l) => `${l.type_entite}:${l.entite_id}`).sort();

test('un mail envoyé : source « mail », rattachée à l\'agent, à son agence et au dossier, dédupliquée par Message-ID', () => {
  const log = { statut: 'envoye', message_id: '<abc@klocka>', expediteur: 'nora@klocka.immo', to: 'Paul Durand <p.durand@agence.fr>', subject: 'Nos critères', body: 'Bonjour Paul, voici nos critères.', deal_id: 'd-9', sent_at: '2026-10-16T09:00:00Z' };
  const s = S.depuisMail(log, { extraire: false });
  assert.equal(s.type, 'mail');
  assert.equal(s.cle, 'mail:<abc@klocka>');
  assert.equal(s.auteur, 'nora@klocka.immo');
  assert.deepEqual(liensDe(s), [`agence:${agence.id}`, `agent:${agent.id}`, 'dossier:d-9'].sort());
  assert.match(s.contenu, /^Mail envoyé de nora@klocka.immo à p.durand@agence.fr, objet « Nos critères »/);
  assert.equal(S.depuisMail(log, { extraire: false }).id, s.id);
});

test('un mail non parti, ou sans identifiant, n\'entre pas', () => {
  assert.equal(S.depuisMail({ statut: 'simule', message_id: '<x>', body: 'a' }, { extraire: false }), null);
  assert.equal(S.depuisMail({ statut: 'envoye', body: 'a' }, { extraire: false }), null);
});

test('un mail reçu se rattache par l\'adresse de l\'expéditeur', () => {
  const s = S.depuisMail({ message_id_rfc: '<r1@agence>', de_email: 'p.durand@agence.fr', compte: 'nora@klocka.immo', objet: 'Fiche', texte: 'Ci-joint la fiche du local.', date: '2026-10-16T10:00:00Z' }, { sens: 'recu', extraire: false });
  assert.equal(s.cle, 'mail:<r1@agence>');
  assert.deepEqual(liensDe(s), [`agence:${agence.id}`, `agent:${agent.id}`].sort());
  assert.equal(s.auteur, null);
});

test('Monday : un changement de statut sur le tableau des agents, rattaché par la ligne', () => {
  const r = S.depuisMonday({ event: { type: 'update_column_value', boardId: 111, pulseId: 9001, pulseName: 'Paul Durand', columnId: 'status', columnType: 'color', columnTitle: 'Statut', value: { label: { text: 'RDV pris' } }, previousValue: { label: { text: 'À rappeler' } }, triggerUuid: 'u1', triggerTime: '2026-10-16T11:00:00Z' } }, { extraire: false });
  assert.equal(r.source.type, 'evenement');
  assert.equal(r.source.cle, 'evenement:monday:statut:u1');
  assert.equal(r.source.lien_original, 'https://klocka-company.monday.com/boards/111/pulses/9001');
  assert.match(r.source.contenu, /passe de « À rappeler » à « RDV pris »/);
  assert.deepEqual(liensDe(r.source), [`agence:${agence.id}`, `agent:${agent.id}`].sort());
});

test('Monday : un commentaire sur Propriétés se rattache au dossier et au projet ; le reste est ignoré', () => {
  const r = S.depuisMonday({ event: { type: 'create_update', boardId: '222', pulseId: '7001', textBody: 'Le vendeur baisse à 450 k€.', updateId: 55, triggerTime: '2026-10-16T12:00:00Z' } }, { extraire: false });
  assert.equal(r.source.cle, 'evenement:monday:update:55');
  assert.deepEqual(liensDe(r.source), [`dossier:d-9`, `projet:${projet.id}`].sort());
  assert.equal(S.depuisMonday({ event: { type: 'create_update', boardId: '222', pulseId: '7001', textBody: 'Le vendeur baisse à 450 k€.', updateId: 55 } }, { extraire: false }).deja, true);
  assert.ok(S.depuisMonday({ event: { type: 'create_update', boardId: '333', pulseId: '1', textBody: 'x', updateId: 1 } }).ignore);
  assert.ok(S.depuisMonday({ event: { type: 'update_column_value', boardId: '111', pulseId: '1', columnType: 'text', value: { value: 'x' } } }).ignore);
  assert.ok(S.depuisMonday({ event: { type: 'update_column_value', boardId: '111', pulseId: '1', columnType: 'color', value: { label: { text: 'A' } }, previousValue: { label: { text: 'A' } } } }).ignore);
});

test('le webhook n\'ouvre qu\'avec le jeton', () => {
  assert.equal(S.jetonValide('secret'), true);
  assert.equal(S.jetonValide('autre'), false);
  assert.equal(S.jetonValide(''), false);
});

test('les webhooks se posent sur les deux tableaux, statut et commentaires', async () => {
  const appels = [];
  const poses = await S.brancherWebhooks('https://klocka.test/', { graphql: async (q, v) => { appels.push(v); return { create_webhook: { id: String(appels.length) } }; } });
  assert.equal(poses.length, 4);
  assert.deepEqual(appels.map((v) => `${v.board}:${v.event}`), ['111:change_status_column_value', '111:create_update', '222:change_status_column_value', '222:create_update']);
  assert.equal(appels[0].url, 'https://klocka.test/api/layer/monday/webhook?jeton=secret');
});

test('l\'historique importe les mails envoyés et reçus une seule fois', () => {
  Records.create('EmailLog', { statut: 'envoye', message_id: '<h1@klocka>', to: 'p.durand@agence.fr', subject: 'Relance', body: 'Avez-vous la fiche ?', sent_at: new Date().toISOString() });
  Records.create('EmailLog', { statut: 'erreur', message_id: null, to: 'p.durand@agence.fr', body: 'x', sent_at: new Date().toISOString() });
  Records.create('MailRecu', { message_id_rfc: '<h2@agence>', de_email: 'p.durand@agence.fr', texte: 'La voici.', date: new Date().toISOString() });
  assert.equal(S.importerMails().importes, 2);
  assert.equal(S.importerMails().importes, 0);
});

test('un appel client : source « appel », rattachée à l\'investisseur qui a un compte ; un appel annulé n\'entre pas', () => {
  const u = Records.create('User', { email: 'simon@exemple.fr', full_name: 'Simon S', role: 'user' });
  const d = Records.create('DemandeClient', { client_nom: 'Simon S', client_email: 'Simon@exemple.fr' });
  const a = Records.create('AppelClient', { client_id: d.id, le: '2026-10-16T14:00:00Z', par: 'nora@klocka.immo', source: 'colle', resume_colle: 'Cherche des murs à Nice, 800 k€ maximum.' });
  const s = S.depuisAppelClient(a, { extraire: false });
  assert.equal(s.type, 'appel');
  assert.equal(s.cle, `appel-client-${a.id}`);
  assert.deepEqual(liensDe(s), [`investisseur:${u.id}`]);
  assert.match(s.contenu, /^Résumé de l'appel, collé/);
  assert.equal(S.depuisAppelClient({ ...a, id: 'x2', annule_le: '2026-10-16T15:00:00Z' }), null);
  const sans = S.depuisAppelClient({ id: 'x3', client_id: Records.create('DemandeClient', { client_nom: 'Inconnu' }).id, transcription: 'Bonjour, je cherche un local.' }, { extraire: false });
  assert.deepEqual(sans.liens, []);
});
