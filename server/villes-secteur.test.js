// « Mon secteur » d'un mandataire : les villes cochées pour le secteur, plus les Villes Klocka de son contour
// (30 oct. 2026, Jules : « j'ai bien mis Antibes dans les villes Klocka »).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-villes-secteur-'));
const { Meta } = await import('./db.js');
const { unir, villesDuSecteurMandataire, communesALire } = await import('./villes-secteur.js');

// Un secteur fait de deux communes, sans appel réseau ; Antibes est une Ville Klocka.
const secteur = { id: null, unites: [{ niveau: 'commune', nom: 'Antibes', code: '06004' }, { niveau: 'commune', nom: 'Vallauris', code: '06155' }] };
Meta.set('villes-klocka', JSON.stringify([{ nom: 'Antibes', code: '06004' }, { nom: 'Lyon', code: '69123' }]));

test('unir : sans doublon, par code puis par nom', () => {
  assert.deepEqual(unir([{ nom: 'Antibes', code: '06004' }], [{ nom: 'Antibes', code: '06004' }, { nom: 'Nice', code: '06088' }]).map((c) => c.nom), ['Antibes', 'Nice']);
});

test('aucune ville cochée : la Ville Klocka du contour suffit', async () => {
  assert.deepEqual((await villesDuSecteurMandataire(secteur)).map((c) => c.nom), ['Antibes']);
});

test('des villes cochées : elles, plus la Ville Klocka, sans la compter deux fois', async () => {
  const s = { ...secteur, villes_choisies: [{ nom: 'Vallauris', code: '06155' }] };
  assert.deepEqual((await villesDuSecteurMandataire(s)).map((c) => c.nom), ['Vallauris', 'Antibes']);
  assert.deepEqual((await communesALire(s)).map((c) => c.nom), ['Vallauris', 'Antibes']);
  const avecAntibes = { ...secteur, villes_choisies: [{ nom: 'Antibes', code: '06004' }] };
  assert.deepEqual((await villesDuSecteurMandataire(avecAntibes)).map((c) => c.nom), ['Antibes']);
});

// Les villes d'un mandataire (6 nov. 2026, Jules : « pas de secteur, il tape une ville ») : une liste, sans contour.
test('ses villes : créées à la première, sans doublon, retirables ; un ancien secteur garde les siennes, figées', async () => {
  const { Records } = await import('./db.js');
  const V = await import('./villes-secteur.js');
  for (const [nom, code] of [['Lyon', '69123'], ['Villeurbanne', '69266'], ['Vallauris', '06155']]) Records.create('Ville', { nom, code_insee: code, centre: { lat: 45, lon: 4 } });
  assert.deepEqual(await V.villesDe('neuf@kp.test'), []);
  assert.equal((await V.ajouterVille('Neuf@kp.test', { nom: 'Lyon', code: '69123' }, 'jules@klocka.test')).ok, true);
  await V.ajouterVille('neuf@kp.test', { nom: 'Villeurbanne', code: '69266' });
  await V.ajouterVille('neuf@kp.test', { nom: 'Lyon', code: '69123' });
  assert.deepEqual((await V.villesDe('neuf@kp.test')).map((v) => v.nom), ['Lyon', 'Villeurbanne']);
  const s = V.secteurPour('neuf@kp.test');
  assert.equal(s.villes_seules, true);
  assert.deepEqual((await communesALire(s)).map((c) => c.nom), ['Lyon', 'Villeurbanne'], 'pas de Ville Klocka ajoutée');
  await V.retirerVille('neuf@kp.test', '69123');
  assert.deepEqual((await V.villesDe('neuf@kp.test')).map((v) => v.nom), ['Villeurbanne']);
  // Un secteur tracé : ses villes (choisies + Klocka du contour) deviennent sa liste au premier geste, le contour reste.
  Records.create('SecteurMandataire', { ...secteur, nom: 'Antibois', mandataire_email: 'ancien@kp.test', villes_choisies: [{ nom: 'Vallauris', code: '06155' }] });
  assert.deepEqual((await V.villesDe('ancien@kp.test')).map((v) => v.nom), ['Vallauris', 'Antibes']);
  await V.retirerVille('ancien@kp.test', '06155');
  const apres = V.secteurPour('ancien@kp.test');
  assert.deepEqual((await V.villesDe('ancien@kp.test')).map((v) => v.nom), ['Antibes']);
  assert.equal(apres.unites.length, 2, 'le contour reste enregistré');
});

test('le temps de lecture suit la population, entre 10 minutes et 3 heures, arrondi à 5', async () => {
  const { dureeLecture } = await import('./villes-secteur.js');
  assert.equal(dureeLecture(37000), 30);
  assert.equal(dureeLecture(500), 10);
  assert.equal(dureeLecture(2_000_000), 180);
  assert.equal(dureeLecture(null), 20);
});
