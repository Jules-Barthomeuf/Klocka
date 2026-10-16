// Le taux de vacance (14 oct. 2026) : les règles, sans réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-vacance-taux-'));
const T = await import('./vacance-taux.js');

const ZONE = { lat: 44.9150, lon: -0.2430, rayon_m: 300 };
const MAINTENANT = new Date('2026-10-14T10:00:00Z');
let n = 0;
const etab = (adresse, x = {}) => ({ siret: String(++n).padStart(14, '0'), siren: String(n).padStart(9, '0'), denomination: `ENTREPRISE ${n}`, enseigne: null, adresse, code_naf: '47.71Z', etat: 'actif', date_fermeture: null, date_creation: '2020-01-01', lat: 44.9151, lon: -0.2431, categorie_juridique: '5499', ...x });

test('la clé d\'un local : numéro, indice, voie ; abréviations développées, ville retirée', () => {
  assert.equal(T.cleLocal('23 PL JEAN MOULIN 33500 LIBOURNE'), T.cleLocal('23 Place Jean-Moulin'));
  assert.equal(T.cleLocal('9 B RUE LYROT 33500 LIBOURNE'), '9 BIS RUE LYROT');
  assert.equal(T.cleLocal('RUE GAMBETTA 33500 LIBOURNE'), null, 'sans numéro, local inconnu');
  assert.equal(T.voieDe('38 RUE GAMBETTA'), 'RUE GAMBETTA');
  assert.equal(T.memeCommerce('LE WINE SHOP', 'Wine Shop Fronsac'), true);
  assert.equal(T.memeCommerce('AMOUR COOKIE', 'Le Murmure des Fleurs'), false);
});

test('occupé, vacant, écartés : un local par adresse, le taux et la fourchette', () => {
  const e = [
    etab('38 RUE GAMBETTA 33500 LIBOURNE', { etat: 'ferme', date_fermeture: '2026-09-21', enseigne: 'VALEGE' }),
    etab('40 RUE GAMBETTA 33500 LIBOURNE', { enseigne: 'PHARMACIE' }),
    etab('42 RUE GAMBETTA 33500 LIBOURNE', { etat: 'ferme', date_fermeture: '2019-01-01' }),
    etab('44 RUE GAMBETTA 33500 LIBOURNE', { code_naf: '47.89Z' }),
    ...Array.from({ length: 9 }, () => etab('23 PLACE JEAN MOULIN 33500 LIBOURNE')),
  ];
  const r = T.etatsDesLocaux(e, [], ZONE, { maintenantD: MAINTENANT });
  const par = Object.fromEntries(r.locaux.map((l) => [l.cle, l.etat]));
  assert.equal(par['38 RUE GAMBETTA'], 'vacant');
  assert.equal(par['40 RUE GAMBETTA'], 'occupe');
  assert.equal(par['42 RUE GAMBETTA'], undefined, 'fermé il y a plus de cinq ans : hors recensement');
  assert.ok(r.exclus.some((x) => /hors magasin/.test(x.raison)), 'un marché n\'a pas de local');
  assert.ok(r.exclus.some((x) => /domiciliation/.test(x.raison)), 'neuf entreprises à la même adresse : domiciliation');
  assert.deepEqual([r.taux.vacants, r.taux.occupes, r.taux.taux], [1, 1, 50]);
  assert.equal(r.taux.tranches, 2);
  assert.equal(r.taux.fiable, false, 'deux locaux : pas de pourcentage affiché');
  assert.equal(r.taux.bas, undefined, 'plus de fourchette des incertains');
});

