// OpenStreetMap : les tronçons deviennent des rues, les vitrines se
// rattachent à la bonne. Pur : une petite ville inventée, pas de réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import { grouperVoies, rattacherVitrines, pointsLeLongDe, distanceAuTrace } from './osm.js';

// Deux tronçons de la rue d'Antibes, est-ouest, et une rue perpendiculaire.
const way = (id, name, pts, highway = 'residential') => ({ type: 'way', id, tags: { highway, name }, geometry: pts.map(([lat, lon]) => ({ lat, lon })) });
const ELEMENTS = [
  way(1, "Rue d'Antibes", [[43.5510, 7.0200], [43.5510, 7.0220]]),
  way(2, "RUE D'ANTIBES", [[43.5510, 7.0220], [43.5510, 7.0240]]),
  way(3, 'Rue Hoche', [[43.5500, 7.0220], [43.5520, 7.0220]]),
  way(4, 'Autoroute A8', [[43.56, 7.0], [43.56, 7.1]], 'motorway'),
  // Une pharmacie avec son adresse ; un bar sans adresse, à 5 m de la rue d'Antibes ; un café perdu dans les terres.
  { type: 'node', id: 10, lat: 43.5512, lon: 7.0230, tags: { amenity: 'pharmacy', name: 'Pharmacie', 'addr:street': "Rue d'Antibes" } },
  { type: 'node', id: 11, lat: 43.55105, lon: 7.0235, tags: { amenity: 'bar', name: 'Le Bar' } },
  { type: 'node', id: 12, lat: 43.5600, lon: 7.0500, tags: { amenity: 'cafe' } },
  // Un local vide n'est pas une vitrine ; un immeuble (way avec center) shop=clothes en est une.
  { type: 'node', id: 13, lat: 43.5510, lon: 7.0221, tags: { shop: 'vacant' } },
  { type: 'way', id: 14, center: { lat: 43.5511, lon: 7.0212 }, tags: { shop: 'clothes', brand: 'Zara' } },
];

test('les tronçons du même nom, quelle que soit la casse, font une seule rue', () => {
  const rues = grouperVoies(ELEMENTS);
  assert.deepEqual(rues.map((r) => r.nom).sort((a, b) => a.localeCompare(b)), ["Rue d'Antibes", 'Rue Hoche'], "l'autoroute n'est pas une rue de vitrines");
  const antibes = rues.find((r) => r.nom === "Rue d'Antibes");
  assert.equal(antibes.trace.length, 2);
  assert.ok(antibes.longueur_m > 300 && antibes.longueur_m < 340, `longueur ${antibes.longueur_m}`);
});

test('une vitrine se rattache par son adresse, sinon par la rue la plus proche', () => {
  const { rues, vitrines_total, sans_rue } = rattacherVitrines(ELEMENTS, grouperVoies(ELEMENTS));
  assert.equal(vitrines_total, 4, 'pharmacie, bar, café, Zara ; pas le local vide');
  assert.equal(sans_rue, 1, 'le café dans les terres');
  assert.equal(rues[0].nom, "Rue d'Antibes");
  assert.equal(rues[0].vitrines, 3);
  assert.deepEqual(rues[0].enseignes, ['Pharmacie', 'Le Bar', 'Zara']);
  assert.equal(rues.find((r) => r.nom === 'Rue Hoche').vitrines, 0);
});

test('la balade pose un point tous les quarante mètres le long du tracé', () => {
  const trace = [[[43.5510, 7.0200], [43.5510, 7.0240]]]; // ~323 m
  const pts = pointsLeLongDe(trace, 40);
  assert.ok(pts.length >= 8 && pts.length <= 10, `${pts.length} points`);
  assert.deepEqual(pts[0], { lat: 43.551, lon: 7.02 });
  assert.ok(distanceAuTrace(pts[pts.length - 1], trace) < 1);
});
