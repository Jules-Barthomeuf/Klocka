// L'étude d'implantation en interne : la géométrie, le recensement réduit, les
// familles, la rue et le tronçon, le flux calé sur les rapports archivés, et
// la forme de l'étude assemblée. Tout sans réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-implantation-'));
const { contient, partDans, aireM2, boiteDe, metres } = await import('./geo.js');
const { reduire, agreger, CSP } = await import('./iris.js');
const { familleDe, parFamille, PREFIXES, FAMILLES_COMMERCE } = await import('./familles.js');
const { lireRue, lireTroncon, numeroDe, trancheAnciennete, etablissementsDeLaRue } = await import('./rue.js');
const { fluxPieton, fluxVoiture, noteShopping, FOURCHETTES } = await import('./flux.js');
const { cercle, partsIris } = await import('./zones.js');
const { assembler, cleAdresse, SOURCE } = await import('./etude.js');

// Un carré de cent mètres à Nice, en GeoJSON [lon, lat].
const carre = (lon, lat, m = 100) => {
  const dLat = m / 110540; const dLon = m / (111320 * Math.cos((lat * Math.PI) / 180));
  return { type: 'Polygon', coordinates: [[[lon, lat], [lon + dLon, lat], [lon + dLon, lat + dLat], [lon, lat + dLat], [lon, lat]]] };
};

test('la géométrie : dedans, part commune, aire', () => {
  const a = carre(7.26, 43.70);
  assert.equal(contient(a, 7.2603, 43.7004), true);
  assert.equal(contient(a, 7.27, 43.70), false);
  assert.ok(Math.abs(aireM2(a) - 10000) < 60, `${aireM2(a)} m²`);
  // Le même carré décalé de moitié : la moitié tombe dedans.
  const b = carre(7.26 + (50 / (111320 * Math.cos((43.7 * Math.PI) / 180))), 43.70);
  const part = partDans(b, a, 5);
  assert.ok(part > 0.45 && part < 0.55, `part ${part}`);
  assert.equal(partDans(carre(8, 44), a), 0);
  assert.deepEqual(boiteDe(null), null);
  assert.ok(Math.abs(metres({ lat: 43.7, lon: 7.26 }, { lat: 43.7, lon: 7.27 }) - 805) < 10);
  // Un cercle de 400 m fait à peu près pi r².
  assert.ok(Math.abs(aireM2(cercle(43.7, 7.26, 400)) - Math.PI * 400 * 400) / (Math.PI * 160000) < 0.03);
});

test('le recensement se réduit à une ligne par IRIS et s\'additionne au prorata', () => {
  const pop = [
    'IRIS;COM;TYP_IRIS;P21_POP;P21_POPH;P21_POPF;P21_POP0014;P21_POP1529;P21_POP6074;P21_POP75P;C21_POP15P;C21_POP15P_CS1;C21_POP15P_CS2;C21_POP15P_CS3;C21_POP15P_CS4;C21_POP15P_CS5;C21_POP15P_CS6;C21_POP15P_CS7;C21_POP15P_CS8',
    '060880101;06088;H;1000;480;520;150;200;150;100;850;0;50;100;150;200;100;200;50',
    '060880102;06088;H;2000;1000;1000;300;400;300;200;1700;0;100;400;300;300;100;400;100',
  ];
  const act = ['IRIS;COM;P21_ACT1564;P21_CHOM1564', '060880101;06088;500;60', '060880102;06088;1000;80', '999999999;99999;1;1'];
  const base = reduire(pop, act);
  assert.equal(Object.keys(base).length, 2);
  assert.equal(base['060880101'].pop, 1000);
  assert.equal(base['060880101'].seniors, 250);
  assert.equal(base['060880101'].chom, 60);
  assert.deepEqual(base['060880102'].cs, [0, 100, 400, 300, 300, 100, 400, 100]);

  const tout = agreger([{ code: '060880101', part: 1 }, { code: '060880102', part: 0.5 }, { code: 'absent', part: 1 }], base);
  assert.equal(tout.iris, 2);
  assert.equal(tout.population, 2000);
  assert.equal(tout.csp_plus, 300 + 400, 'artisans, cadres, intermédiaires');
  assert.equal(tout.retraites, 400);
  assert.equal(tout.taux_chomage, 10);
  assert.equal(tout.csp_majoritaire, CSP[6]);
  assert.equal(agreger([], base).population, 0);
  assert.equal(agreger([], base).csp_majoritaire, null);
});

