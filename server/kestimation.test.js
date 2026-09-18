// K-Estimation : le taux de marché, les ajustements, et la fourchette.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kestimation-'));
const { tauxDeMarche, calculerEstimation, lancerEstimation, CHOIX, ETAPES, TAUX_PIVOT, TAUX_MIN, TAUX_MAX } = await import('./kestimation.js');

const INSEE_AISE = { revenus: { niveau_de_vie_moyen: 30000, taux_pauvrete: 8 }, population: { densite_km2: 12000 } };

test('le taux de marché descend sur un emplacement commerçant et aisé, monte sur un désert', () => {
  const bon = tauxDeMarche({ commerces: 80, insee: INSEE_AISE });
  const mauvais = tauxDeMarche({ commerces: 2, insee: { revenus: { niveau_de_vie_moyen: 15000, taux_pauvrete: 28 }, population: { densite_km2: 900 } } });

  assert.ok(bon.taux < TAUX_PIVOT, 'un emplacement recherché se paie plus cher, donc rend moins');
  assert.ok(mauvais.taux > TAUX_PIVOT);
  assert.ok(bon.facteurs.some((f) => /très commerçant/.test(f.libelle)));
  assert.ok(mauvais.facteurs.some((f) => /Peu de commerces/.test(f.libelle)));
  // Sans aucune donnée, on reste au pivot : rien d'inventé.
  assert.equal(tauxDeMarche({ commerces: 10, insee: null }).taux, TAUX_PIVOT);
});

test('un local vide vaut moins que le même local occupé, et le loyer est obligatoire', () => {
  const base = { taux_marche: 7, reponses: { loyer_annuel: 30000, situation: 'occupe', reseau: 'oui', anciennete: '+9' } };
  const occupe = calculerEstimation(base);
  const vide = calculerEstimation({ ...base, reponses: { ...base.reponses, situation: 'vide', reseau: 'nc', anciennete: '-1' } });

  assert.ok(occupe.ok && vide.ok);
  assert.ok(occupe.taux < vide.taux, 'le vide est un risque : le taux exigé monte');
  assert.ok(occupe.valeurs.moyenne > vide.valeurs.moyenne);
  assert.ok(occupe.valeurs.basse < occupe.valeurs.moyenne && occupe.valeurs.moyenne < occupe.valeurs.haute);
  // La valeur suit bien la division, aux mille euros près.
  assert.equal(occupe.valeurs.moyenne, Math.round(30000 / (occupe.taux / 100) / 1000) * 1000);
  assert.match(calculerEstimation({ taux_marche: 7, reponses: {} }).error, /loyer annuel/);
});

test('le taux reste borné, et le taux d\'effort pèse quand le chiffre d\'affaires est connu', () => {
  const pire = calculerEstimation({ taux_marche: TAUX_MAX, reponses: { loyer_annuel: 10000, situation: 'vide', retards: 'oui', etat_batiment: 'gros_oeuvre', etat_local: 'brut' } });
  assert.equal(pire.taux, TAUX_MAX, 'les ajustements ne débordent pas des bornes');
  assert.ok(pire.taux_fourchette.bas >= TAUX_MIN);

  const lourd = calculerEstimation({ taux_marche: 7, reponses: { loyer_annuel: 30000, ca_ht: 150000 } });
  const leger = calculerEstimation({ taux_marche: 7, reponses: { loyer_annuel: 30000, ca_ht: 800000 } });
  assert.equal(lourd.taux_effort, 20);
  assert.ok(lourd.taux > leger.taux, 'un loyer qui prend un cinquième du chiffre d\'affaires tient mal');
  assert.equal(calculerEstimation({ taux_marche: 7, reponses: { loyer_annuel: 30000 } }).taux_effort, null);
});

test('quatre étapes, des choix lisibles par le formulaire, et une adresse vague refusée', () => {
  assert.equal(ETAPES.length, 4);
  assert.equal(ETAPES[0].cle, 'adresse');
  assert.deepEqual(CHOIX.situation.options.map((o) => o.valeur), ['occupe', 'vide']);
  assert.equal(CHOIX.etat_batiment.options.length, 5);
  assert.match(lancerEstimation({ adresse: 'Nice' }).error, /adresse précise/);
});
