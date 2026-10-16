// Le Layer, phase 2 : les tables dédiées, réversibles ; la file de tâches reprise au démarrage ; l'audit ; le journal des recherches.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-layer-schema-'));
const { Records } = await import('./db.js');
Records.create('CerveauRecherche', { par: 'jules.b@klocka.immo', question: 'Libourne ?', trouves: 2, le: '2026-10-14T10:00:00Z' });
const S = await import('./layer-schema.js');
const T = await import('./layer-taches.js');

test('les tables se créent sur une base vide, se suppriment et se recréent ; le journal du MVP est recopié, pas déplacé', () => {
  assert.equal(S.tablesPresentes().length, 8);
  assert.equal(S.requetesDepuis('2026-01-01').length, 1, 'la recherche du MVP est dans le nouveau journal');
  assert.equal(Records.list('CerveauRecherche').length, 1, 'et toujours à sa place');
  S.defaire();
  assert.equal(S.tablesPresentes().length, 0);
  S.installer(); S.installer();
  assert.equal(S.tablesPresentes().length, 8, 'rejouable');
  assert.equal(S.requetesDepuis('2026-01-01').length, 1, 'recopiée une seule fois');
});

test('audit : qui, quoi, avant et après', () => {
  S.auditer({ par: 'Jules.B@klocka.immo', action: 'corriger', fait_id: 'f1', avant: { resume: 'a' }, apres: { resume: 'b' } });
  const a = S.auditDe('f1');
  assert.equal(a.length, 1);
  assert.equal(a[0].par, 'jules.b@klocka.immo');
  assert.deepEqual([a[0].avant, a[0].apres], [{ resume: 'a' }, { resume: 'b' }]);
});

test('journal des recherches : filtres, faits rendus, faits cités ; seuils du chantier Postgres', () => {
  const id = S.journaliserRequete({ par: 'nora.l@klocka.immo', question: 'Durand ?', filtres: { type: 'engagement' }, faits: ['f1', 'f2'], duree_ms: 420 });
  S.noterCites(id, ['f2']);
  const r = S.requetesDepuis('2026-01-01').find((x) => x.id === id);
  assert.deepEqual([r.nombre, r.filtres.type, r.cites], [2, 'engagement', ['f2']]);
  const alerte = S.alertePostgres();
  assert.equal(alerte.lent, true, 'une recherche de 420 ms dépasse le seuil de 300');
  assert.equal(alerte.trop, false);
});

test('la file de tâches : une clé ne double pas, un échec réessaie puis s\'arrête, une tâche en cours reprend au démarrage', async () => {
  const faits = [];
  T.enregistrer('essai', async ({ n }) => { faits.push(n); });
  const a = T.enfiler('essai', { n: 1 }, { cle: 'x' });
  const b = T.enfiler('essai', { n: 2 }, { cle: 'x' });
  assert.equal(a.id, b.id, 'même clé en attente : la même tâche');
  await T.tourner();
  assert.deepEqual(faits, [1]);
  assert.equal(T.tache(a.id).etat, 'faite');

  let essais = 0;
  T.enregistrer('rate', async () => { essais += 1; throw new Error('panne'); });
  const r = T.enfiler('rate', {});
  await T.tourner();
  assert.equal(T.tache(r.id).etat, 'en_attente', 'réessaiera plus tard');
  assert.equal(T.tache(r.id).erreur, 'panne');
  assert.equal(essais, 1);

  // Une tâche restée « en cours » (serveur arrêté) repart.
  const c = T.enfiler('essai', { n: 3 });
  const db = (await import('./db.js')).default;
  db.prepare("UPDATE layer_taches SET etat = 'en_cours' WHERE id = ?").run(c.id);
  assert.equal(T.reprendre(), 1);
  await T.tourner();
  assert.equal(T.tache(c.id).etat, 'faite');
  assert.ok(faits.includes(3));
});
