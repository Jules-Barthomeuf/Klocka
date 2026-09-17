// K-Zoning : les zones, leur rangement, et la requête qui lit leurs commerces.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kzoning-'));
const { Records } = await import('./db.js');
const {
  creerZoneCercle, listerZones, renommerZone, deplacerZone, supprimerZone,
  creerDossier, supprimerDossier, listerDossiers,
} = await import('./kzoning.js');
const { construireRequete, normaliser } = await import('./kzoning-commerces.js');
const { filtresDe, listerMetiers, TOUS_LES_COMMERCES } = await import('./kzoning-metiers.js');

const TOULOUSE = { lat: 43.6007, lon: 1.447 };

test('une zone en cercle demande un point, un rayon tenable et un nom', () => {
  assert.match(creerZoneCercle({ adresse: 'x', lat: null, lon: null, rayon_m: 300 }).error, /point de départ/);
  assert.match(creerZoneCercle({ adresse: 'x', ...TOULOUSE, rayon_m: 10 }).error, /rayon/);
  assert.match(creerZoneCercle({ adresse: 'x', ...TOULOUSE, rayon_m: 50000 }).error, /rayon/);
  assert.match(creerZoneCercle({ adresse: '', ...TOULOUSE, rayon_m: 300 }).error, /nom/);
  // Un point hors des bornes terrestres vient d'une adresse mal résolue.
  assert.match(creerZoneCercle({ adresse: 'x', lat: 91, lon: 1, rayon_m: 300 }).error, /lieu/);

  const r = creerZoneCercle({ adresse: '54 rue de Metz, Toulouse', ...TOULOUSE, rayon_m: 300 });
  assert.equal(r.ok, true);
  assert.equal(r.zone.forme, 'cercle');
  assert.equal(r.zone.rayon_m, 300);
  // Sans nom donné, la zone prend celui de son adresse.
  assert.equal(r.zone.nom, '54 rue de Metz, Toulouse');
  assert.equal(r.zone.dossier_id, null);
});

test('un dossier range des zones sans les posséder : le supprimer les libère', () => {
  const d = creerDossier('Toulouse 2027');
  assert.equal(d.ok, true);
  const z = creerZoneCercle({ adresse: 'rue Alsace', ...TOULOUSE, rayon_m: 400, dossier_id: d.dossier.id }).zone;
  assert.equal(listerDossiers().find((x) => x.id === d.dossier.id).zones, 1);
  assert.equal(listerZones().find((x) => x.id === z.id).dossier_nom, 'Toulouse 2027');

  assert.equal(supprimerDossier(d.dossier.id).ok, true);
  // La zone survit à son rangement, sans dossier.
  const apres = listerZones().find((x) => x.id === z.id);
  assert.ok(apres, 'la zone existe toujours');
  assert.equal(apres.dossier_id, null);
});

