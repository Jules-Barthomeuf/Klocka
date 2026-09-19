// K-Vacance : le taux de vacance, rue par rue, et le rythme des fermetures.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kvac-'));
const { tauxDeVacance, turnOver, lireFermeture, normaliserRue, cleAdresse, dureesDeVacance, MINIMUM_PAR_RUE } = await import('./kvacance.js');
const { libelleActivite, NAF_SOUS_CLASSES } = await import('./naf.js');

const local = (adresse, vacant = false) => ({ adresse, vacant, lat: 43.7, lon: 7.25, genre: vacant ? 'vacant' : 'bakery' });

test('le taux se calcule sur la zone et rue par rue, et une rue trop courte est écartée', () => {
  const v = tauxDeVacance([
    local('1 Rue Dabray'), local('3 Rue Dabray', true), local('5 Rue Dabray'), local('7 Rue Dabray', true),
    local('2 Avenue Jean Médecin'), local('4 Avenue Jean Médecin'), local('6 Avenue Jean Médecin'), local('8 Avenue Jean Médecin'),
    local('1 Rue Courte', true), local('3 Rue Courte'),
  ]);

  assert.equal(v.total, 10);
  assert.equal(v.vides, 3);
  assert.equal(v.taux, 30);
  const dabray = v.rues.find((r) => r.rue === 'dabray');
  assert.equal(dabray.total, 4);
  assert.equal(dabray.vides, 2);
  assert.equal(dabray.taux, 50);
  assert.equal(dabray.points.length, 2, 'les locaux vides portent leur point, pour la carte');
  // Deux devantures ne font pas une statistique : la rue est écartée, et on le dit.
  assert.equal(v.rues.find((r) => r.rue === 'courte'), undefined);
  assert.equal(v.rues_ecartees, 1);
  assert.equal(v.minimum_par_rue, MINIMUM_PAR_RUE);
  // Les rues les plus en tension d'abord.
  assert.equal(v.rues[0].rue, 'dabray');
  assert.equal(tauxDeVacance([]).taux, null);
});

test('une fermeture porte sa durée d\'exploitation, et sans point elle est écartée', () => {
  const centre = { lat: 43.7, lon: 7.25 };
  const f = lireFermeture(
    { nom_complet: 'V.N.RESTAURATION', etat_administratif: 'C', activite_principale: '56.10A' },
    { siret: '43405555400019', etat_administratif: 'F', date_creation: '2000-12-29', date_fermeture: '2008-09-15', latitude: '43.70372', longitude: '7.26327', adresse: '19 RUE ALSACE LORRAINE 06000 NICE' },
    centre,
  );
  assert.equal(f.siret, '43405555400019');
  assert.equal(f.annee_fermeture, 2008);
  assert.ok(Math.abs(f.duree_ans - 7.7) < 0.2, `durée ${f.duree_ans}`);
  assert.equal(f.societe_cessee, true);
  assert.ok(f.distance_m > 0);
  // Sans coordonnées ou sans date de fermeture, rien à en tirer.
  assert.equal(lireFermeture({}, { siret: '1', date_fermeture: '2020-01-01' }, centre), null);
  assert.equal(lireFermeture({}, { siret: '1', latitude: '43.7', longitude: '7.25' }, centre), null);
});

test('le turn-over rend la durée médiane et la part des enseignes qui ne tiennent pas', () => {
  const t = turnOver([
    { duree_ans: 2, annee_fermeture: 2023 }, { duree_ans: 4, annee_fermeture: 2023 },
    { duree_ans: 6, annee_fermeture: 2024 }, { duree_ans: 12, annee_fermeture: 2025 },
    { duree_ans: null, annee_fermeture: 2025 },
  ]);
  assert.equal(t.n, 5);
  assert.equal(t.duree_mediane, 5, 'la fermeture sans durée ne fausse pas la médiane');
  assert.equal(t.part_moins_3_ans, 25);
  assert.deepEqual(t.par_annee, [{ annee: 2023, n: 2 }, { annee: 2024, n: 1 }, { annee: 2025, n: 2 }]);
  assert.equal(turnOver([]).duree_mediane, null);
});

test('les rues se rapprochent sans leur type de voie', () => {
  assert.equal(normaliserRue('Boulevard de Cessole'), 'de cessole');
  assert.equal(normaliserRue('Bd de Cessole'), 'de cessole');
  assert.equal(normaliserRue('Avenue Jean Médecin'), 'jean medecin');
});

test("le code NAF devient un métier, et un code d'avant 2008 ne devient rien", () => {
  assert.equal(NAF_SOUS_CLASSES, 732, 'la nomenclature rév. 2 compte 732 sous-classes');
  // Le cas qui a motivé la table : « ISATIS » ne dit rien, son code si.
  assert.equal(libelleActivite('85.59A'), "Formation continue d'adultes");
  assert.equal(libelleActivite('96.02A'), 'Coiffure');
  // Le point est facultatif : les sources ne l'écrivent pas toutes.
  assert.equal(libelleActivite('4711B'), "Commerce d'alimentation générale");
  // La nomenclature d'avant 2008 est plus courte d'un caractère : on rend null
  // plutôt qu'un libellé faux, et l'appelant retombe sur le nom de la société.
  assert.equal(libelleActivite('55.5A'), null);
  assert.equal(libelleActivite('85.3K'), null);
  assert.equal(libelleActivite(''), null);
  assert.equal(libelleActivite(null), null);
});

