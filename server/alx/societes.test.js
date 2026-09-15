// Les portefeuilles : ce qu'une société a acheté et vendu, depuis quand elle
// tient ses murs, et ce qu'on lui propose en premier.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-societes-'));
const { estPrivee, probaAuMoinsUne, millesimesDistincts, mouvementsDe, detentionDe, profilsDe, accrocheDe } = await import('./societes.js');

// Trois millésimes et un alias : 2026 n'est que le 2025 reposé.
const millesime = (couples) => {
  const sirens = new Map();
  for (const [siren, parcelle, droit = 'P'] of couples) {
    if (!sirens.has(siren)) sirens.set(siren, []);
    sirens.get(siren).push({ siren, parcelle, droit, locaux: 1 });
  }
  return { sirens, parcelles: new Map() };
};
const m2025 = millesime([['111', 'A'], ['111', 'C'], ['222', 'B']]);
const PM = new Map([
  [2021, millesime([['111', 'A'], ['111', 'B']])],
  [2023, millesime([['111', 'A'], ['111', 'B']])],
  [2025, m2025],
  [2026, m2025],
]);
const VENTES = new Map([['B', ['2024-05-10']], ['C', ['2023-11-02']], ['A', ['2019-03-01']]]);

test('une société privée, pas une commune ni un bailleur social', () => {
  assert.equal(estPrivee('SCI', 'SCI Les Oliviers'), true);
  assert.equal(estPrivee('COM', 'COMMUNE DE NICE'), false);
  assert.equal(estPrivee('SARL', 'SOCIETE HABITAT ET LOGEMENT ALPES-MARITIMES'), false);
  assert.equal(estPrivee('ASS', 'Fondation'), false);
});

test("la probabilité qu'au moins un bien se vende", () => {
  assert.ok(Math.abs(probaAuMoinsUne([0.1, 0.2]) - 0.28) < 1e-9);
  assert.equal(probaAuMoinsUne([]), 0);
});

test("les millésimes distincts ignorent l'alias de l'année courante", () => {
  assert.deepEqual(millesimesDistincts(PM), [2021, 2023, 2025]);
});

test("les ventes et achats se déduisent d'un millésime au suivant, confirmés par DVF", () => {
  const m = mouvementsDe(PM, '111', VENTES);
  assert.deepEqual(m, [
    { type: 'vente', parcelle: 'B', date: '2024-05-10' },
    { type: 'achat', parcelle: 'C', date: '2023-11-02' },
  ]);
  // Sans vente DVF entre les deux millésimes, pas de mouvement : un transfert
  // interne ou une erreur du fichier ne compte pas.
  assert.deepEqual(mouvementsDe(PM, '111', new Map()), []);
  assert.deepEqual(mouvementsDe(PM, '111', VENTES, { depuis: '2024-01-01' }).map((x) => x.parcelle), ['B']);
});

test('la détention part du premier millésime continu, et se dit censurée au premier lu', () => {
  assert.deepEqual(detentionDe(PM, '111', 'A'), { depuis: 2021, censuree: true });
  assert.deepEqual(detentionDe(PM, '111', 'C'), { depuis: 2025, censuree: false });
  assert.equal(detentionDe(PM, '222', 'A'), null);
});

test('les profils sont des faits, pas des poids', () => {
  const arbitre = profilsDe({ mouvements: [{ type: 'vente' }, { type: 'achat' }], murs: 3 });
  assert.deepEqual(arbitre.map((p) => p.cle), ['rotateur']);
  assert.deepEqual(profilsDe({ mouvements: [{ type: 'vente' }], murs: 2 }).map((p) => p.cle), ['liquidation']);
  assert.deepEqual(profilsDe({ mouvements: [{ type: 'achat' }, { type: 'achat' }], murs: 3 }).map((p) => p.cle), ['acheteur'], 'acheter sans vendre, ce n\'est pas arbitrer');
  const stable = profilsDe({ mouvements: [], murs: 4, gerant70: true, toutesCensurees: true });
  assert.deepEqual(stable.map((p) => p.cle), ['transmission', 'stable']);
  assert.equal(stable[1].mot, 'Stable depuis 2021');
  assert.deepEqual(profilsDe({ mouvements: [], murs: 9, gerant70: true }).map((p) => p.cle), [], 'au-delà de six murs, ce n\'est plus une SCI familiale');
});

test("l'accroche commence par le bien n°1 et ouvre sur le reste", () => {
  const murs = [
    { adresse: '27 Avenue Jean Médecin', parcelle: 'A', tranche: { libelle: 'Top 5 % de la ville' } },
    { adresse: '3 Rue Pastorelli', parcelle: 'B' },
    { adresse: '8 Rue Alberti', parcelle: 'C' },
  ];
  assert.equal(accrocheDe({ nom: 'SCI X', ville: 'Nice', murs }), 'Proposer une offre sur 27 Avenue Jean Médecin (top 5 % de la ville), puis ouvrir la discussion sur ses 2 autres murs commerciaux à Nice.');
  assert.match(accrocheDe({ nom: 'SCI X', ville: 'Nice', murs: murs.slice(0, 1), profils: [{ cle: 'transmission' }] }), /^Parler transmission.*proposer une offre sur 27 Avenue Jean Médecin/);
  assert.equal(accrocheDe({ nom: 'SCI X', ville: 'Nice', murs: [] }), null);
});
