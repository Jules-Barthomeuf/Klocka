// K-Vacance : le taux de vacance, rue par rue, et le rythme des fermetures.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kvac-'));
const {
  tauxDeVacance, turnOver, lireFermeture, normaliserRue, cleAdresse, dureesDeVacance, MINIMUM_PAR_RUE,
  attribuerLesRues, RAYON_RUE_VOISINE,
  estCommerce, dansLeRayon, vacanceAuRegistre, rythmeDesFermetures, rangParmiLesRues, comparer, verdictVacance, resumerVerdict,
  SEUILS, MINIMUM_DEVANTURES, MINIMUM_ADRESSES, MINIMUM_ADRESSES_RUE,
} = await import('./kvacance.js');
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

test("un local vide sans adresse rejoint la rue de sa voisine, sinon aucune rue n'aurait de vide", () => {
  // Le cas qui a motivé la déduction : sur le terrain, à Cannes, les quatre
  // locaux vides de la zone étaient sans adresse, et toutes les rues
  // sortaient à zéro pour cent alors que la zone en comptait quatre.
  const p = (lat, lon, adresse, vacant = false) => ({ adresse, vacant, lat, lon });
  const commerces = [
    p(43.7000, 7.25, '1 Rue Dabray'), p(43.7001, 7.25, '3 Rue Dabray'),
    p(43.7002, 7.25, '5 Rue Dabray'), p(43.7003, 7.25, '7 Rue Dabray'),
    // À cinq mètres de la devanture adressée la plus proche.
    p(43.70035, 7.25, null, true),
    // À plus d'un kilomètre : on préfère ne pas savoir plutôt que de le ranger
    // dans une rue qui n'est pas la sienne.
    p(43.7100, 7.26, null, true),
  ];

  const situes = attribuerLesRues(commerces);
  assert.equal(situes[4].rue, 'dabray');
  assert.equal(situes[4].libelle_rue, 'Rue Dabray', 'il hérite aussi du libellé de sa voisine');
  assert.equal(situes[4].rue_deduite, true, 'la rue est déduite, pas relevée');
  assert.equal(situes[0].rue_deduite, false, 'une devanture adressée ne doit rien à personne');
  assert.equal(situes[5].rue, null);
  assert.equal(RAYON_RUE_VOISINE, 50);

  const v = tauxDeVacance(commerces);
  const dabray = v.rues.find((x) => x.rue === 'dabray');
  assert.equal(dabray.total, 5);
  assert.equal(dabray.vides, 1, 'sans la déduction, la rue sortait à zéro vide');
  assert.equal(dabray.taux, 20);
  assert.equal(dabray.points.length, 1, 'le vide déduit reste posé sur la carte à son vrai point');
  assert.equal(v.rues_deduites, 1);
  assert.equal(v.sans_rue, 1);
  // Le taux de la zone, lui, n'a jamais dépendu des adresses.
  assert.equal(v.total, 6);
  assert.equal(v.vides, 2);
});

test('une fermeture porte sa durée d\'exploitation, et sans point elle est écartée', () => {
  const centre = { lat: 43.7, lon: 7.25 };
  const f = lireFermeture(
    { siret: '43405555400019', nom: 'V.N.RESTAURATION', etat: 'F', activite: '56.10A', activite_libelle: 'Restauration traditionnelle', ouverture: '2000-12-29', fermeture: '2008-09-15', lat: 43.70372, lon: 7.26327, adresse: '19 RUE ALSACE LORRAINE 06000 NICE' },
    centre,
  );
  assert.equal(f.siret, '43405555400019');
  assert.equal(f.annee_fermeture, 2008);
  assert.equal(f.cle_adresse, '19|alsace lorraine');
  assert.ok(Math.abs(f.duree_ans - 7.7) < 0.2, `durée ${f.duree_ans}`);
  assert.ok(f.distance_m > 0);
  // « 1900-01-01 » est la sentinelle du registre pour une date inconnue : la
  // compter donnerait un commerce exploité cent vingt ans, qui tirerait la
  // durée médiane et la part des enseignes qui ne tiennent pas.
  const sentinelle = lireFermeture(
    { siret: '2', etat: 'F', ouverture: '1900-01-01', fermeture: '2020-06-30', lat: 43.7, lon: 7.25, adresse: '5 RUE DABRAY 06000 NICE' },
    centre,
  );
  assert.equal(sentinelle.duree_ans, null, 'une ouverture inconnue ne donne pas de durée');
  assert.equal(sentinelle.annee_fermeture, 2020, 'la fermeture, elle, reste connue');

  // Un établissement actif, sans point ou sans date de fermeture : rien à en tirer.
  assert.equal(lireFermeture({ siret: '1', etat: 'A', lat: 43.7, lon: 7.25 }, centre), null);
  assert.equal(lireFermeture({ siret: '1', etat: 'F', fermeture: '2020-01-01' }, centre), null);
  assert.equal(lireFermeture({ siret: '1', etat: 'F', lat: 43.7, lon: 7.25 }, centre), null);
});

