import test from 'node:test';
import assert from 'node:assert/strict';
import { indiceDeFlux, poidsGare, classerEmplacement } from './emplacement.js';
import { rangerRisques, lireUrbanisme, rapprocherGares } from './sources-ouvertes.js';

test("l'indice de flux : composantes notées sur 100, poids répartis sur celles qui ont une donnée", () => {
  const f = indiceDeFlux({ habitants: 9000, emplois: 600, gares: [{ voyageurs: 5_600_000, distance_m: 622 }], arrets: [{ distance_m: 34 }, { distance_m: 400 }], generateurs: 10, commerces_troncon: 20 });
  assert.equal(f.composantes.find((c) => c.cle === 'habitants').note, 100);
  assert.equal(f.composantes.find((c) => c.cle === 'arrets').valeur, 1);
  assert.ok(f.indice > 50 && f.indice <= 100);
  const partiel = indiceDeFlux({ commerces_troncon: 10 });
  assert.equal(partiel.sur, '1 composantes sur 6');
  assert.equal(partiel.indice, 50);
  assert.equal(indiceDeFlux({}).indice, null);
  assert.equal(poidsGare(200), 1);
  assert.equal(poidsGare(2000), 0);
});

test('le classement : n°1 sur un flux et une commercialité forts, secondaire sinon ; réserves et activités', () => {
  const fort = classerEmplacement({ flux: indiceDeFlux({ habitants: 9000, emplois: 1200, arrets: Array(10).fill({ distance_m: 50 }), commerces_troncon: 20, generateurs: 25 }), risques: { lourds: ['Inondation'] } });
  assert.equal(fort.classement, 'n1');
  assert.match(fort.reserves[0], /Inondation/);
  assert.ok(fort.activites.adaptees.some((a) => /prêt-à-porter/.test(a)));
  const faible = classerEmplacement({ flux: indiceDeFlux({ habitants: 800, commerces_troncon: 1 }), revenu_vs_france: 25 });
  assert.equal(faible.classement, 'secondaire');
  assert.ok(faible.activites.adaptees.some((a) => /proximité/.test(a)));
  assert.equal(classerEmplacement({}).classement, null);
});

test('les sources : risques rangés, urbanisme lu, gares rapprochées par le code UIC', () => {
  const r = rangerRisques([{ libelle_risque_long: 'Inondation' }, { libelle_risque_long: 'Radon' }]);
  assert.deepEqual([r.lourds, r.autres], [['Inondation'], ['Radon']]);
  const u = lireUrbanisme({ zones: [{ properties: { libelle: 'UBa', typezone: 'U' } }], lineaires: [{ properties: { libelle: 'Linéaire commercial à protéger' } }] });
  assert.equal(u.zone.code, 'UBa');
  assert.equal(u.lineaire_commercial, true);
  const g = rapprocherGares([{ nom: 'Cannes', position_geographique: { lat: 43.55, lon: 7.01 }, codes_uic: '87757625' }], [{ code_uic_complet: '0087757625', total_voyageurs_2024: 5622415 }]);
  assert.equal(g[0].voyageurs, 5622415);
});

test('K-Zoning : une zone lisible, et la chalandise au format commun', async () => {
  const { zoneLisible } = await import('./zoning.js');
  const { versFormatCommun } = await import('../socle/format-commun.js');
  const z = zoneLisible({ cle: 'primaire', nom: 'Zone primaire', marche: '5 minutes à pied', insee: { population: { habitants: 1086, part_moins_18: 10.7, part_65_plus: 35.8 }, menages: { menages: 661 }, revenus: { niveau_de_vie_moyen: 22297 } }, recensement: { population: 1100, csp_plus: 188, taux_chomage: 14.1 } });
  assert.equal(z.habitants, 1086);
  assert.equal(z.csp_plus_part, 17.1);
  const c = versFormatCommun('kzoning', { id_local: 'L-1', zones: [z, { habitants: 5393 }, { habitants: 13971 }], commerces_zone_primaire: 484, concurrence: { nombre: 10 }, flux: { indice: 72 }, sources: ['OpenStreetMap (commerces)'], le: new Date().toISOString() }, { adresse: 'x' });
  assert.equal(c.valeur.indice_flux, 72);
  assert.equal(c.valeur.concurrents, 10);
  assert.equal(c.confiance, 'haute');
});

