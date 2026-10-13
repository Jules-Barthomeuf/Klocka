// L'exécution de code d'Anthropic (13 oct. 2026) : les fichiers qu'une
// réponse a écrits dans le bac à sable se retrouvent par leur file_id.

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ANTHROPIC_API_KEY = '';
const { fichiersProduits, OUTIL_CODE } = await import('./llm.js');

test('les fichiers écrits par le code, et rien d\'autre', () => {
  const contenu = [
    { type: 'text', text: 'Voici le fichier.' },
    { type: 'server_tool_use', name: 'bash_code_execution', input: { command: 'python fait.py' } },
    { type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_result', stdout: '', content: [{ type: 'bash_code_execution_output', file_id: 'file_A' }, { type: 'autre', file_id: 'file_X' }] } },
    { type: 'bash_code_execution_tool_result', content: { type: 'bash_code_execution_tool_result_error', error_code: 'unavailable' } },
  ];
  assert.deepEqual(fichiersProduits(contenu), ['file_A']);
  assert.deepEqual(fichiersProduits(null), []);
});

test('l\'outil déclaré est celui de la documentation', () => {
  assert.deepEqual(OUTIL_CODE, { type: 'code_execution_20260521', name: 'code_execution' });
});