test('Google Maps tranche : un autre commerce ouvert reprend le local ; le même encore affiché, incertain ; personne, vacant confirmé', () => {
  const e = [
    etab('36 PLACE ABEL SURCHAMP', { etat: 'ferme', date_fermeture: '2026-09-21', denomination: 'AMOUR COOKIE' }),
    etab('38 RUE MONTESQUIEU', { etat: 'ferme', date_fermeture: '2025-11-10', denomination: 'HALIB VOYAGES' }),
    etab('48 RUE GAMBETTA', { etat: 'ferme', date_fermeture: '2026-06-30', denomination: 'X AND O' }),
  ];
  const google = new Map([
    ['36 PLACE ABEL SURCHAMP', [{ nom: 'Le Murmure des Fleurs', statut: 'OPERATIONAL', type: 'florist' }]],
    ['38 RUE MONTESQUIEU', [{ nom: 'Halib Voyages', statut: 'OPERATIONAL', type: 'travel_agency' }]],
    ['48 RUE GAMBETTA', [{ nom: 'Cabinet Martin', statut: 'OPERATIONAL', type: 'doctor' }]],
  ]);
  const r = T.etatsDesLocaux(e, [], ZONE, { maintenantD: MAINTENANT, google });
  const l = (cle) => r.locaux.find((x) => x.cle === cle);
  assert.equal(l('36 PLACE ABEL SURCHAMP').etat, 'occupe');
  assert.match(l('36 PLACE ABEL SURCHAMP').raison, /Murmure des Fleurs/);
  assert.equal(l('38 RUE MONTESQUIEU').etat, 'incertain');
  assert.equal(l('48 RUE GAMBETTA').etat, 'vacant', 'un cabinet à l\'étage n\'occupe pas la vitrine');
  assert.equal(l('48 RUE GAMBETTA').confiance, 'forte');
});

test('OpenStreetMap ne se rattache que par l\'adresse ; un local vide qu\'il signale compte', () => {
  const e = [etab('10 RUE THIERS', { etat: 'ferme', date_fermeture: '2026-01-01', denomination: 'CHAUSS LIB' })];
  const osm = [
    { nom: 'MT Ongles', type: 'beauty', vacant: false, adresse: null, lat: 44.9151, lon: -0.2431 },
    { nom: null, type: 'vacant', vacant: true, adresse: '12 Rue Thiers', lat: 44.9152, lon: -0.2432 },
  ];
  const r = T.etatsDesLocaux(e, osm, ZONE, { maintenantD: MAINTENANT });
  assert.equal(r.locaux.find((x) => x.cle === '10 RUE THIERS').etat, 'vacant', 'un voisin sans adresse ne reprend pas le local');
  assert.equal(r.locaux.find((x) => x.cle === '12 RUE THIERS').etat, 'vacant');
  assert.equal(T.lireOsm({ type: 'node', lat: 1, lon: 2, tags: { shop: 'vacant', 'addr:housenumber': '12', 'addr:street': 'Rue Thiers' } }).vacant, true);
});

// --- Par rue et par tronçon (16 oct. 2026) ----------------------------------------------------

test('la voie d\'un nom de rue seul est celle du registre, sans article ni abréviation', () => {
  assert.equal(T.voieDuNom('Rue de la République'), T.voieDeAdresse('12 RUE REPUBLIQUE 33500 LIBOURNE'));
  assert.equal(T.voieDuNom('Place Jean-Moulin'), T.voieDeAdresse('23 PL JEAN MOULIN 33500 LIBOURNE'));
  assert.equal(T.voieDuNom(''), null);
});

/** Une rue de `nb` locaux, d'ouest en est, le côté pair puis impair entrelacés ; `vides` : les numéros fermés. */
function rue(nom, nb, { vides = [], lonDepart = -0.25 } = {}) {
  return Array.from({ length: nb }, (_, k) => {
    const numero = k + 1;
    const ferme = vides.includes(numero);
    return etab(`${numero} ${nom} 33500 LIBOURNE`, { lat: 44.915 + (numero % 2) * 0.00004, lon: lonDepart + k * 0.0003, ...(ferme ? { etat: 'ferme', date_fermeture: '2026-06-01', enseigne: `FERME ${numero}` } : { enseigne: `BOUTIQUE ${numero}` }) });
  });
}

