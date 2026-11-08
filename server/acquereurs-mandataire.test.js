// Les candidats locataires et le bail signé (6 nov. 2026, Jules : « adapter tout le système à la location »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-acquereurs-'));
const { Records } = await import('./db.js');
const A = await import('./acquereurs-mandataire.js');
const F = await import('./fiche-mandataire.js');
const { statutDuBien, etapesFaites } = await import('../src/lib/biens-mandataire.js');

const user = { email: 'm@kpartners.fr', role: 'mandataire' };

test('le bail signé : le candidat au bail signé, sinon à l’accord ; son loyer accepté, sinon le loyer demandé', () => {
  const p = { biens: { repris: { loyer_annuel: 13200 } } };
  assert.deepEqual(A.bailSigneDe(p, { candidats: [{ nom: 'X', statut_touche: 'visite' }, { nom: 'Sofia', statut_touche: 'accord' }], le: '2026-11-06' }), { le: '2026-11-06', locataire: 'Sofia', loyer_annuel: 13200 });
  assert.equal(A.bailSigneDe(p, { candidat: { nom: 'Léo', budget_max: 12000 } }).loyer_annuel, 12000);
  assert.ok(A.estCandidat({ role: 'locataire' }));
  assert.ok(A.estCandidat({}, { biens: { transaction: 'location' } }));
  assert.ok(!A.estCandidat({}, { biens: {} }));
});

test('valider le Bail signé d’une location : le bien est loué ; replacer une étape le remet en location ; une vente ne change pas', () => {
  const p = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Local', statut: 'mandat_signe', biens: { transaction: 'location', validee: 'offre', repris: { loyer_annuel: 13200 } } });
  Records.create('AcquereurMandataire', { mandataire_email: user.email, nom: 'Sofia Lemaire', proprietaire_id: p.id, role: 'locataire', statut_touche: 'accord' });
  const v = F.validerEtape(p.id, 'vente', user);
  assert.ok(v.ok);
  assert.equal(v.proprietaire.biens.loue.locataire, 'Sofia Lemaire');
  assert.equal(v.proprietaire.biens.loue.loyer_annuel, 13200);
  assert.equal(statutDuBien({ proprietaire: v.proprietaire }), 'Loué');
  const r = F.placerEtape(p.id, 'marche', user);
  assert.equal(r.proprietaire.biens.loue, undefined);
  assert.ok(!etapesFaites({ proprietaire: r.proprietaire }).has('vente'));
  const vente = Records.create('ProprietaireMandataire', { mandataire_email: user.email, commerce: 'Murs', statut: 'mandat_signe', biens: { validee: 'offre' } });
  assert.equal(F.validerEtape(vente.id, 'vente', user).proprietaire.biens.loue, undefined);
});
