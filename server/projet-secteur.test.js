// Les chiffres du secteur d'un projet : ce qu'ils prennent, et ce qu'ils refusent d'inventer.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-secteur-'));
const {
  communeParente, agglomerationDe, distanceM, residentielDe, loyerDe, loyerDataBDe, fluxDe,
  implantationEnCache, lotDuProjet, calculerSecteur, lireSecteur, attendreSecteur, dureeDeGarde, JOURS_GARDE, secteurGarde,
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

test("le loyer autour vient d'Equimmox seul : sa moyenne, sinon le milieu de sa fourchette", () => {
  const r = loyerDe({ bas: 200, moyenne: 240, haut: 300, rayon: '500 m', surface_min: 64, surface_max: 96 }, 'Rue des Poteaux');
  assert.equal(r.loyer_m2_an, 240);
  assert.equal(r.loyer_source, 'Equimmox');
  assert.equal(r.nom, 'Rue des Poteaux');
  assert.equal(r.surface_min, 64);
  assert.equal(loyerDe({ bas: 200, haut: 300 }).loyer_m2_an, 250);
  assert.equal(loyerDe({ bas: null, moyenne: null, haut: null }), null);
  assert.equal(loyerDe(null), null);
});

test("sans bail Equimmox, Data-B répond : le quartier d'abord, et il le dit", () => {
  const d = loyerDataBDe({ rue: { basse: 300, haute: 400 }, quartier: { basse: 200, haute: 260 }, ville: null });
  assert.deepEqual([d.loyer_m2_an, d.loyer_source, d.maille], [230, 'Data-B', 'quartier']);
  assert.equal(loyerDataBDe({ rue: { basse: 300, haute: null } }).loyer_m2_an, 300);
  assert.equal(loyerDataBDe({ rue: null, quartier: null, ville: null }), null);
  assert.equal(loyerDataBDe(null), null);
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
    { adresse_complete: '55 rue des Poteaux, 75018 Paris', deal_id: 'd1', sim_surface: 80 },
    {
      resoudre: async () => ({ label: '55 Rue des Poteaux 75018 Paris', code_insee: '75118', numero: '55', rue: 'Rue des Poteaux', code_postal: '75018', ville: 'Paris', lat: 48.8938, lon: 2.3486 }),
      mairie: async (code) => { assert.equal(code, '75056'); return { nom: 'Paris', lat: 48.8564, lon: 2.3525, repere: 'mairie' }; },
      figaro: async () => { figaroLu = true; return null; },
      loyer: async (adresse, surface) => {
        assert.equal(adresse, '55 Rue des Poteaux 75018 Paris');
        assert.equal(surface, 80);
        return { bas: 180, moyenne: 220, haut: 260, rayon: '500 m', surface_min: 64, surface_max: 96 };
      },
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
  assert.equal(donnees.rue.nom, 'Rue des Poteaux');
  assert.equal(donnees.rue.loyer_source, 'Equimmox');
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

test("l'équipe relance l'analyse du loyer : le calcul repart et Equimmox ignore son cache", async () => {
  const appels = [];
  const calculer = async (projet, opts) => { appels.push(opts?.forcerLoyer === true); return { residentiel: { prix_m2: 1 }, rue: { loyer_m2_an: 300 } }; };
  const projet = { id: 'p-relance', adresse_complete: '3 rue de la Paix, 75002 Paris' };
  lireSecteur(projet, { calculer });
  await attendreSecteur('p-relance');
  lireSecteur(projet, { calculer });
  await attendreSecteur('p-relance');
  assert.deepEqual(appels, [false], 'une fiche fraîche ne se recalcule pas');
  lireSecteur(projet, { calculer, forcerLoyer: true });
  await attendreSecteur('p-relance');
  assert.deepEqual(appels, [false, true]);
  assert.equal(secteurGarde('p-relance').rue.loyer_m2_an, 300);

  let force = null;
  await calculerSecteur({ adresse_complete: '3 rue de la Paix, 75002 Paris' }, {
    forcerLoyer: true,
    resoudre: async () => ({ label: '3 Rue de la Paix 75002 Paris', code_insee: '75102', rue: 'Rue de la Paix', ville: 'Paris', lat: 48.869, lon: 2.331 }),
    mairie: async () => null, figaro: async () => null, etudes: () => [], dealDe: () => null,
    loyer: async (_t, _s, forcer) => { force = forcer; return { moyenne: 900 }; },
  });
  assert.equal(force, true);
});
