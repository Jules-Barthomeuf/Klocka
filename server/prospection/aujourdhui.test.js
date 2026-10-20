import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-aujourdhui-'));
const J = await import('./aujourdhui.js');
const { Records } = await import('../db.js');

const MAINT = new Date('2026-10-20T08:00:00Z');
const users = [{ email: 'maxime.p@klocka.immo', full_name: 'Maxime Pama', role: 'admin' }, { email: 'nora.l@klocka.immo', full_name: 'Nora L', role: 'admin' }];

test("à relancer, à rappeler : chaque analyste ses personnes, les plus en retard d'abord", () => {
  const agents = [
    { id: 'a1', nom: 'Manon', agence: 'Primo', prochaine: { le: '2026-10-20', quoi: 'rappeler (essai 2 sur 3)' } },
    { id: 'a2', nom: 'Paul', prochaine: { le: '2026-10-15', quoi: 'point du mois' } },
    { id: 'a3', nom: 'Lucie', prochaine: { le: '2026-10-25', quoi: 'plus tard' } },
    { id: 'a4', nom: 'Marc', prochaine: { le: '2026-10-19', quoi: 'rappeler si la fiche n\'est pas arrivée' } },
    { id: 'a5', nom: 'Archivé', statut: 'archive', prochaine: { le: '2026-10-10' } },
    { id: 'a6', nom: 'Sans appel', statut: 'a_rappeler', prochaine: { le: '2026-10-20', quoi: 'rappeler' } },
  ];
  const appels = [
    { id: 'c1', agent_id: 'a1', par: 'maxime.p@klocka.immo', etat: 'valide', issue: 'pas_de_reponse', le: '2026-10-17T09:00:00Z', transcription_gardee: '' },
    { id: 'c2', agent_id: 'a2', par: 'maxime.p@klocka.immo', etat: 'valide', issue: 'pas_de_murs', le: '2026-09-15T09:00:00Z', transcription_gardee: 'Bonjour, ...' },
    { id: 'c3', agent_id: 'a4', par: 'nora.l@klocka.immo', etat: 'valide', issue: 'a_des_murs', le: '2026-10-16T09:00:00Z' },
    { id: 'c4', agent_id: 'a4', par: 'maxime.p@klocka.immo', etat: 'valide', issue: 'a_des_murs', le: '2026-10-18T09:00:00Z' },
    { id: 'c5', agent_id: 'a2', par: 'nora.l@klocka.immo', etat: 'valide', issue: 'pas_de_murs', le: '2026-10-01T09:00:00Z', essai: true },
  ];
  const max = J.aujourdhui({ pour: 'maxime.p@klocka.immo', maintenant: MAINT, agents, appels, users });
  assert.deepEqual(max.relancer.map((l) => l.nom), ['Paul']);
  assert.deepEqual(max.rappeler.map((l) => l.nom), ['Manon']);
  assert.equal(max.relancer[0].retard, 5);
  assert.equal(max.relancer[0].dernier_appel.transcription, true);
  assert.equal(max.rappeler[0].dernier_appel.issue, 'Pas de réponse');
  const nora = J.aujourdhui({ pour: 'nora.l@klocka.immo', maintenant: MAINT, agents, appels, users });
  assert.deepEqual(nora.relancer.map((l) => l.nom), ['Marc'], 'Marc est à Nora, qui l\'a appelé en premier');
  assert.equal(nora.relancer[0].dernier_appel.par, 'Maxime', 'le dernier appel reste visible');
  const equipe = J.aujourdhui({ pour: 'nora.l@klocka.immo', tous: true, maintenant: MAINT, agents, appels, users });
  assert.deepEqual(equipe.relancer.map((l) => l.nom), ['Paul', 'Marc']);
  assert.deepEqual(equipe.rappeler.map((l) => l.nom).sort(), ['Manon', 'Sans appel'], 'sans appel validé, il est à l\'équipe');
  assert.equal(equipe.rappeler.find((l) => l.nom === 'Sans appel').proprietaire, null);
});

test("les appels d'un agent : la transcription entière, les notes, le plus récent d'abord", () => {
  const a = Records.create('AgentImmo', { nom: 'Manon', agence: 'Primo' });
  const longue = 'Bonjour. '.repeat(5000);
  Records.create('AppelAgent', { agent_id: a.id, par: 'maxime.p@klocka.immo', le: '2026-10-17T09:00:00Z', etat: 'valide', issue: 'pas_de_murs', transcription_gardee: longue, notes: 'mail lyon@agence.com', resume: 'Pas de murs.' });
  Records.create('AppelAgent', { agent_id: a.id, par: 'maxime.p@klocka.immo', le: '2026-10-18T09:00:00Z', etat: 'valide', issue: 'a_rappeler', rappel_entrant: true });
  Records.create('AppelAgent', { agent_id: a.id, le: '2026-10-19T09:00:00Z', etat: 'valide', essai: true });
  const r = J.appelsDeLAgent(a.id);
  assert.equal(r.ok, true);
  assert.equal(r.appels.length, 2, 'sans les essais');
  assert.equal(r.appels[0].sens, 'Il a rappelé');
  assert.equal(r.appels[1].transcription.length, longue.trim().length, 'rien n\'est coupé');
  assert.equal(r.appels[1].notes, 'mail lyon@agence.com');
  assert.ok(J.TRANSCRIPTION_MAX >= 200000);
});
