// Le dataset d'apprentissage : le gel temporel, l'échantillonnage, le verrou.
//
// La seule chose qui puisse invalider tout le projet est une variable qui
// voit le futur. Ces tests fabriquent des locaux et vérifient qu'à la date T,
// rien de postérieur à T ne transpire — ni dans les mutations, ni chez le
// propriétaire, ni dans la rotation de portefeuille.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ml-'));
const { alea, indexerLocaux, featuresA, echantillonner, verrouLocatif, COLONNES_FEATURES } = await import('./dataset-ml.js');
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
    ['33063000AB0001', ['2021-02-01']],   // la parcelle du local : ne compte pas
  ]);
  const f = featuresA(local, '2022-06-01', { pm, ventesParParcelle: ventes, rues: null, procedures: null });
  assert.equal(f.taille_portefeuille, 3);
  assert.equal(f.nb_ventes_autres_24m, 1);
  assert.equal(f.a_vendu_ailleurs_24m, 1);
});

test('l’échantillonnage : un an de recul, des témoins non vendus, reproductible', () => {
  const lignes = [ligneDvf({ id: 'v1', date: '2023-06-15' })];
  for (let i = 2; i <= 9; i += 1) {
    lignes.push(ligneDvf({ id: `t${i}`, date: '2021-03-01', parcelle: `33063000AB000${i}`, numero: String(10 + i) }));
  }
  // Un piège : un local qui se vend DANS l'horizon des 12 mois — jamais témoin.
  lignes.push(ligneDvf({ id: 'p1', date: '2021-03-01', parcelle: '33063000AC0001', numero: '99' }));
  lignes.push(ligneDvf({ id: 'p2', date: '2022-09-01', parcelle: '33063000AC0001', numero: '99' }));

  const locaux = indexerLocaux(lignes);
  const obs = echantillonner(locaux, { debut: '2022-01-01', fin: '2024-12-31', seed: 7 });
  const positifs = obs.filter((o) => o.y === 1);
  const negatifs = obs.filter((o) => o.y === 0);
  // Deux ventes dans la fenêtre : v1 (2023-06-15) et la revente p2 (2022-09-01).
  assert.equal(positifs.length, 2);
  assert.deepEqual(positifs.map((o) => o.T).sort(), ['2021-09-01', '2022-06-15'], 'chacune lue un an avant sa vente');
  assert.equal(negatifs.length, 6, 'trois témoins par vente');
  const temoinsDeV1 = negatifs.filter((o) => o.T === '2022-06-15');
  assert.equal(temoinsDeV1.length, 3, 'les témoins sont lus à la date de leur vente');
  assert.ok(!temoinsDeV1.some((o) => o.local.parcelle === '33063000AC0001'), 'un local vendu dans l’horizon n’est pas un témoin');
  // Reproductible : même seed, mêmes témoins.
  const obs2 = echantillonner(locaux, { debut: '2022-01-01', fin: '2024-12-31', seed: 7 });
  assert.deepEqual(obs2.map((o) => o.local.cle), obs.map((o) => o.local.cle));
  const obs3 = echantillonner(locaux, { debut: '2022-01-01', fin: '2024-12-31', seed: 8 });
  assert.notDeepEqual(obs3.filter((o) => !o.y).map((o) => o.local.cle), negatifs.map((o) => o.local.cle), 'un autre seed tire autrement');
});

test('le verrou locatif écarte l’adresse en procédure, pas la rue entière', () => {
  const locaux = indexerLocaux([ligneDvf({ id: 'm1', date: '2023-06-15', numero: '12' })]);
  const [local] = [...locaux.values()];
  const procedures = [{ date: '2022-01-10', rue: 'rue sainte catherine', numero: '12' }];
  assert.equal(verrouLocatif(local, '2022-06-15', procedures), true, 'procédure au 12, cinq mois avant T');
  assert.equal(verrouLocatif(local, '2024-06-15', procedures), false, 'trop vieux : plus de dix-huit mois');
  assert.equal(verrouLocatif(local, '2022-06-15', [{ ...procedures[0], numero: '48' }]), false, 'au 48, pas au 12');
  // La même procédure reste une VARIABLE au niveau de la rue.
  const f = featuresA(local, '2022-06-15', { pm: new Map(), ventesParParcelle: new Map(), rues: null, procedures });
  assert.equal(f.procedures_rue_18m, 1);
});

test('les colonnes du CSV sont stables et l’aléa est un vrai seed', () => {
  assert.equal(COLONNES_FEATURES.length, 17);
  const a = alea(42), b = alea(42);
  assert.equal(a(), b());
});
