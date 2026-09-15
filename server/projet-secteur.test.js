// Les chiffres du secteur d'un projet : ce qu'ils prennent, et ce qu'ils refusent d'inventer.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-secteur-'));
const {
  communeParente, agglomerationDe, distanceM, residentielDe, rueDe, fluxDe,
  implantationEnCache, lotDuProjet, calculerSecteur, lireSecteur, attendreSecteur, dureeDeGarde, JOURS_GARDE,
} = await import('./projet-secteur.js');

test("une fiche sans résidentiel ou sans rue ne se garde qu'une heure", () => {
  assert.equal(dureeDeGarde({ residentiel: { prix_m2: 1 }, rue: { loyer_m2_an: 1 } }), JOURS_GARDE * 86400000);
  assert.equal(dureeDeGarde({ residentiel: null, rue: { loyer_m2_an: 1 } }), 3600000);
  assert.equal(dureeDeGarde(undefined), 3600000);
});

test("un arrondissement renvoie à sa commune, et l'agglomération suit", () => {
  assert.equal(communeParente('75118'), '75056');
  assert.equal(communeParente('69389'), '69123');
  assert.equal(communeParente('13216'), '13055');
  assert.equal(communeParente('06088'), '06088');
  const paris = agglomerationDe('75118');
  assert.equal(paris.nom, 'Paris');
  assert.ok(paris.population > 10_000_000);
  assert.equal(agglomerationDe('01001'), null, 'une commune hors unité urbaine n\'a pas d\'agglomération');
});

test('la distance à la mairie se mesure en mètres', () => {
  // Place Masséna → mairie de Nice : un peu moins de 300 m.
  const d = distanceM({ lat: 43.6975, lon: 7.2703 }, { lat: 43.6969, lon: 7.2737 });
  assert.ok(d > 250 && d < 320, `distance ${d}`);
  assert.equal(distanceM({ lat: 1 }, { lat: 2, lon: 2 }), null);
});

test("le résidentiel prend le quartier, et une évolution nulle reste une évolution", () => {
  const r = residentielDe({
    ville: 'Lyon',
    commune: { nom: 'Lyon', prix: { median: 4978, sur_1_an: 0, sur_5_ans: -6 }, loyer: { median: 21 } },
    quartier: { nom: 'Bellecour-Ainay', prix: { median: 5434, sur_1_an: -7, sur_5_ans: null }, loyer: { median: 21 }, lien: 'https://q' },
  });
  assert.equal(r.echelle, 'quartier');
  assert.equal(r.prix_m2, 5434);
  assert.deepEqual(r.evolution_1_an, { valeur: -7, echelle: 'quartier' });
  assert.deepEqual(r.evolution_5_ans, { valeur: -6, echelle: 'commune' });
  assert.equal(r.loyer_m2_mois, 21);

  const commune = residentielDe({ commune: { nom: 'Lorient', prix: { median: 2500, sur_1_an: 0 }, loyer: { median: 11 } } });
  assert.equal(commune.echelle, 'commune');
  assert.deepEqual(commune.evolution_1_an, { valeur: 0, echelle: 'commune' });
  assert.equal(residentielDe({ commune: { prix: {} } }), null);
});

test("la rue garde le milieu de la fourchette Data-B et ne fabrique pas de prix", () => {
  const r = rueDe({ rue: 'Rue des Poteaux', loyer: [200, 300], loyer_source: 'Data-B, rue', prix_m2: null });
  assert.equal(r.loyer_m2_an, 250);
  assert.equal(r.prix_m2, null);
  assert.equal(rueDe({ rue: 'X', loyer: null, prix_m2: null }), null);
});

test("les étoiles : un flux indisponible n'a pas de note, un tronçon sans flux compte", () => {
  const f = fluxDe({
    flux_pieton: { note: { note: 2, sur: 5 }, indisponible: false },
    flux_voiture: { note: { note: 5, sur: 5 }, indisponible: true },
    troncon: { libelle: '19 commerces - tronçon premium', note: { note: 5, sur: 5 } },
  });
  assert.deepEqual(f.pieton, { note: 2, sur: 5 });
  assert.equal(f.voiture, null);
  assert.deepEqual(f.commercialite, { note: 5, sur: 5 });
  assert.equal(fluxDe({ flux_pieton: null, troncon: null }), null);
});

