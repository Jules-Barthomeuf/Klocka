// Le comportement demandé, vu de bout en bout : Equimmox tombe, la lecture
// continue. Les connecteurs sont des doublures — aucun réseau, aucun
// navigateur, aucune base — mais ils rendent exactement la forme que les
// vrais rendent, et échouent avec les messages que les vrais écrivent.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { collecter, BESOINS_DEFAUT } from './chaine.js';
import { ErreurSource } from './erreurs.js';

// Les connecteurs tirent les scrapers, qui ouvrent la base au chargement. On
// la déroute vers un dossier jetable AVANT de les importer : un test ne touche
// pas aux données de travail. D'où l'import dynamique, seul moyen de poser la
// variable d'environnement avant l'évaluation du module.
process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-test-'));
const vraiEquimmox = (await import('./connecteurs/equimmox.js')).default;
const vraiDataB = (await import('./connecteurs/valeur-locative.js')).default;
const vraiTransactions = (await import('./connecteurs/bodacc-cessions.js')).default;
const vraiFigaro = (await import('./connecteurs/figaro.js')).default;
const vraiImplantation = (await import('./connecteurs/implantation.js')).default;
const vraiDvf = (await import('./connecteurs/dvf.js')).default;
const vraiBodacc = (await import('./connecteurs/bodacc.js')).default;

const sansAttente = { patienter: async () => {} };

// Les vrais résultats bruts, réduits à ce que la normalisation lit.
const EQUIMMOX_OK = {
  source: 'Equimmox · Analyse de loyer', bas: 150, moyenne: 180, haut: 220,
  rayon: '500m', classe: 'Commerce', surface_min: 70, surface_max: 130,
  le: '2026-09-11T08:00:00.000Z',
};
const DATAB_OK = {
  source: 'Equimmox · Analyse de loyer',
  rue: { nom: 'Rue Gazan', basse: 140, haute: 200 },
  quartier: { nom: 'Centre', basse: 120, haute: 210 },
  ville: { nom: 'Grasse', basse: 100, haute: 240 },
  lien: 'https://valeurlocative.data-b.com/search?x=1',
  le: '2026-09-11T08:01:00.000Z',
};
const FIGARO_OK = {
  source: 'Le Figaro Immobilier',
  quartier: { nom: 'Centre', prix: { median: 3200, bas: 2400, haut: 4100, sur_1_an: 2.1, sur_5_ans: 11.4 }, loyer: { median: 14 }, lien: 'https://x' },
  commune: { nom: 'Grasse', prix: { median: 3000 }, loyer: { median: 13 } },
  le: '2026-09-11T08:02:00.000Z',
};
const TRANSACTIONS_OK = {
  source: 'Data-B · Transactions de fonds de commerce',
  rayon: '500 m',
  marche: { prix_bas: 30000, prix_median: 85000, prix_haut: 210000, avec_prix: 12 },
  rue: null,
  le: '2026-09-11T08:03:00.000Z',
};

// L'étude d'implantation, réduite à ce que la normalisation lit : les notes
// sur cinq, le revenu, les CSP+, les propriétaires.
const IMPLANTATION_OK = {
  source: 'Data-B · Étude d\'implantation',
  flux_pieton: { note: { note: 3, sur: 5 }, par_heure: { haute: { min: 400, max: 450 } } },
  flux_voiture: { note: { note: 3, sur: 5 } },
  troncon: { libelle: '19 commerces - tronçon premium', note: { note: 5, sur: 5 } },
  revenu: { revenu_moyen_annuel: 30246, csp_plus: 40298 },
  zone_primaire: { proprietaires: 3917 },
  lien: 'https://expertise.data-b.com/edition?o=x&expertise_format=etude_implantation',
  le: '2026-09-11T08:04:00.000Z',
};

// Les ventes réelles : DVF ne publie pas de médiane sous cinq ventes, donc la
// doublure en porte assez pour que l'indicateur existe.
const DVF_OK = {
  source: 'DVF · Demandes de valeurs foncières',
  commune: 'Grasse', code_insee: '06069', rayon: 500,
  annees: [2021, 2022, 2023, 2024, 2025],
  prix_m2: { bas: 2100, median: 2800, haut: 3600 },
  n: 9,
  periode: { du: '2021-03-02', au: '2025-07-18' },
  ventes: [{ date: '2025-07-18', prix: 240000, surface: 86, prix_m2: 2791, adresse: '11 RUE GAZAN', distance_m: 40 }],
  ecartees: { mixtes: 14, symboliques: 1, sans_surface: 0 },
  le: '2026-09-11T08:05:00.000Z',
};

