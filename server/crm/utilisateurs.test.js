// Les comptes de Klocka, tableau du CRM (6 nov. 2026).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-crm-utilisateurs-'));
const U = await import('./utilisateurs.js');

const comptes = [
  { id: '1', email: 'Jean@x.fr', full_name: 'Jean', role: 'user', etape_actuelle: 0, created_date: '2026-10-01' },
  { id: '2', email: 'lea@x.fr', full_name: 'Léa', role: 'user', etape_actuelle: 3, created_date: '2026-10-03' },
  { id: '3', email: 'paul@kp.fr', full_name: 'Paul', role: 'mandataire', created_date: '2026-10-02' },
  { id: '4', email: 'jules@klocka.immo', full_name: 'Jules', role: 'admin', aussi_mandataire: true, created_date: '2026-09-01' },
];
const secteurs = [{ mandataire_email: 'paul@kp.fr', villes_seules: true, villes_choisies: [{ nom: 'Lyon' }, { nom: 'Villeurbanne' }] }];
const lignes = comptes.map((u) => U.ligne(u, secteurs));

test('une ligne : type, statut, rôles, étape, villes', () => {
  assert.deepEqual(lignes.map((l) => [l.type, l.statut, l.admin, l.mandataire]), [['CLIENT', 'EN_ATTENTE', false, false], ['CLIENT', 'EN_COURS', false, false], ['MANDATAIRE', 'EN_COURS', false, true], ['EQUIPE', 'EN_COURS', true, true]]);
  assert.equal(lignes[1].etape, '3');
  assert.equal(lignes[2].villes, 'Lyon, Villeurbanne');
  assert.equal(lignes[0].email, 'jean@x.fr');
});

test('les vues, la recherche et le tri', () => {
  const o = U.objet();
  const vue = (id) => o.vues.find((v) => v.id === id).filtres;
  assert.deepEqual(U.choisir(lignes, { filtres: vue('u-en-attente') }).map((l) => l.name), ['Jean']);
  assert.deepEqual(U.choisir(lignes, { filtres: vue('u-mandataires') }).map((l) => l.name), ['Paul', 'Jules']);
  assert.deepEqual(U.choisir(lignes, { q: 'villeur' }).map((l) => l.name), ['Paul']);
  assert.deepEqual(U.choisir(lignes).map((l) => l.name), ['Léa', 'Paul', 'Jean', 'Jules'], 'les plus récents d\'abord');
  assert.deepEqual(U.choisir(lignes, { tri: 'name', sens: 'asc' }).map((l) => l.name), ['Jean', 'Jules', 'Léa', 'Paul']);
});

test('les rôles ne se cochent que pour un super administrateur', () => {
  assert.equal(U.objet().champs.find((c) => c.nom === 'admin').modifiable, false);
  assert.equal(U.objet({ superAdmin: true }).champs.find((c) => c.nom === 'admin').modifiable, true);
});