test('une zone se renomme, se range et se supprime', () => {
  const z = creerZoneCercle({ adresse: 'place du Capitole', ...TOULOUSE, rayon_m: 250 }).zone;
  assert.match(renommerZone(z.id, '   ').error, /nom/);
  assert.equal(renommerZone(z.id, 'Capitole').zone.nom, 'Capitole');
  assert.match(deplacerZone(z.id, 'inconnu').error, /dossier/);
  const d = creerDossier('Essais').dossier;
  assert.equal(deplacerZone(z.id, d.id).zone.dossier_id, d.id);
  assert.equal(deplacerZone(z.id, null).zone.dossier_id, null);
  assert.equal(supprimerZone(z.id).ok, true);
  assert.match(supprimerZone(z.id).error, /n'existe plus/);
});

test('la requête Overpass est une union, sinon tout sauf le dernier filtre se perd', () => {
  const r = construireRequete([{ cle: 'shop', valeurs: ['bakery'] }, { cle: 'amenity', valeurs: ['cafe', 'bar'] }], 43.6, 1.44, 300);
  // Les parenthèses font l'union : c'est ce qui manquait au premier relevé.
  assert.match(r, /\(nwr.*\);out/);
  assert.match(r, /\["shop"="bakery"\]/);
  // Plusieurs valeurs passent en expression, pas en trois requêtes.
  assert.match(r, /\["amenity"~"\^\(cafe\|bar\)\$"\]/);
  // `center` donne un point aux commerces dessinés comme un bâtiment.
  assert.match(r, /out center tags/);
  // Une clé sans valeur prend tout ce qui la porte.
  assert.match(construireRequete([{ cle: 'craft', valeurs: [] }], 43.6, 1.44, 300), /\["craft"\]/);
});

test('les objets OpenStreetMap deviennent des commerces situés et classés', () => {
  const commerces = normaliser([
    { type: 'node', id: 1, lat: 43.6009, lon: 1.4472, tags: { name: 'Le Pain Doré', shop: 'bakery', 'addr:housenumber': '12', 'addr:street': 'rue de Metz' } },
    { type: 'way', id: 2, center: { lat: 43.605, lon: 1.45 }, tags: { shop: 'vacant' } },
    // Sans point, on ne sait pas où le poser : écarté.
    { type: 'node', id: 3, tags: { name: 'Fantôme', shop: 'clothes' } },
    // Deux fois le même objet : compté une fois.
    { type: 'node', id: 1, lat: 43.6009, lon: 1.4472, tags: { name: 'Le Pain Doré', shop: 'bakery' } },
  ], TOULOUSE);

  assert.equal(commerces.length, 2);
  assert.equal(commerces[0].nom, 'Le Pain Doré');
  assert.equal(commerces[0].adresse, '12 rue de Metz');
  assert.equal(commerces[0].genre, 'bakery');
  assert.equal(commerces[0].vacant, false);
  // Le plus proche du centre en premier.
  assert.ok(commerces[0].distance_m < commerces[1].distance_m);
  // Un local vide est reconnu comme tel, et n'avoir pas de nom est normal.
  assert.equal(commerces[1].vacant, true);
  assert.equal(commerces[1].nom, null);
});

test('les métiers se cherchent de A à Z et se regroupent par étiquette', () => {
  const metiers = listerMetiers();
  assert.ok(metiers.length > 50, 'le référentiel couvre le commerce de détail');
  // Classé de A à Z, comme la liste s'affiche.
  assert.deepEqual([...metiers].map((m) => m.nom), [...metiers].map((m) => m.nom).sort((a, b) => a.localeCompare(b, 'fr')));
  // Les métiers dictés par Jules existent bien, avec une étiquette relevée sur le terrain.
  for (const nom of ['Tabac', 'Tatoueur, perceur', 'Téléphonie', 'Tissus, rideaux', 'Traiteur', 'Torréfacteur, café en grains', 'Café', 'Vélo', 'Véranda, fermetures', 'Vitrerie']) {
    assert.ok(metiers.find((m) => m.nom === nom), `${nom} figure au référentiel`);
  }

  // Deux métiers qui partagent une clé n'envoient qu'un filtre pour cette clé.
  const f = filtresDe(['Boulangerie', 'Pâtisserie', 'Café']);
  assert.equal(f.filter((x) => x.cle === 'shop').length, 1);
  assert.deepEqual(f.find((x) => x.cle === 'shop').valeurs.sort(), ['bakery', 'pastry']);
  assert.deepEqual(f.find((x) => x.cle === 'amenity').valeurs, ['cafe']);

  // Rien de choisi, ou « tous les commerces » : les filtres larges.
  assert.deepEqual(filtresDe([]), TOUS_LES_COMMERCES.filtres);
  assert.deepEqual(filtresDe([TOUS_LES_COMMERCES.nom]), TOUS_LES_COMMERCES.filtres);
});

test('un relevé gardé sert sans repartir sur le réseau', async () => {
  // Le cache est une entité comme une autre : on vérifie qu'un relevé posé à
  // la main est bien rendu, sans qu'Overpass soit appelé (pas de réseau ici).
  const { commercesDeLaZone } = await import('./kzoning-commerces.js');
  const filtres = [{ cle: 'shop', valeurs: ['bakery'] }];
  const cle = `${(43.6).toFixed(5)},${(1.44).toFixed(5)},300|${JSON.stringify(filtres)}`;
  Records.create('CacheCommercesKZoning', {
    cle,
    commerces: [{ id: 'node/9', nom: 'Gardée', genre: 'bakery', lat: 43.6, lon: 1.44 }],
    garde_le: new Date().toISOString(),
  });
  const r = await commercesDeLaZone({ lat: 43.6, lon: 1.44, rayon_m: 300, filtres });
  assert.equal(r.ok, true);
  assert.equal(r.du_cache, true);
  assert.equal(r.commerces[0].nom, 'Gardée');
});
