// La note d'une ligne de la fiche du bien, réécrite à la main puis rendue au calcul.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-notes-'));
const { Records } = await import('../db.js');
const { noterLigne } = await import('./index.js');

test('une note écrite à la main remplace la calculée, et se vide pour y revenir', () => {
  Records.create('Deal', { deal_id: 'n1', lots: [{ lot: { prix_fai: { valeur: 520000, citation: 'Net vendeur' }, honoraires_inclus: { valeur: false } }, evaluation: { grille: [] } }] });
  const r = noterLigne('n1', 0, 'prix', '  Honoraires 5 % confirmés par l\'agent au téléphone.  ', { email: 'jules.b@klocka.immo' });
  assert.equal(r.lot.notes_manuelles.prix.texte, 'Honoraires 5 % confirmés par l\'agent au téléphone.');
  assert.equal(r.lot.notes_manuelles.prix.par, 'jules.b@klocka.immo');
  assert.ok(r.lot.notes.prix.textes.length, 'la note calculée reste calculée à côté');
  const vide = noterLigne('n1', 0, 'prix', '', null);
  assert.equal(vide.lot.notes_manuelles.prix, undefined);
  assert.equal(noterLigne('n1', 0, 'nimporte', 'x', null).error, 'Ligne inconnue');
});
