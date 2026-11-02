import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-fiche-du-bien-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('./db.js');
const F = await import('./fiche-du-bien.js');
const P = await import('./mandataire-portes.js');
const lea = { email: 'lea@kpartners.fr', role: 'mandataire' };
const attendre = () => new Promise((r) => setTimeout(r, 200));

test('le même local : même rue et numéro, même ville quand on la connaît', () => {
  assert.equal(F.rueDe('64 Rue Waldeck-Rousseau, 69006 Lyon'), '64 rue waldeck rousseau');
  assert.equal(F.villeDe('64 Rue Waldeck-Rousseau, 69006 Lyon'), 'lyon');
  const fiches = [{ id: 'a', adresse: '64 rue Waldeck Rousseau', ville: 'Lyon' }, { id: 'b', adresse: '64 rue Waldeck Rousseau', ville: 'Caluire' }];
  assert.equal(F.memeLocal(fiches, { adresse: '64 Rue Waldeck-Rousseau, Lyon' })?.id, 'a');
  assert.equal(F.memeLocal(fiches, { adresse: '66 Rue Waldeck-Rousseau, Lyon' }), null, 'un autre numéro, un autre local');
  assert.equal(F.memeLocal(fiches, { adresse: 'Rue Waldeck-Rousseau, Lyon' }), null, 'sans numéro, on ne devine pas');
});

test('un avis tapé dans le chat a toujours sa fiche : retrouvée, sinon créée (2 nov. 2026, Jules)', async () => {
  const d = Records.create('ProprietaireMandataire', { mandataire_email: lea.email, commerce: 'Mango Bang', adresse: '64 rue Waldeck Rousseau', ville: 'Lyon' });
  const e1 = P.creerEstimation({ bien: 'Murs Mango', adresse: '64 Rue Waldeck-Rousseau, Lyon' }, lea).estimation;
  await attendre();
  assert.equal(Records.get('EstimationMandataire', e1.id).proprietaire_id, d.id, 'la fiche du local est reprise');
  const avant = Records.list('ProprietaireMandataire').length;
  const e2 = P.creerEstimation({ bien: 'Boulangerie', adresse: '14 rue du Marché, Annecy' }, lea).estimation;
  await attendre();
  const pid = Records.get('EstimationMandataire', e2.id).proprietaire_id;
  assert.ok(pid);
  assert.equal(Records.list('ProprietaireMandataire').length, avant + 1);
  const p = Records.get('ProprietaireMandataire', pid);
  assert.equal(p.mandataire_email, lea.email);
  assert.equal(p.adresse, '14 rue du Marché');
  assert.equal(p.ville, 'Annecy');
});

test('un mandat sans avis a aussi sa fiche, par l’adresse du bien', async () => {
  const m = Records.create('MandatMandataire', { mandataire_email: lea.email, bien: 'Fleuriste', statut: 'brouillon', questionnaire: { bien_adresse: '3 place Bellecour, Lyon', vendeur_societe: 'SCI Fleur' } });
  const pid = await F.ficheDuMandat(m.id, lea);
  assert.ok(pid);
  assert.equal(Records.get('MandatMandataire', m.id).proprietaire_id, pid);
  assert.equal(Records.get('ProprietaireMandataire', pid).nom, 'SCI Fleur');
});
