import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-murs-'));
const M = await import('./ktransactions-murs.js');

const vente = (o) => ({ id: Math.random().toString(36), date: '2024-05-01', prix: 100000, surface: 50, prix_m2: 2000, parcelle: '06088000AB0001', lots: 1, adresse: '12 RUE D ANTIBES', lat: 43.55, lon: 7.01, ...o });

test('les prix hors du 5e–95e centile de la commune sont écartés', () => {
  const ventes = [...Array.from({ length: 18 }, (_, i) => vente({ prix_m2: 2000 + i * 100 })), vente({ prix_m2: 90 }), vente({ prix_m2: 99000 })];
  const r = M.sansAberrants(ventes);
  assert.equal(r.ecartees, 2);
  assert.ok(!r.ventes.some((v) => v.prix_m2 === 90 || v.prix_m2 === 99000));
  assert.equal(M.sansAberrants(ventes.slice(0, 5)).ecartees, 0);
});

test('les cercles : la parcelle, puis la rue, puis la commune, au premier qui réunit 5 ventes', () => {
  const ventes = [
    ...Array.from({ length: 2 }, () => vente({})),
    ...Array.from({ length: 4 }, () => vente({ parcelle: 'AUTRE', adresse: "8 rue d'Antibes" })),
    ...Array.from({ length: 10 }, () => vente({ parcelle: 'X', adresse: '3 BD CARNOT' })),
  ];
  const local = { parcelle: '06088000AB0001', rue: "Rue d'Antibes", code_iris: null };
  const r = M.choisirCercle(ventes, local);
  assert.equal(r.cercle, 'rue');
  assert.equal(r.ventes.length, 6);
  assert.deepEqual(r.essais.map((e) => [e.cercle, e.n]), [['parcelle', 2], ['rue', 6]]);
  assert.equal(M.choisirCercle(ventes, { parcelle: null, rue: 'rue inconnue' }).cercle, 'commune');
});

test("l'IRIS sert quand la rue ne suffit pas", () => {
  const ventes = Array.from({ length: 6 }, (_, i) => vente({ parcelle: 'X', adresse: `${i} AV FOCH`, lat: 43 + i }));
  const r = M.choisirCercle(ventes, { parcelle: null, rue: 'rue absente', code_iris: '060880101' }, () => '060880101');
  assert.equal(r.cercle, 'iris');
});

test('le résumé : quartiles à partir de 5 ventes, médiane par année ; la dernière vente de la parcelle', () => {
  const ventes = [1000, 2000, 3000, 4000, 5000].map((p, i) => vente({ prix_m2: p, date: `202${i}-03-01` }));
  const r = M.resumer(ventes);
  assert.deepEqual(r.prix_m2, { bas: 2000, median: 3000, haut: 4000 });
  assert.equal(r.par_annee.length, 5);
  assert.equal(M.resumer(ventes.slice(0, 4)).prix_m2, null);
  assert.equal(M.derniereVente(ventes, '06088000AB0001').date, '2024-03-01');
  assert.equal(M.derniereVente(ventes, null), null);
});

test('un projet Klocka signé devient une vente comparable ; sans prix, surface ou point, rien', () => {
  const v = M.venteKlocka({ id: 'p1', statut: 'signe', sim_prix_bien_negocie: 300000, surface_m2: 100, latitude: 43.7, longitude: 7.2, adresse_complete: '5 rue de France, 06000 Nice', signe_le: '2026-06-01T10:00:00Z' });
  assert.deepEqual([v.prix_m2, v.source, v.date], [3000, 'klocka', '2026-06-01']);
  assert.equal(M.venteKlocka({ id: 'p2', prix_acquisition: 1, surface_m2: 0, latitude: 1, longitude: 1 }), null);
  assert.equal(M.rueDe('5 rue de France, 06000 Nice'), M.rueDe('5 RUE DE FRANCE'));
});
