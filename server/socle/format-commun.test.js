// Le contrat commun : chaque outil, lu depuis la forme que son code rend.

import test from 'node:test';
import assert from 'node:assert/strict';
import { resultatCommun, confianceDe, ADAPTATEURS, versFormatCommun, OUTILS, CONFIANCES } from './format-commun.js';

const IL_Y_A = (jours) => new Date(Date.now() - jours * 86400000).toISOString();
const ENTREE = { adresse: '12 Rue de France 06000 Nice', id_local: null, parametres: {} };

function conforme(r, outil) {
  assert.equal(r.outil, outil);
  assert.notEqual(r.valeur, undefined);
  assert.ok(CONFIANCES.includes(r.confiance), `confiance ${r.confiance}`);
  assert.ok(Array.isArray(r.sources));
  for (const s of r.sources) {
    assert.equal(typeof s.cle, 'string');
    assert.ok('millesime' in s && 'le' in s);
  }
  assert.ok(r.detail !== undefined && r.detail !== null && typeof r.detail === 'object');
  assert.equal(new Date(r.date).toISOString(), r.date);
  assert.equal(typeof r.perime, 'boolean');
  assert.deepEqual(resultatCommun(r), { ...r, perime: r.perime });
}

// --- Des bruts copiés des formes que les outils rendent ---------------------------

