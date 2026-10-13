// Signaux de vacance : les règles sans réseau, et l'ingestion rejouée deux fois.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-vacance-'));
const {
  categorieDe, classerAnnonce, sirenDe, adresseAnnonce, rattacher, estDemenagement, distanceM, boite, lireParametres, regrouper, enGeoJson,
  PARAMETRES, CLES_TYPES, CLES_CATEGORIES,
} = await import('./vacance-regles.js');
const { lireEtablissementVacance } = await import('./vacance-sources.js');
const { default: db } = await import('../db.js');
const { chargerZone, rechercher, zone, etat, supprimerSignal, poserNaf, utiliserSources } = await import('./vacance.js');

test('vacance : le type de bien se déduit du code NAF, le préfixe le plus long l\'emporte', () => {
  assert.equal(categorieDe('47.11F'), 'commerce');
  assert.equal(categorieDe('56.10A'), 'commerce');
  assert.equal(categorieDe('95.21Z'), 'commerce', '95.2 est un commerce (réparation de biens personnels)');
  assert.equal(categorieDe('95.11Z'), 'autre', '95.1 (réparation d\'ordinateurs) ne l\'est pas');
  assert.equal(categorieDe('96.02A'), 'commerce');
  assert.equal(categorieDe('62.01Z'), 'bureau');
  assert.equal(categorieDe('68.20B'), 'bureau');
  assert.equal(categorieDe('84.11Z'), 'bureau');
  assert.equal(categorieDe('25.62B'), 'industrie');
  assert.equal(categorieDe('43.32A'), 'industrie');
  assert.equal(categorieDe('46.69B'), 'entrepot');
  assert.equal(categorieDe('52.10B'), 'entrepot');
  assert.equal(categorieDe('86.21Z'), 'sante');
  assert.equal(categorieDe('75.00Z'), 'sante');
  assert.equal(categorieDe('55.10Z'), 'autre');
  assert.equal(categorieDe('85.59A'), 'autre');
  assert.equal(categorieDe(null), 'autre');
  // Une table modifiée en base l'emporte sur celle de la spec.
  assert.equal(categorieDe('55.10Z', [{ prefixe: '55', categorie: 'commerce' }]), 'commerce');
});

const jugement = (nature, date = '2026-10-05', famille = 'Extrait de jugement', complement = null) => ({
  id: 'A1', familleavis: 'collective', dateparution: '2026-10-08', tribunal: 'Greffe du Tribunal de Commerce de Libourne', registre: ['919582106', '919 582 106'],
  jugement: JSON.stringify({ nature, date, famille, complementJugement: complement }),
});

