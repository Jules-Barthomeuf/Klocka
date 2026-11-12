import test from 'node:test';
import assert from 'node:assert/strict';
import { voieDuNom } from './vacance-taux.js';
import { rueDifferente, sansForme, marqueDuNom, exploitantsDe, cellulesEstimees, rotationDe, cellulesDeLaRue, resumeDeLaRue, positionDuLocal, notePassage, conclusionRue } from './rue.js';

const AUJ = new Date('2026-11-11');
const e = (siret, { adresse = '12 RUE DE LA REPUBLIQUE 06600 ANTIBES', naf = '47.71Z', etat = 'actif', creation = '2015-03-10', fermeture = null, nom = 'X', enseigne = null, cat = '5710', lat = 43.58, lon = 7.12 } = {}) =>
  ({ siret, siren: siret.slice(0, 9), denomination: nom, enseigne, adresse, code_naf: naf, etat, date_creation: creation, date_fermeture: fermeture, categorie_juridique: cat, lat, lon });

test('les exploitants d\'une adresse : en boutique, dans la fenêtre de dix ans, les plus anciens d\'abord', () => {
  const xs = exploitantsDe([
    e('111111111_00010', { creation: '2018-01-01' }),
    e('222222222_00010', { creation: '2010-01-01', etat: 'ferme', fermeture: '2012-01-01' }),
    e('333333333_00010', { creation: '2012-01-01', etat: 'ferme', fermeture: '2019-06-01' }),
    e('444444444_00010', { naf: '47.91B', creation: '2020-01-01' }),
  ], { aujourdhui: AUJ });
  assert.deepEqual(xs.map((x) => x.siret), ['333333333_00010', '111111111_00010']);
  assert.equal(xs[0].actif, false);
  assert.equal(xs[1].actif, true);
});

test('deux exploitants ouverts en même temps font deux cellules, qui se succèdent une seule', () => {
  const succession = exploitantsDe([
    e('111111111_00010', { creation: '2015-01-01', etat: 'ferme', fermeture: '2019-08-21' }),
    e('222222222_00010', { creation: '2019-09-01' }),
  ], { aujourdhui: AUJ });
  assert.equal(cellulesEstimees(succession, { aujourdhui: AUJ }), 1);
  const cote = exploitantsDe([e('111111111_00010', { creation: '2019-09-01' }), e('222222222_00010', { creation: '2025-04-30' })], { aujourdhui: AUJ });
  assert.equal(cellulesEstimees(cote, { aujourdhui: AUJ }), 2);
});

test('la rotation : stable jusqu\'à deux par cellule, à surveiller à trois, forte au-delà ; une domiciliation ne se lit pas', () => {
  const un = rotationDe(exploitantsDe([e('111111111_00010', { creation: '2015-01-01' })], { aujourdhui: AUJ }), { aujourdhui: AUJ });
  assert.equal(un.statut, 'ok');
  assert.equal(un.exploitants_10_ans, 1);
  // La durée se mesure dans la fenêtre de dix ans, pas depuis 2015.
  assert.equal(un.duree_moyenne_ans, 10);
  const trois = rotationDe(exploitantsDe([
    e('111111111_00010', { creation: '2017-01-01', etat: 'ferme', fermeture: '2019-01-01' }),
    e('222222222_00010', { creation: '2019-02-01', etat: 'ferme', fermeture: '2022-01-01' }),
    e('333333333_00010', { creation: '2022-02-01' }),
  ], { aujourdhui: AUJ }), { aujourdhui: AUJ });
  assert.equal(trois.statut, 'a_voir');
  assert.equal(trois.cellules_estimees, 1);
  const cinq = rotationDe(exploitantsDe([1, 2, 3, 4, 5].map((i) => e(`${i}${i}${i}${i}${i}${i}${i}${i}${i}_00010`, { creation: `20${16 + i}-01-01`, etat: i < 5 ? 'ferme' : 'actif', fermeture: i < 5 ? `20${17 + i}-06-01` : null })), { aujourdhui: AUJ }), { aujourdhui: AUJ });
  assert.equal(cinq.statut, 'alerte');
  const domicil = rotationDe(exploitantsDe([1, 2, 3, 4, 5, 6, 7, 8].map((i) => e(`${i}${i}${i}${i}${i}${i}${i}${i}${i}_00010`, { creation: '2020-01-01' })), { aujourdhui: AUJ }), { aujourdhui: AUJ });
  assert.equal(domicil.statut, 'vide');
  assert.match(domicil.verdict, /domiciliation/);
});

test('les cellules de la rue : par numéro, l\'état au registre, l\'enseigne nationale reconnue, les domiciliations à part', () => {
  const index = new Map([['monoprix', { n: 'Monoprix', w: 'Q1' }]]);
  const { cellules, domiciliations } = cellulesDeLaRue([
    e('111111111_00010', { adresse: '10 RUE DE LA REPUBLIQUE 06600 ANTIBES', enseigne: 'MONOPRIX' }),
    e('222222222_00010', { adresse: '12 RUE DE LA REPUBLIQUE 06600 ANTIBES', etat: 'ferme', fermeture: '2024-01-01', creation: '2016-01-01' }),
    e('333333333_00010', { adresse: '14 RUE DE LA REPUBLIQUE 06600 ANTIBES' }),
    e('444444444_00010', { adresse: '3 RUE VAUBAN 06600 ANTIBES' }),
    ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => e(`${i}${i}${i}${i}${i}${i}${i}${i}${i}_00020`, { adresse: '20 RUE DE LA REPUBLIQUE 06600 ANTIBES' })),
  ], voieDuNom('rue de la République'), { aujourdhui: AUJ, index });
  assert.deepEqual(cellules.map((c) => c.numero), [10, 12, 14]);
  assert.equal(cellules[0].enseigne_nationale, 'Monoprix');
  assert.equal(cellules[1].etat, 'vacant');
  assert.equal(cellules[1].dernier.ferme_le, '2024-01-01');
  assert.equal(domiciliations.length, 1);
  const r = resumeDeLaRue(cellules);
  assert.equal(r.vides, 1);
  assert.equal(r.part_enseignes_pct, 50);
  assert.equal(r.fiable, false);
});

