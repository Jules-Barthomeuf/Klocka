// « Que du résidentiel » et « Il rappelle tout de suite » (16 oct. 2026, Jules) : validés d'office,
// sans relance, sans Monday, sans mail ; le résidentiel sort de la file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.MONDAY_TOKEN = '';
process.env.MONDAY_BOARD_AGENTS = '';
process.env.LLM_PROVIDER = 'aucun';
process.env.ANTHROPIC_API_KEY = '';
process.env.GEMINI_API_KEY = '';
process.env.GOOGLE_AI_API_KEY = '';
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-issues-direct-'));
const MA = await import('./mode-appel.js');
const R = await import('./regles.js');
const { issueDuModeAppel } = await import('./appel.js');
const { Records } = await import('../db.js');

const nora = { email: 'nora.l@klocka.immo', role: 'admin', full_name: 'Nora Lorinquer' };
let n = 40;
function agence() {
  n += 1;
  const L = Records.create('ListeAgences', { ville: 'Nice', etat: 'fini', journal: [] });
  return Records.create('AgenceProspect', { liste_id: L.id, nom: `Agence Test ${n}`, telephone: `04 93 11 22 ${n}`, email: `contact@test-${n}.fr`, agents: [], gerants: [{ nom: 'Marie Test', qualite: 'Gérante' }] });
}

test('les règles : ni relance ni mail', () => {
  assert.deepEqual(R.suiteDeLIssue('residentiel'), { statut: 'archive', tentatives: 0, prochaine: null, mails: [], hors_cible: true });
  const r = R.suiteDeLIssue('rappelle_bientot', { tentatives: 1, statut: 'en_discussion' });
  assert.equal(r.prochaine, null);
  assert.deepEqual(r.mails, []);
  assert.equal(r.statut, 'en_discussion', 'le statut ne bouge pas');
  assert.equal(issueDuModeAppel('residentiel'), 'residentiel');
  assert.equal(issueDuModeAppel('rappelle_bientot'), 'rappelle_bientot');
});

test('Que du résidentiel : validé d’office, rien dans Monday, aucune relance, l’agence sort de la file', async () => {
  const ag = agence();
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'residentiel', user: nora });
  assert.equal(r.ok, true);
  assert.equal(r.simple, true);
  assert.equal(r.issue, 'residentiel');
  assert.ok(!r.recu?.monday || r.recu.monday.etat !== 'ok', 'pas de ligne Monday');
  assert.ok(!r.recu?.mail, 'pas de mail');
  assert.ok(!r.recu?.relance, 'pas de relance');
  const a = Records.get('AgenceProspect', ag.id);
  assert.equal(a.hors_cible, true);
  assert.match(a.hors_cible_pourquoi, /résidentiel/);
});

test('Il rappelle tout de suite : l’appel est noté, rien d’autre', async () => {
  const ag = agence();
  const r = await MA.noterIssue({ agence_id: ag.id, issue: 'rappelle_bientot', user: nora });
  assert.equal(r.ok, true);
  assert.equal(r.simple, true);
  assert.ok(!r.recu?.mail && !r.recu?.relance);
  assert.ok(Records.list('AppelAgent').some((x) => x.agence_id === ag.id), 'l’appel est dans la base');
  assert.notEqual(Records.get('AgenceProspect', ag.id).hors_cible, true, 'elle reste dans la file');
});
