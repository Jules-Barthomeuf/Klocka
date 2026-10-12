// Off-market, mode Simple (11 oct. 2026) : le lien exploitant / propriétaire,
// les drapeaux, la lecture d'une ville avec un faux SIRENE, la résolution
// d'un commerce avec de faux registres, une adresse précise, les réponses
// d'appel. Rien ne sort sur le réseau.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-simple-'));
process.env.NODE_TEST_CONTEXT = '1';
const { Records } = await import('../db.js');
const S = await import('./simple.js');

const ville = Records.create('Ville', { nom: 'Mâcon', code_postal: '71000', code_insee: '71270', centre: { lat: 46.3, lon: 4.83 } });
const etab = (n, extra = {}) => ({ siret: `1234567890000${n}`, siren: `12345678${n}`, nom: `SOCIETE ${n}`, enseigne: `Enseigne ${n}`, ape: '47.11C', activite: 'Supérette', adresse: `${n} Rue Carnot`, numero: String(n), rue: 'Rue Carnot', cle_rue: 'rue carnot', code_postal: '71000', ville: 'Mâcon', lat: 46.3 + n / 1000, lon: 4.83, depuis: '2010-01-01', actif: true, chaine: false, ...extra });

test('le lien : même SIREN, même dirigeant, même famille, siège à l\'adresse, enseigne dans le nom, tiers, inconnu', () => {
  const ex = { siren: '111', nom: 'BOULANGERIE DUPONT', gerants: [{ nom: 'Jean DUPONT', nom_famille: 'DUPONT' }] };
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: null }).lien, 'inconnu');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'X', siren: '111' } }).lien, 'exploitant_certain');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'SCI DES LILAS', siren: '222', gerants: [{ nom: 'Jean DUPONT' }] } }).motif, 'même dirigeant : Jean DUPONT');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'SCI DES LILAS', siren: '222', gerants: [{ nom: 'Marie DUPONT', nom_famille: 'DUPONT' }] } }).lien, 'exploitant_probable');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'SCI AZUR', siren: '222', siege: { adresse: '12 Rue Carnot 71000 Mâcon' } }, adresse: '12 Rue Carnot' }).motif, 'le siège du propriétaire est à cette adresse');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'SCI BOULANGERIE DUPONT IMMO', siren: '222' }, enseigne: 'Chez Dupont' }).lien, 'exploitant_probable');
  assert.equal(S.lierProprietaire({ exploitant: ex, proprietaire: { nom: 'FONCIERE DU SUD', siren: '333', gerants: [{ nom: 'Paul MARTIN' }] } }).lien, 'tiers');
});

test('les drapeaux : gérant 70+, fonds cédé, fermé, transmission, détention 22 et 30 ans', () => {
  const m = Date.parse('2026-10-11');
  const d = S.drapeauxDe({ exploitant: { gerants: [{ nom: 'A', tranche_age: '70+' }], active: false }, proprietaire: { creation: '1990-01-01' }, evenements: [{ type: 'cession de fonds', date: '2026-01-10' }, { type: 'dissolution', date: '2026-03-01' }], lien: 'tiers' }, { maintenantMs: m });
  assert.deepEqual(d.map((x) => x.cle), ['gerant_age', 'fonds_cede', 'ferme', 'transmission', 'detention_30']);
  assert.match(d[1].texte, /les murs restent au bailleur/);
  assert.deepEqual(S.drapeauxDe({ proprietaire: { creation: '2002-01-01' } }, { maintenantMs: m }).map((x) => x.cle), ['detention_22']);
  assert.deepEqual(S.drapeauxDe({}, { maintenantMs: m }), []);
});

