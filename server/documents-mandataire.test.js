import test from 'node:test';
import assert from 'node:assert/strict';
import { documentsDuMandataire } from './documents-mandataire.js';

test('les documents du mandataire, le plus récent en tête, sans exemple ni nom de client (2 nov. 2026, Jules)', () => {
  const docs = documentsDuMandataire({
    mandats: [{ id: 'm1', bien: 'Boulangerie Masséna', statut: 'demande_envoyee', a_relire: { url: '/u/r.pdf', le: '2026-11-01T10:00:00Z' }, vendeur: 'M. Bernard' }, { id: 'mx', exemple: true, statut: 'signe' }],
    estimations: [{ id: 'e1', bien: 'Boulangerie Masséna', statut: 'envoye', envoye_le: '2026-10-28T10:00:00Z', avis: { chiffres: { valeur: 400000 } } }, { id: 'e2', bien: 'Sans avis' }],
    proprietaires: [{ id: 'p1', commerce: 'Fleuriste', ville: 'Nice', biens: { compte_rendu: { le: '2026-10-20T10:00:00Z', texte: 'Visite faite.' } } }],
    marches: [{ id: 'k1', bien: 'Pharmacie', teaser: { compose_le: '2026-11-02T08:00:00Z' }, offres: [{ id: 'o1', montant: 1250000, validee_le: '2026-11-02T09:00:00Z' }] }],
  });
  assert.deepEqual(docs.map((d) => d.type), ['offre', 'teaser', 'mandat', 'avis', 'compte_rendu']);
  assert.equal(docs.find((d) => d.type === 'mandat').detail, 'À relire · M. Bernard');
  assert.equal(docs.find((d) => d.type === 'mandat').pdf, '/u/r.pdf');
  assert.match(docs.find((d) => d.type === 'avis').detail, /400 k€ · envoyé au propriétaire/);
  assert.match(docs.find((d) => d.type === 'offre').detail, /1,3 M€/);
  assert.equal(docs.find((d) => d.type === 'compte_rendu').lien, '/Biens?bien=proprietaire%3Ap1&etape=previsite');
});