test('les parts d\'IRIS dans une zone se calculent, et les IRIS loin sont ignorés', () => {
  const zone = cercle(43.7, 7.26, 300);
  const iris = [
    { code: 'A', nom: 'Dedans', geometry: carre(7.2598, 43.6998, 50) },
    { code: 'B', nom: 'Loin', geometry: carre(7.4, 43.9, 50) },
  ];
  const parts = partsIris(iris, zone);
  assert.deepEqual(parts.map((p) => p.code), ['A']);
  assert.equal(parts[0].part, 1);
});

test('les familles : le préfixe le plus long gagne, et les préfixes tiennent dans une question', () => {
  assert.equal(familleDe('47.71Z'), 'Mode');
  assert.equal(familleDe('4778A'), 'Beauté / Santé', 'optique');
  assert.equal(familleDe('47.78C'), 'Maison / Décoration');
  assert.equal(familleDe('56.10A'), 'Restauration');
  assert.equal(familleDe('10.71C'), 'Commerce de Bouche');
  assert.equal(familleDe('69.10Z'), 'Service');
  assert.equal(familleDe('68.20A'), null, 'les SCI ne sont pas des vitrines');
  assert.equal(familleDe(''), null);
  assert.ok(PREFIXES.every((p) => /^\d{2,4}$/.test(p)));
  assert.ok(FAMILLES_COMMERCE.has('Restauration') && !FAMILLES_COMMERCE.has('Service'));
  assert.deepEqual(parFamille([{ activite: '56.10A' }, { activite: '56.30Z' }, { activite: '47.71Z' }, { activite: '99.99Z' }]), [{ n: 2, famille: 'Restauration' }, { n: 1, famille: 'Mode' }]);
});

const point = { lat: 43.70, lon: 7.26 };
const deg = (m) => m / 111320;
const etab = (siret, numero, code, opts = {}) => ({
  siret, nom: `Société ${siret}`, enseigne: opts.enseigne ?? `Enseigne ${siret}`, activite: code, activite_libelle: `Libellé ${code}`,
  adresse: `${numero} RUE DABRAY 06000 NICE`, voie: 'DABRAY', etat: opts.etat || 'A', ouverture: opts.ouverture || '2010-05-01',
  lat: opts.lat ?? point.lat + deg(opts.d ?? 0), lon: opts.lon ?? point.lon,
});

test('la rue : ses commerces par famille et ancienneté, sa note, sans les fermés ni les services', () => {
  const aujourdhui = new Date('2026-09-21');
  const etabs = [
    etab('1', '10', '56.10A', { ouverture: '2025-01-01' }),
    etab('2', '12', '47.71Z', { ouverture: '2022-01-01' }),
    etab('3', '14', '96.02A', { ouverture: '2019-01-01' }),
    etab('4', '16', '47.11B', { ouverture: '2000-01-01' }),
    etab('5', '18', '69.10Z'),
    etab('6', '20', '56.10A', { etat: 'F' }),
    { ...etab('7', '5', '56.10A'), adresse: '5 RUE DE FRANCE 06000 NICE', voie: 'DE FRANCE' },
  ];
  assert.equal(etablissementsDeLaRue(etabs, 'Rue Dabray').length, 6);
  const rue = lireRue(etabs, 'Rue Dabray', { longueur_m: 459, type: 'residential' }, aujourdhui);
  assert.equal(rue.commerces, 4);
  assert.equal(rue.entreprises, 5, 'le cabinet compte comme entreprise, pas comme commerce');
  assert.equal(rue.fermetures_recentes, 1);
  assert.equal(rue.longueur_m, 459);
  assert.deepEqual(rue.anciennete.map((t) => t.n), [1, 1, 1, 1]);
  assert.equal(rue.anciennete[0].part, 25);
  assert.equal(rue.note.note, 2);
  assert.match(rue.libelle, /4 commerces - rue semi-commerçante/);
  assert.equal(lireRue([], 'Rue Vide').libelle, '0 commerce - rue peu commerçante');
  assert.equal(trancheAnciennete('1900-01-01'), null, 'la date sentinelle du registre');
  assert.equal(trancheAnciennete('2026-01-01', aujourdhui), '0-3 ans');
  assert.deepEqual(numeroDe('12 B AV JEAN MEDECIN 06000 NICE'), { n: 12, libelle: '12 b' });
  assert.equal(numeroDe('AV JEAN MEDECIN 06000 NICE'), null);
});