test('vacance : une annonce BODACC se range dans un des sept types, ou nulle part', () => {
  assert.equal(classerAnnonce(jugement("Jugement d'ouverture de liquidation judiciaire")).type, 'liquidation');
  assert.equal(classerAnnonce(jugement('Jugement de conversion en liquidation judiciaire')).type, 'liquidation');
  assert.equal(classerAnnonce(jugement('Jugement prononçant la résolution du plan de redressement et la liquidation judiciaire')).type, 'liquidation');
  assert.equal(classerAnnonce(jugement("Jugement d'ouverture d'une procédure de redressement judiciaire")).type, 'redressement');
  assert.equal(classerAnnonce(jugement("Jugement d'ouverture d'une procédure de sauvegarde")).type, 'sauvegarde');
  assert.equal(classerAnnonce(jugement("Jugement de clôture pour insuffisance d'actif")).type, 'autre_procedure');
  assert.equal(classerAnnonce(jugement('Jugement de plan de redressement')).type, 'autre_procedure');
  assert.equal(classerAnnonce(jugement('Autre jugement et ordonnance', '2026-10-09', 'Extrait de jugement', 'Ouvre la procédure de redressement après conversion de la procédure de sauvegarde')).type, 'redressement');
  // Les actes de pure procédure ne sont pas des signaux.
  assert.equal(classerAnnonce(jugement("Dépôt de l'état des créances", '2026-10-05', 'Avis de dépôt')), null);
  assert.equal(classerAnnonce(jugement("Liste des créances nées après le jugement d'ouverture d'une procédure de liquidation judiciaire", '2026-10-05', 'Avis de dépôt')), null);
  // La date retenue d'une procédure est celle du jugement, pas de la parution.
  assert.equal(classerAnnonce(jugement("Jugement d'ouverture de liquidation judiciaire", '2026-10-05')).date, '2026-10-05');
  assert.equal(classerAnnonce(jugement("Jugement d'ouverture de liquidation judiciaire")).detail.tribunal, 'Greffe du Tribunal de Commerce de Libourne');

  const radiation = { id: 'B1', familleavis: 'radiation', dateparution: '2026-10-11', radiationaurcs: JSON.stringify({ dateCessationActivitePP: '2026-09-14' }) };
  assert.deepEqual({ type: classerAnnonce(radiation).type, date: classerAnnonce(radiation).date }, { type: 'radiation', date: '2026-10-11' });
  const dissolution = { id: 'B2', familleavis: 'modification', dateparution: '2026-10-13', modificationsgenerales: JSON.stringify({ descriptif: "Cessation d'activité et dissolution de la société", dateEffet: '2025-04-30' }) };
  assert.equal(classerAnnonce(dissolution).type, 'dissolution');
  const transfert = { id: 'B3', familleavis: 'modification', dateparution: '2026-10-08', modificationsgenerales: JSON.stringify({ descriptif: "modification survenue sur le capital (augmentation) et l'adresse du siège" }) };
  assert.equal(classerAnnonce(transfert).type, 'transfert_siege');
  const gerant = { id: 'B4', familleavis: 'modification', dateparution: '2026-10-08', modificationsgenerales: JSON.stringify({ descriptif: 'modification survenue sur l\'administration' }) };
  assert.equal(classerAnnonce(gerant), null);
  assert.equal(classerAnnonce({ familleavis: 'creation' }), null);
  assert.equal(classerAnnonce({ familleavis: 'vente' }), null);
  assert.equal(classerAnnonce({ familleavis: 'dpc' }), null);
});

test('vacance : le SIREN et l\'adresse se lisent dans l\'annonce', () => {
  assert.equal(sirenDe({ registre: ['919582106', '919 582 106'] }), '919582106');
  assert.equal(sirenDe({ registre: '919 582 106' }), '919582106');
  assert.equal(sirenDe({ registre: null }), null);
  const a = { listepersonnes: JSON.stringify({ personne: { adressePP: { numeroVoie: '41 bis', typeVoie: 'rue', nomVoie: 'Max Linder', codePostal: '33500', ville: 'Libourne' } } }) };
  assert.equal(adresseAnnonce(a), '41 bis rue Max Linder 33500 Libourne');
  const b = { listepersonnes: JSON.stringify({ personne: { adresseSiegeSocial: { nomVoie: '12 Avenue de la Mairie', codePostal: '33500', ville: 'NEAC' } } }) };
  assert.equal(adresseAnnonce(b), '12 Avenue de la Mairie 33500 NEAC');
  assert.equal(adresseAnnonce({}), null);
});

const etab = (siret, etat, o = {}) => ({ siret, etat, date_fermeture: null, est_siege: false, adresse: `${siret} rue`, ...o });

test('vacance : un signal d\'entreprise se rattache aux locaux actifs ou fermés depuis moins de douze mois', () => {
  const liste = [
    etab('A', 'actif', { est_siege: true }),
    etab('B', 'ferme', { date_fermeture: '2026-03-01' }),
    etab('C', 'ferme', { date_fermeture: '2024-01-01' }),
  ];
  const r = rattacher({ type: 'liquidation', date: '2026-10-05' }, liste);
  assert.deepEqual(r.etablissements.map((e) => e.siret), ['A', 'B'], 'C a fermé il y a plus de douze mois');
  assert.equal(r.multi_sites, false);
  // Au-delà de dix, le siège seul, et on le dit.
  const reseau = [etab('S', 'actif', { est_siege: true }), ...Array.from({ length: 12 }, (_, i) => etab(`M${i}`, 'actif'))];
  const m = rattacher({ type: 'redressement', date: '2026-10-05' }, reseau);
  assert.deepEqual(m.etablissements.map((e) => e.siret), ['S']);
  assert.equal(m.multi_sites, true);
  assert.equal(rattacher({ type: 'radiation', date: '2026-10-05' }, []).etablissements.length, 0);
});