test('la ville : les commerces en pied d\'immeuble, vite, puis la résolution avec de faux registres', async () => {
  const lister = async () => [etab(1), etab(2, { ape: '70.22Z' }), etab(3, { lat: null }), etab(4)];
  const r = await S.lireVilleSimple(ville.id, { lister });
  assert.equal(r.n, 2, 'le cabinet de conseil et le sans-position sont écartés');
  const liste = S.commercesDe(ville.id);
  assert.equal(liste.length, 2);
  assert.equal(liste[0].etat, 'a_faire');
  assert.ok((await S.lireVilleSimple(ville.id, { lister })).deja, 'pas relue avant 30 jours');
  const etapes = [];
  const c = await S.resoudreCommerce(liste[0].id, {
    surEtape: (t) => etapes.push(t),
    lireSociete: async ({ siren }) => (siren === '123456781' ? { siren, nom: 'SOCIETE 1', forme: 'SARL', gerants: [{ nom: 'Luc BERNARD', nom_famille: 'BERNARD', tranche_age: '70+' }], lu_le: 'x' } : { siren, nom: 'SCI BERNARD', forme: 'SCI', creation: '1995-05-05', siege: { adresse: '9 Rue Haute', ville: 'Mâcon' }, gerants: [{ nom: 'Luc BERNARD', nom_famille: 'BERNARD' }] }),
    proprietaires: async () => ({ proprietaires: [{ nom: 'SCI BERNARD', siren: '999999999', forme: 'SCI', rez_de_chaussee: true, gerants: [] }], parcelle: '71270000AB0001', source: 'Cadastre' }),
    lireEvenements: async () => [],
  });
  assert.equal(c.lien, 'exploitant_certain');
  assert.equal(c.lien_motif, 'même dirigeant : Luc BERNARD');
  assert.deepEqual(c.drapeaux.map((d) => d.cle), ['gerant_age', 'detention_30']);
  assert.equal(c.etat_recherche, 'fait');
  assert.ok(etapes.some((t) => /Propriétaire des murs : SCI BERNARD/.test(t)));
  const f = S.fiche(c);
  assert.equal(f.proprietaire.gerants[0].nom, 'Luc BERNARD');
  assert.equal(f.exploitant.gerants[0].age, '70 ans et plus');
  assert.equal(S.etatDe(ville.id).faits, 1);
  assert.equal(S.commercesDe(ville.id)[0].lien, 'exploitant_certain', 'les exploitants propriétaires d\'abord');
});

test('une adresse précise : BAN, SIRENE au numéro, résolution complète racontée', async () => {
  const etapes = [];
  const r = await S.chercherAdresse('63 rue de la République, Antibes', {
    surEtape: (t) => etapes.push(t),
    geocoder: async () => ({ label: '63 Rue de la République 06600 Antibes', lat: 43.58, lon: 7.12, code_insee: '06004', numero: '63', rue: 'Rue de la République' }),
    lister: async () => [etab(63, { rue: 'Rue de la République', cle_rue: 'rue republique', numero: '63' }), etab(65, { rue: 'Rue de la République', cle_rue: 'rue republique', numero: '65' })],
    resoudre: async (id, { complet, surEtape }) => { assert.ok(complet); surEtape('résolu'); return Records.update(S.COMMERCE, id, { etat_recherche: 'fait', lien: 'inconnu' }); },
  });
  assert.ok(r.ok);
  assert.equal(r.commerces.length, 1, 'seul le numéro 63');
  assert.ok(r.commerces[0].adresse_exacte);
  assert.ok(etapes.some((t) => /1 établissement/.test(t)));
});

test('la réponse d\'un appel corrige le lien et nourrit « Mes appels »', () => {
  const c = Records.filter(S.COMMERCE, { ville_id: ville.id }).find((x) => !x.proprietaire);
  const r = S.noterReponse('klocka', c.id, { choix: 'pas_proprietaire', qui: 'Mme Roux', user: { email: 'j@k' } });
  assert.equal(r.commerce.lien, 'tiers');
  assert.equal(r.commerce.proprietaire_declare.nom, 'Mme Roux');
  const r2 = S.noterReponse('klocka', c.id, { choix: 'proprietaire_ouvert', user: { email: 'j@k' } });
  assert.equal(r2.commerce.lien, 'exploitant_certain');
  assert.equal(r2.commerce.proprietaire.source, 'Déclaré au téléphone');
  const appels = S.listerAppels('klocka');
  assert.equal(appels.length, 2);
  assert.ok(appels.some((a) => a.prochaine?.quoi === 'rappeler pour un rendez-vous') && appels.some((a) => a.prochaine?.quoi === 'joindre Mme Roux'));
  assert.equal(S.listerAppels('autre@x').length, 0, 'propre à l\'espace');
  assert.equal(S.noterReponse('klocka', c.id, { choix: 'nimporte' }).ok, false);
});

