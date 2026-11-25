import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-contexte-vente-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const { contexteDuDossier } = await import('./contexte-vente.js');

test('le contexte dicté dans l’Analyse : gardé sur le dossier, recopié sur son projet, sauf un texte changé à part (25 nov. 2026)', async () => {
  const deal = Records.create('Deal', { deal_id: 'd-ctx', titre: 'Murs Libération', lots: [{ donnees: { adresse: '5 place de la Libération, Lorient' } }] });
  const p1 = Records.create('Project', { deal_id: 'd-ctx', titre: 'Libération' });
  const p2 = Records.create('Project', { deal_id: 'd-ctx', titre: 'Autre', contexte_vente: 'Écrit à la main sur le projet.' });
  const lire = (texte) => async () => ({ texte, reponse: 'Écrit.' });
  const r = await contexteDuDossier('d-ctx', { demande: 'retraite' }, { lire: lire('## Pourquoi\nRetraite.') });
  assert.equal(r.ok, true);
  assert.equal(Records.get('Deal', deal.id).contexte_vente, '## Pourquoi\nRetraite.');
  assert.equal(Records.get('Project', p1.id).contexte_vente, '## Pourquoi\nRetraite.');
  assert.equal(Records.get('Project', p2.id).contexte_vente, 'Écrit à la main sur le projet.', 'un texte changé à part reste');
  await contexteDuDossier('d-ctx', { demande: 'ajoute le bail' }, { lire: lire('## Pourquoi\nRetraite.\n\n## Bail\nRenouvelé.') });
  assert.match(Records.get('Project', p1.id).contexte_vente, /## Bail/, 'le projet suit le dossier');
  assert.equal((await contexteDuDossier('inconnu', { demande: 'x' }, { lire: lire('y') })).ok, false);
});
