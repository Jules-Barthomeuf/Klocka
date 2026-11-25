// La sauvegarde de Monday dans la plateforme (25 nov. 2026, Jules : « pour couper Monday une fois pour toutes »).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-sauvegarde-monday-'));
const S = await import('./sauvegarde-monday.js');
const { Records } = await import('../db.js');

const brut = { id: 42, name: 'Clients', workspace: { name: 'KLOCKA PRINCIPAL' }, columns: [{ id: 'name', title: 'Nom', type: 'name' }, { id: 'email', title: 'E-mail', type: 'email' }, { id: 'status1', title: 'Statut', type: 'status' }], groups: [{ title: 'Clients signés', position: '2' }, { title: 'Clients en cours', position: '1' }] };
const elements = [
  { id: 1, name: 'Rachel PEYRABOUT', group: { title: 'Clients en cours' }, created_at: '2026-03-01T10:00:00Z', creator: { name: 'Paul' }, column_values: [{ id: 'email', text: 'r@x.fr' }, { id: 'status1', text: 'Compromis' }, { id: 'vide', text: '' }], assets: [{ id: 9, name: 'Mandat signé.pdf' }] },
  { id: 2, name: 'Louis; "VIDAL"', group: { title: 'Clients signés' }, column_values: [] },
];
const fil = [{ item_id: 1, created_at: '2026-03-02T09:00:00Z', creator: { name: 'Paul' }, text_body: 'Premier appel', replies: [{ text_body: 'ok', creator: { name: 'Jules' } }], assets: [] }];

test('un tableau Monday se garde compact : colonnes, groupes dans l’ordre, valeurs lisibles, fichiers, fil', () => {
  const t = S.compacter(brut, elements, fil);
  assert.deepEqual(t.colonnes.map((c) => c.titre), ['E-mail', 'Statut'], 'la colonne du nom n’est pas répétée');
  assert.deepEqual(t.groupes, ['Clients en cours', 'Clients signés']);
  assert.deepEqual(t.elements[0].valeurs, { email: 'r@x.fr', status1: 'Compromis' }, 'les cases vides ne se gardent pas');
  assert.equal(t.elements[0].fichiers[0].chemin, '9-Mandat signé.pdf');
  assert.equal(t.fil[0].reponses[0].par, 'Jules');
});

test('gardé une fois par tableau, remplacé à la sauvegarde suivante ; le CSV s’ouvre dans Excel', () => {
  S.garderTableau(S.compacter(brut, elements, fil), '2026-11-25T10:00:00Z');
  S.garderTableau(S.compacter(brut, elements.slice(0, 1), fil), '2026-11-26T10:00:00Z');
  const gardes = Records.filter(S.ENTITE, { tableau_id: '42' });
  assert.equal(gardes.length, 1);
  assert.equal(gardes[0].n_elements, 1);
  assert.equal(gardes[0].n_fichiers, 1);
  const csv = S.csvDuTableau(S.compacter(brut, elements, fil));
  assert.ok(csv.startsWith('﻿Nom;Groupe;E-mail;Statut'));
  assert.match(csv, /"Louis; ""VIDAL"""/);
  assert.match(csv, /2026-03-02 Paul : Premier appel/);
  assert.equal(S.cheminFichier('../../etc/passwd'), null, 'rien hors du dossier de la sauvegarde');
});

test('les fiches écrites par les tests dans le vrai Monday (6-25 nov. 2026) ne se gardent pas', () => {
  const t = S.compacter(brut, [...elements, { id: 7, name: 'SCI Quai', created_at: '2026-11-15T08:00:00Z', column_values: [] }, { id: 8, name: 'SCI Quai', created_at: '2026-10-01T08:00:00Z', column_values: [] }], [...fil, { item_id: 7, text_body: 'test' }]);
  assert.deepEqual(t.elements.map((e) => e.id), ['1', '2', '8'], 'avant le 6 nov., le même nom est une vraie fiche');
  assert.equal(t.fil.length, 1);
});
