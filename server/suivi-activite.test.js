import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-suivi-activite-'));
const { suiviActivite } = await import('./suivi-activite.js');

const maintenant = new Date('2026-11-02T12:00:00Z');
const T = 'thomas@kpartners.fr';
const tables = {
  users: [{ email: T, role: 'mandataire', full_name: 'Thomas' }],
  proprietaires: [
    { id: 'p1', mandataire_email: T, statut: 'a_appeler', historique: [] },
    { id: 'p2', mandataire_email: T, statut: 'contacte', historique: [] },
    { id: 'p3', mandataire_email: T, commerce: 'Boulangerie', ville: 'Lyon', statut: 'rdv_pris', historique: [{ le: '2026-10-20T09:00:00Z', type: 'statut', texte: 'RDV pris (2026-10-22T10:00:00)' }] },
    { id: 'p4', mandataire_email: T, commerce: 'Tabac', ville: 'Lyon', statut: 'rdv_pris', biens: { perdu: { motif: 'prix' } }, historique: [{ le: '2026-10-25T09:00:00Z', type: 'statut', texte: 'RDV pris' }] },
    { id: 'p5', mandataire_email: T, commerce: 'Essai', statut: 'rdv_pris', test: true, historique: [{ le: '2026-10-25T09:00:00Z', type: 'statut', texte: 'RDV pris' }] },
  ],
  estimations: [
    { id: 'e3', mandataire_email: T, proprietaire_id: 'p3', statut: 'envoye', cree_le: '2026-10-22T10:00:00Z', envoye_le: '2026-10-24T10:00:00Z' },
    { id: 'e9', mandataire_email: T, exemple: true, statut: 'envoye', envoye_le: '2026-10-24T10:00:00Z' },
  ],
  mandats: [
    { id: 'm3', mandataire_email: T, estimation_id: 'e3', statut: 'signe', signe_le: '2026-10-30T10:00:00Z', prix: 400000, honoraires: 5 },
    { id: 'm7', mandataire_email: T, bien: 'Ancien', statut: 'enregistre', cree_le: '2026-09-01T00:00:00Z', updated_date: '2026-09-10T00:00:00Z', prix: 240000, honoraires: 14400 },
  ],
  dossiers: [],
  marches: [],
};

test("l'activité : les gestes de la période, le parcours, le portefeuille, sans les essais ni les exemples", () => {
  const r = suiviActivite({ jours: 30, maintenant, tables });
  const g = Object.fromEntries(r.gestes.map((x) => [x.cle, x.n]));
  assert.deepEqual(g, { prospectes: 2, visites: 1, mandats: 1, offres: 0, ventes: 0 });
  assert.equal(r.gestes.find((x) => x.cle === 'mandats').avant, 1);
  const n = Object.fromEntries(r.parcours.map((x) => [x.cle, x.n]));
  assert.equal(n.a_appeler, 1);
  assert.equal(n.contactes, 1);
  // Le mandat signé de p3 et l'ancien mandat : deux biens en Commercialisation ; le tabac perdu n'y est pas.
  assert.equal(n.marche, 2);
  assert.equal(r.parcours.find((x) => x.cle === 'marche').arretes, 1);
  assert.deepEqual(r.perdus, [{ motif: 'prix', n: 1 }]);
  // 5 % de 400 000 et 14 400 € écrits en euros.
  assert.deepEqual(r.portefeuille, { mandats: 2, valeur: 640000, honoraires: 34400, sans_prix: 0 });
  assert.equal(r.delais[0].jours, 4);
  assert.equal(r.delais[1].jours, 6);
  assert.equal(r.ecartes, 1);
  assert.equal(r.mandataires[0].nom, 'Thomas');
  assert.equal(r.mandataires[0].prospects, 2);
  assert.equal(r.par_jour.length, 30);
});
