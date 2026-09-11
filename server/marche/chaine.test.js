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
const vraiDataB = (await import('./connecteurs/data-b-valeur-locative.js')).default;
const vraiTransactions = (await import('./connecteurs/data-b-transactions.js')).default;
const vraiFigaro = (await import('./connecteurs/figaro.js')).default;

const sansAttente = { patienter: async () => {} };

// Les vrais résultats bruts, réduits à ce que la normalisation lit.
const EQUIMMOX_OK = {
  source: 'Equimmox · Analyse de loyer', bas: 150, moyenne: 180, haut: 220,
  rayon: '500m', classe: 'Commerce', surface_min: 70, surface_max: 130,
  le: '2026-09-11T08:00:00.000Z',
};
const DATAB_OK = {
  source: 'Data-B · Valeurs locatives',
  rue: { nom: 'Rue Gazan', basse: 140, haute: 200 },
  quartier: { nom: 'Centre', basse: 120, haute: 210 },
  ville: { nom: 'Grasse', basse: 100, haute: 240 },
  lien: 'https://valeurlocative.data-b.com/search?x=1',
  le: '2026-09-11T08:01:00.000Z',
};
const FIGARO_OK = {
  source: 'Le Figaro Immobilier',
  quartier: { nom: 'Centre', prix: { median: 3200, bas: 2400, haut: 4100 }, loyer: { median: 14 }, lien: 'https://x' },
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

function registre({ equimmox, dataB, figaro, transactions } = {}) {
  return {
    equimmox: equimmox || doublure(vraiEquimmox, { resultat: EQUIMMOX_OK }),
    'data-b-valeur-locative': dataB || doublure(vraiDataB, { resultat: DATAB_OK }),
    'data-b-transactions': transactions || doublure(vraiTransactions, { resultat: TRANSACTIONS_OK }),
    figaro: figaro || doublure(vraiFigaro, { resultat: FIGARO_OK }),
  };
}

const contexte = { adresse: '9 rue Gazan, 06130 Grasse', surface: 100 };

// ---------------------------------------------------------------------------

test('Equimmox en 502 : trois réessais, puis Data-B prend le relais', async () => {
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
  assert.equal(r.besoins.loyer_commercial.servi_par, 'data-b-valeur-locative');
  assert.deepEqual(r.besoins.loyer_commercial.essayees, ['equimmox', 'data-b-valeur-locative']);

  // Le chiffre est là, dans le format pivot, étiqueté à sa vraie source.
  const loyer = r.indicateurs.loyer_commercial_m2_an;
  assert.ok(loyer, 'le loyer commercial est renseigné malgré la panne');
  assert.equal(loyer.connecteur, 'data-b-valeur-locative');
  assert.equal(loyer.service, 'Data-B');
  assert.equal(loyer.source, 'Data-B · Valeurs locatives');
  assert.equal(loyer.collecte_le, '2026-09-11T08:01:00.000Z');
  assert.equal(loyer.unite, '€ / m² / an');
  assert.equal(loyer.echelle, 'rue', 'la maille la plus fine que Data-B donne');
  assert.equal(loyer.bas, 140);
  assert.equal(loyer.haut, 200);
  assert.equal(loyer.median, null, 'Data-B ne publie pas de médiane : elle reste vide');

  // Et l'échec est tracé, sans faire tomber le reste de la lecture.
  const echec = r.sources_en_echec.find((s) => s.source === 'equimmox');
  assert.equal(echec.classe, 'temporaire');
  assert.equal(echec.essais, 4);
  assert.equal(r.a_reessayer, true);
  assert.equal(r.complet, true, 'toutes les questions ont trouvé une réponse');
  assert.equal(r.besoins_couverts, 3);
});

test('la panne d’Equimmox ne coûte rien aux autres besoins', async () => {
  const equimmox = doublure(vraiEquimmox, { erreur: new ErreurSource('502', { statut: 502 }) });
  const r = await collecter(contexte, { connecteurs: registre({ equimmox }), ...sansAttente });

  assert.equal(r.besoins.cessions_fonds.servi_par, 'data-b-transactions');
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
  assert.equal(r.besoins.loyer_commercial.servi_par, 'data-b-valeur-locative');
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
    }),
  });

  assert.deepEqual(r.indicateurs, {}, 'aucun chiffre — et surtout aucun chiffre inventé');
  assert.equal(r.complet, false);
  assert.equal(r.besoins_couverts, 0);
  assert.equal(r.sources_en_echec.length, 4);
  assert.deepEqual(
    r.indicateurs_manquants.sort(),
    ['loyer_commercial_m2_an', 'prix_fonds_commerce', 'prix_residentiel_m2', 'loyer_residentiel_m2_mois'].sort()
  );
  assert.equal(r.a_reessayer, true, 'des pannes : on repassera');
  assert.equal(r.sources_utilisees.length, 0);
});

test('une source à terre n’est pas resollicitée dans le même passage', async () => {
  // Data-B sert deux besoins par deux modules distincts ; ici on force la même
  // source dans deux chaînes pour vérifier qu'elle n'est interrogée qu'une fois.
  const dataB = doublure(vraiDataB, { erreur: new ErreurSource('503', { statut: 503 }) });
  const besoins = [
    { cle: 'a', titre: 'a', indicateurs: ['loyer_commercial_m2_an'], chaine: ['data-b-valeur-locative'] },
    { cle: 'b', titre: 'b', indicateurs: ['loyer_commercial_m2_an'], chaine: ['data-b-valeur-locative'] },
  ];
  const r = await collecter(contexte, { ...sansAttente, besoins, connecteurs: registre({ dataB }) });
  assert.equal(dataB.appels.length, 4, 'quatre essais en tout, pas huit');
  assert.equal(r.sources_en_echec.length, 1);
});

test('la chaîne se réordonne sans toucher au code', async () => {
  const c = registre();
  const besoins = [{ ...BESOINS_DEFAUT[0], chaine: ['data-b-valeur-locative', 'equimmox'] }];
  const r = await collecter(contexte, { ...sansAttente, besoins, connecteurs: c });
  assert.equal(r.besoins.loyer_commercial.servi_par, 'data-b-valeur-locative');
  assert.equal(c.equimmox.appels.length, 0, 'la source de tête a répondu : on s’arrête là');
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
    ['data-b-valeur-locative', 'valeur_locative', true],
    ['data-b-transactions', 'transactions_fonds', true],
    ['figaro', 'prix_residentiel', true],
  ]);
});

test('chaque tentative sait à quel besoin elle appartient', async () => {
  const equimmox = doublure(vraiEquimmox, { erreur: new ErreurSource('502', { statut: 502 }) });
  const r = await collecter(contexte, { ...sansAttente, connecteurs: registre({ equimmox }) });
  const dEquimmox = r.tentatives.filter((t) => t.source === 'equimmox');
  assert.equal(dEquimmox.length, 4);
  assert.ok(dEquimmox.every((t) => t.besoin === 'loyer_commercial' && t.rang === 0));
  assert.equal(r.tentatives.at(-1).besoin, 'residentiel');
});
