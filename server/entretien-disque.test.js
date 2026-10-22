// L'entretien du disque (22 oct. 2026) : seulement ce que l'application ne relit plus.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-entretien-'));
const { entretenir, rechercheDvfJetables } = await import('./entretien-disque.js');
const { Records } = await import('./db.js');

test('le cache DVF garde la plus récente de chaque adresse de moins de 120 jours, et rien d\'autre', () => {
  const maintenant = Date.parse('2026-10-22T10:00:00Z');
  const lignes = [
    { id: 'a1', cle: 'a', le: '2026-10-20T00:00:00Z' },
    { id: 'a2', cle: 'a', le: '2026-10-01T00:00:00Z' },
    { id: 'b1', cle: 'b', le: '2026-01-01T00:00:00Z' },
    { id: 'c1', cle: 'c', le: '2026-09-01T00:00:00Z' },
  ];
  assert.deepEqual(rechercheDvfJetables(lignes, maintenant).sort(), ['a2', 'b1']);
});

test('un passage efface les copies du bac à sable anciennes, garde les récentes, tronque les gros journaux', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-entretien-d-'));
  const vieux = path.join(d, 'testeur', 'bac-vieux');
  const recent = path.join(d, 'testeur', 'bac-recent');
  fs.mkdirSync(vieux, { recursive: true });
  fs.mkdirSync(recent, { recursive: true });
  fs.writeFileSync(path.join(vieux, 'klocka.db'), Buffer.alloc(2000));
  const sept = (Date.now() - 7 * 3600 * 1000) / 1000;
  fs.utimesSync(vieux, sept, sept);
  fs.writeFileSync(path.join(d, 'dev.log'), Buffer.alloc(6 * 1024 * 1024, 65));
  const b = entretenir({ dossier: d });
  assert.equal(fs.existsSync(vieux), false);
  assert.equal(fs.existsSync(recent), true, 'un essai en cours n\'est pas touché');
  assert.equal(fs.statSync(path.join(d, 'dev.log')).size, 1024 * 1024);
  assert.ok(b.libere > 5 * 1024 * 1024);
  Records.create('DvfRecherche', { cle: 'x', le: '2025-01-01T00:00:00Z' });
  entretenir({ dossier: d });
  assert.equal(Records.list('DvfRecherche').length, 0);
});