const BRUTS = {
  // routes/kzoning.js : lecture (insee + équipements) fusionnée avec les commerces.
  kzoning: {
    insee: { carreaux: 12, carreaux_estimes: 0, communes: ['Nice'], population: { habitants: 4200, densite_km2: 8750 }, menages: { menages: 2300 }, revenus: { niveau_de_vie_moyen: 24100 } },
    insee_garde_le: IL_Y_A(2),
    equipements: { commerces: 3, vacants: 1, restauration: 2, metro: false, tram: true, gare: false, ecoles: [] },
    equipements_garde_le: IL_Y_A(2),
    commerces: [
      { id: 'node/1', nom: 'Boulangerie Paul', genre: 'bakery', vacant: false, lat: 43.7, lon: 7.26, adresse: '10 Rue de France', distance_m: 20, siret: '12345678900011', metier: 'Boulangerie' },
      { id: 'node/2', nom: null, genre: 'vacant', vacant: true, lat: 43.7, lon: 7.26, adresse: null, distance_m: 45 },
    ],
    garde_le: IL_Y_A(1),
    metiers: ['Boulangerie'],
  },
  // kexpertise.js : l'enregistrement ExpertiseKData, étude interne comprise.
  kexpertise: {
    id: 'e1', adresse: '12 rue de France Nice', etat: 'terminee', cree_le: IL_Y_A(3), fini_le: IL_Y_A(3),
    resultat: {
      sources: ['Base Adresse Nationale', 'Sirene', 'OpenStreetMap', 'IGN', 'INSEE Filosofi', 'INSEE recensement'],
      point: { lat: 43.7, lon: 7.26, libelle: '12 Rue de France 06000 Nice', precis: true },
      etude: {
        source: 'Klocka · sources ouvertes',
        sources: ['Base Adresse Nationale', 'Sirene', 'OpenStreetMap', 'IGN', 'INSEE Filosofi', 'INSEE recensement'],
        le: IL_Y_A(3), manques: [],
        flux_pieton: { note: { note: 4, sur: 5 }, estime: true, indisponible: false },
        flux_voiture: { note: { note: 3, sur: 5 }, estime: true, indisponible: false },
      },
      generateurs: [{ famille: 'Transport', genre: 'Tramway', nom: 'Masséna', distance_m: 120, rang: 1, bande: 'Plus de 100 mètres' }],
      zones: [
        { cle: 'primaire', nom: 'Zone primaire', rayon_m: 400, insee: { population: { habitants: 5100 } }, erreur: null },
        { cle: 'secondaire', nom: 'Zone secondaire', rayon_m: 800, insee: { population: { habitants: 16000 } }, erreur: null },
        { cle: 'tertiaire', nom: 'Zone tertiaire', rayon_m: 1200, insee: { population: { habitants: 32000 } }, erreur: null },
      ],
    },
  },
  // kestimation.js : l'enregistrement EstimationMurs (marche + resultat de calculerEstimation).
  kestimation: {
    id: 'm1', etat: 'terminee',
    marche: { sources: ['DVF', 'OpenStreetMap', 'INSEE Filosofi', 'DVF, loyer déduit'], dvf: { n: 6, mois: 36, prix_m2_pondere: 4100, bas: 3500, median: 4000, haut: 4800, ventes: [{ date: '2025-03-01', prix: 300000, surface: 70, prix_m2: 4286, adresse: '8 Rue de France', distance_m: 90 }] } },
    resultat: {
      ok: true, statut: 'loue', loyer_annuel: 24000,
      methodes: {
        capitalisation: { basse: 300000, moyenne: 320000, haute: 345000 },
        dvf: { n: 6, basse: 280000, moyenne: 310000, haute: 350000, ventes: [] },
      },
      poids: { capitalisation: 0.67, dvf: 0.33 },
      valeurs: { basse: 293000, moyenne: 317000, haute: 347000 },
      prix_m2: 4529,
      calcule_le: IL_Y_A(5),
    },
  },
  // kprospective.js : l'enregistrement Prospection.
  kprospective: {
    id: 'p1', etat: 'terminee', cree_le: IL_Y_A(1), fini_le: IL_Y_A(1),
    commerces: [
      { id: 'node/1', nom: 'Pharmacie du Port', genre: 'chemist', societe: { siren: '123456789', nom: 'PHARMACIE DU PORT' }, rue_nb_commerces: 14 },
      { id: 'node/2', nom: 'Le Bistrot', genre: 'restaurant', societe: null },
    ],
    retenus: ['node/1'], nb_commerces: 2, nb_retenus: 1,
  },
  // kvacance.js : le retour d'analyser().
  kvacance: {
    ok: true, point: { lat: 43.7, lon: 7.26 }, rayon: 400,
    verdict: { niveau: 'moyenne', phrase: 'Vacance dans la moyenne.', appuis: [], reserves: [], face_ville: null },
    visible: { zone: { total: 48, vides: 3, taux: 6.3 }, commune: { total: 900, vides: 60, taux: 6.7 } },
    registre: { zone: { adresses: 35, vides: 4, taux: 11.4, lignes: [] }, garde_le: IL_Y_A(4) },
    rythme: { zone: { actifs: 40, fermees_12_mois: 3 } },
    source_registre: 'insee',
    vacance: { total: 48, vides: 3, taux: 6.3, rues: [] },
    locaux_vides: [{ lat: 43.7, lon: 7.26, adresse: '3 Rue de France', genre: 'vacant' }],
    fermetures: [], erreurs: [],
  },
  // kfoncier.js : le retour d'analyser().
  kfoncier: {
    ok: true, point: { lat: 43.7, lon: 7.26, label: '12 Rue de France 06000 Nice', code_insee: '06088' },
    annee: 2024, erreurs: [],
    parcelles: [
      { idu: '06088000KZ0014', code_insee: '06088', section: 'KZ', numero: '0014', contenance: 412, geometry: { type: 'Polygon', coordinates: [] }, proprietaires: [{ siren: '789129590', nom: 'EDEN', lots: [{}] }] },
      { idu: '06088000KZ0015', code_insee: '06088', section: 'KZ', numero: '0015', contenance: 220, geometry: null, proprietaires: [] },
    ],
    total: 2, avec_proprietaires: 1,
  },
  // valeur-locative.js : le resultat de valeurLocative(), valeur retenue Equimmox.
  valeur_locative: {
    source: 'Equimmox · Analyse de loyer', unite: '€ HT HC / m² / an', adresse: '12 Rue de France 06000 Nice',
    rue: { nom: 'Rue de France', basse: 280, moyenne: 320, haute: 360, rayon: '200 m', source: 'Equimmox', du_cache: false },
    quartier: null, ville: null, dvf: null, data_b: null, constate: true,
    comparables: {
      niveau: null, libelle: null,
      comparables: [{ source: 'equimmox', poids: 1, loyer_m2: 320, niveau: 'rue', titre: 'Equimmox, baux à 200 m', le: IL_Y_A(2) }],
      fourchette: { bas: 320, central: 320, haut: 320 },
      klocka: { n: 0, fourchette: null, age_median_ans: null, dispersion: null },
      confiance: 'faible', affichee: 'equimmox',
      valeur: { bas: 280, central: 320, haut: 360 }, controle: null,
    },
    valeur: { bas: 280, central: 320, haut: 360, source: 'equimmox', niveau: null, confiance: 'faible' },
    erreurs: [], le: IL_Y_A(2), par: null,
  },
  // ktransactions.js : le retour d'analyser(), murs DVF et fonds BODACC.
  ktransactions: {
    ok: true, point: { lat: 43.7, lon: 7.26 }, annees: 5, rayon: 500,
    murs: { source: 'DVF · Demandes de valeurs foncières', unite: '€ / m²', annees: [2021, 2022, 2023, 2024, 2025], prix_m2: { bas: 3500, median: 4100, haut: 4900 }, n: 9, n_minimum: 5, ventes: [{ date: '2024-05-01', prix_m2: 4100 }], le: IL_Y_A(1) },
    murs_erreur: null, locaux: 120,
    rotation: { ventes: 9, annees: 5, locaux: 120, ventes_par_an: 1.8, part_annuelle: 1.5, periode_ans: 66.7 },
    tension_rue: { rue: 'rue de france', n_rue: 2, rues_comptees: 80, mediane_par_rue: 1, haut_par_rue: 2, rang: 85 },
    fonds: { n: 40, n_avec_prix: 22, prix: { median: 120000, bas: 60000, haut: 210000, min: 10000, max: 900000 }, rue: 'rue de france', comparables_rue: [], prix_rue: null },
    fonds_erreur: null,
    cessions: [{ id: 'b1', date: '2025-01-10', prix: 90000, activite: 'boulangerie', rue: 'rue de france' }],
    du_cache: false,
  },
  // outils/vacance.js : le retour de rechercher(), un FeatureCollection.
  signaux_vacance: {
    ok: true, statut: 200, type: 'FeatureCollection', total: 1, tronque: false, repartition: { liquidation: 1, fermeture: 1 },
    zone: { code_commune: '06088', nom: 'Nice', code_postal: '06000', chargee_le: IL_Y_A(1), etat: 'prete', erreur: null },
    features: [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [7.26, 43.7] },
      properties: {
        cle: '1', siret: '1', siren: '123456789', denomination: 'SARL EXEMPLE', adresse: '5 Rue de France', categorie_bien: 'commerce', distance_m: 80,
        signal_principal: { type: 'liquidation', date: '2026-09-01' },
        signaux: [{ type: 'liquidation', date: '2026-09-01', source: 'bodacc' }, { type: 'fermeture', date: '2026-05-01', source: 'sirene' }],
      },
    }],
    parametres: {},
  },
};

