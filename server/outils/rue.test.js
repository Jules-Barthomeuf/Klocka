import test from 'node:test';
import assert from 'node:assert/strict';
import { voieDuNom } from './vacance-taux.js';
import { rueDifferente, sansForme, marqueDuNom, exploitantsDe, cellulesEstimees, rotationDe, cellulesDeLaRue, resumeDeLaRue, positionDuLocal, rangsDeLaCommune, conclusionRue } from './rue.js';

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

test('le classement de la commune : chaque rue de quatre cellules au moins, un commerce ouvert du milieu, la rue de tête', () => {
  const es = [];
  for (let i = 1; i <= 6; i += 1) es.push(e(`1000000000000${i}`, { adresse: `${i * 2} RUE DE LA REPUBLIQUE 06600 ANTIBES`, nom: `BOUTIQUE ${i}`, lat: 43.58 + i / 10000 }));
  for (let i = 1; i <= 4; i += 1) es.push(e(`2000000000000${i}`, { adresse: `${i} RUE DES PECHEURS 06600 ANTIBES`, nom: `ATELIER ${i}`, etat: i > 1 ? 'ferme' : 'actif', fermeture: i > 1 ? '2024-01-01' : null }));
  es.push(e('30000000000001', { adresse: '3 IMPASSE DU PORT 06600 ANTIBES' }));
  const r = rangsDeLaCommune(es, { aujourdhui: AUJ, index: new Map() });
  assert.equal(r.rues.length, 2, 'l\'impasse d\'une cellule ne compte pas');
  assert.deepEqual([...r.ouvertes].sort(), [1, 6]);
  assert.equal(r.tete.ouvertes, 6);
  assert.match(r.tete.exemple, /RUE DE LA REPUBLIQUE 06600 ANTIBES$/);
  assert.equal(r.tete.nom, 'RUE DE LA REPUBLIQUE');
  assert.ok(Number.isFinite(r.tete.centre.lat));
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

// 13 nov. 2026, Jules : « dans 4 exploitants, Du pareil au même deux fois, puis Minili et Minili SAS ».
test('un même commerce ne compte qu’une fois : même société, ou même nom sans forme juridique', async () => {
  const { fusionnerExploitants, rotationDe } = await import('./rue.js');
  const x = (siren, nom, ouvert, ferme = null) => ({ siret: `${siren}00010`, siren, nom, ouvert, ferme, actif: !ferme, naf: '47.71Z' });
  const brut = [
    x('111', 'DU PAREIL AU MEME', '2016-03-01', '2019-06-30'),
    x('111', 'DU PAREIL AU MÊME', '2019-07-01', '2021-01-31'),
    x('222', 'MINILI', '2021-03-01', '2023-02-28'),
    x('333', 'MINILI SAS', '2023-03-01'),
  ];
  const f = fusionnerExploitants(brut);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((e) => [e.ouvert, e.ferme, e.actif]), [['2016-03-01', '2021-01-31', false], ['2021-03-01', null, true]]);
  assert.equal(f[1].nom, 'MINILI SAS', 'le nom de l’exploitant en place');
  assert.equal(rotationDe(f, { aujourdhui: new Date('2026-11-13') }).exploitants_10_ans, 2);
  // Deux commerces différents restent deux.
  assert.equal(fusionnerExploitants([x('444', 'BOULANGERIE MARTIN', '2015-01-01', '2020-01-01'), x('555', 'FLEURS ET CIE', '2020-02-01')]).length, 2);
});
