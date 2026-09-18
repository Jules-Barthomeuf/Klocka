// La feuille de route : le plan cumulé, sa projection, et le débit d'une page
// ouverte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lm-'));
const { calculerRoadmap, lienSimulateur, tropDeDemandes, avecDelai, SURFACES, RENDEMENT_CIBLE, PART_CASH_FLOW } = await import('./leadmagnet.js');

const plan = (p = {}) => calculerRoadmap({ objectif_mensuel: 3000, fonds_propres: 80000, revenus_annuels: 60000, horizon_ans: 25, prix_m2: 2500, ...p });

test('les acquisitions sont typées, de prix différents, et montent en gamme', () => {
  const p = plan();
  assert.equal(p.ok, true);
  assert.ok(p.acquisitions.length >= 2, 'un objectif de 3 000 € demande plusieurs lots');

  // Chaque acquisition porte son métier et sa surface, et son prix en découle.
  for (const a of p.acquisitions) {
    assert.ok(a.metier && a.surface > 0, 'un métier et une surface');
    assert.ok(SURFACES.some(([nom, s]) => nom === a.metier && s === a.surface));
    assert.equal(a.loyer_annuel, Math.round(a.prix * (RENDEMENT_CIBLE / 100) / 1000) * 1000);
  }
  // Les prix ne se répètent pas à l'identique : c'était le défaut à corriger.
  const prix = p.acquisitions.map((a) => a.prix);
  assert.ok(new Set(prix).size > 1, `des prix différents, pas ${prix.join(' / ')}`);
  assert.ok(prix[prix.length - 1] > prix[0], 'on commence petit et on monte');
  assert.ok(p.acquisitions.every((a, i) => i === 0 || a.annee >= p.acquisitions[i - 1].annee));
});

test('la projection court sur tout l\'horizon et porte les achats à leur année', () => {
  const p = plan({ horizon_ans: 30 });
  assert.equal(p.horizon_ans, 30);
  assert.equal(p.projection.length, 31, 'de l\'année 0 à l\'année 30');
  assert.equal(p.projection[0].annee, 0);

  // Les années d'achat de la projection sont exactement celles des acquisitions.
  const anneesProjection = p.projection.filter((x) => x.achats.length).flatMap((x) => x.achats);
  assert.deepEqual(anneesProjection.sort((a, b) => a - b), p.acquisitions.map((a) => a.rang));
  // Le revenu mensuel ne recule jamais, et finit sur ce que le plan annonce.
  for (let i = 1; i < p.projection.length; i++) assert.ok(p.projection[i].mensuel >= p.projection[i - 1].mensuel);
  assert.equal(p.projection[p.projection.length - 1].mensuel, p.atteint_mensuel);
  // Le mensuel de la dernière année, c'est bien la part du loyer total.
  const loyerTotal = p.acquisitions.reduce((t, a) => t + a.loyer_annuel, 0);
  assert.equal(p.projection[p.projection.length - 1].mensuel, Math.round((loyerTotal * PART_CASH_FLOW) / 12));
  // L'année d'un achat coûte : le bien n'est détenu qu'une demi-année.
  const achat = p.projection.find((x) => x.achats.length);
  assert.ok(achat.cash_flow < achat.cash_flow_hors_achat, 'l\'année d\'achat rapporte moins qu\'à plein régime');
  assert.ok(achat.apport_verse > 0, 'l\'apport versé est dit, pour l\'infobulle');
  // L'apport n'entre pas dans le cash-flow : un investissement n'est pas une
  // charge, et le déduire creusait des gouffres qui ne disaient rien.
  assert.ok(p.projection.every((x) => x.cash_flow >= 0), 'aucune année ne plonge à cause d\'un apport');
});

test('l\'horizon borne le plan, et le quartier choisit les métiers', () => {
  // Un horizon court n'invente pas des acquisitions qu'on ne peut pas financer.
  const court = plan({ horizon_ans: 10, fonds_propres: 0, revenus_annuels: 30000 });
  assert.ok(court.acquisitions.every((a) => a.annee < 10));
  assert.equal(typeof court.dans_horizon, 'boolean');

  // Les métiers relevés dans le quartier priment sur la table, s'il y en a assez.
  const local = plan({ metiers: ['Pharmacie', 'Restaurant', 'Boulangerie'] });
  assert.ok(local.acquisitions.every((a) => ['Pharmacie', 'Restaurant', 'Boulangerie'].includes(a.metier)));

  // Sans prix de quartier, un repère est pris et signalé comme tel.
  const sansMarche = plan({ prix_m2: null });
  assert.equal(sansMarche.prix_m2_estime, true);
  assert.ok(sansMarche.prix_m2_retenu > 0);
  assert.equal(plan().prix_m2_estime, false);
  assert.match(calculerRoadmap({ objectif_mensuel: 0 }).error, /objectif/);
});

test('le lien du simulateur porte l\'acquisition, et une page ouverte compte les passages', () => {
  const p = plan();
  const lien = lienSimulateur(p.acquisitions[0], 'https://klocka.immo');
  const params = JSON.parse(decodeURIComponent(lien.split('data=')[1]));
  assert.equal(params.prixBienFAI, p.acquisitions[0].prix);
  assert.equal(params.loyerInitialHTHC, p.acquisitions[0].loyer_annuel);
  assert.equal(params.surface, p.acquisitions[0].surface);

  const ip = '203.0.113.7';
  for (let i = 0; i < 8; i++) assert.equal(tropDeDemandes(ip), false);
  assert.equal(tropDeDemandes(ip), true, 'le neuvième passage en une heure est refusé');
});

test('une source qui tarde ou qui tombe ne fait pas attendre le visiteur', async () => {
  const lente = new Promise((r) => setTimeout(() => r('trop tard'), 400));
  assert.equal(await avecDelai(lente, 40, null), null);
  assert.equal(await avecDelai(Promise.resolve('à temps'), 200), 'à temps');
  assert.deepEqual(await avecDelai(Promise.reject(new Error('DVF est tombé')), 200, []), []);
});
