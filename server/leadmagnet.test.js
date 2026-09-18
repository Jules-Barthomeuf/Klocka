// La feuille de route : le plan d'acquisition, et le débit d'une page ouverte.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-lm-'));
const { calculerRoadmap, lienSimulateur, tropDeDemandes, avecDelai, RENDEMENT_CIBLE, PART_CASH_FLOW } = await import('./leadmagnet.js');

test('du revenu voulu au patrimoine, puis aux acquisitions année par année', () => {
  const p = calculerRoadmap({ objectif_mensuel: 2000, fonds_propres: 60000, revenus_annuels: 60000, horizon_ans: 10, prix_m2: 2500 });

  assert.equal(p.ok, true);
  // 2 000 € par mois à 30 % du loyer : 80 000 € de loyer annuel, qui à 7 %
  // demandent un peu plus d'un million de patrimoine.
  assert.equal(p.loyer_annuel_vise, Math.round((2000 * 12) / PART_CASH_FLOW / 1000) * 1000);
  assert.equal(p.patrimoine_vise, Math.round(p.loyer_annuel_vise / (RENDEMENT_CIBLE / 100) / 1000) * 1000);
  assert.ok(p.nombre_acquisitions >= 2 && p.nombre_acquisitions <= 6);
  assert.equal(p.etapes.length, p.nombre_acquisitions);

  // Les acquisitions se suivent, jamais en arrière, et le cumul monte.
  for (let i = 1; i < p.etapes.length; i++) {
    assert.ok(p.etapes[i].annee >= p.etapes[i - 1].annee, 'les années ne reculent pas');
    assert.ok(p.etapes[i].cumul_mensuel > p.etapes[i - 1].cumul_mensuel);
  }
  assert.equal(p.etapes[0].rendement_cible, RENDEMENT_CIBLE);
  assert.equal(p.etapes[0].surface_indicative, Math.round(p.etapes[0].prix / 2500));
  assert.equal(p.atteint_mensuel, p.etapes[p.etapes.length - 1].cumul_mensuel);
});

test('plus de fonds propres avance le calendrier, et l\'horizon est dit sans être flatté', () => {
  const base = { objectif_mensuel: 1500, revenus_annuels: 50000, horizon_ans: 10 };
  const riche = calculerRoadmap({ ...base, fonds_propres: 300000 });
  const modeste = calculerRoadmap({ ...base, fonds_propres: 0 });

  assert.ok(riche.etapes[0].annee <= modeste.etapes[0].annee, 'avec l\'apport en poche, on achète plus tôt');
  assert.ok(riche.annee_objectif <= modeste.annee_objectif);
  // Le plan dit s'il tient dans l'horizon voulu : il ne se raccourcit pas
  // pour faire plaisir.
  assert.equal(typeof modeste.dans_horizon, 'boolean');
  assert.equal(riche.dans_horizon, riche.annee_objectif <= 10);
  // Sans prix de marché, la surface indicative se tait plutôt que d'inventer.
  assert.equal(calculerRoadmap({ ...base, fonds_propres: 0, prix_m2: null }).etapes[0].surface_indicative, null);
  assert.match(calculerRoadmap({ objectif_mensuel: 0 }).error, /objectif/);
});

test('le lien du simulateur porte l\'acquisition, et une page ouverte compte les passages', () => {
  const p = calculerRoadmap({ objectif_mensuel: 1000, fonds_propres: 100000, revenus_annuels: 40000, horizon_ans: 8, prix_m2: 2000 });
  const lien = lienSimulateur(p.etapes[0], 'https://klocka.immo');
  assert.ok(lien.startsWith('https://klocka.immo/SimulateurPublic?data='));
  const params = JSON.parse(decodeURIComponent(lien.split('data=')[1]));
  assert.equal(params.prixBienFAI, p.etapes[0].prix);
  assert.equal(params.loyerInitialHTHC, p.etapes[0].loyer_annuel);
  assert.equal(params.apport, p.etapes[0].apport);

  const ip = '203.0.113.7';
  for (let i = 0; i < 8; i++) assert.equal(tropDeDemandes(ip), false, `passage ${i + 1} accepté`);
  assert.equal(tropDeDemandes(ip), true, 'le neuvième passage en une heure est refusé');
  assert.equal(tropDeDemandes('198.51.100.1'), false, 'une autre adresse n\'est pas punie');
});

test('une source qui tarde ou qui tombe ne fait pas attendre le visiteur', async () => {
  const lente = new Promise((r) => setTimeout(() => r('trop tard'), 400));
  assert.equal(await avecDelai(lente, 40, null), null, 'passé le délai, on rend le secours');
  assert.equal(await avecDelai(Promise.resolve('à temps'), 200), 'à temps');
  assert.deepEqual(await avecDelai(Promise.reject(new Error('DVF est tombé')), 200, []), [], 'une source en panne rend le secours, pas une exception');
});