for (const outil of OUTILS) {
  test(`${outil} : le brut de l'outil passe au format commun`, () => {
    const r = ADAPTATEURS[outil](BRUTS[outil], ENTREE);
    conforme(r, outil);
    assert.equal(r.entree.adresse, ENTREE.adresse);
    assert.ok(r.sources.length > 0, 'au moins une source');
    assert.notEqual(r.valeur, null);
  });

  test(`${outil} : un brut vide ne casse pas et ne rend rien d'inventé`, () => {
    const r = versFormatCommun(outil, {}, ENTREE);
    conforme(r, outil);
    assert.equal(r.fourchette, null);
    assert.equal(r.confiance, 'faible');
  });
}

test('les neuf outils ont leur adaptateur', () => {
  assert.deepEqual(Object.keys(ADAPTATEURS).sort(), [...OUTILS].sort());
});

test('valeur locative : une valeur Equimmox donne la fourchette depuis `valeur`', () => {
  const r = versFormatCommun('valeur_locative', BRUTS.valeur_locative, ENTREE);
  assert.deepEqual(r.fourchette, { bas: 280, central: 320, haut: 360 });
  assert.equal(r.valeur, 320);
  assert.equal(r.unite, '€ HT HC / m² / an');
  assert.equal(r.confiance, 'faible');
  assert.equal(r.detail.source_retenue, 'equimmox');
  assert.ok(r.sources.some((s) => s.cle === 'equimmox'));
});