test("K-Prospective : le score d'intérêt monte avec un signal, un propriétaire et un contact, descend si Klocka a écarté", async () => {
  const { scoreInteret } = await import('./prospective.js');
  const fort = scoreInteret({ criteres_remplis: 2, criteres_total: 2, signaux: [{ type_signal: 'liquidation' }], proprietaire_societe: true, contact: { telephone: '04 93 00 00 00' } });
  assert.equal(fort.total, 90);
  const ecarte = scoreInteret({ criteres_remplis: 1, criteres_total: 2, historique: { pile: 'ecartee' } });
  assert.equal(ecarte.total, 0);
  assert.equal(scoreInteret({}).total, 0);
});

test('K-Vacance, la vérification : intervalle de Wilson, rétro-test des signaux, évaluation de la feuille de terrain', async () => {
  const V = await import('./vacance-verif.js');
  const w = V.wilson(18, 20);
  assert.equal(w.pct, 90);
  assert.ok(w.bas > 68 && w.bas < 72 && w.haut > 97 && w.haut < 99);
  assert.equal(V.wilson(0, 0).pct, null);

  const etat = new Map([['1', { etat: 'F', date_fin: '2026-02-01' }], ['2', { etat: 'A' }], ['3', { etat: 'F', date_fin: '2026-09-01' }]]);
  const r = V.retroTest([
    { type: 'liquidation', date: '2025-10-01', siret: '1' },
    { type: 'liquidation', date: '2025-10-01', siret: '2' },
    { type: 'liquidation', date: '2026-09-20', siret: '3' }, // trop récent : écarté
    { type: 'fermeture', date: '2025-01-01', siret: '1' },   // pas un signal fort
    { type: 'radiation', date: '2025-06-01', siret: '9' },   // établissement inconnu
  ], etat, { aujourdhui: Date.parse('2026-10-19') });
  assert.deepEqual([r.par_type.liquidation.n, r.par_type.liquidation.fermes, r.par_type.liquidation.pct, r.par_type.liquidation.delai_median_mois], [2, 1, 50, 4]);
  assert.equal(r.sans_etablissement, 1);

  const locaux = [...Array(30)].map((_, i) => ({ adresse: `${i} rue A`, etat: 'vacant', lat: 1, lon: 2 })).concat([...Array(60)].map((_, i) => ({ adresse: `${i} rue B`, etat: 'occupe' })));
  const e = V.echantillonner(locaux, { vacants: 10, occupes: 10, incertains: 5 });
  assert.equal(e.filter((l) => l.etat === 'vacant').length, 10);
  assert.equal(e.length, 20);
  assert.deepEqual(V.echantillonner(locaux, { vacants: 10, occupes: 10 }), e);

  const csv = V.feuilleCsv(e.slice(0, 2), { commune: 'Cannes', date: '2026-10-19' });
  const relu = V.lireFeuille(csv.replace(/""\n/g, '"vide";""\n').replace(/;"";""\n/g, ';"vide";""\n'));
  assert.equal(relu.length, 2);
  assert.equal(relu[0].etat_outil, 'vacant');

  const feuille = [
    ...Array(8).fill({ etat_outil: 'vacant', constat: 'vide' }), ...Array(2).fill({ etat_outil: 'vacant', constat: 'occupe' }),
    ...Array(19).fill({ etat_outil: 'occupe', constat: 'occupe' }), { etat_outil: 'occupe', constat: 'vide' },
    { etat_outil: 'occupe', constat: '' },
  ];
  const ev = V.evaluerFeuille(feuille, { vacants: 20, occupes: 280, incertains: 0 });
  assert.equal(ev.constats, 30);
  assert.equal(ev.precision_vacants.pct, 80);
  assert.equal(ev.faux_occupes.pct, 5);
  assert.equal(ev.taux_corrige.taux_outil, 6.7);
  // 20 vacants à 80 % de précision + 280 occupés à 5 % de faux : 16 + 14 = 30 locaux vides sur 300, soit 10 % (l'outil en annonçait 6,7 %).
  assert.equal(ev.taux_corrige.taux_corrige, 10);
});