test('la casse : adresses, personnes, sociétés et enseignes', async () => {
  const C = await import('./casse.js');
  assert.equal(C.rueLisible('15 RUE DE LA REPUBLIQUE 71000 MACON'), '15 Rue de la Republique');
  assert.equal(C.adresseLisible("12 AV DE L'EUROPE ZI NORD"), "12 Av de l'Europe ZI Nord");
  assert.equal(C.personneLisible('GEOFFROY JEAN-GHISLAIN MOISSE'), 'Geoffroy MOISSE');
  assert.equal(C.personneLisible('LARA MONIQUE COLETTE REY (NOEL)', { nom_famille: 'REY' }), 'Lara REY (NOEL)');
  assert.equal(C.nomLisible('MADAME LARA NOEL'), 'Madame Lara NOEL');
  assert.equal(C.nomLisible('MONSIEUR JEAN PAUL DUPONT'), 'Monsieur Jean DUPONT');
  assert.equal(C.nomLisible('BNP PARIBAS'), 'BNP Paribas');
  assert.equal(C.nomLisible('SCI PLANCHE'), 'SCI Planche');
  assert.equal(C.nomLisible('ORTHOPEDIE GAILLARD', { forme: 'SA' }), 'Orthopedie Gaillard');
  assert.equal(C.societeLisible('PITOA IMMOBILIER'), 'Pitoa Immobilier');
  assert.equal(C.societeLisible("CAISSE D'EPARGNE ET DE PREVOYANCE"), "Caisse d'Epargne et de Prevoyance");
  assert.equal(C.societeLisible('Chocolats Dufoux'), 'Chocolats Dufoux', 'une casse déjà soignée ne bouge pas');
  assert.equal(C.nomLisible('LARA REY (NOEL)', { forme: 'Entrepreneur individuel' }), 'Lara REY (NOEL)');
});

test('vers une liste de la Prospection : créée par son nom, un commerce une seule fois', () => {
  const ids = Records.filter(S.COMMERCE, { ville_id: ville.id }).map((c) => c.id);
  const r = S.envoyerVersListe(ids, { nom: 'Antibes', user: { email: 'j@k' } });
  assert.ok(r.ok);
  assert.equal(r.ajoutes, ids.length);
  const l = Records.get('ListeAgences', r.liste.id);
  assert.equal(l.type, 'commerces');
  assert.equal(l.ville, 'Antibes');
  const lignes = Records.filter('AgenceProspect', { liste_id: l.id });
  assert.equal(lignes.length, ids.length);
  assert.ok(lignes.every((a) => a.commerce_id && a.genre === 'proprietaire'));
  const r2 = S.envoyerVersListe([ids[0]], { nom: 'antibes' });
  assert.equal(r2.liste.id, l.id, 'même nom, même liste');
  assert.equal(r2.ajoutes, 0);
  assert.equal(r2.deja.length, 1);
  assert.equal(S.compact(Records.get(S.COMMERCE, ids[0])).liste.nom, 'Antibes');
  assert.deepEqual(S.listesDeCommerces().map((x) => [x.nom, x.n]), [['Antibes', ids.length]]);
  assert.equal(S.envoyerVersListe(ids, {}).ok, false, 'sans nom ni liste');
});

test('la barre du bas : une phrase devient des filtres', async () => {
  const L = await import('../../src/lib/off-market-simple.js');
  const activites = ['Boulangerie, pâtisserie', 'Coiffure, salon de beauté', 'Restaurant, restauration assise', 'Restauration rapide (snack, sandwicherie)', 'Pharmacie', 'Optique, commerce spécialisé'].map((v) => ({ v, mot: v, n: 1 }));
  let r = L.comprendre('boulangerie propriétaire exploitant', activites);
  assert.deepEqual(r.filtres.activites, ['Boulangerie, pâtisserie']);
  assert.deepEqual(r.filtres.liens, ['exploitant']);
  r = L.comprendre('un coiffeur avec un gérant âgé, en SCI, pas encore dans une liste', activites);
  assert.deepEqual(r.filtres.activites, ['Coiffure, salon de beauté']);
  assert.deepEqual(r.filtres.drapeaux, ['gerant_age']);
  assert.deepEqual(r.filtres.proprietaires, ['sci']);
  assert.equal(r.filtres.liste, 'libres');
  r = L.comprendre('restaurants indépendants installés depuis 25 ans', activites);
  assert.deepEqual(r.filtres.activites, ['Restaurant, restauration assise', 'Restauration rapide (snack, sandwicherie)']);
  assert.equal(r.filtres.chaine, 'independant');
  assert.equal(r.filtres.anciennete, '20');
  assert.equal(L.comprendre('bonjour', activites).compris.length, 0);
  const c = { lien: 'exploitant_probable', activite: 'Pharmacie', drapeaux: ['detention_30'], proprietaire_type: 'sci', depuis: '1990-01-01', chaine: false, liste: null };
  assert.ok(L.passeSimple(c, { ...L.FILTRES_SIMPLE, liens: ['exploitant'], activites: ['Pharmacie'], drapeaux: ['detention_30'], proprietaires: ['sci'], anciennete: '30', chaine: 'independant', liste: 'libres' }));
  assert.ok(!L.passeSimple(c, { ...L.FILTRES_SIMPLE, liens: ['tiers'] }));
  assert.ok(!L.passeSimple({ ...c, liste: { id: 'x', nom: 'Antibes' } }, { ...L.FILTRES_SIMPLE, liste: 'libres' }));
});