const BODACC_OK = {
  source: 'BODACC · Annonces commerciales',
  rue: 'Rue Gazan', commune: 'Grasse', code_postal: '06130', mois: 24, depuis: '2024-09-12',
  sur_la_rue: { creations: 4, cessions: 2, procedures: 1, fermetures: 3, evenements: [], annonces_lues: 10, tronque: false },
  commune_entiere: { creations: 310, cessions: 42, procedures: 28, radiations: 260, total: 640 },
  cessions_avec_prix: [{ date: '2025-11-04', prix: 95000, activite: 'boulangerie', commercant: 'X', numero: '11' }],
  le: '2026-09-11T08:06:00.000Z',
};

/** Une doublure du connecteur `modele` qui rend `resultat`, ou jette `erreur`. */
function doublure(modele, { resultat = null, erreur = null } = {}) {
  const appels = [];
  return {
    ...modele,
    appels,
    async lire(contexte) {
      appels.push(contexte);
      if (erreur) throw typeof erreur === 'function' ? erreur(appels.length) : erreur;
      return resultat;
    },
  };
}

function registre({ equimmox, dataB, figaro, transactions, implantation, dvf, bodacc } = {}) {
  return {
    equimmox: equimmox || doublure(vraiEquimmox, { resultat: EQUIMMOX_OK }),
    'valeur-locative': dataB || doublure(vraiDataB, { resultat: DATAB_OK }),
    'bodacc-cessions': transactions || doublure(vraiTransactions, { resultat: TRANSACTIONS_OK }),
    figaro: figaro || doublure(vraiFigaro, { resultat: FIGARO_OK }),
    implantation: implantation || doublure(vraiImplantation, { resultat: IMPLANTATION_OK }),
    dvf: dvf || doublure(vraiDvf, { resultat: DVF_OK }),
    bodacc: bodacc || doublure(vraiBodacc, { resultat: BODACC_OK }),
  };
}

const contexte = { adresse: '9 rue Gazan, 06130 Grasse', surface: 100 };

// ---------------------------------------------------------------------------

test('Equimmox en 502 : trois réessais, puis la valeur locative du secteur prend le relais', async () => {
  const attentes = [];
  const equimmox = doublure(vraiEquimmox, {
    erreur: new ErreurSource('Equimmox a répondu 502.', { service: 'Equimmox', statut: 502 }),
  });
  const c = registre({ equimmox });

  const r = await collecter(contexte, {
    connecteurs: c,
    patienter: async (ms) => { attentes.push(ms); },
  });

  // La source de tête a bien été relancée, en espaçant.
  assert.equal(equimmox.appels.length, 4);
  assert.deepEqual(attentes, [5000, 15000, 45000]);

  // Puis le repli a répondu, et c'est lui qui sert le besoin.
  assert.equal(r.besoins.loyer_commercial.servi_par, 'valeur-locative');
  assert.deepEqual(r.besoins.loyer_commercial.essayees, ['equimmox', 'valeur-locative']);

  // Le chiffre est là, dans le format pivot, étiqueté à sa vraie source.
  const loyer = r.indicateurs.loyer_commercial_m2_an;
  assert.ok(loyer, 'le loyer commercial est renseigné malgré la panne');
  assert.equal(loyer.connecteur, 'valeur-locative');
  assert.equal(loyer.service, 'Equimmox, secteur');
  assert.equal(loyer.source, 'Equimmox · Analyse de loyer');
  assert.equal(loyer.collecte_le, '2026-09-11T08:01:00.000Z');
  assert.equal(loyer.unite, '€ / m² / an');
  assert.equal(loyer.echelle, 'rue', 'la maille la plus fine que le secteur donne');
  assert.equal(loyer.bas, 140);
  assert.equal(loyer.haut, 200);
  assert.equal(loyer.median, null, 'sans moyenne lue, la médiane reste vide');

  // Et l'échec est tracé, sans faire tomber le reste de la lecture.
  const echec = r.sources_en_echec.find((s) => s.source === 'equimmox');
  assert.equal(echec.classe, 'temporaire');
  assert.equal(echec.essais, 4);
  assert.equal(r.a_reessayer, true);
  assert.equal(r.complet, true, 'toutes les questions ont trouvé une réponse');
  assert.equal(r.besoins_couverts, 6, 'loyer, cessions, résidentiel, ventes réelles, vitalité, emplacement');
});