test("le cache d'étude se retrouve par l'adresse, quelle que soit l'activité", () => {
  const adresse = { numero: '93', rue: 'Avenue Marceau', code_postal: '92400', ville: 'Courbevoie' };
  const vide = { flux_pieton: null };
  const pleine = { flux_pieton: { note: { note: 3, sur: 5 } } };
  const trouve = implantationEnCache(adresse, [
    { cle: '93 avenue marceau 92400 courbevoie|boulangerie', le: '2026-09-01', resultat: vide },
    { cle: '93 avenue marceau 92400 courbevoie|tous les commerces', le: '2026-08-01', resultat: pleine },
    { cle: '930 avenue marceau 92400 courbevoie|tous les commerces', le: '2026-09-10', resultat: pleine },
  ]);
  assert.equal(trouve, pleine);
});

test('le lot du projet est celui de sa rue', () => {
  const deal = { lots: [
    { lot: { adresse: { valeur: { rue: '12 rue de la République' } } }, n: 1 },
    { lot: { adresse: { valeur: { rue: '55 rue des Poteaux' } } }, n: 2 },
  ] };
  assert.equal(lotDuProjet({ adresse_complete: '55 Rue des Poteaux, Paris' }, deal).n, 2);
  assert.equal(lotDuProjet({ adresse_complete: 'ailleurs' }, deal).n, 1);
  assert.equal(lotDuProjet({}, null), null);
});

test("l'assemblage reprend les données du dossier sans relire Le Figaro", async () => {
  let figaroLu = false;
  const donnees = await calculerSecteur(
    { adresse_complete: '55 rue des Poteaux, 75018 Paris', deal_id: 'd1' },
    {
      resoudre: async () => ({ label: '55 Rue des Poteaux 75018 Paris', code_insee: '75118', numero: '55', rue: 'Rue des Poteaux', code_postal: '75018', ville: 'Paris', lat: 48.8938, lon: 2.3486 }),
      mairie: async (code) => { assert.equal(code, '75056'); return { nom: 'Paris', lat: 48.8564, lon: 2.3525, repere: 'mairie' }; },
      figaro: async () => { figaroLu = true; return null; },
      rue: async () => ({ rue: 'Rue des Poteaux', loyer: [180, 260], prix_m2: 6200, prix_m2_source: 'DVF, 12 ventes autour' }),
      etudes: () => [],
      dealDe: () => ({ lots: [{
        prix_residentiel: { commune: { nom: 'Paris', prix: { median: 9400, sur_1_an: -2, sur_5_ans: -8 }, loyer: { median: 30 } } },
        implantation: { flux_pieton: { note: { note: 4, sur: 5 } }, flux_voiture: { note: { note: 2, sur: 5 } }, troncon: null },
      }] }),
    },
  );
  assert.equal(figaroLu, false);
  assert.equal(donnees.agglomeration.nom, 'Paris');
  assert.ok(donnees.centre.distance_m > 4000 && donnees.centre.distance_m < 4400, `distance ${donnees.centre.distance_m}`);
  assert.equal(donnees.centre.repere, 'mairie de Paris');
  assert.equal(donnees.residentiel.prix_m2, 9400);
  assert.equal(donnees.rue.loyer_m2_an, 220);
  assert.deepEqual(donnees.flux.pieton, { note: 4, sur: 5 });
  assert.equal(donnees.flux.commercialite, null);
});

test('la fiche se garde, et un second appel ne relance pas le calcul', async () => {
  let calculs = 0;
  const calculer = async () => { calculs += 1; return { agglomeration: { nom: 'Nice', population: 987709 }, residentiel: { prix_m2: 7402 }, rue: { loyer_m2_an: 820 } }; };
  const projet = { id: 'p1', adresse_complete: '12 avenue Jean Médecin, 06000 Nice' };
  const premier = lireSecteur(projet, { calculer });
  assert.equal(premier.en_cours, true);
  assert.equal(premier.le, null);
  await attendreSecteur('p1');
  const second = lireSecteur(projet, { calculer });
  assert.equal(second.en_cours, false);
  assert.equal(second.agglomeration.nom, 'Nice');
  assert.equal(calculs, 1);
  // L'adresse change : la fiche ne vaut plus.
  lireSecteur({ ...projet, adresse_complete: '1 place Masséna, 06000 Nice' }, { calculer });
  await attendreSecteur('p1');
  assert.equal(calculs, 2);
});
