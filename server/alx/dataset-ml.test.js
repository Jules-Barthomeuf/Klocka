// Le dataset d'apprentissage : le gel temporel, l'univers adresse, le verrou.
//
// La seule chose qui puisse invalider tout le projet est une variable qui
// voit le futur. Ces tests fabriquent des parcelles, des vitrines et des
// millésimes, et vérifient qu'à la date T rien de postérieur ne transpire —
// ni dans les mutations, ni chez le propriétaire, ni dans le cycle du bail.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ml-'));
const { alea, indexerLocaux, mutationsParParcelle, featuresA, observationsAdresse, parcellesCommercantes, installationDe, verrouLocatif, COLONNES_FEATURES } = await import('./dataset-ml.js');
const { grouper, parParcelle, parSiren } = await import('./personnes-morales.js');

// --- Des lignes DVF fabriquées -----------------------------------------------

const ligneDvf = ({ id, date, prix = 300000, parcelle = '33063000AB0001', type = 'Local industriel. commercial ou assimilé', rue = 'RUE SAINTE-CATHERINE', numero = '12', surface = 80, nature = 'Vente' }) => ({
  id_mutation: id, date_mutation: date, valeur_fonciere: prix, id_parcelle: parcelle,
  type_local: type, adresse_nom_voie: rue, adresse_numero: numero, surface_reelle_bati: surface, nature_mutation: nature,
});

test('l’inventaire garde l’adresse, la surface et les mutations datées', () => {
  const locaux = indexerLocaux([
    ligneDvf({ id: 'm1', date: '2022-03-15' }),
    ligneDvf({ id: 'm2', date: '2024-06-01', prix: 420000 }),
    ligneDvf({ id: 'm3', date: '2023-01-01', parcelle: '33063000AB0002', numero: '14' }),
  ]);
  assert.equal(locaux.size, 2);
  const [a] = [...locaux.values()];
  assert.equal(a.rue, 'RUE SAINTE-CATHERINE');
  assert.equal(a.surface, 80);
  assert.deepEqual(a.mutations.map((m) => m.date), ['2022-03-15', '2024-06-01'], 'triées');
  // L'agrégation par parcelle, granularité de l'univers adresse.
  const parParcelleDvf = mutationsParParcelle(locaux);
  assert.equal(parParcelleDvf.get('33063000AB0001').length, 2);
});

test('rien de postérieur à T ne transpire dans les variables', () => {
  const locaux = indexerLocaux([
    ligneDvf({ id: 'm1', date: '2021-05-01', prix: 250000 }),
    ligneDvf({ id: 'm2', date: '2023-06-01', prix: 400000 }),
  ]);
  const [local] = [...locaux.values()];
  const ctx = { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures: null };
  const f = featuresA(local, '2022-06-01', ctx);
  // La mutation de 2023 n'existe pas encore : seule celle de 2021 se voit.
  assert.equal(f.deja_mute, 1);
  assert.equal(f.dernier_prix, 250000);
  assert.ok(Math.abs(f.mois_depuis_mutation - 13) < 1);
  // Avant toute mutation, il n'y a rien — pas des zéros, des trous.
  const avant = featuresA(local, '2021-01-01', ctx);
  assert.equal(avant.deja_mute, 0);
  assert.equal(avant.dernier_prix, null);
  assert.equal(avant.mois_depuis_mutation, null);
});

// --- Le propriétaire, par millésime -------------------------------------------

const ENTETE = '"Département (Champ géographique)";"Code Direction";"Code Commune";"Nom Commune";"Préfixe";"Section";"N° plan";"Bâtiment";"Entrée";"Niveau";"Porte";"N° voirie";"Indice";"Code voie MAJIC";"Code voie rivoli";"Nature voie";"Nom voie";"Code droit";"N° MAJIC";"N° SIREN";"Groupe personne";"Forme juridique";"Forme juridique abrégée";"Dénomination"';
const lignePm = ({ commune = '063', section = 'AB', plan = '0001', siren = '111111111', forme = 'SCI', nom = 'SCI DES MURS', niveau = '00' }) =>
  `"33";"0";"${commune}";"BORDEAUX";"   ";"${section}";"${plan}";"A";"01";"${niveau}";"01001";"12";"";"00060";"B060";"";"RUE SAINTE-CATHERINE";"P";"XXXXXX";"${siren}";"0";"6540";"${forme}";"${nom}"`;

const millesime = (lignes) => {
  const g = grouper([ENTETE, ...lignes]);
  return { parcelles: parParcelle(g), sirens: parSiren(g) };
};

