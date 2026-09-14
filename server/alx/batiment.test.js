// Le bâtiment sous un commerce : la géométrie, sur des formes fabriquées.
// Pur : rien n'est téléchargé, les éléments Overpass sont donnés à la main.

import test from 'node:test';
import assert from 'node:assert/strict';
import { aireDuPolygone, dansLePolygone, facadesDe, mesurerBatiment, surfaceCommerciale, trier } from './batiment.js';

// Un coin de Nice, à 43,7° : un degré de longitude y fait environ 80 500 m.
const LAT = 43.7;
const M_LAT = 1 / 110540;
const M_LON = 1 / (111320 * Math.cos((LAT * Math.PI) / 180));
/** Un point à x mètres à l'est et y mètres au nord de l'origine. */
const p = (x, y) => ({ lat: LAT + y * M_LAT, lon: 7.25 + x * M_LON });

// Un bâtiment de 20 m sur 15, à l'angle de deux rues : la façade sud sur
// l'avenue (20 m), la façade est sur la rue (15 m).
const COIN = [p(0, 0), p(20, 0), p(20, 15), p(0, 15), p(0, 0)];
const AVENUE = { nom: 'Avenue Jean Médecin', trace: [[[p(-40, -8).lat, p(-40, -8).lon], [p(60, -8).lat, p(60, -8).lon]]] };
const RUE = { nom: 'Rue Masséna', trace: [[[p(28, -30).lat, p(28, -30).lon], [p(28, 40).lat, p(28, 40).lon]]] };

test('l’aire d’un polygone est celle du terrain, en mètres carrés', () => {
  assert.ok(Math.abs(aireDuPolygone(COIN) - 300) < 6, `${aireDuPolygone(COIN)} m² pour 20 × 15`);
  assert.equal(aireDuPolygone([p(0, 0), p(1, 0)]), 0, 'deux points ne font pas une surface');
});

test('un point se sait dedans ou dehors', () => {
  assert.equal(dansLePolygone(p(10, 7), COIN), true);
  assert.equal(dansLePolygone(p(25, 7), COIN), false);
  assert.equal(dansLePolygone(p(10, 7), [p(0, 0)]), false);
});

test('un commerce d’angle a deux façades, et on les mesure toutes les deux', () => {
  const f = facadesDe(COIN, [AVENUE, RUE]);
  assert.equal(f.length, 2);
  assert.deepEqual(f.map((x) => x.rue), ['Avenue Jean Médecin', 'Rue Masséna']);
  assert.ok(Math.abs(f[0].longueur_m - 20) <= 1, `${f[0].longueur_m} m sur l’avenue`);
  assert.ok(Math.abs(f[1].longueur_m - 15) <= 1, `${f[1].longueur_m} m sur la rue`);
});

test('une rue trop loin ou perpendiculaire ne fait pas une façade', () => {
  const loin = { nom: 'Rue Lointaine', trace: [[[p(0, -60).lat, p(0, -60).lon], [p(40, -60).lat, p(40, -60).lon]]] };
  assert.deepEqual(facadesDe(COIN, [loin]), [], 'à soixante mètres, ce n’est plus une façade');
  // Une rue qui passe près du côté sud mais le croise à angle droit : c'est un
  // pignon, pas une façade. On la place au ras du côté ouest, orientée nord-sud,
  // pour qu'elle soit proche du côté sud sans lui être parallèle.
  const perpendiculaire = { nom: 'Rue Perpendiculaire', trace: [[[p(-3, -10).lat, p(-3, -10).lon], [p(-3, 30).lat, p(-3, 30).lon]]] };
  const f = facadesDe(COIN, [perpendiculaire]);
  assert.deepEqual(f.map((x) => x.rue), ['Rue Perpendiculaire'], 'seul le côté ouest, qui lui est parallèle');
  assert.ok(Math.abs(f[0].longueur_m - 15) <= 1);
});

test('Overpass se trie en bâtiments, rues et vitrines', () => {
  const { batiments, rues, vitrines } = trier([
    { type: 'way', id: 1, tags: { building: 'yes', 'building:levels': '5' }, geometry: COIN.map((x) => ({ lat: x.lat, lon: x.lon })) },
    { type: 'way', id: 2, tags: { highway: 'primary', name: 'Avenue Jean Médecin' }, geometry: [{ lat: p(-40, -8).lat, lon: p(-40, -8).lon }, { lat: p(60, -8).lat, lon: p(60, -8).lon }] },
    { type: 'way', id: 3, tags: { highway: 'service' }, geometry: [{ lat: LAT, lon: 7.25 }] },
    { type: 'node', id: 4, tags: { shop: 'optician', name: 'Optic 2000' }, lat: p(5, 7).lat, lon: p(5, 7).lon },
    { type: 'way', id: 5, tags: { amenity: 'bank' }, center: { lat: p(15, 7).lat, lon: p(15, 7).lon } },
  ]);
  assert.equal(batiments.length, 1);
  assert.equal(batiments[0].id, 'way/1');
  assert.deepEqual(rues.map((r) => r.nom), ['Avenue Jean Médecin'], 'une voie sans nom n’est pas une rue');
  assert.equal(vitrines.length, 2);
});