test("la clé d'un local survit au bruit des adresses du registre", () => {
  assert.equal(cleAdresse('12 AVENUE MALAUSSENA 06000 NICE'), '12|malaussena');
  // Le registre préfixe parfois d'un nom d'établissement : c'est la dernière
  // adresse postale qui compte, pas la première suite de chiffres.
  assert.equal(cleAdresse('ADAPEI 06 TORRINI 8 RUE TORRINI 06000 NICE'), '8|torrini');
  assert.equal(cleAdresse('14 ET 16 14 BOULEVARD DE CESSOLE 06100 NICE'), '14|de cessole');
  // Deux écritures de la même adresse doivent donner la même clé.
  assert.equal(cleAdresse('3 BD GAMBETTA 06000 NICE'), cleAdresse('3 Boulevard Gambetta 06000 Nice'));
  // Le bis est une adresse à part entière : le 14 et le 14 bis d'un boulevard
  // sont deux immeubles, et les confondre inventerait des successions.
  assert.equal(cleAdresse('31 B RUE MICHEL ANGE 06100 NICE'), '31b|michel ange');
  assert.equal(cleAdresse('124 B BOULEVARD GAMBETTA 06000 NICE'), '124b|gambetta');
  assert.notEqual(cleAdresse('14 BIS RUE DABRAY 06000 NICE'), cleAdresse('14 RUE DABRAY 06000 NICE'));
  // Des types de voie que le registre emploie et que la première version ignorait.
  assert.equal(cleAdresse('4 PASSAGE COGNET 06000 NICE'), '4|cognet');
  // Une adresse sans numéro n'est pas localisable au local : on ne devine pas.
  assert.equal(cleAdresse('PLACE DE LA GARE DU SUD 06000 NICE'), null);
  assert.equal(cleAdresse("VILLA BEAUSEJOUR AVENUE DU PLATEAU DE L'EDEN PARK 06000 NICE"), null);
  assert.equal(cleAdresse('SANS NUMERO NI VOIE'), null);
  assert.equal(cleAdresse(''), null);
});

test('la vacance se mesure par la reprise du local, et les locaux encore vides restent à part', () => {
  const f = (siret, cle, fermeture) => ({ siret, cle_adresse: cle, fermeture });
  const o = (cle, date, nom) => ({ cle, date, nom, activite_libelle: 'Coiffure' });
  const d = dureesDeVacance(
    [f('A', '12|malaussena', '2020-01-01'), f('B', '8|torrini', '2021-01-01'), f('C', '5|dabray', '2022-01-01')],
    [
      o('12|malaussena', '2022-01-01', 'LE NOUVEAU'),
      o('12|malaussena', '2019-01-01', 'TROP TOT'),
      o('8|torrini', '2021-07-02', 'REPRENEUR'),
    ],
    new Date('2026-01-01T00:00:00Z'),
  );

  assert.equal(d.n, 3);
  assert.equal(d.n_reprises, 2);
  assert.equal(d.n_en_cours, 1, 'le local de la rue Dabray n\'a jamais été repris');
  const a = d.lignes.find((x) => x.siret === 'A');
  assert.equal(a.vacance_ans, 2, 'deux ans entre la fermeture et la reprise');
  assert.equal(a.reprise_par, 'LE NOUVEAU', 'une ouverture antérieure à la fermeture ne compte pas');
  assert.equal(a.en_cours, false);
  const b = d.lignes.find((x) => x.siret === 'B');
  assert.ok(Math.abs(b.vacance_ans - 0.5) < 0.1, `six mois, pas ${b.vacance_ans}`);
  const c = d.lignes.find((x) => x.siret === 'C');
  assert.equal(c.en_cours, true);
  assert.ok(c.vacance_ans >= 3.9, 'un local encore vide porte sa durée écoulée');

  // La médiane ne porte que sur les vacances terminées : une durée inconnue ne
  // peut pas entrer dans une médiane sans la fausser.
  assert.equal(d.mediane_ans, 1.3, 'médiane de 0,5 et 2');
  assert.ok(d.mediane_en_cours_ans >= 3.9, 'les locaux encore vides ont leur propre chiffre');
  // Deux reprises ne font pas une médiane affichable : la page le saura.
  assert.equal(d.assez, false);
  assert.equal(d.minimum_reprises, 5);
  // Sans aucune reprise, on ne fabrique pas de mediane.
  assert.equal(dureesDeVacance([f('X', '1|voie', '2024-01-01')], []).mediane_ans, null);
  assert.equal(dureesDeVacance([], []).n, 0);
});
