import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreValide, classement, pointsEstimation, finDeBail, rueEtVille, actifDeProjet, quatreRues, rueDeLecture, ruesJouables, decouperAdresse } from './jeux-immo.js';

test('jeux : les points d\'une estimation de loyer', () => {
  assert.equal(pointsEstimation(500, 500), 100);
  assert.equal(pointsEstimation(540, 500), 100);
  assert.equal(pointsEstimation(1000, 500), 0);
  const p = pointsEstimation(650, 500);
  assert.ok(p > 0 && p < 100);
  assert.equal(pointsEstimation(0, 500), 0);
});

test('jeux : la fin de bail telle qu\'écrite dans les dossiers', () => {
  assert.equal(finDeBail('2033-04-22'), '2033-04-22');
  assert.equal(finDeBail('31 janvier 2028'), '2028-01-31');
  assert.equal(finDeBail('2031'), '2031-12-31');
  assert.equal(finDeBail('Bail 10 ans ferme à compter de 2021'), '2031-12-31');
  assert.equal(finDeBail(''), null);
  assert.equal(finDeBail('à voir'), null);
});

test('jeux : un dossier devient un actif, avec ses défauts lus dans les faits', () => {
  assert.deepEqual(rueEtVille('12 rue de la République, 69002 Lyon'), { rue: 'rue de la republique', ville: 'lyon' });
  const rues = [rueDeLecture({ adresse: '12 rue de la République, 69002 Lyon', resultat: { source: 'Equimmox · Analyse de loyer', adresse: '12 Rue de la République 69002 Lyon', bas: 547, moyenne: 684, haut: 820, rayon: '200m', base: 'baux' } })];
  const kfc = actifDeProjet({ id: 'k', nom_locataire: 'KFC', adresse_complete: '12 rue de la République, 69002 Lyon', prix_acquisition: 1650000, loyer_annuel_ht: 95000, surface_m2: 180, echeance_bail: '2033-04-22' }, { rues, aujourdhui: '2026-11-26' });
  assert.equal(kfc.rendement, 5.8);
  assert.equal(kfc.loyer_m2, 528);
  assert.ok(kfc.atouts.some((a) => /sous les baux autour/.test(a)));
  assert.equal(kfc.loyer_autour.rayon, '200m');
  assert.ok(kfc.atouts.some((a) => /jusqu'en 2033/.test(a)));
  const echu = actifDeProjet({ id: 'm', adresse_complete: '5 Place de la Libération, 56100 Lorient', prix_acquisition: 295000, loyer_annuel_ht: 27500, echeance_bail: '2014-04-30', notes_diagnostique: [{ titre: 'Électricité', contenu: 'anomalies' }, { titre: 'Électricité', contenu: 'anomalies encore' }] }, { aujourdhui: '2026-11-26' });
  assert.ok(echu.defauts.some((d) => /Bail échu depuis 13 ans/.test(d)));
  assert.equal(echu.defauts.filter((d) => /^Électricité/.test(d)).length, 1);
  assert.ok(echu.note < echu.rendement);
  assert.equal(actifDeProjet({ adresse_complete: 'Lorient', prix_acquisition: 1, loyer_annuel_ht: 1 }), null);
});

test('jeux : quatre rues d\'une ville, à classer', () => {
  const r = (n, m) => ({ adresse: `${n} Rue ${n}`, rue: `Rue ${n}`, ville: 'Toulouse', loyer: { basse: m * 0.8, haute: m * 1.2, milieu: m } });
  const quatre = quatreRues([r(1, 100), r(2, 104), r(3, 150), r(4, 200), r(5, 260), r(6, 330)], () => 0.3);
  assert.equal(quatre.length, 4);
  const tri = quatre.map((x) => x.loyer.milieu).sort((a, b) => a - b);
  for (let i = 1; i < 4; i += 1) assert.ok(tri[i] >= tri[i - 1] * 1.1);
  assert.deepEqual(quatreRues([r(1, 100), r(2, 300)]), []);
});

test('jeux : les lectures Equimmox, une par adresse, au plus petit rayon', () => {
  assert.deepEqual(decouperAdresse('12 Rue de la République 69002 Lyon'), { rue: 'Rue de la République', ville: 'Lyon' });
  assert.deepEqual(decouperAdresse('10 Place Abel Surchamp, 33500 - Libourne'), { rue: 'Place Abel Surchamp', ville: 'Libourne' });
  assert.equal(decouperAdresse('Lyon'), null);
  const lu = (rayon, moyenne) => ({ adresse: '20 rue Esquermoise, Lille', le: '2026-11-01', resultat: { adresse: '20 Rue Esquermoise 59800 Lille', bas: moyenne - 50, moyenne, haut: moyenne + 50, rayon, base: 'baux' } });
  const r = ruesJouables([lu('1000m', 400), lu('200m', 512), lu('500m', 450), { adresse: 'x', resultat: { error: 'non' } }]);
  assert.equal(r.length, 1);
  assert.equal(r[0].loyer.milieu, 512);
  assert.equal(r[0].rue, 'Rue Esquermoise');
});

test('jeux : une paire ne se joue qu\'une fois tranchée par l\'équipe', async () => {
  const { pairesAVerifier, pairePourJouer, clePaire } = await import('./jeux-immo.js');
  const a = (id, note) => ({ id, note });
  const actifs = [a('1', 5), a('2', 6), a('3', 9)];
  assert.equal(clePaire('2', '1'), '1|2');
  const verdicts = [{ paire: '1|2', a_id: '1', b_id: '2', choix: '2', pourquoi: 'bail long', etat: 'valide' }, { paire: '1|3', a_id: '1', b_id: '3', etat: 'ecartee' }];
  const reste = pairesAVerifier(actifs, verdicts);
  assert.deepEqual(reste.map(([x, y]) => clePaire(x.id, y.id)), ['2|3']);
  const p = pairePourJouer(actifs, verdicts, () => 0.1);
  assert.equal(p.verdict.choix, '2');
  assert.deepEqual(p.actifs.map((x) => x.id).sort(), ['1', '2']);
  assert.equal(pairePourJouer(actifs, [verdicts[1]]), null);
  assert.equal(pairePourJouer([a('1', 5)], verdicts), null);
});

test('jeux : les annonces de murs loués de l\'export Equimmox, pour le rendement', async () => {
  const { annoncesDeLExport } = await import('./jeux-immo.js');
  const { pointExcel, dateExcel } = await import('./loyers-reels.js');
  const l = (id, prix, rent, coord = '4.82937,45.75027', classe = 'commercial') => ({ ID: id, 'asset class': classe, price: String(prix), rent: String(rent), surface: '54', coordinates: coord, address: '8 Rue Duhamel 69002 Lyon', city: 'Lyon', 'publication date': '46303.04166666667' });
  const a = annoncesDeLExport([l('1', 210000, 11580), l('1', 210000, 11580), l('2', 200000, 1000), l('3', 200000, 12000, ''), l('4', 200000, 12000, '4.8,45.7', 'office')], { pointExcel, dateExcel });
  assert.equal(a.length, 1);
  assert.equal(a[0].rendement, 5.5);
  assert.equal(a[0].adresse, '8 Rue Duhamel 69002 Lyon');
  assert.deepEqual(a[0].point, { lat: 45.75027, lon: 4.82937 });
  assert.equal(a[0].loyer_m2, 214);
});

test('jeux : la rue alterne le loyer d\'une boutique et le prix des murs au m²', async () => {
  const { manchesAlternees } = await import('./jeux-immo.js');
  const rues = [1, 2, 3].map((i) => ({ adresse: `${i} rue A`, loyer: { milieu: 300 } }));
  const annonces = [1, 2].map((i) => ({ id: String(i), prix_m2: 4000, point: { lat: 45, lon: 4 } }));
  const m = manchesAlternees(rues, annonces, 5, () => 0.5);
  assert.deepEqual(m.map((x) => x.type), ['loyer', 'prix', 'loyer', 'prix', 'loyer']);
  assert.deepEqual(manchesAlternees(rues, [], 2, () => 0.5).map((x) => x.type), ['loyer', 'loyer']);
});

test('jeux : une partie de La rue se garde si elle tient debout', () => {
  assert.deepEqual(scoreValide({ points: 452, manches: 6 }), { ok: true, score: { jeu: 'rue', points: 452, sur: 600, manches: 6 } });
  assert.equal(scoreValide({ points: 601, manches: 6 }).ok, false);
  assert.equal(scoreValide({ points: -1, manches: 6 }).ok, false);
  assert.equal(scoreValide({ points: 10, manches: 0 }).ok, false);
  assert.equal(scoreValide({ jeu: 'duel', points: 10, manches: 1 }).ok, false);
});

test('jeux : le classement garde chaque partie, une personne peut y être deux fois', () => {
  const c = classement([
    { id: 'a', par: 'nora.l@klocka.immo', points: 300, le: '2026-11-27T10:00:00Z' },
    { id: 'b', par: 'jules.b@klocka.immo', points: 520, le: '2026-11-27T11:00:00Z' },
    { id: 'c', par: 'jules.b@klocka.immo', points: 480, le: '2026-11-27T12:00:00Z' },
    { id: 'd', par: 'maxime.p@klocka.immo', points: 300, le: '2026-11-27T09:00:00Z' },
  ]);
  assert.deepEqual(c.map((s) => [s.id, s.rang]), [['b', 1], ['c', 2], ['d', 3], ['a', 4]]);
});