test('toute la rue, d\'un bout à l\'autre : un rayon la couperait, la voie la prend entière', () => {
  const e = rue('RUE DE LA REPUBLIQUE', 30, { vides: [1, 2, 3, 4, 5, 6] });
  // Le point est au milieu ; 300 m de rayon ne voient qu'une partie des 30 locaux (9 km de rue au total).
  const centre = { lat: 44.915, lon: -0.25 + 14 * 0.0003, rayon_m: 300 };
  const rayon = T.etatsDesLocaux(e, [], centre, { maintenantD: MAINTENANT });
  assert.ok(rayon.taux.locaux < 30, 'le rayon coupe la rue');
  const entiere = T.etatsDesLocaux(e, [], { ...centre, voie: T.voieDuNom('Rue de la République') }, { maintenantD: MAINTENANT });
  assert.equal(entiere.taux.locaux, 30);
  assert.deepEqual([entiere.taux.vacants, entiere.taux.occupes, entiere.taux.taux, entiere.taux.fiable], [6, 24, 20, true]);
});

test('les autres rues ne comptent pas dans la rue choisie', () => {
  const e = [...rue('RUE DE LA REPUBLIQUE', 12), ...rue('RUE GAMBETTA', 12, { vides: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] })];
  const r = T.etatsDesLocaux(e, [], { lat: 44.915, lon: -0.24, rayon_m: 300, voie: T.voieDuNom('Rue de la République') }, { maintenantD: MAINTENANT });
  assert.equal(r.taux.locaux, 12);
  assert.equal(r.taux.vacants, 0);
});

test('les tronçons : une rue courte reste entière, une longue se coupe en parts égales, dans l\'ordre des numéros', () => {
  const locauxDe = (nb, vides = []) => T.etatsDesLocaux(rue('RUE LONGUE', nb, { vides }), [], { lat: 44.915, lon: -0.24, rayon_m: 1500, voie: T.voieDuNom('Rue Longue') }, { maintenantD: MAINTENANT }).locaux;
  const courte = T.decouperEnTroncons(locauxDe(29));
  assert.equal(courte.length, 1);
  assert.deepEqual([courte[0].du, courte[0].au, courte[0].locaux], [1, 29, 29]);
  // 45 locaux : trois tronçons de 15 ; les dix premiers numéros sont fermés, un bout vide.
  const longue = T.decouperEnTroncons(locauxDe(45, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  assert.equal(longue.length, 3);
  assert.deepEqual(longue.map((t) => t.locaux), [15, 15, 15]);
  assert.deepEqual(longue.map((t) => [t.du, t.au]), [[1, 15], [16, 30], [31, 45]]);
  assert.deepEqual(longue.map((t) => t.vacants), [10, 0, 0]);
  assert.equal(longue[0].taux, 66.7);
  assert.equal(longue[1].taux, 0);
  assert.ok(longue.every((t) => t.fiable), 'quinze locaux tranchés : un pourcentage qui a du sens');
  assert.ok(longue[0].longueur_m > 0 && longue[0].centre.lat);
  // 50 locaux : trois tronçons, 17-17-16, jamais un reste de trois.
  assert.deepEqual(T.decouperEnTroncons(locauxDe(50)).map((t) => t.locaux), [17, 17, 16]);
  // Le décompte du total est la somme des tronçons.
  const somme = longue.reduce((t, x) => t + x.vacants, 0);
  assert.equal(somme, T.compterLocaux(locauxDe(45, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).vacants);
});

test('une demande de rue sans voie ou sans commune est refusée avant tout chargement', async () => {
  assert.deepEqual(T.decouperEnTroncons([]), []);
  const r = await T.tauxDeLaRue({ commune: '', voie: 'Rue X' });
  assert.equal(r.statut, 400);
  assert.equal((await T.tauxDeLaRue({ commune: '33243', voie: '' })).statut, 400);
});
