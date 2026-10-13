// Les enseignes nationales autour d'un local : Google Maps pour ce qui est
// ouvert, la liste des marques d'OpenStreetMap pour ce qui est national.
// Sans réseau : Google est remplacé par une réponse écrite ici.

import test from 'node:test';
import assert from 'node:assert/strict';
import { marqueDe, indexDesMarques, enseignesAutour, norm, memeMetier } from './enseignes-autour.js';

const index = indexDesMarques([
  { n: 'Yves Rocher', w: 'Q1477321' },
  { n: 'Orange', w: 'Q1431486' },
  { n: 'Pharmacie Lafayette', w: 'Q1' },
  { n: 'BNP Paribas', w: 'Q499707', m: ['bnp'] },
  { n: 'Bio', w: 'Q2' },
  { n: "L'Atelier", w: null },
]);

test('la marque d\'un nom Google : exacte, au début, ou mot entier ailleurs ; jamais un nom générique', () => {
  assert.equal(marqueDe('Yves Rocher', index).n, 'Yves Rocher');
  assert.equal(marqueDe('Orange Libourne', index).n, 'Orange');
  assert.equal(marqueDe('BNP Paribas - Libourne', index).n, 'BNP Paribas');
  assert.equal(marqueDe('Grande Pharmacie Lafayette du Centre', index).n, 'Pharmacie Lafayette');
  assert.equal(marqueDe('Banque Courtois', index), null, 'une banque régionale n\'est pas dans la liste');
  assert.equal(marqueDe('Les Jardins Bio de Marie', index), null, 'un mot court ne vaut que seul');
  assert.equal(marqueDe('Orangerie du Parc', index), null, 'un mot entier, pas un morceau');
  assert.equal(marqueDe("L'Atelier", index), null, 'sans fiche Wikidata, un nom générique est écarté');
  assert.equal(memeMetier('real_estate_agency', 'shop/furniture'), false, 'Habitat Conseil, agence, n\'est pas Habitat le meuble');
  assert.equal(memeMetier('real_estate_agency', 'office/estate_agent'), true);
  assert.equal(memeMetier('clothing_store', 'shop/clothes'), true);
  assert.equal(norm('Caisse d’Épargne'), 'caisse d epargne');
});

test('enseignesAutour : les lieux ouverts et reconnus, une fois par marque, du plus proche au plus loin', async () => {
  const point = { lat: 44.91576, lon: -0.24339 };
  const lieu = (nom, dLat, type, statut = 'OPERATIONAL') => ({ id: nom, displayName: { text: nom }, primaryTypeDisplayName: { text: type }, businessStatus: statut, location: { latitude: point.lat + dLat, longitude: point.lon }, googleMapsUri: `https://maps.google.com/?cid=${encodeURIComponent(nom)}` });
  const appels = [];
  const lire = async (url, opts) => {
    appels.push(JSON.parse(opts.body));
    const places = appels.length > 2 ? [] : appels.length === 1
      ? [lieu('Yves Rocher', 0.0004, 'institut de beauté'), lieu('Banque Courtois', 0.0001, 'Banque'), lieu('Orange Libourne', 0.001, 'Magasin de téléphonie'), lieu('Yves Rocher', 0.002, 'institut de beauté')]
      : [lieu('BNP Paribas - Libourne', 0.0002, 'Banque'), lieu('Orange', 0.0003, 'Magasin', 'CLOSED_PERMANENTLY')];
    return { ok: true, json: async () => ({ places }) };
  };
  const r = await enseignesAutour(point, { cle: 'test', lire, index });
  assert.equal(r.ok, true);
  assert.equal(appels.length, 7, 'sept groupes de types : vingt lieux chacun couvrent les 300 m');
  assert.equal(appels[0].rankPreference, 'DISTANCE');
  assert.equal(appels[0].locationRestriction.circle.radius, 300);
  assert.deepEqual(r.enseignes.map((e) => e.nom), ['BNP Paribas', 'Yves Rocher', 'Orange'], 'Courtois écartée, Orange fermé écarté, Yves Rocher une fois');
  assert.equal(r.enseignes[1].secteur, 'Institut de beauté');
  assert.ok(r.enseignes[0].distance_m > 15 && r.enseignes[0].distance_m < 30);
  assert.equal((await enseignesAutour(point, { cle: '', lire, index })).ok, false, 'sans clé Google, rien d\'inventé');
});
