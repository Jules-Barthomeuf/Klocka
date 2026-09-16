// Les cartes de prospection : un nom, des critères, des villes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-cartes-'));
const { Records } = await import('../db.js');
const { criteresPropres, phraseCriteres, listerCartes, creerCarte, majCarte, supprimerCarte, rattacherVille, detacherVille, detailCarte } = await import('./cartes.js');

test('les critères se nettoient : des nombres, une famille connue', () => {
  const c = criteresPropres({ prix_min: '300 000 €', prix_max: '200000', rendement_min: '8,5', rendement_max: 8, famille: 'Inventée', note: '  centre-ville  ' });
  // Le minimum et le maximum se remettent dans l'ordre plutôt que de rendre une fourchette vide.
  assert.deepEqual([c.prix_min, c.prix_max], [200000, 300000]);
  assert.deepEqual([c.rendement_min, c.rendement_max], [8, 8.5]);
  assert.equal(c.famille, null);
  assert.equal(c.note, 'centre-ville');
  assert.equal(criteresPropres({ famille: 'Grande métropole' }).famille, 'Grande métropole');
  assert.deepEqual(criteresPropres({}).prix_min, null);
});

test('les critères se lisent en une phrase', () => {
  assert.equal(phraseCriteres({ prix_min: 200000, prix_max: 300000, rendement_min: 8, rendement_max: 8.5 }), '200 k€ à 300 k€ · 8 à 8,5 %');
  assert.equal(phraseCriteres({ prix_max: 300000 }), 'jusqu\'à 300 k€');
  assert.equal(phraseCriteres({}), 'Aucun critère posé');
});

test('une carte porte un nom libre et ne se crée pas deux fois', () => {
  const r = creerCarte({ nom: '  Investisseur Machin  ', client: 'M. Machin', criteres: { prix_min: 200000, prix_max: 300000, rendement_min: 8 } });
  assert.equal(r.ok, true);
  assert.equal(r.carte.nom, 'Investisseur Machin');
  assert.equal(r.carte.criteres.prix_max, 300000);
  assert.equal(creerCarte({ nom: 'investisseur machin' }).deja, true);
  assert.equal(creerCarte({ nom: '   ' }).ok, false);
});

test('la carte ouverte dit où aller et ce qu\'on y tient déjà', () => {
  const carte = listerCartes()[0];
  const ville = Records.create('Ville', { nom: 'Dijon', code_insee: '21231', rues: [] });
  assert.equal(rattacherVille(carte.id, ville.id).ok, true);
  Records.create('Cible', { ville_id: ville.id, enseigne: 'Pizzeria Chez Truc', pile: 'appeler', valorisation: { loyer_annuel: 20000, loyer_m2_marche: 400, surface: 50 } });

  const d = detailCarte(carte.id);
  assert.deepEqual(d.villes.map((v) => v.nom), ['Dijon']);
  assert.equal(d.villes[0].cibles.appeler, 1);
  // Dijon est prospectée pour cette carte : elle sort des conseils, et passe
  // dans les villes déjà tenues.
  assert.ok(!d.conseillees.some((v) => v.ville === 'Dijon'));
  assert.ok(d.prospectees.some((v) => v.ville === 'Dijon'));
  assert.ok(d.conseillees.length > 3, 'le tableau conseille d\'autres villes à ce rendement');
  assert.deepEqual(d.cibles.map((c) => c.nom), ['Pizzeria Chez Truc']);
  assert.equal(d.carte.phrase, '200 k€ à 300 k€ · 8 % minimum');
  assert.equal(listerCartes()[0].cibles.appeler, 1);
  assert.equal(listerCartes()[0].villes.length, 1);

  assert.equal(detailCarte('inconnue'), null);
  assert.equal(detacherVille(ville.id).ok, true);
  assert.deepEqual(detailCarte(carte.id).villes, []);
});

test('une carte se renomme, et s\'efface sans emporter les villes', () => {
  const carte = creerCarte({ nom: 'Carte à jeter' }).carte;
  const ville = Records.create('Ville', { nom: 'Autun', code_insee: '71014', rues: [] });
  rattacherVille(carte.id, ville.id);
  assert.equal(majCarte(carte.id, { nom: 'Carte renommée', criteres: { rendement_min: 9 } }).carte.nom, 'Carte renommée');
  assert.equal(Records.get('Carte', carte.id).criteres.rendement_min, 9);
  assert.equal(majCarte('inconnue', {}).ok, false);
  assert.equal(supprimerCarte(carte.id).ok, true);
  assert.equal(Records.get('Carte', carte.id), null);
  assert.equal(Records.get('Ville', ville.id).carte_id, null, 'la ville reste, détachée');
  assert.equal(supprimerCarte(carte.id).ok, false);
});
