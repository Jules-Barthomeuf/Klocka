// Les rappels : ce qu'on lit dans une phrase, et le titre qui en sort.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-rappels-'));
const { objetDuRappel, lireNom, lireTelephone, lireEcheance, titreDuRappel } = await import('./rappels.js');

test('le titre reprend le verbe employé, il n\'en impose aucun', () => {
  const phrase = 'Rappelle-moi dans 3 jours de relancer Monsieur Lardeux au 06 12 34 56 78';
  const quoi = objetDuRappel(phrase);
  assert.equal(quoi, 'relancer Monsieur Lardeux', 'le numéro sort du titre : il est lu à part');
  assert.equal(titreDuRappel({ quoi, nom: 'Monsieur Lardeux' }), 'Relancer Monsieur Lardeux');

  assert.equal(titreDuRappel({ quoi: 'passer voir la vitrine', nom: null }), 'Passer voir la vitrine');
  assert.equal(titreDuRappel({ quoi: objetDuRappel('Rappelle-moi jeudi de vérifier le bail') }), 'Vérifier le bail');
  // Les rappels d'avant ne portaient `quoi` que sans personne nommée : leur
  // titre tient toujours.
  assert.equal(titreDuRappel({ quoi: null, nom: 'Marc' }), 'Rappeler Marc');
  assert.equal(titreDuRappel({ quoi: null, nom: null, note: 'le PV d\'AG' }), 'le PV d\'AG');
  assert.equal(titreDuRappel({}), 'Rappel');
});

test('la phrase rend son moment, son nom et son numéro', () => {
  const dans = (d) => Math.round((d - new Date().setHours(12, 0, 0, 0)) / 86400000);
  assert.equal(dans(lireEcheance('rappelle-moi dans 3 jours de relancer Lardeux')), 3);
  assert.equal(dans(lireEcheance('rappelle-moi demain')), 1);
  assert.equal(lireEcheance('relancer Lardeux'), null, 'sans moment, pas de rappel');
  assert.equal(lireNom('rappelle-moi dans 3 jours de relancer Monsieur Lardeux'), 'Monsieur Lardeux');
  assert.equal(lireTelephone('au 06 12 34 56 78'), '0612345678');
  assert.equal(lireTelephone('sans numéro'), null);
});