test('le tronçon : cent mètres, numéro par numéro, les trous sont des habitations', () => {
  const etabs = [
    etab('1', '37', '56.10A', { d: 10 }),
    etab('2', '41', '47.71Z', { d: 20 }),
    etab('3', '41', '96.02A', { d: 20 }),
    etab('4', '40', '47.11B', { d: -30 }),
    etab('5', '44', '69.10Z', { d: -40 }),
    etab('6', '200', '56.10A', { d: 900 }),
    { ...etab('7', '39', '56.10A', { d: 5 }), lat: null, lon: null },
  ];
  const { troncon, commerces_troncon } = lireTroncon(etabs, point);
  assert.equal(commerces_troncon.total, 4, 'le cabinet et le lointain ne comptent pas, le sans-point non plus');
  assert.deepEqual(troncon.bornes, { du: 37, au: 44 });
  assert.equal(troncon.note.note, 2);
  assert.match(troncon.libelle, /4 commerces - tronçon peu commerçant/);
  const impair = commerces_troncon.numeros.filter((n) => n.cote === 'impair');
  assert.deepEqual(impair.map((n) => n.numero), ['37', '39', '41']);
  assert.equal(impair[1].habitation, true);
  assert.equal(impair[2].commerces.length, 2);
  const pair = commerces_troncon.numeros.filter((n) => n.cote === 'pair');
  assert.deepEqual(pair.map((n) => [n.numero, n.habitation || false]), [['40', false], ['42', true], ['44', false]]);
  assert.equal(pair[2].commerces[0].activite, 'Libellé 69.10Z');
});

test('le flux retombe à une étoile près des trois rapports archivés', () => {
  // Rue Dabray, Nice : 13 commerces sur le tronçon, 35 sur 459 m ; le rapport archivé disait 3/5.
  const dabray = fluxPieton({ commerces_troncon: 13, commerces_rue: 35, longueur_rue_m: 459, type_voie: 'residential', habitants_5min: 5829, entreprises_5min: 1117, generateurs: [{ genre: 'Gare' }, { genre: 'Bus' }, { genre: 'Bus' }] });
  assert.ok(Math.abs(dabray.note.note - 3) <= 1, `Dabray ${dabray.note.note}`);
  // Rue Saint-Agricol, Avignon : 33 sur le tronçon, 48 sur 166 m, piétonne ; le rapport archivé disait 5/5.
  const agricol = fluxPieton({ commerces_troncon: 33, commerces_rue: 48, longueur_rue_m: 166, type_voie: 'pedestrian', habitants_5min: 3428, entreprises_5min: 1588, generateurs: [{ genre: 'Bus' }] });
  assert.equal(agricol.note.note, 5, `Saint-Agricol ${agricol.note.note}`);
  // Avenue Marceau, Courbevoie : 19 sur le tronçon, 116 sur 583 m ; le rapport archivé disait 3/5.
  const marceau = fluxPieton({ commerces_troncon: 19, commerces_rue: 116, longueur_rue_m: 583, type_voie: 'secondary', habitants_5min: 8334, entreprises_5min: 1365, generateurs: [{ genre: 'Bus' }, { genre: 'Bus' }] });
  assert.ok(Math.abs(marceau.note.note - 3) <= 1, `Marceau ${marceau.note.note}`);
  // Une rue sans rien.
  const vide = fluxPieton({ commerces_troncon: 0, commerces_rue: 0, longueur_rue_m: 300, type_voie: 'residential', habitants_5min: 800, entreprises_5min: 20, generateurs: [] });
  assert.equal(vide.note.note, 1);
  assert.equal(vide.estime, true);
  assert.deepEqual(vide.par_heure.basse, { min: FOURCHETTES[1][0], max: FOURCHETTES[1][1] });
  assert.ok(vide.par_jour.haute.max > vide.par_heure.haute.max * 10);
  assert.equal(Object.keys(vide.sous_notes).length, 4);
  assert.equal(noteShopping({ commerces_troncon: 0, commerces_rue: 48, longueur_rue_m: 166 }), 3, 'une rue dense mais un tronçon vide : entre les deux');

  assert.equal(fluxVoiture('primary').note.note, 5);
  assert.equal(fluxVoiture('residential').note.note, 2);
  assert.equal(fluxVoiture(null).indisponible, true);
});

