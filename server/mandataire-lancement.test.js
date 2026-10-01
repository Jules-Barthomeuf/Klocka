import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lancement-'));
process.env.MONDAY_TOKEN = '';
const { Records } = await import('./db.js');
const L = await import('./mandataire-lancement.js');

const MOI = { email: 'marc@kpartners.fr', role: 'mandataire' };
const AUTRE = { email: 'lea@kpartners.fr', role: 'mandataire' };

test('les activités de plusieurs clients, et le filtre des commerces', () => {
  assert.deepEqual(L.activitesDe([{ type_commerce: 'boulangerie' }, { type_commerce: 'pharmacie' }, { type_commerce: 'boulangerie' }]), ['boulangerie', 'pharmacie']);
  assert.deepEqual(L.activitesDe([{ type_commerce: 'boulangerie' }, { type_commerce: null }]), [], 'un client sans type : tous les commerces');
  const c = { activite: 'Boulangerie-pâtisserie', emplacement: 1, pile: 'surveiller' };
  assert.equal(L.cibleCorrespond(c, { activites: ['boulangeries'] }), true);
  assert.equal(L.cibleCorrespond(c, { activites: ['pharmacie'] }), false);
  assert.equal(L.cibleCorrespond(c, { activites: ['pharmacie', 'boulangerie'] }), true);
  assert.equal(L.cibleCorrespond(c, { emplacement: 2 }), false);
  assert.equal(L.cibleCorrespond({ ...c, pile: 'ecartee' }, {}), false);
});

test("l'état d'une prospection : les commerces de la ville, à soi seulement", async () => {
  const v = Records.create('Ville', { nom: 'Lyon', centre: { lat: 45.76, lon: 4.83 }, rues: [{ nom: 'rue de la République', classe: 1, trace: [[[45.76, 4.83], [45.761, 4.834]]] }], parcours: { etat: 'en_cours', phase: 'commerces', rue_en_cours: 'rue de la République' } });
  const a = Records.create('Cible', { ville_id: v.id, ville: 'Lyon', enseigne: 'Maison Pain', activite: 'Boulangerie', emplacement: 1, pile: 'surveiller', adresse: '12 rue de la République' });
  Records.create('Cible', { ville_id: v.id, ville: 'Lyon', enseigne: 'Pharmacie X', activite: 'Pharmacie', emplacement: 1, pile: 'surveiller' });
  const pr = Records.create('ProspectionMandataire', { mandataire_email: MOI.email, nom: 'Boulangerie Lyon', criteres: { activites: ['boulangerie'], emplacement: null, ville: 'Lyon' }, ville_id: v.id, cree_le: new Date().toISOString() });
  const e = await L.etatProspection(pr.id, MOI);
  assert.equal(e.ok, true);
  assert.deepEqual(e.resultats.map((r) => r.enseigne), ['Maison Pain']);
  assert.equal(e.parcours.rue_en_cours, 'rue de la République');
  assert.equal(e.ville.rues[0].classe, 1);
  assert.equal((await L.etatProspection(pr.id, AUTRE)).ok, false, "jamais la prospection d'un autre");

  // Exporter : une nouvelle liste, puis la même liste ; les doublons sont refusés.
  const x = await L.exporter({ nom: 'Boulangeries Presqu’île', prospection_id: pr.id, cible_ids: [a.id] }, MOI);
  assert.equal(x.ajoutes, 1);
  const y = await L.exporter({ liste_id: x.liste.id, cible_ids: [a.id] }, MOI);
  assert.equal(y.ajoutes, 0);
  assert.equal(y.refuses.length, 1);
  assert.equal((await L.exporter({ cible_ids: [a.id] }, MOI)).ok, false, 'une nouvelle liste a un nom');
  const listes = L.mesListes(MOI);
  assert.equal(listes[0].total, 1);
  assert.equal(listes[0].a_appeler, 1);
  assert.equal(L.mesListes(AUTRE).length, 0);
  assert.equal((await L.etatProspection(pr.id, MOI)).resultats[0].statut.cle, 'ma_liste');
  assert.equal(L.renommerListe(x.liste.id, 'Lyon 2e', MOI).liste.nom, 'Lyon 2e');
  assert.equal(L.supprimerListe(x.liste.id, AUTRE).ok, false);
  assert.equal(L.supprimerListe(x.liste.id, MOI).ok, true);
  assert.equal(Records.list('ProprietaireMandataire').length, 1, 'la fiche reste, sans liste');
});
