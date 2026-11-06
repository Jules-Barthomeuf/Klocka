// Le bilan Tokimo (6 nov. 2026) : le dossier de Mailly-sur-Seille, tel que leur Excel le chiffre.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bilan, saisieVide } from '../src/lib/tokimo-bilan.js';
import { ventesResidentielles } from './tokimo.js';

const MAILLY = {
  ...saisieVide(),
  adresse: '28 Rue de Mont, 54610 Mailly-sur-Seille',
  surfaces: { utile: 180, terrasse: 0, terrain: 2000, creee: 0 },
  prix_acquisition: 180000,
  duree_mois: 6,
  taux_pct: 11,
  structuration_grille_pct: 8,
  apporteur: true,
  prix_cible_m2: 1389,
  comparables: [
    { surface: 90, prix_fai: 259000 }, { surface: 80, prix_fai: 199900 }, { surface: 110, prix_fai: 189000 },
    { surface: 195, prix_fai: 299000 }, { surface: 99, prix_fai: 241000 }, { surface: 100, prix_fai: 235000 },
    { surface: 180, prix_fai: 239000 },
  ],
  dvf: [{ surface: 140, prix: 223900 }, { surface: 110, prix: 191000 }, { surface: 102, prix: 160000 }, { surface: 100, prix: 257000 }],
};
const r = (x) => Math.round(x);

test('tokimo : le bilan achat revente de Mailly-sur-Seille', () => {
  const b = bilan(MAILLY);
  assert.equal(b.lignes.frais_notaire, 13500);
  assert.equal(b.lignes.charges_foncieres, 193500);
  assert.equal(b.lignes.suretes, 2700);
  assert.equal(b.besoin, 196200);
  assert.equal(b.dette, 196200);
  assert.equal(b.collecte, 220000);
  assert.equal(r(b.frais_tokimo), 23760);
  assert.equal(r(b.lignes.interets), 12100);
  assert.equal(r(b.lignes.frais_financiers), 35860);
  assert.equal(r(b.lignes.prix_de_revient), 232060);
  assert.equal(r(b.par_m2(b.lignes.prix_de_revient)), 1289);
});

test('tokimo : chiffre d\'affaires, marges et exposition', () => {
  const b = bilan(MAILLY);
  assert.equal(r(b.ca.bas), 225018);
  assert.equal(r(b.ca.cible), 250020);
  assert.equal(r(b.ca.haut), 275022);
  assert.equal(r(b.performance.bas.marge), -7042);
  assert.equal(r(b.performance.cible.marge), 17960);
  assert.equal(r(b.performance.haut.marge), 42962);
  assert.equal(b.performance.cible.sur_pr.toFixed(3), '0.077');
  assert.equal(b.performance.cible.sur_ca.toFixed(3), '0.072');
  assert.equal(r(b.exposition.ltv * 100), 88);
  assert.equal(r(b.exposition.ltc * 100), 95);
  assert.equal(r(b.exposition.risque_m2), 1222);
  assert.equal(r(b.exposition.annuites), 24200);
});

test('tokimo : emplois, ressources, décaissement et facturation', () => {
  const b = bilan(MAILLY);
  assert.equal(r(b.total_emplois), 219960);
  assert.equal(r(b.ressources.fonds_propres), -40);
  assert.equal(r(b.decaissement.notaire), 196240);
  assert.equal(r(b.decaissement.net_operateur), 193540);
  assert.equal(r(b.facturation.total_ht), 19800);
  assert.equal(r(b.facturation.total_ttc), 23760);
});

test('tokimo : les prix au m² des comparables (net vendeur) et de DVF', () => {
  const { dvf, comparables } = bilan(MAILLY).marches;
  assert.deepEqual([r(comparables.max), r(comparables.moyenne), r(comparables.mediane), r(comparables.min)], [2741, 2005, 2238, 1265]);
  assert.deepEqual([r(dvf.max), r(dvf.moyenne), r(dvf.mediane), r(dvf.min)], [2570, 1869, 1668, 1569]);
});

test('tokimo : une analyse vide ne divise pas par zéro', () => {
  const b = bilan({});
  assert.equal(b.collecte, 0);
  assert.equal(b.exposition.ltv, 0);
  assert.equal(b.marches.dvf, null);
});

test('tokimo : DVF, seules les ventes d\'une maison seule, à un vrai prix, avec une surface', () => {
  const l = (id, type, prix, surface, extra = {}) => ({ id_mutation: id, nature_mutation: 'Vente', type_local: type, valeur_fonciere: String(prix), surface_reelle_bati: String(surface), date_mutation: '2025-01-20', adresse_numero: '3', adresse_nom_voie: 'RUE DE NOMENY', nom_commune: 'Abaucourt', ...extra });
  const ventes = ventesResidentielles([
    l('a', 'Maison', 191000, 110),
    l('b', 'Maison', 300000, 100), l('b', 'Appartement', 300000, 50),
    l('c', 'Maison', 1, 90),
    l('d', 'Maison', 150000, 0),
    l('e', 'Appartement', 120000, 60),
    l('f', 'Maison', 160000, 102, { nature_mutation: 'Echange' }),
    // Une maison, son garage et deux parcelles : une vente de 140 m², pas de 280.
    l('g', 'Maison', 223900, 140, { id_parcelle: 'p1', nombre_pieces_principales: '5' }),
    l('g', 'Maison', 223900, 140, { id_parcelle: 'p2', nombre_pieces_principales: '5' }),
    l('g', 'Dépendance', 223900, 0, { id_parcelle: 'p1' }),
    l('g', '', 223900, 0, { id_parcelle: 'p3' }),
  ], 'Maison');
  assert.deepEqual(ventes.map((v) => [v.prix, v.surface]), [[191000, 110], [223900, 140]]);
  assert.equal(ventes[0].adresse, '3 RUE DE NOMENY, Abaucourt');
});