test('Google Maps : le rectangle coupé en quatre quand Google plafonne, la fusion avec le registre', async () => {
  const P = await import('./places-ville.js');
  const v = Records.create('Ville', { nom: 'Testville', centre: { lat: 45, lon: 5 } });
  Records.create(S.COMMERCE, { ville_id: v.id, siret: '1', siren: '111111111', nom: 'SARL DUPONT', enseigne: 'AXA DUPONT ASSURANCES', activite: 'Courtier en assurance', adresse: '3 Rue Carnot', lat: 45.0001, lon: 5.0001, etat_recherche: 'fait' });

  const lieu = (id, nom, lat, lon) => ({ id, displayName: { text: nom }, location: { latitude: lat, longitude: lon }, formattedAddress: '3 Rue Carnot, 71000 Testville, France', shortFormattedAddress: '3 Rue Carnot, Testville', nationalPhoneNumber: '03 85 00 00 00', businessStatus: 'OPERATIONAL' });
  const lire = async (url, o) => {

    const corps = JSON.parse(o.body);
    if (corps.textQuery === 'assurance') return { ok: true, json: async () => ({ places: [lieu('g1', 'AXA Assurances Dupont', 45.0002, 5.0002), lieu('g2', 'Allianz Martin', 45.01, 5.01)] }) };
    // « banque » : 20 lieux par page et toujours une page suivante, donc saturé, coupé en quatre.
    if (corps.textQuery === 'banque') return { ok: true, json: async () => ({ places: Array.from({ length: 20 }, (_, i) => lieu(`b${corps.pageToken || 0}-${i}-${corps.locationRestriction.rectangle.low.latitude}`, `Banque ${i}`, 45 + i / 10000, 5)), nextPageToken: String(Number(corps.pageToken || 0) + 1) }) };
    return { ok: true, json: async () => ({ places: [] }) };
  };
  const r = await P.balayerVille(v.id, { lire, cle: 'x', categories: [['assurance', 'Courtier en assurance'], ['banque', 'Banque']] });
  assert.ok(r.ok);
  assert.equal(r.enrichis, 1, 'AXA Dupont rapproché du registre');
  const axa = Records.filter(S.COMMERCE, { ville_id: v.id }).find((c) => c.siren === '111111111');
  assert.equal(axa.place_id, 'g1');
  assert.equal(axa.telephone, '03 85 00 00 00');
  const allianz = Records.filter(S.COMMERCE, { ville_id: v.id }).find((c) => c.place_id === 'g2');
  assert.equal(allianz.source, 'Google Maps');
  assert.equal(allianz.activite, 'Courtier en assurance');
  assert.equal(allianz.adresse, '3 Rue Carnot');
  assert.ok(r.recherches > 2, 'la banque saturée a été recoupée');
  assert.equal(Records.get('Ville', v.id).simple.google.etat, 'fini');
  const L = await import('../../src/lib/off-market-simple.js');
  const q = L.comprendre('agences immobilières rue de la République', [{ v: 'Agence immobilière', mot: 'Agence immobilière', n: 3 }]);
  assert.equal(q.filtres.rue, 'rue de la republique');
  assert.deepEqual(q.filtres.activites, ['Agence immobilière']);
  assert.ok(L.passeSimple({ lien: null, activite: 'Agence immobilière', drapeaux: [], adresse: '63 Rue de la Republique', liste: null }, q.filtres));
  assert.ok(!L.passeSimple({ lien: null, activite: 'Agence immobilière', drapeaux: [], adresse: '2 Place Carnot', liste: null }, q.filtres));
});