test('la panne d’Equimmox ne coûte rien aux autres besoins', async () => {
  const equimmox = doublure(vraiEquimmox, { erreur: new ErreurSource('502', { statut: 502 }) });
  const r = await collecter(contexte, { connecteurs: registre({ equimmox }), ...sansAttente });

  assert.equal(r.besoins.cessions_fonds.servi_par, 'bodacc-cessions');
  assert.equal(r.besoins.residentiel.servi_par, 'figaro');
  assert.ok(r.indicateurs.prix_fonds_commerce);
  assert.ok(r.indicateurs.prix_residentiel_m2);
  assert.equal(r.indicateurs.prix_residentiel_m2.echelle, 'quartier');
});

test('des identifiants refusés : aucun réessai, source suivante, et on notifie', async () => {
  const attentes = [];
  const equimmox = doublure(vraiEquimmox, {
    erreur: new Error('Connexion à Equimmox refusée : vérifiez le compte dans .env.'),
  });
  const r = await collecter(contexte, {
    connecteurs: registre({ equimmox }),
    patienter: async (ms) => { attentes.push(ms); },
  });

  assert.equal(equimmox.appels.length, 1, 'un mur ne se force pas');
  assert.deepEqual(attentes, []);
  assert.equal(r.besoins.loyer_commercial.servi_par, 'valeur-locative');
  assert.equal(r.notifications.length, 1);
  assert.equal(r.notifications[0].service, 'Equimmox');
  assert.match(r.notifications[0].message, /refusée/);
  assert.equal(r.a_reessayer, false, 'rien à réessayer plus tard : c’est le compte');
});

test('toutes les sources à terre : la lecture se termine quand même', async () => {
  const panne = (nom) => new ErreurSource(`${nom} a répondu 503.`, { statut: 503 });
  const r = await collecter(contexte, {
    ...sansAttente,
    connecteurs: registre({
      equimmox: doublure(vraiEquimmox, { erreur: panne('Equimmox') }),
      dataB: doublure(vraiDataB, { erreur: panne('Data-B') }),
      transactions: doublure(vraiTransactions, { erreur: panne('Data-B') }),
      figaro: doublure(vraiFigaro, { erreur: panne('Le Figaro') }),
      implantation: doublure(vraiImplantation, { erreur: panne('Data-B') }),
      dvf: doublure(vraiDvf, { erreur: panne('DVF') }),
      bodacc: doublure(vraiBodacc, { erreur: panne('BODACC') }),
    }),
  });

  assert.deepEqual(r.indicateurs, {}, 'aucun chiffre — et surtout aucun chiffre inventé');
  assert.equal(r.complet, false);
  assert.equal(r.besoins_couverts, 0);
  assert.equal(r.sources_en_echec.length, 7);
  assert.deepEqual(
    r.indicateurs_manquants.sort(),
    [
      'loyer_commercial_m2_an', 'prix_fonds_commerce',
      'prix_residentiel_m2', 'loyer_residentiel_m2_mois', 'evolution_prix_residentiel_1_an', 'evolution_prix_residentiel_5_ans',
      'flux_pieton_note', 'flux_voiture_note', 'commercialite_troncon_note', 'revenu_moyen_annuel', 'csp_plus', 'proprietaires_zone',
      'prix_local_commercial_m2', 'fermetures_rue', 'creations_rue',
    ].sort()
  );
  assert.equal(r.a_reessayer, true, 'des pannes : on repassera');
  assert.equal(r.sources_utilisees.length, 0);
});