test('un commerce se reconnaît à son code NAF, et le rayon garde ce qui est à portée', () => {
  assert.equal(estCommerce('47.11B'), true);
  assert.equal(estCommerce('5610A'), true);
  assert.equal(estCommerce('96.02A'), true, 'la coiffure est une devanture');
  assert.equal(estCommerce('95.23Z'), true, 'le cordonnier aussi');
  assert.equal(estCommerce('64.20Z'), false, 'une holding n\'est pas une devanture');
  assert.equal(estCommerce('68.20A'), false, 'ni une SCI');
  assert.equal(estCommerce('70.22Z'), false, 'ni un cabinet de conseil');
  assert.equal(estCommerce(null), false);

  const point = { lat: 43.7, lon: 7.25 };
  const z = dansLeRayon([
    { siret: 'A', lat: 43.7005, lon: 7.25, adresse: '3 RUE DABRAY 06000 NICE' },
    { siret: 'B', lat: 43.72, lon: 7.25, adresse: '9 RUE LOIN 06000 NICE' },
    { siret: 'C', lat: null, lon: null, adresse: '1 RUE SANS POINT' },
  ], point, 400);
  assert.deepEqual(z.map((e) => e.siret), ['A']);
  assert.equal(z[0].cle_adresse, '3|dabray');
  assert.ok(z[0].distance_m > 0 && z[0].distance_m < 100);
});

// Un jeu d'établissements : trois adresses occupées, deux vidées récemment,
// une vidée il y a longtemps, et un local repris à la même adresse.
const AUJOURDHUI = new Date('2026-09-20T00:00:00Z');
const etab = (siret, cle, etat, extra = {}) => ({ siret, cle_adresse: cle, etat, adresse: cle, nom: siret, lat: 43.7, lon: 7.25, ...extra });
const ZONE = [
  etab('A1', '1|dabray', 'A', { ouverture: '2015-01-01' }),
  etab('A2', '3|dabray', 'A', { ouverture: '2020-01-01' }),
  etab('A3', '5|dabray', 'A', { ouverture: '2010-01-01' }),
  // Repris : l'ancien a fermé, un nouveau est actif à la même clé.
  etab('F0', '7|dabray', 'F', { ouverture: '2012-01-01', fermeture: '2024-03-01' }),
  etab('A4', '7|dabray', 'A', { ouverture: '2024-09-01' }),
  // Vidées dans la fenêtre de trois ans, sans reprise.
  etab('F1', '9|dabray', 'F', { ouverture: '2018-01-01', fermeture: '2025-11-15', activite_libelle: 'Coiffure' }),
  etab('F2', '11|dabray', 'F', { ouverture: '2019-01-01', fermeture: '2026-02-01' }),
  // Vidée il y a longtemps : sans doute plus un commerce.
  etab('F3', '13|dabray', 'F', { ouverture: '2000-01-01', fermeture: '2019-06-01' }),
];