test('le centre-ville : la densité de commerces, les rues classées, pas les chemins ni les zones', () => {
  const v = Records.create('Ville', { nom: 'Densiville', centre: { lat: 46, lon: 4.8 }, rues: [{ nom: 'Rue Isolée', classe: 1 }] });
  const mk = (i, lat, lon, adresse) => Records.create(S.COMMERCE, { ville_id: v.id, siret: `d${i}`, nom: `C${i}`, activite: 'Supérette', adresse, lat, lon, etat_recherche: 'fait' });
  for (let i = 0; i < 30; i += 1) mk(i, 46 + (i % 6) * 0.0002, 4.8 + Math.floor(i / 6) * 0.0002, `${i} Rue Carnot`);
  mk(100, 46.02, 4.82, '12 Chemin des Vignes');
  mk(101, 46.03, 4.83, '3 Rue Isolée');
  const l = S.commercesDe(v.id);
  assert.equal(l.filter((c) => c.centre).length, 31, 'les 30 de la rue Carnot et la rue classée');
  assert.equal(l.find((c) => c.adresse.includes('Chemin')).centre, false);
  assert.equal(l.find((c) => c.adresse.includes('Isol')).centre, true, 'rue classée emplacement 1');
});

test('les zones commerçantes : une question au modèle, les rues placées, le centre suit les zones', async () => {
  const Z = await import('./zones.js');
  const v = Records.create('Ville', { nom: 'Zoneville', code_postal: '06600', code_insee: '06004', centre: { lat: 43.58, lon: 7.12 } });
  let question = null;
  const invoquer = async ({ prompt }) => { question = prompt; return { zones: [{ nom: 'Centre', genre: 'hyper-centre', rues: ['Rue de la République', 'Rue Inventée', 'Rue Lointaine'], pourquoi: 'piéton' }] }; };
  const geocoder = async (t) => (t.startsWith('Rue de la République') ? { lat: 43.5805, lon: 7.1205, code_insee: '06004' } : t.startsWith('Rue Lointaine') ? { lat: 44.5, lon: 7.12, code_insee: '06004' } : null);
  const r = await Z.zonesDeLaVille(v.id, { invoquer, geocoder });
  assert.match(question, /Zoneville \(06600\)/);
  assert.equal(r.zones.length, 1);
  assert.deepEqual(r.zones[0].rues, ['Rue de la République'], 'la rue introuvable et la rue à 100 km sont écartées');
  assert.ok((await Z.zonesDeLaVille(v.id, { invoquer: async () => { throw new Error('pas deux fois'); }, geocoder })).deja);
  Records.create(S.COMMERCE, { ville_id: v.id, siret: 'z1', nom: 'Près', adresse: '1 Rue de la République', lat: 43.5806, lon: 7.1206, etat_recherche: 'fait' });
  Records.create(S.COMMERCE, { ville_id: v.id, siret: 'z2', nom: 'Loin', adresse: '9 Chemin des Pins', lat: 43.59, lon: 7.13, etat_recherche: 'fait' });
  const l = S.commercesDe(v.id);
  assert.equal(l.find((c) => c.nom === 'Près').zone, 'Centre');
  assert.equal(l.find((c) => c.nom === 'Près').centre, true);
  assert.equal(l.find((c) => c.nom === 'Loin').centre, false);
  assert.ok(Z.rectangleDeZone(r.zones[0]).bas.lat < 43.5805);
});

test('Google Maps moins cher : des zones qui se chevauchent ne font qu\'un rectangle', async () => {
  const P = await import('./places-ville.js');
  const a = { bas: { lat: 43.0, lon: 7.0 }, haut: { lat: 43.01, lon: 7.01 } };
  const b = { bas: { lat: 43.005, lon: 7.005 }, haut: { lat: 43.02, lon: 7.02 } };
  const c = { bas: { lat: 44.0, lon: 7.0 }, haut: { lat: 44.01, lon: 7.01 } };
  const f = P.fusionnerRectangles([a, b, c]);
  assert.equal(f.length, 2);
  assert.deepEqual(f[0], { bas: { lat: 43.0, lon: 7.0 }, haut: { lat: 43.02, lon: 7.02 } });
  assert.equal(P.CATEGORIES.length, 20);
});

