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

test('la fiche d\'un commerce reprend ses champs OpenStreetMap tels quels, sans en inventer', () => {
  const resultat = normaliser([
    {
      type: 'node', id: 9, lat: 43.6, lon: 1.44,
      tags: {
        name: 'Terra Nova', shop: 'books', 'contact:housenumber': '18', 'contact:street': 'Rue Léon Gambetta',
        opening_hours: 'Mo-Sa 10:00-19:00', phone: '+33 5 61 21 17 47', website: 'https://librairie-terranova.fr/',
        email: 'contact@librairie-terranova.fr', wheelchair: 'no', outdoor_seating: 'yes', cuisine: 'french;pizza',
      },
    },
    { type: 'node', id: 10, lat: 43.601, lon: 1.441, tags: { name: 'Sans fiche', shop: 'clothes' } },
  ], TOULOUSE);
  // Le classement est par distance : on retrouve chaque fiche par son id
  // plutôt que par sa position, pour ne pas dépendre du hasard des coordonnées.
  const complet = resultat.find((c) => c.id === 'node/9');
  const vide = resultat.find((c) => c.id === 'node/10');

  assert.equal(complet.adresse, '18 Rue Léon Gambetta');
  assert.equal(complet.horaires, 'Mo-Sa 10:00-19:00');
  assert.equal(complet.telephone, '+33 5 61 21 17 47');
  assert.equal(complet.site, 'https://librairie-terranova.fr/');
  assert.equal(complet.email, 'contact@librairie-terranova.fr');
  assert.equal(complet.pmr, 'no');
  assert.equal(complet.terrasse, true);
  assert.equal(complet.cuisine, 'french, pizza');

  // Un commerce sans ces champs les rend absents, jamais devinés.
  for (const cle of ['horaires', 'telephone', 'site', 'email', 'pmr', 'cuisine']) assert.equal(vide[cle], null);
  assert.equal(vide.terrasse, null);
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

test('les carreaux INSEE dont le centre tombe dans le cercle s\'additionnent, les autres non', async () => {
  const { agreger, boiteDe } = await import('./kzoning-insee.js');
  const carre = (lat, lon, props) => ({
    type: 'Feature',
    geometry: { type: 'MultiPolygon', coordinates: [[[[lon - 0.001, lat - 0.001], [lon - 0.001, lat + 0.001], [lon + 0.001, lat + 0.001], [lon + 0.001, lat - 0.001], [lon - 0.001, lat - 0.001]]]] },
    properties: props,
  });
  const zone = { lat: 43.6, lon: 1.44, rayon_m: 300 };
  const r = agreger([
    carre(43.6, 1.44, { ind: 100, men: 50, ind_0_3: 10, ind_25_39: 40, ind_65_79: 10, men_1ind: 20, men_prop: 10, men_coll: 45, men_mais: 5, log_soc: 5, men_surf: 3000, ind_snv: 2000000, men_pauv: 5, log_av45: 25, log_ap90: 25, nom_com: 'Toulouse' }),
    carre(43.6015, 1.44, { ind: 100, men: 50, ind_0_3: 0, ind_25_39: 100, men_1ind: 30, men_prop: 40, men_coll: 50, men_surf: 2000, ind_snv: 3000000, men_pauv: 0, nom_com: 'Toulouse', i_car_est: 1 }),
    // À un kilomètre : hors zone.
    carre(43.609, 1.44, { ind: 9999, men: 9999, nom_com: 'Ailleurs' }),
  ], zone);

  assert.equal(r.carreaux, 2);
  assert.equal(r.carreaux_estimes, 1);
  assert.deepEqual(r.communes, ['Toulouse']);
  assert.equal(r.population.habitants, 200);
  // Deux carreaux de quatre hectares : 200 habitants sur 0,08 km².
  assert.equal(r.population.densite_km2, 2500);
  assert.equal(r.population.ages['25-39 ans'], 70);
  // Les 18-24 manquent de la grille : ils se déduisent du reste (200 - 160).
  assert.equal(r.population.ages['18-24 ans'], 20);
  assert.equal(r.menages.menages, 100);
  assert.equal(r.menages.taille_moyenne, 2);
  assert.equal(r.menages.part_une_personne, 50);
  assert.equal(r.menages.part_proprietaires, 50);
  // 5 000 000 de niveau de vie pour 200 personnes.
  assert.equal(r.revenus.niveau_de_vie_moyen, 25000);
  assert.equal(r.revenus.taux_pauvrete, 5);
  assert.equal(r.logement.part_social, 5);
  assert.equal(r.logement.surface_moyenne_m2, 50);
  assert.equal(r.logement.construction['avant 1945'], 25);

  // La boîte d'un cercle englobe le cercle : 300 m font un peu moins de 0,003°.
  const b = boiteDe(43.6, 1.44, 300);
  assert.ok(b.nord - 43.6 > 0.0026 && b.nord - 43.6 < 0.0028);
  assert.ok(b.est - 1.44 > b.nord - 43.6, 'la longitude s\'étire à cette latitude');
});

test('les équipements se classent par famille, et le métro se remarque', async () => {
  const { classerEquipements } = await import('./kzoning-commerces.js');
  const e = classerEquipements([
    { tags: { amenity: 'school', name: 'École Jules Ferry' } },
    { tags: { amenity: 'school' } },
    { tags: { amenity: 'kindergarten', name: 'Maternelle du Parc' } },
    { tags: { highway: 'bus_stop' } }, { tags: { highway: 'bus_stop' } }, { tags: { highway: 'bus_stop' } },
    { tags: { railway: 'subway_entrance' } },
    { tags: { amenity: 'bicycle_rental' } },
    { tags: { shop: 'bakery' } }, { tags: { shop: 'vacant' } },
    { tags: { amenity: 'restaurant' } },
    { tags: { power: 'pole' } },
  ]);
  assert.deepEqual(e.enseignement, [{ nom: 'Écoles, collèges, lycées', nombre: 2 }, { nom: 'Écoles maternelles', nombre: 1 }]);
  assert.equal(e.mobilite[0].nom, 'Arrêts de bus');
  assert.equal(e.mobilite[0].nombre, 3);
  assert.equal(e.metro, true);
  assert.equal(e.tram, false);
  assert.equal(e.commerces, 1);
  assert.equal(e.vacants, 1);
  assert.equal(e.restauration, 1);
  // Seules les écoles nommées se listent.
  assert.deepEqual(e.ecoles.map((x) => x.nom), ['École Jules Ferry', 'Maternelle du Parc']);
});