test('la vacance au registre compte les adresses vidées récemment, pas celles reprises ni celles vidées depuis longtemps', () => {
  const v = vacanceAuRegistre(ZONE, { aujourdhui: AUJOURDHUI });
  assert.equal(v.occupees, 4, 'le 7 est repris, donc occupé');
  assert.equal(v.vides, 2);
  assert.equal(v.anciennes, 1);
  assert.equal(v.adresses, 6, 'l\'adresse vidée en 2019 ne compte ni vide ni occupée');
  assert.equal(v.taux, 33.3);
  assert.equal(v.lignes[0].cle, '11|dabray', 'la plus récente d\'abord');
  assert.equal(v.lignes[1].activite_libelle, 'Coiffure');
  assert.equal(vacanceAuRegistre([], { aujourdhui: AUJOURDHUI }).taux, null);
  // Un établissement sans clé d'adresse ne se range nulle part.
  assert.equal(vacanceAuRegistre([{ siret: 'X', etat: 'A', adresse: 'PLACE SANS NUMERO' }]).adresses, 0);
});

test('le rythme des fermetures rapporte les douze derniers mois au stock, et se dit en « un sur N »', () => {
  const r = rythmeDesFermetures(ZONE, { aujourdhui: AUJOURDHUI });
  assert.equal(r.actifs, 4);
  assert.equal(r.fermees_12_mois, 2, 'F1 et F2 ; F0 a plus d\'un an');
  assert.equal(r.taux_annuel, 33.3);
  assert.equal(r.un_sur, 3);
  const calme = rythmeDesFermetures(ZONE.filter((e) => e.etat === 'A'), { aujourdhui: AUJOURDHUI });
  assert.equal(calme.taux_annuel, 0);
  assert.equal(calme.un_sur, null);
});

test('la zone se classe parmi les rues de la commune qui ont assez d\'adresses', () => {
  const rue = (nom, occupees, vides) => [
    ...Array.from({ length: occupees }, (_, i) => etab(`${nom}A${i}`, `${i + 1}|${nom}`, 'A')),
    ...Array.from({ length: vides }, (_, i) => etab(`${nom}F${i}`, `${100 + i}|${nom}`, 'F', { fermeture: '2026-01-01' })),
  ];
  const commune = [...rue('calme', 10, 0), ...rue('moyenne', 9, 1), ...rue('tendue', 5, 5), ...rue('courte', 2, 1)];
  const r = rangParmiLesRues(20, commune, { aujourdhui: AUJOURDHUI });
  assert.equal(r.rues_comptees, 3, `la rue courte a moins de ${MINIMUM_ADRESSES_RUE} adresses`);
  assert.equal(r.mediane_des_rues, 10);
  assert.equal(r.rang, 67, 'deux rues sur trois ont moins de vacance que la zone');
  assert.equal(rangParmiLesRues(null, commune), null);
  assert.equal(rangParmiLesRues(20, []), null);
});

test('un taux se compare à celui de la commune par un mot, jamais par un score', () => {
  assert.deepEqual(comparer(12, 6), { ratio: 2, mot: 'au-dessus' });
  assert.deepEqual(comparer(3, 6), { ratio: 0.5, mot: 'en dessous' });
  assert.deepEqual(comparer(7, 6), { ratio: 1.2, mot: 'dans la moyenne' });
  assert.equal(comparer(7, 6).ratio < 1.5, true);
  assert.deepEqual(comparer(2, 0), { ratio: null, mot: 'au-dessus' }, 'une commune sans vacant : tout vide est au-dessus');
  assert.equal(comparer(null, 6), null);
  assert.equal(comparer(6, null), null);
});