test('un commerce précis : connu, sinon Google Maps, épinglé et lu', async () => {
  const v = Records.create('Ville', { nom: 'Nomville', code_postal: '06600', centre: { lat: 43.58, lon: 7.12 } });
  Records.create(S.COMMERCE, { ville_id: v.id, siret: 'n1', nom: 'SARL UJA', enseigne: 'UJA', adresse: '5 Rue Thuret', lat: 43.58, lon: 7.12, etat_recherche: 'fait' });
  const r1 = await S.trouverCommerce(v.id, 'uja');
  assert.equal(r1.commerces.length, 1);
  assert.equal(S.compact(Records.filter(S.COMMERCE, { ville_id: v.id })[0], { centre: new Set() }).centre, true, 'épinglé : visible hors des zones');
  process.env.GOOGLE_MAPS_SERVEUR = 'x';
  const lire = async () => ({ ok: true, json: async () => ({ places: [{ id: 'p9', displayName: { text: 'Chez Lulu' }, formattedAddress: '12 Rue Sade, 06600 Antibes, France', shortFormattedAddress: '12 Rue Sade, Antibes', location: { latitude: 43.581, longitude: 7.121 }, businessStatus: 'OPERATIONAL' }] }) });
  const r2 = await S.trouverCommerce(v.id, 'Chez Lulu', { lire, resoudre: async (id) => Records.update(S.COMMERCE, id, { etat_recherche: 'fait' }) });
  delete process.env.GOOGLE_MAPS_SERVEUR;
  assert.equal(r2.commerces[0].enseigne, 'Chez Lulu');
  assert.equal(Records.list(S.COMMERCE).find((c) => c.place_id === 'p9').epingle, true);
});

test('le prix des murs : surface × loyer de marché ÷ taux, en fourchette ; sans loyer, pas de prix', async () => {
  const c = Records.create(S.COMMERCE, { ville_id: 'x', siret: 'p1', nom: 'Boulangerie', activite: 'Boulangerie, pâtisserie', adresse: '5 Rue Carnot', code_postal: '71000', ville: 'Mâcon', lat: 46.3, lon: 4.83, etat_recherche: 'fait' });
  const batiment = async () => ({ surface_estimee: [60, 80], emprise_m2: 200, commerces_dans_le_batiment: 2 });
  const loyer = async () => ({ ok: true, resultat: { rue: { nom: 'Rue Carnot', basse: 150, haute: 250 }, source: 'Data-B' } });
  const rendement = async () => ({ taux: 7.5, source: 'barème' });
  const r = await S.estimerPrix(c.id, { batiment, loyer, rendement });
  assert.deepEqual(r.commerce.estimation.prix, { basse: 120000, moyenne: 187000, haute: 267000 });
  assert.deepEqual(r.commerce.estimation.loyer_an, { basse: 9000, haute: 20000 });
  const r2 = await S.estimerPrix(c.id, { surface: 100, batiment, loyer, rendement });
  assert.equal(r2.commerce.estimation.surface_source, 'saisie');
  assert.deepEqual(r2.commerce.estimation.prix, { basse: 200000, moyenne: 267000, haute: 333000 });
  const r3 = await S.estimerPrix(c.id, { batiment, loyer: async () => ({ ok: false, error: 'non' }), rendement });
  assert.equal(r3.commerce.estimation.prix, null);
  assert.equal(r3.commerce.estimation.surface_saisie, 100, 'la surface saisie est gardée');
});

test('Data-B, occupants : la SCI qui loue quand personne n\'est publié, les commerces de la parcelle ajoutés', async () => {
  const O = await import('./occupants.js');
  const html = `<div class="foncierOccupantsResult" data-count="2"><div class="foncierCard check_save" entreprise_id="84925149100031"><header><h1 class="company-title company_data" siren="849251491"> CAFE MILO </h1></header><div class="row"><div class="k">Adresse</div><div class="v">26 Rue Georges Clémenceau 06600 Antibes</div></div><div class="row"><div class="k">Activité</div><div class="v">Restauration traditionnelle</div></div><div class="person foncierPerson check_save"><div class="p-title"><span class="company_mapping text-underline" key="x">Yann Elbaz</span><span class="muted"> - 40 ans</span></div><div class="p-meta">Président de SAS</div></div></div><div class="foncierCard check_save" entreprise_id="12345678900011"><h1 class="company-title" siren="123456789">SCI DU PORT</h1><div class="row"><div class="k">Activité</div><div class="v">Location de terrains et d'autres biens immobiliers</div></div></div><div class="foncierCard check_save" entreprise_id="11122233300011"><h1 class="company-title" siren="111222333">AS TENNIS</h1><div class="row"><div class="k">Activité</div><div class="v">Activités de clubs de sports</div></div></div></div>`;
  const occ = O.lireOccupants(html);
  assert.equal(occ.length, 3);
  assert.equal(occ[0].gerants[0].age, 40);
  assert.ok(O.estCommerceOccupant(occ[0]) && !O.estCommerceOccupant(occ[1]) && !O.estCommerceOccupant(occ[2]));
  assert.ok(O.estBailleurDesMurs(occ[1]) && !O.estBailleurDesMurs({ nom: 'X AB', activite: 'Location de logements' }));
  const v = Records.create('Ville', { nom: 'Occuville', centre: { lat: 43.58, lon: 7.12 } });
  const c = Records.create(S.COMMERCE, { ville_id: v.id, siret: '99999999900011', siren: '999999999', nom: 'L HERMES', enseigne: 'L HERMES', activite: 'Restauration rapide', adresse: '26 Rue Georges Clémenceau', lat: 43.5816, lon: 7.1265, etat_recherche: 'a_faire' });
  const r = await S.resoudreCommerce(c.id, {
    complet: true,
    lireSociete: async () => null,
    proprietaires: async () => ({ proprietaires: [], parcelle: '06004000BN0241', source: 'Data-B' }),
    lireEvenements: async () => [],
    dirigeant: async () => [],
    lireOccupants: async () => ({ parcelle: '06004000BN0241', lat: 43.5817, lon: 7.1265, occupants: occ }),
  });
  assert.equal(r.proprietaire.nom, 'SCI DU PORT');
  assert.match(r.proprietaire.source, /occupant qui loue/);
  assert.equal(r.lien, 'tiers');
  const ajoute = Records.filter(S.COMMERCE, { ville_id: v.id }).find((x) => x.siret === '84925149100031');
  assert.equal(ajoute.source, 'Data-B occupants');
  assert.ok(!Records.filter(S.COMMERCE, { ville_id: v.id }).some((x) => x.siren === '111222333'), 'le club de sport n\'est pas un commerce');
});

