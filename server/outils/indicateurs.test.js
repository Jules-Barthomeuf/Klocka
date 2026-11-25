import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-indicateurs-'));
process.env.NODE_TEST_CONTEXT = '1';
const I = await import('./indicateurs.js');


// Une rue droite vers l'est : les impairs sur un trottoir, les pairs en face (12 m plus au nord), un numéro de chaque côté
// tous les 30 m ; le bien au milieu de la rue, devant le n° 21 (à 300 m du début).
const m = (dx, dy = 0) => ({ lat: 47.75 + dy / 111320, lon: -3.365 + dx / (111320 * Math.cos((47.75 * Math.PI) / 180)) });
const droite = Array.from({ length: 40 }, (_, i) => { const n = i + 1; const k = Math.floor(i / 2); return { numero: n, ...m(k * 30, n % 2 ? 0 : 12) }; });
const auMilieu = m(300, 0);

test('commercialité : 150 m avant et après le bien, le long de la rue, les deux trottoirs ; un sur deux, 5 ; tous, 10 (25 nov. 2026)', () => {
  const tous = I.commercialite({ numeros: droite, cellules: droite.map((n) => ({ numero: n.numero, etat: 'occupe' })), point: auMilieu });
  assert.equal(tous.note, 10);
  assert.equal(tous.immeubles, 22, '11 numéros de chaque côté : de 150 m avant à 150 m après');
  const moitie = I.commercialite({ numeros: droite, cellules: droite.filter((n) => n.numero % 4 < 2).map((n) => ({ numero: n.numero, etat: 'occupe' })), point: auMilieu });
  assert.ok(moitie.note >= 4.5 && moitie.note <= 5.5, `un sur deux : ${moitie.note}`);
  assert.match(moitie.texte, /150 m avant et après le bien dans la rue/);
  // Un local vide ne compte pas ; 7 et 7 bis sont un même immeuble.
  const vide = I.commercialite({ numeros: [...droite, { numero: 21, suffixe: 'bis', lat: droite[20].lat, lon: droite[20].lon }], cellules: [{ numero: 19, etat: 'vacant' }, { numero: 21, etat: 'occupe' }], point: auMilieu });
  assert.equal(vide.immeubles, 22);
  assert.equal(vide.pieds, 1);
  assert.equal(I.commercialite({ numeros: droite.slice(0, 4), cellules: [], point: m(0) }).note, null, 'moins de six numéros : pas de note');
});

test('le long de la rue, pas à vol d’oiseau : une rue en épingle ne compte pas son retour, même tout proche', () => {
  // Un trottoir qui part vers l'est sur 300 m, tourne et revient 40 m plus au nord : le retour passe à 40 m du bien à vol
  // d'oiseau, mais à plus de 300 m en suivant la rue.
  const aller = Array.from({ length: 11 }, (_, i) => ({ numero: 2 * i + 1, ...m(i * 30, 0) }));
  const retour = Array.from({ length: 11 }, (_, i) => ({ numero: 23 + 2 * i, ...m(300 - i * 30, 40) }));
  const gardes = I.leLongDeLaRue([...aller, ...retour], m(0, 0), { rayon: 150 });
  assert.deepEqual(gardes.map((p) => p.numero), [1, 3, 5, 7, 9, 11]);
  assert.deepEqual(I.leLongDeLaRue(aller, m(0, 200)), [], 'un trottoir loin du bien ne compte pas');
});