test('le propriétaire vient du millésime de l’année de T, pas d’aujourd’hui', () => {
  const locaux = indexerLocaux([ligneDvf({ id: 'm1', date: '2021-02-01' })]);
  const [local] = [...locaux.values()];
  const pm = new Map([
    [2021, millesime([lignePm({ siren: '111111111' })])],
    [2022, millesime([lignePm({ siren: '111111111' })])],
    // En 2023, la parcelle a changé de mains.
    [2023, millesime([lignePm({ siren: '222222222', forme: 'SARL', nom: 'SARL NOUVELLE' })])],
  ]);
  const ctx = { pm, ventesParParcelle: new Map(), rues: null, procedures: null };

  const en2022 = featuresA(local, '2022-06-01', ctx);
  assert.equal(en2022.est_personne_morale, 1);
  assert.equal(en2022.forme_sci, 1);
  assert.equal(en2022.detention_min_annees, 1, 'présent depuis 2021, lu en 2022');
  assert.equal(en2022.detention_censuree, 1, 'présent dès le plus vieux millésime : on ne sait pas avant');

  const en2023 = featuresA(local, '2023-06-01', ctx);
  assert.equal(en2023.forme_sci, 0, 'la SARL de 2023, pas la SCI d’avant');
  assert.equal(en2023.detention_min_annees, 0, 'arrivée cette année-là');
  assert.equal(en2023.detention_censuree, 0, 'on l’a vue arriver : la durée est exacte');
});

test('la rotation ne compte que les ventes d’AVANT T, sur les AUTRES parcelles', () => {
  const locaux = indexerLocaux([ligneDvf({ id: 'm1', date: '2021-02-01' })]);
  const [local] = [...locaux.values()];
  const pm = new Map([[2022, millesime([
    lignePm({ plan: '0001', siren: '111111111' }),
    lignePm({ plan: '0002', siren: '111111111' }),
    lignePm({ plan: '0003', siren: '111111111' }),
  ])]]);
  const ventes = new Map([
    ['33063000AB0002', ['2021-09-01']],   // avant T : compte
    ['33063000AB0003', ['2023-01-01']],   // après T : invisible
    ['33063000AB0001', ['2021-02-01']],   // la parcelle du sujet : ne compte pas
  ]);
  const f = featuresA(local, '2022-06-01', { pm, ventesParParcelle: ventes, rues: null, procedures: null });
  assert.equal(f.taille_portefeuille, 3);
  assert.equal(f.nb_ventes_autres_24m, 1);
  assert.equal(f.a_vendu_ailleurs_24m, 1);
});

// --- L'univers adresse ----------------------------------------------------------

const carre = (id, lat, lon, cote = 0.0004) => ({ id, c: [[lat, lon], [lat + cote, lon], [lat + cote, lon + cote], [lat, lon + cote], [lat, lon]] });

test('les vitrines se regroupent par parcelle, la plus vieille installation gagne', async () => {
  const { indexerParcelles } = await import('./cadastre.js');
  const cadastre = indexerParcelles([carre('33063000AB0001', 44.84, -0.57), carre('33063000AB0002', 44.84, -0.5694)]);
  const { parcelles, sans_parcelle } = parcellesCommercantes([
    { lat: 44.8401, lon: -0.5698, rue: 'Rue Sainte-Catherine', numero: '12', enseigne: 'Boulangerie', installation: '2015-03-01' },
    { lat: 44.8402, lon: -0.5697, rue: 'Rue Sainte-Catherine', numero: '12', enseigne: 'Opticien', installation: '2021-09-01' },
    { lat: 44.8401, lon: -0.5692, rue: 'Rue Sainte-Catherine', numero: '14', enseigne: 'Bar', installation: null },
    { lat: 44.9, lon: -0.4, rue: 'Ailleurs', numero: null, enseigne: 'Perdu', installation: null },
  ], cadastre);
  assert.equal(parcelles.size, 2);
  assert.equal(sans_parcelle, 1, 'la vitrine hors cadastre est comptée, pas inventée');
  const p1 = parcelles.get('33063000AB0001');
  assert.equal(p1.vitrines_parcelle, 2);
  assert.equal(p1.installation, '2015-03-01', 'le bail le plus mûr : la plus vieille installation');
});