test('vacance : un transfert de siège se rattache à l\'ancien siège fermé à soixante jours près, sinon à rien', () => {
  const liste = [etab('N', 'actif', { est_siege: true }), etab('V', 'ferme', { date_fermeture: '2026-09-20' }), etab('L', 'ferme', { date_fermeture: '2025-01-01' })];
  assert.deepEqual(rattacher({ type: 'transfert_siege', date: '2026-10-08' }, liste).etablissements.map((e) => e.siret), ['V']);
  assert.deepEqual(rattacher({ type: 'transfert_siege', date: '2026-10-08' }, [etab('N', 'actif')]).etablissements, []);
  assert.equal(PARAMETRES.jours_transfert, 60);
});

test('vacance : une fermeture suivie d\'une ouverture ailleurs est un déménagement', () => {
  const ferme = etab('F', 'ferme', { date_fermeture: '2026-03-01', adresse: '1 rue A' });
  assert.equal(estDemenagement(ferme, [etab('G', 'actif', { date_creation: '2026-03-15', adresse: '9 rue B' })]), true);
  assert.equal(estDemenagement(ferme, [etab('G', 'actif', { date_creation: '2026-03-15', adresse: '1 rue A' })]), false, 'même adresse : pas un déménagement');
  assert.equal(estDemenagement(ferme, [etab('G', 'actif', { date_creation: '2025-01-15', adresse: '9 rue B' })]), false, 'trop ancien');
  assert.equal(estDemenagement(ferme, []), false);
});

test('vacance : distance, boîte englobante et paramètres bornés', () => {
  // Place Abel Surchamp → rue Max Linder, à Libourne : environ 2,7 km.
  const d = distanceM(44.914668, -0.244462, 44.938858, -0.240362);
  assert.ok(d > 2600 && d < 2800, `${d}`);
  const b = boite(44.9147, -0.2445, 500);
  assert.ok(b.lat_max - b.lat_min > 0.0089 && b.lat_max - b.lat_min < 0.0091);
  assert.ok(b.lon_max - b.lon_min > (b.lat_max - b.lat_min), 'un degré de longitude est plus court à cette latitude');

  const p = lireParametres({ lon: '-0.2445', lat: '44.9147' });
  assert.equal(p.ok, true);
  assert.equal(p.rayon_m, 500);
  assert.deepEqual(p.categories, CLES_CATEGORIES);
  assert.deepEqual(p.types, CLES_TYPES);
  assert.equal(CLES_TYPES.length, 8, 'huit types : les permis Sitadel ne sont pas branchés');
  assert.equal(lireParametres({ lon: '-0.2445', lat: '44.9147', rayon_m: '50' }).ok, false);
  assert.equal(lireParametres({ lon: '-0.2445', lat: '44.9147', rayon_m: '6000' }).ok, false);
  assert.equal(lireParametres({ lon: '-0.2445', lat: '44.9147', categories: 'inconnue' }).ok, false, 'aucun type de bien valable');
  assert.equal(lireParametres({ lon: '-0.2445', lat: '44.9147', date_min: '2026-01-01', date_max: '2025-01-01' }).ok, false, 'intervalle inversé');
  assert.deepEqual(lireParametres({ lon: '-0.2445', lat: '44.9147', categories: 'commerce,bureau', types: 'liquidation' }).categories, ['commerce', 'bureau']);
  assert.equal(lireParametres({ lon: 'x', lat: '1' }).ok, false);
});

