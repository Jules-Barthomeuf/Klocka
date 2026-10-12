// La boucle d'outils des chats (12 oct. 2026, phase 1) : 20 tours, les arrêts max_tokens et pause_turn,
// un dernier tour qui résume à la limite, les erreurs d'outil marquées is_error.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-boucle-'));
process.env.ANTHROPIC_API_KEY = '';
const L = await import('./llm.js');

/** Un faux client : rend les réponses dans l'ordre, garde chaque requête. */
const fauxClient = (reponses) => {
  const requetes = [];
  return { requetes, messages: { create: async (corps) => { requetes.push(JSON.parse(JSON.stringify(corps))); const r = reponses.shift(); if (!r) throw new Error('plus de réponse'); return { usage: { input_tokens: 1, output_tokens: 1 }, ...r }; } } };
};
const outil = (id, name = 'chercher') => ({ type: 'tool_use', id, name, input: {} });
const texte = (t) => ({ type: 'text', text: t });

test('la réflexion est demandée en résumé, l’effort passe', async () => {
  const c = fauxClient([{ stop_reason: 'end_turn', content: [texte('ok')] }]);
  L.brancherClientAgentPourTests(c);
  const r = await L.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [], onTool: async () => ({}), effort: 'high' });
  assert.equal(r.text, 'ok');
  assert.deepEqual(c.requetes[0].thinking, { type: 'adaptive', display: 'summarized' });
  assert.deepEqual(c.requetes[0].output_config, { effort: 'high' });
});

test('coupé par max_tokens au milieu d’un appel : le tour repart avec un refus pour l’appel et une consigne de continuer', async () => {
  const c = fauxClient([{ stop_reason: 'max_tokens', content: [texte('je cherche'), outil('t1')] }, { stop_reason: 'end_turn', content: [texte('fini')] }]);
  L.brancherClientAgentPourTests(c);
  let appels = 0;
  const r = await L.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [{ name: 'chercher', description: 'd', input_schema: { type: 'object' } }], onTool: async () => { appels += 1; return {}; } });
  assert.equal(r.text, 'fini');
  assert.equal(appels, 0, 'l’appel coupé ne s’exécute pas');
  const suite = c.requetes[1].messages.at(-1).content;
  assert.equal(suite[0].type, 'tool_result');
  assert.equal(suite[0].is_error, true);
  assert.match(suite[1].text, /coupée/);
});

test('pause_turn : le tour repart tel quel', async () => {
  const c = fauxClient([{ stop_reason: 'pause_turn', content: [texte('…')] }, { stop_reason: 'end_turn', content: [texte('fini')] }]);
  L.brancherClientAgentPourTests(c);
  const r = await L.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [], onTool: async () => ({}) });
  assert.equal(r.text, 'fini');
  assert.equal(c.requetes[1].messages.at(-1).role, 'assistant');
});

test('à la limite de 20 tours, un dernier tour sans outil dit ce qui est fait', async () => {
  const reponses = Array.from({ length: 20 }, (_, k) => ({ stop_reason: 'tool_use', content: [outil(`t${k}`)] }));
  reponses.push({ stop_reason: 'end_turn', content: [texte('Fait : 20 recherches. Reste : la synthèse.')] });
  const c = fauxClient(reponses);
  L.brancherClientAgentPourTests(c);
  const r = await L.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [{ name: 'chercher', description: 'd', input_schema: { type: 'object' } }], onTool: async () => ({ ok: true }) });
  assert.equal(r.limite, true);
  assert.match(r.text, /Reste : la synthèse/);
  const derniere = c.requetes.at(-1);
  assert.deepEqual(derniere.tool_choice, { type: 'none' });
  assert.match(derniere.messages.at(-1).content.at(-1).text, /Limite d’étapes/);
});

test('un outil en échec revient au modèle marqué is_error', async () => {
  const c = fauxClient([{ stop_reason: 'tool_use', content: [outil('a'), outil('b')] }, { stop_reason: 'end_turn', content: [texte('fini')] }]);
  L.brancherClientAgentPourTests(c);
  await L.runAgent({ system: 's', messages: [{ role: 'user', content: 'q' }], tools: [{ name: 'chercher', description: 'd', input_schema: { type: 'object' } }], onTool: async ({ name }, n = 0) => (c.requetes.length === 1 && n === 0 ? { ok: false, error: 'introuvable' } : { ok: true }) });
  const resultats = c.requetes[1].messages.at(-1).content;
  assert.equal(resultats[0].is_error, true);
});

test.after(() => L.brancherClientAgentPourTests(null));
