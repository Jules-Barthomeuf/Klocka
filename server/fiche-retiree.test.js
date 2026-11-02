// Un commerce retiré d'une liste revient avec la flèche de retour (1er nov. 2026, Jules).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-retiree-'));
const { Records } = await import('./db.js');
const E = await import('./mandataire-espace.js');

const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };

test('retirée puis restaurée : même identifiant, même historique, ses relances', () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: lea.email, commerce: 'Boulangerie du Port', statut: 'contacte', historique: [{ le: '2026-10-01', texte: 'Appelé' }] });
  Records.create('Rappel', { proprietaire_id: p.id, quoi: 'Rappeler', espace: 'mandataire', cree_par: lea.email });
  assert.equal(E.supprimerProprietaire(p.id, lea).ok, true);
  assert.equal(Records.get('ProprietaireMandataire', p.id), null);
  assert.equal(Records.list('Rappel').length, 0);
  assert.equal(E.restaurerProprietaire(p.id, { email: 'autre@kpartners.fr', role: 'mandataire' }).ok, false, 'pas celle d’un autre');
  assert.equal(E.restaurerProprietaire(p.id, lea).ok, true);
  const r = Records.get('ProprietaireMandataire', p.id);
  assert.equal(r.commerce, 'Boulangerie du Port');
  assert.equal(r.historique.length, 1);
  assert.equal(Records.list('Rappel').filter((x) => x.proprietaire_id === p.id).length, 1);
  assert.equal(E.restaurerProprietaire(p.id, lea).ok, false, 'une seule fois');
});