test('vacance : un établissement en redressement puis en liquidation ne fait qu\'un marqueur, les deux signaux dans la chronologie', () => {
  const centre = { lat: 44.914668, lon: -0.244462 };
  const pres = { lat: 44.9155, lon: -0.2440 };
  const loin = { lat: 44.938858, lon: -0.240362 };
  const lignes = [
    { type_signal: 'redressement', source: 'bodacc', source_id: 'A1', siret: '1', date_signal: '2026-02-01', categorie_bien: 'commerce', ...pres, details: '{}' },
    { type_signal: 'liquidation', source: 'bodacc', source_id: 'A2', siret: '1', date_signal: '2026-09-01', categorie_bien: 'commerce', ...pres, details: '{"tribunal":"Libourne"}' },
    { type_signal: 'fermeture', source: 'sirene', source_id: '2', siret: '2', date_signal: '2026-05-01', categorie_bien: 'bureau', ...pres, details: '{}' },
    { type_signal: 'liquidation', source: 'bodacc', source_id: 'A3', siret: '3', date_signal: '2026-09-01', categorie_bien: 'commerce', ...loin, details: '{}' },
    { type_signal: 'liquidation', source: 'bodacc', source_id: 'A4', siret: '4', date_signal: '2024-09-01', categorie_bien: 'commerce', ...pres, details: '{}' },
  ];
  const p = { ...centre, rayon_m: 500, categories: ['commerce'], types: CLES_TYPES, date_min: '2025-01-01', date_max: null };
  const r = regrouper(lignes, p);
  assert.equal(r.total, 1, 'le bureau est filtré, le lointain hors rayon, l\'ancien hors dates');
  const l = r.locaux[0];
  assert.equal(l.siret, '1');
  assert.deepEqual(l.signal_principal, { type: 'liquidation', date: '2026-09-01' });
  assert.deepEqual(l.signaux.map((s) => s.type), ['liquidation', 'redressement']);
  assert.equal(l.signaux[0].tribunal, 'Libourne');
  assert.ok(l.distance_m > 0 && l.distance_m < 500);
  assert.deepEqual(r.repartition, { liquidation: 1, redressement: 1 });
  const g = enGeoJson(r, { nom: 'Libourne' });
  assert.equal(g.type, 'FeatureCollection');
  assert.deepEqual(g.features[0].geometry.coordinates, [pres.lon, pres.lat]);
  assert.equal(g.features[0].properties.url_annuaire, null, 'sans SIREN, pas de lien annuaire');
  // La limite : au-delà de deux mille locaux, on tronque et on le dit.
  const beaucoup = Array.from({ length: 2005 }, (_, i) => ({ type_signal: 'fermeture', source: 'sirene', source_id: `s${i}`, siret: `s${i}`, date_signal: '2026-01-01', categorie_bien: 'commerce', ...pres, details: '{}' }));
  const t = regrouper(beaucoup, { ...p, date_min: null });
  assert.equal(t.tronque, true);
  assert.equal(t.locaux.length, 2000);
  assert.equal(t.total, 2005);
});

test('vacance : un établissement Sirene se lit avec son siège et son SIREN ; la diffusion partielle est exclue', () => {
  const brut = {
    siret: '91958210600010', siren: '919582106', etablissementSiege: false, statutDiffusionEtablissement: 'O', dateCreationEtablissement: '2022-10-01',
    uniteLegale: { denominationUniteLegale: 'MSPV' },
    adresseEtablissement: { numeroVoieEtablissement: '9', typeVoieEtablissement: 'RUE', libelleVoieEtablissement: 'DE CONDE', codePostalEtablissement: '33000', libelleCommuneEtablissement: 'BORDEAUX', codeCommuneEtablissement: '33063', coordonneeLambertAbscisseEtablissement: '417733.01', coordonneeLambertOrdonneeEtablissement: '6422436.38' },
    periodesEtablissement: [{ dateFin: null, dateDebut: '2024-12-02', etatAdministratifEtablissement: 'F', activitePrincipaleEtablissement: '01.61Z' }, { dateFin: '2024-12-01', dateDebut: '2022-10-01', etatAdministratifEtablissement: 'A', activitePrincipaleEtablissement: '01.61Z' }],
  };
  const e = lireEtablissementVacance(brut);
  assert.equal(e.siren, '919582106');
  assert.equal(e.etat, 'ferme');
  assert.equal(e.date_fermeture, '2024-12-02');
  assert.equal(e.date_creation, '2022-10-01');
  assert.equal(e.est_siege, false);
  assert.equal(e.code_naf, '01.61Z');
  assert.ok(Math.abs(e.lat - 44.84) < 0.05 && Math.abs(e.lon - (-0.57)) < 0.05, 'Bordeaux');
  assert.equal(e.geo_precision, 'numero');
  assert.equal(lireEtablissementVacance({ ...brut, statutDiffusionEtablissement: 'P' }), null);
});