test('sur une place, le tour de la place : tous ses numéros, sans trottoir pair ou impair', () => {
  assert.ok(I.estUnePlace('Place de la Libération') && I.estUnePlace('Square Jean-Jaurès'));
  assert.ok(!I.estUnePlace('Rue de la Place'));
  const place = [m(-84, 25), m(-99, 6), m(-112, -9), m(-64, -40), m(0, 0), m(-28, 14)].map((p, i) => ({ numero: i + 1, ...p }));
  const c = I.commercialite({ numeros: place, cellules: [{ numero: 4, etat: 'occupe' }, { numero: 5, etat: 'vacant' }], point: m(0, 0), place: true });
  assert.equal(c.immeubles, 6);
  assert.equal(c.note, 1.5);
  assert.match(c.texte, /1 pied d'immeuble sur 6 avec un commerce ouvert, sur la place \(17 %\)\.$/);
});

test('rue pas représentative : le cercle de 150 m autour du bien, toutes les rues (25 nov. 2026)', () => {
  const numeros = [
    { numero: 1, voie: 'PLACE X', ...m(10, 0) }, { numero: 2, voie: 'PLACE X', ...m(20, 0) }, { numero: 2, voie: 'PLACE X', ...m(21, 0) },
    { numero: 5, voie: 'RUE Y', ...m(0, 60) }, { numero: 7, voie: 'RUE Y', ...m(0, 90) }, { numero: 9, voie: 'RUE Y', ...m(0, 120) },
    { numero: 4, voie: 'RUE Z', ...m(-80, 0) }, { numero: 6, voie: 'RUE Z', ...m(-110, 0) }, { numero: 8, voie: 'RUE Z', ...m(-400, 0) },
  ];
  const commercants = new Map([['PLACE X', new Set([1])], ['RUE Y', new Set([5, 7])], ['RUE Z', new Set([8])]]);
  const c = I.commercialiteCercle({ numeros, commercants, point: m(0, 0) });
  assert.equal(c.immeubles, 7, 'le 8 rue Z est à 400 m ; le 2 place X compte une fois');
  assert.equal(c.pieds, 3);
  assert.equal(c.voies, 3);
  assert.equal(c.note, 4.5);
});

test('les autres indicateurs : vacance, transports, et ceux du passage repris sur 10', () => {
  assert.equal(I.noteVacance(5), 10);
  assert.equal(I.noteVacance(30), 0);
  assert.equal(I.noteVacance(17.5), 5);
  // Les transports sans note (25 nov. 2026, Jules) : une ligne par genre présent, puis les parkings.
  assert.deepEqual(I.lignesTransports([{ genre: 'bus' }, { genre: 'tramway' }, { genre: 'bus' }], [{}, {}]).map((x) => [x.nom, x.nombre]), [['Tramway', 1], ['Bus', 2], ['Parkings', 2]]);
  assert.deepEqual(I.lignesTransports([], null).map((x) => [x.nom, x.nombre]), [['Tramway', 0], ['Bus', 0], ['Parkings', null]], 'parkings pas lus ; tramway et bus toujours');
  assert.deepEqual(I.lignesTransports([{ genre: 'gare' }], []).map((x) => x.nom), ['Tramway', 'Gare', 'Bus', 'Parkings']);
  const l = I.indicateurs({ commercial: { note: 7, texte: 'x' }, passage: { signaux: [{ cle: 'enseignes', valeur: 0.83, texte: 'e' }, { cle: 'loyer', valeur: null }] }, vacance: { taux: 10, vacants: 2, tranches: 20 }, arrets: [] });
  assert.deepEqual(l.map((x) => [x.cle, x.note]), [['commercialite', 7], ['loyer', null], ['transports', null]], 'la vacance et les enseignes ont leur partie au-dessus');
});

test('le loyer de la rue, écrit comme la commercialité : les deux loyers, l’écart, la note', () => {
  assert.deepEqual(I.noteLoyer({ rue: 214, ville: 170 }), { note: 10, texte: '214 €/m²/an dans la rue, contre 170 €/m²/an dans le kilomètre autour : 26 % plus cher.' });
  assert.equal(I.noteLoyer({ rue: 100, ville: 100 }).note, 5);
  assert.equal(I.noteLoyer({ rue: 90, ville: 100 }).note, 2.5);
  assert.equal(I.noteLoyer(null), null);
  const l = I.indicateurs({ loyer: { rue: 110, ville: 100 } });
  assert.equal(l.find((x) => x.cle === 'loyer').provisoire, true);
});

test('les numéros d’une voie : lus une fois dans la Base Adresse, gardés', async () => {
  let appels = 0;
  const lire = async () => { appels += 1; return { ok: true, json: async () => ({ numeros: [{ numero: 1, position: { coordinates: [-3.36, 47.75] } }, { numero: 2, position: null }] }) }; };
  assert.deepEqual(await I.numerosDeLaVoie('56121_5430', { lire }), [{ numero: 1, suffixe: null, lon: -3.36, lat: 47.75 }]);
  await I.numerosDeLaVoie('56121_5430', { lire });
  assert.equal(appels, 1);
  assert.equal(await I.numerosDeLaVoie('pas une voie', { lire }), null);
});

test('les parkings autour : publics seulement, un par nom, le centre des surfaces', async () => {
  const { parkingsDesElements } = await import('./rue.js');
  const { parkings } = parkingsDesElements([
    { type: 'node', lat: 43.7, lon: 7.26, tags: { amenity: 'parking', name: 'Parking Masséna', parking: 'underground', capacity: '400' } },
    { type: 'way', center: { lat: 43.7001, lon: 7.2601 }, tags: { amenity: 'parking', name: 'Parking Masséna' } },
    { type: 'way', center: { lat: 43.701, lon: 7.261 }, tags: { amenity: 'parking' } },
    { type: 'way', center: { lat: 43.702, lon: 7.262 }, tags: { amenity: 'parking', access: 'private' } },
    { type: 'node', lat: 43.703, lon: 7.263, tags: { highway: 'bus_stop' } },
  ]);
  assert.equal(parkings.length, 2);
  assert.deepEqual(parkings[0], { nom: 'Parking Masséna', lat: 43.7, lon: 7.26, places: 400, ouvrage: true });
});

test('les parkings lus sur la carte d’OpenStreetMap quand Overpass ne répond pas : points et surfaces à 300 m', async () => {
  const { parkingsDeLaCarte } = await import('./rue.js');
  const el = [
    { type: 'node', id: 1, lat: 47.7500, lon: -3.3650 },
    { type: 'node', id: 2, lat: 47.7502, lon: -3.3650 },
    { type: 'node', id: 3, lat: 47.7502, lon: -3.3646 },
    { type: 'way', id: 10, nodes: [1, 2, 3, 1], tags: { amenity: 'parking' } },
    { type: 'node', id: 4, lat: 47.7499, lon: -3.3660, tags: { amenity: 'parking', name: 'P Libération' } },
    { type: 'node', id: 5, lat: 47.7600, lon: -3.3660, tags: { amenity: 'parking' } },
    { type: 'node', id: 6, lat: 47.7498, lon: -3.3655, tags: { amenity: 'parking', parking: 'street_side' } },
  ];
  const { parkings } = parkingsDeLaCarte(el, 47.7497, -3.3657, 300);
  assert.equal(parkings.length, 2, 'le parking à 1 km et les places le long du trottoir sont écartés');
  assert.ok(parkings.some((p) => p.nom === 'P Libération'));
});
