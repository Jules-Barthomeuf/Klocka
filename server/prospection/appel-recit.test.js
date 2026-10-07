// L'appel raconté en trente secondes : la carte de confirmation dit tout ce
// qui a été rempli, et un vocal vide ne note rien. Sans réseau ni modèle.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-recit-'));
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.MISTRAL_API_KEY = '';
process.env.MONDAY_TOKEN = '';
const { Records } = await import('../db.js');
const { carteAppel, raconterAppel } = await import('./appel.js');

test('la carte dit tout ce qui a été rempli : agent, agence, téléphone, statut, prochaine action, envois, Monday', () => {
  const a = { nom: 'Sophie Martin', agence: 'Immo Riviera', ville: 'Antibes', telephones: ['06 12 34 56 78'], emails: ['sophie@riviera.fr'], statut: 'en_discussion', prochaine: { quoi: 'rappeler pour le mandat', le: '2026-10-20' }, secteurs: ['Antibes', 'Cannes'] };
  const appel = { issue: 'a_des_murs', resume: 'Un mandat de murs à Antibes fin octobre.', propositions: [{ type: 'statut' }, { type: 'mail', objet: 'Vos murs à Antibes' }] };
  const c = carteAppel(a, appel, { faits: ['rappel le 20 oct.'] }, { ok: true, lien: 'https://klocka-company.monday.com/boards/1/pulses/2' });
  assert.equal(c.nom, 'Sophie Martin');
  assert.equal(c.agence, 'Immo Riviera');
  assert.equal(c.telephone, '06 12 34 56 78');
  assert.equal(c.statut, 'En discussion');
  assert.equal(c.issue, 'A un bien intéressant');
  assert.deepEqual(c.prochaine, { quoi: 'rappeler pour le mandat', le: '2026-10-20' });
  assert.deepEqual(c.a_envoyer, ['Mail « Vos murs à Antibes »'], 'le mail attend, il ne part pas');
  assert.equal(c.monday.ok, true);
  // L'agence qui porte le nom de l'agent ne se répète pas ; Monday injoignable se dit.
  const c2 = carteAppel({ ...a, agence: 'Sophie Martin' }, appel, {}, { ok: false, error: 'Monday non configuré' });
  assert.equal(c2.agence, null);
  assert.deepEqual(c2.monday, { ok: false, erreur: 'Monday non configuré' });
});

test('un vocal vide, ou un agent inconnu : rien ne se note', async () => {
  const a = Records.create('AgentImmo', { nom: 'Agent Test', telephones: ['0600000000'], statut: 'nouveau' });
  const vide = await raconterAppel({ agent_id: a.id, audio: null, par: 'jules.b@klocka.immo' });
  assert.equal(vide.ok, false);
  assert.match(vide.error, /Rien n'a été enregistré/);
  assert.equal((await raconterAppel({ agent_id: 'inconnu', audio: Buffer.from('x'), par: 'x' })).ok, false);
  assert.equal(Records.list('AppelAgent').length, 0, 'aucun appel noté');
});

test('05/10 · « à rappeler le 20 octobre » : la date dite passe avant le délai par défaut', async () => {
  const R = await import('./regles.js');
  const maintenant = new Date('2026-10-05T10:00:00+02:00');
  for (const issue of ['veut_mail', 'a_des_murs', 'pas_de_murs', 'autre']) {
    assert.equal(R.suiteDeLIssue(issue, { maintenant, date_dite: '2026-10-20' }).prochaine.le, '2026-10-20', issue);
  }
  // Sans date dite, le délai de la règle.
  assert.equal(R.suiteDeLIssue('veut_mail', { maintenant }).prochaine.le, '2026-10-12');
});

test('06/10 · fiabilité d\'AK : une carte validée telle quelle compte, une correction se garde (avant → après)', async () => {
  const A = await import('./appel.js');
  const P = await import('./index.js');
  const agent = Records.create('AgentImmo', { nom: 'Julie Martin', telephones: ['0611111111'], statut: 'nouveau' });
  const props = [{ id: 'statut', type: 'statut', statut: 'a_rappeler', titre: 'Statut : à rappeler', issue: 'a_rappeler' }, { id: 'note', type: 'note', texte: 'x', titre: 'Note' }];
  const tel = Records.create('AppelAgent', { agent_id: agent.id, etat: 'a_valider', issue: 'a_rappeler', propositions: props, le: new Date().toISOString() });
  const tel2 = Records.create('AppelAgent', { agent_id: agent.id, etat: 'a_valider', issue: 'a_rappeler', propositions: props, le: new Date().toISOString() });
  await A.validerAppel({ appel_id: tel.id, choix: ['statut', 'note'], user: { email: 'jules.b@klocka.immo' } });
  await A.validerAppel({ appel_id: tel2.id, choix: ['statut'], user: { email: 'jules.b@klocka.immo' } });
  assert.equal(Records.get('AppelAgent', tel.id).modifie, false);
  assert.equal(Records.get('AppelAgent', tel2.id).modifie, true, 'une proposition écartée est une modification');
  const c = await A.corrigerAppel({ appel_id: tel.id, champ: 'prochaine_le', valeur: '2026-10-15', user: { email: 'jules.b@klocka.immo' } });
  assert.equal(c.ok, true);
  assert.match(c.correction.apres, /15 oct/);
  assert.equal(Records.get('AppelAgent', tel.id).modifie, true);
  assert.equal(Records.get('AgentImmo', agent.id).prochaine.le, '2026-10-15');
  const f = A.fiabilite();
  assert.equal(f.cartes, 2);
  assert.equal(f.sans_modification, 0);
  assert.equal(f.semaines.length, 6);
  assert.equal(f.corrections[0].champ, 'Date');
  assert.equal(P.badgeDuJour({ rang: 0, raison: 'rappeler pour le mandat' }), 'Rappel');
  assert.equal(P.badgeDuJour({ rang: 0, raison: 'relance du mail' }), 'Relance');
  assert.equal(P.badgeDuJour({ rang: 2, dernier_contact_le: null }), 'Nouveau');
});
