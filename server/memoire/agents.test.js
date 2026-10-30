import test from 'node:test';
import assert from 'node:assert/strict';
import { chiffresAgent, biensDe, ligneAgent } from './agents.js';
import { referencesMemoire, prixMemoire } from './comparables.js';

const biens = [
  { id: 'a', agent_email: 'theo@quorner.com', ville: 'Nice', loyer_annuel: 24000, prix: 300000, surface_m2: 80, adresse: { rue: '1 rue A', code_postal: '06000', ville: 'Nice' }, recu_le: '2026-02-01T00:00:00.000Z', statut: 'memoire', deal_id: null },
  { id: 'b', agent_email: 'theo@quorner.com', ville: 'Antibes', loyer_annuel: 36000, prix: 500000, surface_m2: 120, adresse: { rue: '2 rue B', code_postal: '06600', ville: 'Antibes' }, recu_le: '2026-10-03T00:00:00.000Z', statut: 'dossier', deal_id: 'd-1' },
  { id: 'c', agent_email: 'autre@x.fr', ville: 'Lyon', loyer_annuel: 18000, prix: null, surface_m2: 50, adresse: { rue: '3 rue C', code_postal: '69002', ville: 'Lyon' }, recu_le: '2026-05-01T00:00:00.000Z', statut: 'memoire' },
];

test('chiffresAgent : nombre, villes, fourchettes, dernier envoi, part retenue', () => {
  const c = chiffresAgent(biensDe(biens, ['Theo@Quorner.com']));
  assert.equal(c.nb_fiches, 2);
  assert.deepEqual(c.villes, ['Nice', 'Antibes']);
  assert.deepEqual(c.loyers, { min: 24000, mediane: 30000, max: 36000, n: 2 });
  assert.equal(c.dernier_envoi, '2026-10-03T00:00:00.000Z');
  assert.equal(c.retenus, 1);
  assert.equal(c.taux_retenu, 0.5);
  assert.match(ligneAgent(c), /2 fiches · Nice, Antibes · loyers 24 k€ à 36 k€ · prix 300 k€ à 500 k€ · dernier envoi le 3 oct\. 2026 · 1 retenue/);
  assert.equal(ligneAgent(chiffresAgent([])), null);
});

test('referencesMemoire : la forme de referencesKlocka, poids fiche, sans les lignes « dossier »', () => {
  const refs = referencesMemoire(biens);
  assert.equal(refs.length, 2, 'la ligne dossier est déjà comptée par le dossier');
  const r = refs[0];
  assert.equal(r.source, 'klocka_fiche');
  assert.equal(r.origine, 'annonce');
  assert.equal(r.loyer_m2, 300);
  assert.equal(r.departement, '06');
  assert.equal(r.adresse.ligne, '1 rue A 06000 Nice');
  assert.equal(r.le, '2026-02-01T00:00:00.000Z');
  assert.equal(prixMemoire(biens).length, 1);
  assert.equal(prixMemoire(biens)[0].prix_m2, 3750);
});