// --- L'ingestion, avec de fausses sources ------------------------------------------

const SIEGE = { siret: '11111111100011', siren: '111111111', denomination: 'BOULANGERIE DU PORT', enseigne: 'Au bon pain', adresse: '12 RUE DU PORT 33500 LIBOURNE', code_naf: '10.71C', etat: 'actif', date_fermeture: null, date_creation: '2015-01-01', est_siege: true, lat: 44.9150, lon: -0.2440, geo_precision: 'numero', code_commune: '33243' };
const FERME = { siret: '22222222200022', siren: '222222222', denomination: 'CABINET DURAND', enseigne: null, adresse: '3 RUE GAMBETTA 33500 LIBOURNE', code_naf: '69.10Z', etat: 'ferme', date_fermeture: '2026-06-30', date_creation: '2010-01-01', est_siege: true, lat: 44.9142, lon: -0.2450, geo_precision: 'numero', code_commune: '33243' };
const SANS_POINT = { siret: '33333333300033', siren: '333333333', denomination: 'GARAGE MARTIN', enseigne: null, adresse: '41 bis rue Max Linder 33500 Libourne', code_naf: '45.20A', etat: 'actif', date_fermeture: null, date_creation: '2018-01-01', est_siege: true, lat: null, lon: null, geo_precision: null, code_commune: '33243' };
const ANNONCES = [
  jugement("Jugement d'ouverture d'une procédure de redressement judiciaire", '2026-03-01'),
  { ...jugement("Jugement d'ouverture de liquidation judiciaire", '2026-09-15'), id: 'A2', dateparution: '2026-09-18' },
  { id: 'B5', familleavis: 'radiation', dateparution: '2026-10-11', registre: ['444444444'], commercant: 'Martineau, Matthieu', radiationaurcs: '{}', listepersonnes: JSON.stringify({ personne: { adressePP: { numeroVoie: '7', typeVoie: 'rue', nomVoie: 'Fonneuve', codePostal: '33500', ville: 'Libourne' } } }) },
  { id: 'C1', familleavis: 'creation', dateparution: '2026-10-01', registre: ['555555555'] },
].map((a, i) => (i < 2 ? { ...a, registre: ['111111111', '111 111 111'], url_complete: `https://www.bodacc.fr/${a.id}` } : a));
ANNONCES[0].id = 'A1';

const appels = { bodacc: 0, fermetures: 0, sirens: [], geocodes: [] };
const FAUSSES = {
  annoncesBodacc: async () => { appels.bodacc++; return ANNONCES; },
  fermeturesCommune: async () => { appels.fermetures++; return [FERME]; },
  etablissementsParSirens: async (sirens) => { appels.sirens.push(...sirens); return [SIEGE, SANS_POINT].filter((e) => sirens.includes(e.siren)); },
  geocoder: async (adresse) => { appels.geocodes.push(adresse); return /Max Linder|Fonneuve/.test(adresse) ? { lat: 44.9388, lon: -0.2403, precision: 'numero', score: 0.8 } : null; },
};