test('une source à terre n’est pas resollicitée dans le même passage', async () => {
  // Data-B sert deux besoins par deux modules distincts ; ici on force la même
  // source dans deux chaînes pour vérifier qu'elle n'est interrogée qu'une fois.
  const dataB = doublure(vraiDataB, { erreur: new ErreurSource('503', { statut: 503 }) });
  const besoins = [
    { cle: 'a', titre: 'a', indicateurs: ['loyer_commercial_m2_an'], chaine: ['valeur-locative'] },
    { cle: 'b', titre: 'b', indicateurs: ['loyer_commercial_m2_an'], chaine: ['valeur-locative'] },
  ];
  const r = await collecter(contexte, { ...sansAttente, besoins, connecteurs: registre({ dataB }) });
  assert.equal(dataB.appels.length, 4, 'quatre essais en tout, pas huit');
  assert.equal(r.sources_en_echec.length, 1);
});

test('la chaîne se réordonne sans toucher au code', async () => {
  const c = registre();
  // Sans recoupement, une source de tête qui répond arrête la chaîne.
  const besoins = [{ ...BESOINS_DEFAUT[0], recouper: false, chaine: ['valeur-locative', 'equimmox'] }];
  const r = await collecter(contexte, { ...sansAttente, besoins, connecteurs: c });
  assert.equal(r.besoins.loyer_commercial.servi_par, 'valeur-locative');
  assert.equal(c.equimmox.appels.length, 0, 'la source de tête a répondu : on s’arrête là');
});

test('un besoin à recouper interroge TOUTES ses sources, même quand la première répond', async () => {
  const c = registre();
  const r = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: c });
  assert.equal(c.equimmox.appels.length, 1);
  assert.equal(c['valeur-locative'].appels.length, 1, 'la seconde source est lue aussi');
  // Le chiffre retenu reste celui de la source de tête : le recoupement
  // éclaire, il ne renverse pas l'ordre de confiance.
  assert.equal(r.besoins.loyer_commercial.servi_par, 'equimmox');
  assert.equal(r.indicateurs.loyer_commercial_m2_an.service, 'Equimmox');
});

test('deux lectures qui s’écartent trop lèvent un drapeau', async () => {
  // Equimmox constate 150–220 (centre 180) ; Data-B estime 140–200 (centre 170).
  const proche = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: registre() });
  const r1 = proche.recoupements.loyer_commercial_m2_an;
  assert.ok(r1, 'un recoupement existe dès que deux sources répondent');
  assert.equal(r1.lectures.length, 2);
  assert.equal(r1.alerte, false, '180 contre 170 : moins de 15 % d’écart, rien à signaler');

  // La même chose avec une estimation très basse : l’écart devient un signal.
  // On abaisse le QUARTIER, pas la rue : c'est la maille qui se compare au
  // rayon de 500 m d'Equimmox. Abaisser la rue ne prouverait rien — elle est
  // écartée de la comparaison, justement parce qu'elle ne décrit pas le même
  // territoire.
  const dataB = doublure(vraiDataB, {
    resultat: { ...DATAB_OK, quartier: { nom: 'Centre', basse: 80, haute: 100 } },
  });
  const loin = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: registre({ dataB }) });
  const r2 = loin.recoupements.loyer_commercial_m2_an;
  assert.equal(r2.alerte, true, '180 contre 90 : il faut aller voir');
  assert.equal(r2.bas, 90);
  assert.equal(r2.haut, 180);
  assert.equal(Math.round(r2.ecart_relatif * 100), 100);
});

test('la lecture avance à mesure, source par source', async () => {
  const poses = [];
  const equimmox = doublure(vraiEquimmox, { erreur: new ErreurSource('502', { statut: 502 }) });
  await collecter(contexte, {
    ...sansAttente,
    connecteurs: registre({ equimmox }),
    surResultat: (c, brut) => poses.push([c.cle, c.champ_lot, !!brut]),
  });
  assert.deepEqual(poses, [
    ['valeur-locative', 'valeur_locative', true],
    ['bodacc-cessions', 'transactions_fonds', true],
    ['figaro', 'prix_residentiel', true],
    ['dvf', 'ventes_dvf', true],
    ['bodacc', 'vitalite_rue', true],
    ['implantation', 'implantation', true],
  ]);
});