test('le verdict tranche quand les deux lectures convergent, hésite quand elles divergent, se tait sans matière', () => {
  const visible = (taux, total = 80) => ({ zone: { taux, total, vides: Math.round(total * taux / 100) }, commune: { taux: 6 } });
  const registre = (taux, adresses = 50) => ({ zone: { taux, adresses, fenetre_ans: 3 }, commune: { taux: 8 }, rang: { rang: 70 } });
  const rythme = { zone: { actifs: 40, fermees_12_mois: 4, taux_annuel: 9.1, un_sur: 11 }, commune: { taux_annuel: 8 } };

  const forte = verdictVacance({ visible: visible(14), registre: registre(18), rythme });
  assert.equal(forte.niveau, 'forte');
  assert.match(forte.phrase, /^Vacance forte/);
  assert.equal(forte.appuis.length, 3);
  // La préposition suit le mot : « au-dessus DE la commune », jamais « au-dessus la commune ».
  assert.match(forte.appuis[0].phrase, /14 % des 80 devantures .* au-dessus de la commune \(6 %\)/);
  assert.match(forte.appuis[1].repere, /70 % des rues/);
  assert.match(forte.appuis[2].phrase, /4 commerces sur 44 ont fermé en un an, un sur 11/);

  const faible = verdictVacance({ visible: visible(2), registre: registre(3) });
  assert.equal(faible.niveau, 'faible');
  assert.match(faible.phrase, /peu de locaux vides/);
  assert.match(faible.appuis[0].phrase, /en dessous de la commune/);
  assert.match(verdictVacance({ visible: visible(7), registre: registre(7) }).appuis[0].phrase, /comme la commune/);

  // L'indicateur de droite : un cran, face à la moyenne de la ville. Il suit
  // le registre quand il tient, plus complet que les devantures relevées.
  assert.equal(forte.face_ville.cran, 'eleve');
  assert.equal(forte.face_ville.source, 'registre');
  assert.equal(forte.face_ville.zone, 18);
  assert.equal(forte.face_ville.ville, 8);
  assert.equal(faible.face_ville.cran, 'faible');
  assert.equal(verdictVacance({ visible: visible(7), registre: registre(7) }).face_ville.cran, 'moyen');
  // Sans registre exploitable, il se rabat sur la rue.
  const surLaRue = verdictVacance({ visible: visible(14), registre: { zone: { taux: 50, adresses: 4 } } });
  assert.equal(surLaRue.face_ville.source, 'visible');

  // Aux seuils exacts : 5 % n'est plus frictionnelle, 10 % est structurelle.
  assert.equal(verdictVacance({ visible: { zone: { taux: 5, total: 80 } }, registre: { zone: { taux: 5, adresses: 50 } } }).niveau, 'moyenne');
  assert.equal(verdictVacance({ visible: { zone: { taux: 10, total: 80 } }, registre: { zone: { taux: 10, adresses: 50 } } }).niveau, 'forte');
  assert.equal(SEUILS.frictionnelle, 5);

  // La commune corrige d'un cran : 7 % là où la commune est à 2 % devient forte.
  const relative = verdictVacance({ visible: { zone: { taux: 7, total: 80 }, commune: { taux: 2 } }, registre: { zone: { taux: 7, adresses: 50 }, commune: { taux: 2 } } });
  assert.equal(relative.niveau, 'forte');

  // Divergence : la rue dit peu, le registre dit beaucoup.
  const divergent = verdictVacance({ visible: visible(1), registre: registre(20) });
  assert.equal(divergent.niveau, 'moyenne');
  assert.match(divergent.phrase, /ne disent pas la même chose/);
  assert.ok(divergent.reserves.some((r) => /plancher/.test(r)));

  // Une seule lecture porte le verdict, et c'est écrit.
  const seule = verdictVacance({ visible: visible(14), registre: { zone: { taux: 50, adresses: 4 } } });
  assert.equal(seule.niveau, 'forte');
  assert.ok(seule.reserves.some((r) => /Une seule lecture/.test(r)));
  assert.ok(seule.reserves.some((r) => /4 adresses commerçantes .* trop peu/.test(r)));

  // Sans matière, rien.
  const rien = verdictVacance({ visible: { zone: { taux: 0, total: MINIMUM_DEVANTURES - 1 } }, registre: { zone: { taux: 0, adresses: MINIMUM_ADRESSES - 1 } } });
  assert.equal(rien.niveau, 'inconnue');
  assert.equal(rien.face_ville, null, 'sans matière, aucun cran à montrer');
  assert.equal(rien.appuis.length, 0);
  assert.equal(rien.reserves.length, 2);
  assert.equal(verdictVacance({}).niveau, 'inconnue');

  assert.equal(resumerVerdict(forte, visible(14)), 'vacance forte : 14 % de devantures vides');
  assert.equal(resumerVerdict(rien, {}), 'vacance non mesurable');
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