test('vacance : l\'ingestion d\'une commune est rejouable sans doublon, et la recherche lit la base', async () => {
  // Rien ne sort sur le réseau pendant un test : les sources sont fausses, pour la demande de fond aussi.
  utiliserSources(FAUSSES);
  const z = { code_commune: '33243', code_postal: '33500', nom: 'Libourne' };
  const r1 = await chargerZone(z, { sources: FAUSSES });
  assert.equal(r1.ok, true, r1.error);
  assert.equal(zone('33243').etat, 'prete');
  const n1 = etat().signaux;
  // Redressement + liquidation sur le siège (2), la fermeture du cabinet (1), la radiation sans registre géocodée (1). La création est ignorée.
  assert.equal(n1, 4);
  assert.ok(appels.sirens.includes('111111111'), 'les établissements de l\'entreprise signalée sont lus');
  assert.ok(appels.geocodes.some((a) => /Fonneuve/.test(a)), 'une entreprise inconnue du registre est placée par l\'adresse de l\'annonce');

  const r2 = await chargerZone(z, { sources: FAUSSES, delta: true });
  assert.equal(r2.ok, true);
  assert.equal(etat().signaux, n1, 'deux passages, le même nombre de signaux');
  assert.equal(etat().executions.length, 2);

  // La recherche : autour de la place, 500 m, commerces seuls.
  const res = rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', categories: 'commerce', commune: '33243' });
  assert.equal(res.statut, 200);
  assert.equal(res.features.length, 0, 'la boulangerie est une industrie (10.71C), le cabinet un bureau');
  const tout = rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', commune: '33243' });
  assert.equal(tout.features.length, 2);
  const boulangerie = tout.features.find((f) => f.properties.siret === '11111111100011');
  assert.deepEqual(boulangerie.properties.signaux.map((s) => s.type), ['liquidation', 'redressement'], 'un local, deux signaux, le plus récent d\'abord');
  assert.equal(boulangerie.properties.signal_principal.type, 'liquidation');
  assert.equal(boulangerie.properties.categorie_bien, 'industrie');
  assert.equal(tout.zone.nom, 'Libourne');
  assert.deepEqual(tout.repartition, { liquidation: 1, redressement: 1, fermeture: 1 });
  // Plus loin, la radiation géocodée à la rue Max Linder.
  const large = rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '5000', commune: '33243', types: 'radiation' });
  assert.equal(large.features.length, 1);
  assert.equal(large.features[0].properties.siret, null);
  assert.equal(large.features[0].properties.categorie_bien, 'autre');

  // Les dates sont inclusives.
  assert.equal(rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', commune: '33243', date_min: '2026-09-15', date_max: '2026-09-15' }).features.length, 1);
  assert.equal(rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', commune: '33243', date_min: '2026-09-16' }).features.length, 0);
  // Sans commune choisie dans les propositions, la recherche ne part pas.
  assert.equal(rechercher({ lon: '-0.244462', lat: '44.914668' }).statut, 400);
  // Une commune jamais vue : la demande part, et on dit d'attendre.
  const attente = rechercher({ lon: '2.35', lat: '48.85', commune: '75101', cp: '75001', nom: 'Paris' }, { par: 'test' });
  assert.equal(attente.statut, 202);
  assert.equal(attente.etat, 'chargement');
  // Un chargement interrompu par un redémarrage (la commune reste « en chargement », rien ne tourne) repart à la recherche suivante.
  await new Promise((ok) => setTimeout(ok, 50));
  db.prepare("UPDATE vacance_zone SET etat = 'chargement', chargee_le = NULL WHERE code_commune = '33243'").run();
  const relance = rechercher({ lon: '-0.244462', lat: '44.914668', commune: '33243' });
  assert.equal(relance.statut, 202);
  await new Promise((ok) => setTimeout(ok, 50));
  assert.equal(zone('33243').etat, 'prete', 'la commune a été rechargée au lieu de rester bloquée');
});

test('vacance : une demande de suppression retire le signal et l\'empêche de revenir ; la table NAF se corrige en base', async () => {
  const r = supprimerSignal('A2', { par: 'jules', motif: 'demande DILA' });
  assert.equal(r.supprimes, 1);
  await chargerZone({ code_commune: '33243', code_postal: '33500', nom: 'Libourne' }, { sources: FAUSSES, delta: true });
  const tout = rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', commune: '33243' });
  const boulangerie = tout.features.find((f) => f.properties.siret === '11111111100011');
  assert.deepEqual(boulangerie.properties.signaux.map((s) => s.type), ['redressement']);

  const naf = poserNaf('1071', 'commerce', 'une boulangerie est une devanture');
  assert.equal(naf.ok, true);
  assert.ok(naf.reclasses >= 2, 'l\'établissement et ses signaux sont reclassés sur-le-champ');
  assert.equal(poserNaf('10', 'inexistante').ok, false);
  const apres = rechercher({ lon: '-0.244462', lat: '44.914668', rayon_m: '500', commune: '33243', categories: 'commerce' });
  assert.equal(apres.features.length, 1, 'la boulangerie est désormais un commerce');
});