test('chaque tentative sait à quel besoin elle appartient', async () => {
  const equimmox = doublure(vraiEquimmox, { erreur: new ErreurSource('502', { statut: 502 }) });
  const r = await collecter(contexte, { ...sansAttente, connecteurs: registre({ equimmox }) });
  const dEquimmox = r.tentatives.filter((t) => t.source === 'equimmox');
  assert.equal(dEquimmox.length, 4);
  assert.ok(dEquimmox.every((t) => t.besoin === 'loyer_commercial' && t.rang === 0));
  assert.equal(r.tentatives.at(-1).besoin, 'emplacement');
});

test('le recoupement compare des mailles comparables, et écarte les autres', async () => {
  // Le cas CAFPI, avec ses vrais chiffres : Data-B publie trois mailles, et
  // c'est le quartier — pas la rue — qui se compare au rayon de 500 m
  // d'Equimmox. Comparer la rue donnait +189 %, un écart que personne n'avait
  // mesuré : il naissait du choix de la maille.
  const equimmox = doublure(vraiEquimmox, {
    resultat: { ...EQUIMMOX_OK, bas: 250, moyenne: 277, haut: 291, surface_min: 64, surface_max: 118 },
  });
  const dataB = doublure(vraiDataB, {
    resultat: {
      ...DATAB_OK,
      rue: { nom: 'Avenue Marceau', basse: 640, haute: 960 },
      quartier: { nom: 'Fauvelles', basse: 272, haute: 408 },
      ville: { nom: 'Courbevoie', basse: 369, haute: 553 },
    },
  });
  const r = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: registre({ equimmox, dataB }) });
  const rec = r.recoupements.loyer_commercial_m2_an;

  assert.equal(rec.portee_reference, 500, 'la portée de référence est le rayon de la source de tête');
  assert.deepEqual(rec.lectures.map((l) => l.echelle), ['rayon', 'quartier']);
  assert.equal(Math.round(rec.ecart_relatif * 100), 23, 'à maille égale, l’écart est de 23 % — pas de 189 %');

  // Écartées, jamais supprimées : on doit pouvoir voir ce qui n'a pas été comparé.
  const ecartees = rec.ecartees.map((e) => e.echelle).sort();
  assert.deepEqual(ecartees, ['rue', 'ville']);
  assert.ok(rec.ecartees.every((e) => e.raison && e.bas != null), 'chaque maille écartée garde sa raison et ses chiffres');
});

test('une source qui se contredit d’une maille à l’autre est signalée à part', async () => {
  // Même service, même unité, même définition : ni la pondération ni le
  // périmètre de charges ne peuvent expliquer un rapport pareil.
  const dataB = doublure(vraiDataB, {
    resultat: {
      ...DATAB_OK,
      rue: { nom: 'Rue Gazan', basse: 900, haute: 1100 },
      quartier: { nom: 'Centre', basse: 120, haute: 210 },
      ville: { nom: 'Grasse', basse: 100, haute: 240 },
    },
  });
  const r = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: registre({ dataB }) });
  const [inc] = r.recoupements.loyer_commercial_m2_an.incoherences;
  assert.ok(inc, 'la contradiction interne est relevée');
  assert.equal(inc.service, 'Equimmox, secteur');
  assert.equal(inc.haute.echelle, 'rue');
  assert.equal(inc.basse.echelle, 'quartier');
  assert.ok(inc.rapport > 3);
});

test('une maille trop large pour la référence n’est pas comparée', async () => {
  // Data-B ne rend que sa ville : 3 km contre un rayon de 500 m. Les deux
  // chiffres sont justes et ne se contredisent pas — ils ne parlent pas du
  // même territoire. Un drapeau rouge ici serait une invention.
  const dataB = doublure(vraiDataB, {
    resultat: { source: DATAB_OK.source, ville: { nom: 'Grasse', basse: 400, haute: 600 }, le: DATAB_OK.le },
  });
  const r = await collecter(contexte, { ...sansAttente, besoins: [BESOINS_DEFAUT[0]], connecteurs: registre({ dataB }) });
  const rec = r.recoupements.loyer_commercial_m2_an;
  assert.equal(rec.alerte, false);
  assert.equal(rec.lectures.length, 1, 'seule la source de tête reste comparable');
  assert.equal(rec.ecartees[0].raison, 'maille hors de portée comparable');
});