test("l'étude assemblée a la forme que l'écran lit, et dit ce qu'elle estime", () => {
  const adresse = { label: '49 Rue Dabray 06000 Nice', numero: '49', rue: 'Rue Dabray', code_postal: '06000', ville: 'Nice', code_insee: '06088', lat: point.lat, lon: point.lon };
  assert.equal(cleAdresse(adresse), '49 rue dabray 06000 nice');
  const zone = (minutes, hab, menages) => ({
    cle: minutes === 5 ? 'primaire' : minutes === 10 ? 'secondaire' : 'tertiaire', minutes, marche: `${minutes} minutes à pied`, rayon_m: minutes * 80,
    geometrie: cercle(point.lat, point.lon, minutes * 80),
    insee: { population: { habitants: hab }, menages: { menages, part_proprietaires: 40 }, logement: { part_maisons: 10, part_collectif: 90 }, revenus: { niveau_de_vie_moyen: 20000 + minutes * 100 } },
    recensement: { population: hab, csp_plus: Math.round(hab * 0.3), retraites: Math.round(hab * 0.2), taux_chomage: 12.5, csp_majoritaire: 'Retraités' },
    iris: [{ code: 'x', part: 1 }],
  });
  const etablissements = [etab('1', '49', '56.10A', { d: 10 }), etab('2', '51', '47.71Z', { d: 15 }), etab('3', '53', '69.10Z', { d: 20 }), etab('9', '300', '56.10A', { d: 3000 })];
  const releve = { rues: [{ cle: 'rue dabray', nom: 'Rue Dabray', vitrines: 30, longueur_m: 459, type: 'residential' }, { cle: 'avenue jean medecin', nom: 'Avenue Jean Médecin', vitrines: 200, longueur_m: 1200, type: 'primary' }] };
  const r = assembler({ adresse, etablissements, releve, zones: [zone(5, 5829, 3020), zone(10, 22326, 11000), zone(15, 38943, 19000)], generateurs: [{ genre: 'Gare' }] });

  assert.equal(r.estime, true);
  assert.equal(r.en_tete.revenu_annuel_quartier, 20500);
  assert.equal(r.en_tete.csp_majoritaire, 'Retraités');
  assert.ok(r.en_tete.revenu_vs_france < 0);
  assert.equal(r.flux_pieton.estime, true);
  assert.equal(r.flux_voiture.note.note, 2);
  assert.equal(r.rue.commerces, 3, 'le lointain est dans la rue, pas dans le tronçon');
  assert.equal(r.rue.longueur_m, 459);
  assert.deepEqual(r.rue.rang, { rang: 2, sur: 2, part: 1 });
  assert.equal(r.rue.liste, undefined, 'la liste des établissements ne part pas dans le résultat gardé');
  assert.equal(r.commerces_troncon.total, 2);
  assert.equal(r.troncon.entreprises, 3);
  assert.equal(r.demographie.habitants, 38943, 'la zone la plus large contient les autres');
  assert.equal(r.demographie.evolution, null);
  assert.equal(r.revenu.revenu_moyen_annuel, 21500);
  assert.equal(r.revenu.taux_chomage, 12.5);
  assert.equal(r.revenu.retraites, Math.round(38943 * 0.2));
  assert.deepEqual([r.zone_primaire.logements, r.zone_primaire.maisons, r.zone_primaire.appartements, r.zone_primaire.proprietaires], [3020, 302, 2718, 1208]);
  assert.equal(r.zone_primaire.commerces, 2);
  assert.equal(r.zone_primaire.entreprises, 3);
  assert.equal(r.zones.length, 3);
  assert.equal(r.zones[0].geometrie, undefined, 'la géométrie ne part pas non plus');
  assert.equal(r.zones[0].iris, 1);
  assert.equal(SOURCE, 'Klocka · sources ouvertes');

  // Sans registre ni relevé, l'étude tient quand même, avec des zéros et des nulls.
  const nu = assembler({ adresse, etablissements: [], releve: null, zones: [zone(5, 100, 50), zone(10, 200, 100), zone(15, 300, 150)] });
  assert.equal(nu.rue.commerces, 0);
  assert.equal(nu.rue.rang, null);
  assert.equal(nu.flux_voiture.indisponible, true);
  assert.equal(nu.flux_pieton.note.note, 1);
});
