import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ecarter-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const E = await import('./ecarter-agences.js');
const MA = await import('./mode-appel.js');

test('une règle : des mots au début d’un mot, une spécialité, et jamais une agence intéressée ou à rappeler', () => {
  const r = { id: 'r1', mots: ['promot'], specialite: null };
  assert.ok(E.regleReconnait(r, { nom: 'Nexity Promotion Côte d’Azur' }));
  assert.ok(!E.regleReconnait(r, { nom: 'Compromotion' }), 'au début d’un mot seulement');
  assert.ok(E.regleReconnait({ mots: [], specialite: 'residentiel' }, { nom: 'X', pertinence: { specialite: 'residentiel' } }));
  const { gardees, ecartees } = E.trier([
    { id: 'a', nom: 'Promotion Riviera' },
    { id: 'b', nom: 'Promotion Azur', statut: { interessee: true } },
    { id: 'c', nom: 'Cabinet commerces' },
  ], [r]);
  assert.deepEqual(gardees.map((x) => x.id), ['b', 'c']);
  assert.deepEqual(ecartees, [{ id: 'a', regle_id: 'r1' }]);
});

test('la règle proposée ne garde que ce qui est sur la carte ; un cas isolé ne fait rien', () => {
  const agence = { nom: 'Riviera Promotion', site: 'https://www.riviera-promotion.fr' };
  assert.deepEqual(E.regleSure({ regle: true, libelle: 'Promoteurs', mots: ['promot', 'lotisseur', 'imm'], specialite: 'aucune' }, agence, 'generaliste'), { libelle: 'Promoteurs', mots: ['promot'], specialite: null });
  assert.equal(E.regleSure({ regle: true, libelle: 'Syndics', mots: ['syndic'], specialite: null }, agence, 'generaliste'), null, 'aucun mot sur la carte');
  assert.equal(E.regleSure({ regle: false, libelle: 'x', mots: ['promot'] }, agence, null), null);
});

test('supprimer : la carte sort, la règle naît et écarte les cartes du même genre, « Annuler » rend tout', async () => {
  const l = Records.create('ListeAgences', { ville: 'Nice' });
  const cible = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Riviera Promotion', telephone: '04 93 00 00 01' });
  const autre = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Azur Promotion Immobilière', telephone: '04 93 00 00 02' });
  for (let i = 0; i < 6; i += 1) Records.create('AgenceProspect', { liste_id: l.id, nom: `Cabinet Commerces ${i}`, telephone: `04 93 00 01 0${i}` });
  const lire = async (prompt) => { assert.match(prompt, /que des promoteurs/); return { regle: true, libelle: 'Promoteurs immobiliers', mots: ['promot'], specialite: 'aucune' }; };
  const r = await MA.supprimer(cible.id, 'que des promoteurs', { email: 'maxime@klocka.immo' }, { lire });
  assert.equal(r.ok, true);
  assert.equal(r.regle.libelle, 'Promoteurs immobiliers');
  assert.equal(r.ecartees, 1, 'Azur Promotion');
  assert.equal(Records.get('AgenceProspect', cible.id).supprimee.pourquoi, 'que des promoteurs');
  const file = MA.fileDAppel(l.id, { email: 'nora.l@klocka.immo' });
  assert.ok(!file.file.some((x) => x.id === cible.id || x.id === autre.id));
  assert.equal(file.ecartees.n, 1);
  assert.deepEqual(file.ecartees.regles.map((x) => x.libelle), ['Promoteurs immobiliers']);

  assert.equal(E.annulerSuppression(cible.id, r.regle.id, { email: 'maxime@klocka.immo' }).ok, true);
  const apres = MA.fileDAppel(l.id, { email: 'nora.l@klocka.immo' });
  assert.ok(apres.file.some((x) => x.id === cible.id) && apres.file.some((x) => x.id === autre.id), 'la carte revient, la règle née ici s’éteint');
});

test('un cas isolé supprime la carte sans règle ; sans pourquoi, rien ne se passe', async () => {
  const l = Records.create('ListeAgences', { ville: 'Cannes' });
  const a = Records.create('AgenceProspect', { liste_id: l.id, nom: 'Agence du Port' });
  assert.equal((await MA.supprimer(a.id, '  ', { email: 'maxime@klocka.immo' })).ok, false);
  const r = await MA.supprimer(a.id, 'numéro faux', { email: 'maxime@klocka.immo' }, { lire: async () => ({ regle: false, libelle: '', mots: [], specialite: 'aucune' }) });
  assert.equal(r.ok, true);
  assert.equal(r.regle, null);
  assert.equal(Records.get('AgenceProspect', a.id).hors_cible, true);
});