test('la position : le tronçon du local et son rang parmi les tronçons', () => {
  const cellules = [];
  for (let n = 1; n <= 40; n += 1) cellules.push({ cle: `${n} RUE X`, numero: n, lat: 43.5 + n * 0.0001, lon: 7.1, etat: n <= 20 || n % 3 === 0 ? 'occupe' : 'vacant', enseigne_nationale: n === 4 ? 'Zara' : null, rotation: { par_cellule: 1 } });
  const p = positionDuLocal(cellules, '6 RUE X', { lat: 43.5006, lon: 7.1 });
  assert.ok(p.troncon.du <= 6 && p.troncon.au >= 6);
  assert.equal(p.place.rang, 1);
  assert.equal(p.enseigne_proche.nom, 'Zara');
  assert.equal(p.enseigne_proche.distance_m, 22);
});

test('la note de passage se rapporte à ce qui a pu être lu, et dit son pourquoi', () => {
  assert.equal(notePassage({}), null);
  const faible = notePassage({ rue: { cellules: 12, ouvertes: 2, enseignes_nationales: 0, noms_enseignes: [] }, transports: { genres: [], lourd: false }, voie: 'rue résidentielle' });
  assert.equal(faible.statut, 'alerte');
  assert.ok(faible.pourquoi.some((p) => /aucune enseigne/.test(p)));
  const fort = notePassage({
    rue: { cellules: 40, ouvertes: 30, enseignes_nationales: 6, noms_enseignes: ['Zara', 'Fnac', 'Sephora', 'H&M'] },
    position: { troncon: { occupes: 14, du: 2, au: 30 }, max_densite: 14, place: { mot: 'le cœur commerçant de la rue' } },
    transports: { genres: ['métro', 'bus'], lourd: true }, voie: 'rue piétonne',
    vues: { impression_passage: 9, pourquoi: 'rue piétonne bondée, vitrines ouvertes', date: '2024-06' },
  });
  assert.equal(fort.statut, 'ok');
  assert.ok(fort.note >= 9);
  assert.deepEqual(fort.manque, []);
  const sansPhoto = notePassage({ rue: { cellules: 40, ouvertes: 30, enseignes_nationales: 6, noms_enseignes: [] }, transports: { genres: ['métro'], lourd: true } });
  assert.ok(sansPhoto.manque.includes('vues'));
  // Une rue de deux cellules ne dit rien de son passage : ni tronçon ni enseignes ne notent.
  const minuscule = notePassage({ rue: { cellules: 2, ouvertes: 2, enseignes_nationales: 0, noms_enseignes: [] }, position: { troncon: { occupes: 2, du: 1, au: 3 }, max_densite: 2 } });
  assert.equal(minuscule, null);
});

test('la conclusion tranche sur ce qu\'elle a, et le dit quand elle n\'a rien', () => {
  assert.equal(conclusionRue({}).statut, 'vide');
  const oui = conclusionRue({ rotation: { statut: 'ok' }, rue: { fiable: true, vacance_registre_pct: 5 }, passage: { note: 8 } });
  assert.equal(oui.statut, 'ok');
  const non = conclusionRue({ rotation: { statut: 'alerte' }, rue: { fiable: true, vacance_registre_pct: 25 }, passage: { note: 3 }, local: { etat: 'vacant' } });
  assert.equal(non.statut, 'alerte');
  assert.ok(non.raisons.some((r) => /vide aujourd/.test(r)));
  const seul = conclusionRue({ rotation: { statut: 'ok' } });
  assert.equal(seul.statut, 'a_voir');
  assert.match(seul.phrase, /Trop peu lu/);
});

test('la forme juridique sort du nom avant la marque : « DUPONT SAS » n\'est pas l\'enseigne SAS', () => {
  assert.equal(sansForme('DUPONT SAS'), 'DUPONT');
  assert.equal(sansForme('SARL LE FOURNIL'), 'LE FOURNIL');
  const index = new Map([['sas', { n: 'SAS', w: 'Q1' }], ['picard', { n: 'Picard', w: 'Q2' }]]);
  assert.equal(marqueDuNom('DUPONT SAS', index), null);
  assert.equal(marqueDuNom('PICARD SURGELES SAS', index)?.n, 'Picard');
});

test('la rue reconnue qui n\'est pas celle écrite se signale ; une abréviation ou un prénom omis, non', () => {
  assert.deepEqual(rueDifferente('18 avenue Auguste Dumas, 83000 Toulon', 'Avenue Auguste Aiguier'), { ecrite: 'avenue Auguste Dumas' });
  assert.equal(rueDifferente('42 AVENUE DE SAXE, 69006 LYON', 'Avenue Maréchal de Saxe'), null);
  assert.equal(rueDifferente('16 Av. Franklin Delano Roosevelt, 75008 Paris', 'Avenue Franklin D. Roosevelt'), null);
  assert.equal(rueDifferente('12 rue de la République, 69002 Lyon', 'Rue de la République'), null);
  assert.equal(rueDifferente('1 bis, 75009 Paris', 'Rue de la Tour des Dames'), null);
});
