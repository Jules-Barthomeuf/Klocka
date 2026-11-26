import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-contexte-vente-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const { contexteDuDossier } = await import('./contexte-vente.js');

test('le contexte de l’Analyse : une zone de texte gardée telle quelle et recopiée sur les projets ; réécrite d’un clic (25 nov. 2026)', async () => {
  const deal = Records.create('Deal', { deal_id: 'd-ctx', titre: 'Murs Libération', lots: [{ donnees: { adresse: '5 place de la Libération, Lorient' } }] });
  const p1 = Records.create('Project', { deal_id: 'd-ctx', titre: 'Libération' });
  const p2 = Records.create('Project', { deal_id: 'd-ctx', titre: 'Autre', contexte_vente: 'Écrit à la main sur le projet.' });
  let appels = 0;
  const lire = (texte) => async (prompt) => { appels++; assert.match(prompt, /le proprio part a la retraite/); return { texte, reponse: 'Écrit.' }; };
  const r = await contexteDuDossier('d-ctx', { texte: 'le proprio part a la retraite\n' }, { lire: lire('x') });
  assert.deepEqual(r, { ok: true, texte: 'le proprio part a la retraite' });
  assert.equal(appels, 0, 'enregistrer ne passe pas par l’IA');
  assert.equal(Records.get('Deal', deal.id).contexte_vente, 'le proprio part a la retraite');
  assert.equal(Records.get('Project', p1.id).contexte_vente, 'le proprio part a la retraite');
  assert.equal(Records.get('Project', p2.id).contexte_vente, 'le proprio part a la retraite', 'le projet montre le texte de l’Analyse');
  const m = await contexteDuDossier('d-ctx', { texte: 'le proprio part a la retraite', reecrire: true }, { lire: lire('# Pourquoi le propriétaire vend\nIl part à la retraite.') });
  assert.equal(m.texte, 'Pourquoi le propriétaire vend\nIl part à la retraite.');
  assert.equal(Records.get('Project', p1.id).contexte_vente, m.texte);
  assert.equal((await contexteDuDossier('d-ctx', { texte: '  ', reecrire: true }, { lire: lire('y') })).ok, false);
  assert.equal((await contexteDuDossier('inconnu', { texte: 'x' })).ok, false);
});