test('Google Maps : la franchise (Carrefour City tenu par GORYLO), et les rattachements de travers défaits', async () => {
  const P = await import('./places-ville.js');
  const gorylo = { nom: 'GORYLO', enseigne: 'GORYLO', activite: 'Supérette, supermarché', lat: 43.58097, lon: 7.12424 };
  const lieu = { nom: 'Carrefour City', lat: 43.580966, lon: 7.1242368, activite: 'Supérette, supermarché' };
  assert.ok(!P.memeVitrine(lieu, gorylo));
  assert.ok(P.memeFranchise(lieu, gorylo));
  assert.ok(!P.memeFranchise({ ...lieu, activite: 'Restaurant, restauration assise' }, gorylo), 'pas la même famille');
  assert.ok(!P.memeVitrine({ nom: 'Carrefour Drive Piéton', lat: 43.58, lon: 7.125 }, { nom: 'MANUEL ALVES CARREIRA', enseigne: 'MAX ESTEIN 1961', lat: 43.58, lon: 7.125 }), 'Carrefour ne ressemble pas à Carreira');
  const v = Records.create('Ville', { nom: 'Reparville', centre: { lat: 43.58, lon: 7.12 } });
  const mauvais = Records.create(S.COMMERCE, { ville_id: v.id, siret: 'r1', nom: 'MANUEL ALVES CARREIRA', enseigne: 'MAX ESTEIN 1961', nom_google: 'Carrefour Drive Piéton', place_id: 'g', telephone: '01', contact_source: 'Google Maps', lat: 43.58, lon: 7.125 });
  const bon = Records.create(S.COMMERCE, { ville_id: v.id, siret: 'r2', nom: 'GREZALI', enseigne: 'CARREFOUR CITY', nom_google: 'Carrefour City', place_id: 'h', lat: 43.58, lon: 7.12 });
  assert.equal(P.reparerRattachements(v.id), 1);
  assert.equal(Records.get(S.COMMERCE, mauvais.id).nom_google, null);
  assert.equal(Records.get(S.COMMERCE, mauvais.id).telephone, null);
  assert.equal(Records.get(S.COMMERCE, bon.id).nom_google, 'Carrefour City');
});