test('valeur locative : l\'enregistrement ValeurLocativeRecherche se lit comme son resultat', () => {
  const r = versFormatCommun('valeur_locative', { id: 'v1', resultat: BRUTS.valeur_locative, le: IL_Y_A(2) }, ENTREE);
  assert.deepEqual(r.fourchette, { bas: 280, central: 320, haut: 360 });
});

test('estimation : la fourchette vient des valeurs basse, moyenne, haute', () => {
  const r = versFormatCommun('kestimation', BRUTS.kestimation, ENTREE);
  assert.deepEqual(r.fourchette, { bas: 293000, central: 317000, haut: 347000 });
  assert.equal(r.valeur, 317000);
  assert.equal(r.confiance, 'moyenne');
  assert.ok(r.sources.some((s) => s.cle === 'dvf'));
});

test('K-Foncier : le millésime MAJIC suit la source', () => {
  const r = versFormatCommun('kfoncier', BRUTS.kfoncier, ENTREE);
  assert.equal(r.sources.find((s) => s.cle === 'majic').millesime, '2024');
  assert.ok(r.detail.every((p) => !('geometry' in p)));
});

test('perime : une date de plus de trente jours est périmée, une récente non', () => {
  assert.equal(resultatCommun({ outil: 'kfoncier', valeur: 1, confiance: 'haute', date: IL_Y_A(31) }).perime, true);
  assert.equal(resultatCommun({ outil: 'kfoncier', valeur: 1, confiance: 'haute', date: IL_Y_A(29) }).perime, false);
});

test('resultatCommun remplit les défauts', () => {
  const r = resultatCommun({ outil: 'kzoning' });
  assert.equal(r.valeur, null);
  assert.equal(r.fourchette, null);
  assert.equal(r.confiance, 'faible');
  assert.deepEqual(r.sources, []);
  assert.deepEqual(r.detail, {});
  assert.deepEqual(r.entree, { adresse: null, id_local: null, parametres: {} });
  assert.equal(r.perime, false);
});

test('un outil inconnu, une confiance invalide ou une date illisible lèvent une erreur claire', () => {
  assert.throws(() => resultatCommun({ outil: 'kmagie', confiance: 'haute' }), /outil inconnu « kmagie »/);
  assert.throws(() => versFormatCommun('kmagie', {}), /outil inconnu/);
  assert.throws(() => resultatCommun({ outil: 'kzoning', confiance: 'certaine' }), /confiance invalide/);
  assert.throws(() => resultatCommun({ outil: 'kzoning', date: 'hier' }), /date illisible/);
});

test('confianceDe : seuils de nombre et perte d\'un cran à l\'âge', () => {
  assert.equal(confianceDe({ n: 12, min_haute: 10, min_moyenne: 3 }), 'haute');
  assert.equal(confianceDe({ n: 5, min_haute: 10, min_moyenne: 3 }), 'moyenne');
  assert.equal(confianceDe({ n: 2, min_haute: 10, min_moyenne: 3 }), 'faible');
  assert.equal(confianceDe({ n: 0, min_haute: 1, min_moyenne: 0 }), 'faible');
  assert.equal(confianceDe({ n: 12, min_haute: 10, min_moyenne: 3, age_jours: 40, age_max_jours: 30 }), 'moyenne');
  assert.equal(confianceDe({ n: 5, min_haute: 10, min_moyenne: 3, age_jours: 40, age_max_jours: 30 }), 'faible');
  assert.equal(confianceDe({ n: 12, min_haute: 10, min_moyenne: 3, age_jours: 10, age_max_jours: 30 }), 'haute');
});