const ELEMENTS = [
  { type: 'way', id: 1, tags: { building: 'yes', 'building:levels': '5' }, geometry: COIN.map((x) => ({ lat: x.lat, lon: x.lon })) },
  { type: 'way', id: 2, tags: { highway: 'primary', name: 'Avenue Jean Médecin' }, geometry: [{ lat: p(-40, -8).lat, lon: p(-40, -8).lon }, { lat: p(60, -8).lat, lon: p(60, -8).lon }] },
  { type: 'way', id: 6, tags: { highway: 'residential', name: 'Rue Masséna' }, geometry: [{ lat: p(28, -30).lat, lon: p(28, -30).lon }, { lat: p(28, 40).lat, lon: p(28, 40).lon }] },
  { type: 'node', id: 4, tags: { shop: 'optician' }, lat: p(5, 7).lat, lon: p(5, 7).lon },
];

test('la mesure rend l’emprise, les deux façades, et une surface qui les tient', async () => {
  const m = await mesurerBatiment(p(5, 7), { elements: ELEMENTS });
  assert.equal(m.contient_le_point, true);
  assert.ok(Math.abs(m.emprise_m2 - 300) < 8);
  assert.equal(m.angle, true, 'deux rues : un commerce d’angle');
  assert.deepEqual(m.facades.map((f) => f.rue), ['Avenue Jean Médecin', 'Rue Masséna']);
  assert.equal(m.commerces_dans_le_batiment, 1);
  assert.equal(m.niveaux, 5);
  // 35 m de façade en tout, profondeur 7 à 13, moins le carré d'angle : une
  // bande de 196 à 286 m², bornée par les 300 m² au sol, pour un seul commerce.
  assert.deepEqual(m.bande_commerciale_m2, [196, 286]);
  assert.deepEqual(m.surface_estimee, [147, 286]);
  assert.ok(m.surface_estimee[0] > 100, 'très loin des 8 m² qu’une photo laissait croire');
});

test('la bande commerciale ne compte pas deux fois le carré d’angle', () => {
  // Huit mètres sur une rue, vingt sur l'autre : un L, pas vingt-huit mètres
  // en enfilade. À dix mètres de profondeur, 8×10 + 20×10 − 10×10 = 180 m².
  const angle = surfaceCommerciale({ emprise_m2: 1000, facades: [{ longueur_m: 20 }, { longueur_m: 8 }] });
  assert.deepEqual(angle.bande_m2, [147, 195], '28 m de façade, 7 puis 13 m de profondeur, un carré d’angle en moins');
  // La même façade d'un seul tenant est plus grande : rien à retrancher.
  const droit = surfaceCommerciale({ emprise_m2: 1000, facades: [{ longueur_m: 28 }] });
  assert.deepEqual(droit.bande_m2, [196, 364]);
});

test('la bande ne dépasse jamais l’emprise, et se partage', () => {
  // Un immeuble de 1 624 m² au sol, 56 m de façade, six vitrines : chacune
  // occupe un sixième de la bande, pas un sixième de l'immeuble.
  const six = surfaceCommerciale({ emprise_m2: 1624, facades: [{ longueur_m: 56 }], commerces: 6 });
  assert.deepEqual(six.bande_m2, [392, 728]);
  assert.deepEqual(six.surface, [49, 121], 'un sixième de la bande');
  // Une vitrine lue prend le pas sur le partage à parts égales.
  const lue = surfaceCommerciale({ emprise_m2: 1624, facades: [{ longueur_m: 56 }], commerces: 6, vitrine_m: 14 });
  assert.equal(lue.part, 0.25);
  // Un petit bâtiment borne la bande à son emprise.
  const petit = surfaceCommerciale({ emprise_m2: 60, facades: [{ longueur_m: 30 }] });
  assert.deepEqual(petit.bande_m2, [60, 60]);
  assert.equal(surfaceCommerciale({ emprise_m2: 0, facades: [] }), null);
});

test('plusieurs vitrines dans le même bâtiment se partagent le rez-de-chaussée', async () => {
  const avecTrois = [...ELEMENTS,
    { type: 'node', id: 7, tags: { shop: 'bakery' }, lat: p(11, 7).lat, lon: p(11, 7).lon },
    { type: 'node', id: 8, tags: { amenity: 'bar' }, lat: p(17, 7).lat, lon: p(17, 7).lon },
    // Celle-là est dehors : elle ne compte pas.
    { type: 'node', id: 9, tags: { shop: 'butcher' }, lat: p(40, 7).lat, lon: p(40, 7).lon },
  ];
  const m = await mesurerBatiment(p(5, 7), { elements: avecTrois });
  assert.equal(m.commerces_dans_le_batiment, 3);
  assert.equal(m.vitrines_relevees, 3);
  assert.ok(m.surface_estimee[1] < 100, `${m.surface_estimee[1]} m² pour un tiers de 300`);
});

test('une vitrine posée sur le trottoir retrouve son bâtiment, et le dit', async () => {
  const m = await mesurerBatiment(p(10, -4), { elements: ELEMENTS });
  assert.equal(m.contient_le_point, false, 'le point est dans la rue, pas dans le bâtiment');
  assert.equal(m.batiment_id, 'way/1');
});

test('sans bâtiment, on ne rend rien plutôt qu’un chiffre', async () => {
  assert.equal(await mesurerBatiment(p(0, 0), { elements: [] }), null);
  assert.equal(await mesurerBatiment(null, { elements: ELEMENTS }), null);
});