test('le prix : loyer et taux gardés par rue, le fond estime les commerces des zones', async () => {
  const v = Records.create('Ville', { nom: 'Prixville', code_postal: '71000', centre: { lat: 46.3, lon: 4.83 }, simple: { zones: [{ nom: 'Centre', points: [{ lat: 46.3, lon: 4.83 }], marge_m: 300 }] } });
  const a = Records.create(S.COMMERCE, { ville_id: v.id, siret: 'q1', nom: 'A', activite: 'Pharmacie', adresse: '1 Rue Carnot', code_postal: '71000', lat: 46.3, lon: 4.83, etat_recherche: 'fait', estimation: null });
  const b = Records.create(S.COMMERCE, { ville_id: v.id, siret: 'q2', nom: 'B', activite: 'Pharmacie', adresse: '9 Rue Carnot', code_postal: '71000', lat: 46.3001, lon: 4.8301, etat_recherche: 'fait' });
  Records.create(S.PRIX_RUE, { cle: 'rue carnot|71000', loyer_m2: { basse: 100, haute: 200, niveau: 'rue' }, taux: 8, taux_source: 'Data-B', le: new Date().toISOString() });
  const r = await S.estimerPrix(a.id, { surface: 50 });
  assert.deepEqual(r.commerce.estimation.prix, { basse: 71000, moyenne: 107000, haute: 143000 }, 'la rue déjà lue sert sans rappeler Data-B, taux du barème 7 %');
  assert.equal(r.commerce.estimation.taux, 7);
  const vus = [];
  const reste = await S.tourPrix(v.id, { estimer: async (id) => { vus.push(id); return Records.update(S.COMMERCE, id, { estimation: { prix: null } }); } });
  assert.deepEqual(vus, [b.id], 'le seul commerce de zone sans prix');
  assert.equal(reste, 0);
});

test('le barème des taux et la surface DVF de la parcelle', async () => {
  assert.equal(S.tauxDesMurs({ nom: 'Paris', code_insee: '75101' }).taux, 6);
  assert.equal(S.tauxDesMurs({ nom: 'Lyon' }).taux, 6.5);
  assert.equal(S.tauxDesMurs({ nom: 'Antibes' }).taux, 7);
  assert.equal(S.tauxDesMurs({ nom: 'Mâcon' }).taux, 7);
  assert.equal(S.tauxDesMurs({ nom: 'Antibes' }, { dansZone: false }).taux, 7.5);
  const c = Records.create(S.COMMERCE, { ville_id: 'y', siret: 'dv1', nom: 'X', activite: 'Bar', adresse: '2 Rue Thuret', code_postal: '06600', lat: 43.58, lon: 7.12, etat_recherche: 'fait', foncier: { parcelle: '06004000BN0241' } });
  const dvf = async (insee, parcelle) => { assert.equal(insee, '06004'); assert.equal(parcelle, '06004000BN0241'); return [{ date: '2019-05-02', lots: 1, surface_commerciale: 85 }]; };
  const r = await S.estimerPrix(c.id, { dvf, batiment: async () => { throw new Error('pas besoin'); }, loyer: async () => ({ ok: true, resultat: { rue: { basse: 300, haute: 500 } } }) });
  assert.deepEqual(r.commerce.estimation.surface, [85, 85]);
  assert.match(r.commerce.estimation.surface_source, /DVF/);
});

test('une surface invraisemblable (5 m²) est écartée ; l\'emprise du bâtiment prend le relais', async () => {
  const c = Records.create(S.COMMERCE, { ville_id: 'z', siret: 'sv1', nom: 'Petit', activite: 'Bar', adresse: '3 Rue Thuret', code_postal: '06600', lat: 43.5, lon: 7.1, etat_recherche: 'fait', foncier: { parcelle: '06004000BN0300', surface_batiment: 52 } });
  const etapes = [];
  const r = await S.estimerPrix(c.id, {
    surEtape: (t) => etapes.push(t),
    dvf: async () => [{ date: '2020-01-01', lots: 1, surface_commerciale: 5 }],
    batiment: async () => ({ surface_estimee: [4, 6], emprise_m2: 52, commerces_dans_le_batiment: 1 }),
    loyer: async () => ({ ok: true, resultat: { rue: { basse: 300, haute: 500 } } }),
  });
  assert.deepEqual(r.commerce.estimation.surface, [42, 52], 'l\'emprise au sol, pas 5 m²');
  assert.match(r.commerce.estimation.surface_source, /emprise du bâtiment : 52 m²/);
  assert.ok(etapes.some((t) => /trop petit pour un local commercial/.test(t)));
  const c2 = Records.create(S.COMMERCE, { ville_id: 'z', siret: 'sv2', nom: 'Rien', activite: 'Bar', adresse: '5 Rue Thuret', lat: 43.6, lon: 7.2, etat_recherche: 'fait' });
  const r2 = await S.estimerPrix(c2.id, { batiment: async () => ({ surface_estimee: [3, 5], emprise_m2: 8, commerces_dans_le_batiment: 1 }), loyer: async () => ({ ok: true, resultat: { rue: { basse: 300, haute: 500 } } }) });
  assert.equal(r2.commerce.estimation.prix, null, 'mieux vaut pas de prix qu\'un prix faux');
});
