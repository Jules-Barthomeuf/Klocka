import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-regrouper-'));
const { Records } = await import('../db.js');
const { regrouperDossiers, nomDuRegroupement } = await import('./regrouper.js');

const lot = (prix) => ({ index: 0, lot: { prix_fai: { valeur: prix }, adresse: { valeur: { rue: '30 rue de Cheverus', ville: 'Bordeaux' } } } });

test('le nom réunit les têtes et garde la ville commune', () => {
  assert.equal(nomDuRegroupement(['Disquaire - Bordeaux', 'Coiffeur - Bordeaux']), 'Disquaire + Coiffeur - Bordeaux');
  assert.equal(nomDuRegroupement(['Tabac - Mâcon', 'Ben']), 'Tabac + Ben');
});

test('deux dossiers deviennent un dossier à deux lots, les originaux archivés avec leurs mails déplacés', () => {
  Records.create('Deal', { deal_id: 'a', nom: 'Disquaire - Bordeaux', lots: [lot(230000)], responsables: ['Jules'], archived: false });
  Records.create('Deal', { deal_id: 'b', nom: 'Coiffeur - Bordeaux', lots: [lot(265000)], responsables: ['Nora'], archived: false });
  Records.create('MailRecu', { deal_id: 'b', objet: 'Bail' });
  const r = regrouperDossiers(['a', 'b'], { user: { email: 'jules.b@klocka.immo' } });
  assert.equal(r.ok, true);
  assert.equal(r.nom, 'Disquaire + Coiffeur - Bordeaux');
  assert.equal(r.prix_total, 495000);
  const n = Records.findBy('Deal', 'deal_id', r.deal_id);
  assert.equal(n.lots.length, 2);
  assert.deepEqual(n.lots.map((l) => l.index), [0, 1]);
  assert.equal(n.multi_lots, true);
  assert.deepEqual(n.responsables, ['Jules', 'Nora']);
  for (const id of ['a', 'b']) {
    const d = Records.findBy('Deal', 'deal_id', id);
    assert.equal(d.archived, true);
    assert.equal(d.regroupe_dans.deal_id, r.deal_id);
  }
  assert.equal(Records.list('MailRecu')[0].deal_id, r.deal_id);
});

test('refuse un seul dossier, un dossier inconnu ou un projet', () => {
  assert.equal(regrouperDossiers(['a']).ok, false);
  assert.equal(regrouperDossiers(['a', 'zz']).ok, false);
  Records.create('Deal', { deal_id: 'p', nom: 'Projet', projet_id: 'x', lots: [] });
  assert.equal(regrouperDossiers(['a', 'p']).ok, false);
});
