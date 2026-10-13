// Le banc d'essai : ses cas et ses rapports (12 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { rapport, comparatif } from './rejouer.js';

const CAS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'cas.json'), 'utf8'));

test('trente cas (vingt du 12 oct., dix du journal du 13 oct.), chacun avec sa demande, son chat et ce qu’on teste', () => {
  assert.equal(CAS.length, 30);
  assert.equal(new Set(CAS.map((c) => c.id)).size, 30);
  for (const c of CAS) { assert.ok(c.texte && c.note && ['admin', 'mandataire'].includes(c.chat), c.id); }
  assert.ok(CAS.filter((c) => /Échec connu/.test(c.note)).length >= 4);
});

const passe = (label, tours) => ({ label, le: '2026-10-12', modele_ak: 'm', modele: 'm', resultats: [{ id: '01', note: 'n', texte: 't', reponse: 'r', outils: [{ outil: 'trouver_bien', arguments: {}, echec: false }], tours, limite: false, erreur: null, cout_usd: 0.1, duree_ms: 2000 }] });

test('le rapport et le comparatif se lisent', () => {
  assert.match(rapport(passe('avant', 2)), /\| 01 \| n \| 2 \| trouver_bien/);
  assert.match(comparatif(passe('avant', 2), passe('apres', 4)), /\| 01 n \| 2 → 4 \|/);
});