test('l’étiquette dit la vente dans les douze mois, la prévalence est celle du marché', () => {
  const locaux = indexerLocaux([
    ligneDvf({ id: 'v1', date: '2022-06-15' }),                                  // vendue dans l'horizon de T=2022
    ligneDvf({ id: 'v2', date: '2024-03-01', parcelle: '33063000AB0002' }),      // vendue bien après
  ]);
  const mutations = mutationsParParcelle(locaux);
  const parcelles = new Map([
    ['33063000AB0001', { parcelle: '33063000AB0001', rue: 'RUE SAINTE-CATHERINE', numero: '12', vitrines_parcelle: 1, enseignes: [], installation: null }],
    ['33063000AB0002', { parcelle: '33063000AB0002', rue: 'RUE SAINTE-CATHERINE', numero: '14', vitrines_parcelle: 1, enseignes: [], installation: null }],
    ['33063000AB0003', { parcelle: '33063000AB0003', rue: 'RUE SAINTE-CATHERINE', numero: '16', vitrines_parcelle: 1, enseignes: [], installation: null }],
  ]);
  const obs = observationsAdresse(parcelles, mutations, { references: ['2022-01-01', '2023-01-01'] });
  assert.equal(obs.length, 6, 'trois parcelles fois deux dates : pas d’échantillonnage');
  const en2022 = Object.fromEntries(obs.filter((o) => o.T === '2022-01-01').map((o) => [o.sujet.parcelle, o]));
  assert.equal(en2022['33063000AB0001'].y, 1, 'vendue en juin 2022');
  assert.equal(en2022['33063000AB0001'].date_vente, '2022-06-15');
  assert.equal(en2022['33063000AB0002'].y, 0, 'sa vente de 2024 est hors horizon');
  assert.equal(en2022['33063000AB0003'].y, 0, 'jamais vendue : le vrai négatif, celui que DVF seul ne voyait pas');
  const en2023 = Object.fromEntries(obs.filter((o) => o.T === '2023-01-01').map((o) => [o.sujet.parcelle, o]));
  assert.equal(en2023['33063000AB0001'].y, 0, 'sa vente est PASSÉE à cette date, pas à venir');
});

test('le cycle du bail : l’installation date le commerce, l’échéance se compte en mois', () => {
  const sujet = { parcelle: 'x', rue: null, numero: null, mutations: [], installation: '2014-01-01' };
  const f = featuresA(sujet, '2023-01-01', { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures: null });
  assert.equal(f.mois_depuis_installation, 108, 'neuf ans');
  assert.equal(f.proximite_echeance_369, 0, 'pile sur une échéance triennale');
  const milieu = featuresA({ ...sujet, installation: '2021-07-01' }, '2023-01-01', { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures: null });
  assert.equal(milieu.proximite_echeance_369, 18, 'au milieu du cycle');
  // Installé APRÈS T : le commerce n'existait pas, la variable non plus.
  const futur = featuresA({ ...sujet, installation: '2024-01-01' }, '2023-01-01', { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures: null });
  assert.equal(futur.mois_depuis_installation, null);
});

test('l’installation d’une vitrine se retrouve dans l’annuaire de sa rue', () => {
  const annuaire = {
    'rue sainte catherine': [
      { numero: '12', nom: 'BOULANGERIE DUPONT', creation: '2012-05-01' },
      { numero: '14', nom: 'OPTIQUE MARTIN', creation: '2020-01-01' },
    ],
  };
  assert.equal(installationDe({ rue: 'Rue Sainte-Catherine', numero: '12', enseigne: 'Boulangerie Dupont' }, annuaire), '2012-05-01');
  assert.equal(installationDe({ rue: 'Rue Sainte-Catherine', numero: '14', enseigne: null }, annuaire), '2020-01-01', 'sans enseigne mais seul à ce numéro');
  assert.equal(installationDe({ rue: 'Rue Inconnue', numero: '1', enseigne: 'X' }, annuaire), null);
});

test('le verrou locatif écarte l’adresse en procédure, pas la rue entière', () => {
  const sujet = { parcelle: 'x', rue: 'RUE SAINTE-CATHERINE', numero: '12', mutations: [] };
  const procedures = [{ date: '2022-01-10', rue: 'rue sainte catherine', numero: '12' }];
  assert.equal(verrouLocatif(sujet, '2022-06-15', procedures), true, 'procédure au 12, cinq mois avant T');
  assert.equal(verrouLocatif(sujet, '2024-06-15', procedures), false, 'trop vieux : plus de dix-huit mois');
  assert.equal(verrouLocatif(sujet, '2022-06-15', [{ ...procedures[0], numero: '48' }]), false, 'au 48, pas au 12');
  // La même procédure reste une VARIABLE au niveau de la rue.
  const f = featuresA(sujet, '2022-06-15', { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures });
  assert.equal(f.procedures_rue_18m, 1);
});

test('les colonnes du CSV sont stables et l’aléa est un vrai seed', () => {
  assert.equal(COLONNES_FEATURES.length, 21);
  const a = alea(42), b = alea(42);
  assert.equal(a(), b());
});
