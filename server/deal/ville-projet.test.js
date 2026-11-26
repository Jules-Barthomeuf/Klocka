// La ville d'un projet, pour prêter sa photo aux dossiers de la même ville (26 nov. 2026, Jules : « pour un dossier à
// Paris, une photo d'un projet qu'on a mis à Paris »). Le champ « ville » des projets est souvent un texte libre.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-ville-projet-'));
const { villeDuProjet } = await import('./index.js');

test("la ville d'un projet : après le code postal, puis le dernier morceau de l'adresse, puis un champ qui nomme une ville", () => {
  assert.equal(villeDuProjet({ adresse_complete: '5 Place de la Libération, 56100 Lorient' }), 'Lorient');
  assert.equal(villeDuProjet({ adresse_complete: '80 RUE DE RENNES, 75006 PARIS, FRANCE' }), 'PARIS');
  // « rue d'Orléans » ne fait pas d'un projet de Rennes un projet d'Orléans.
  assert.equal(villeDuProjet({ adresse_complete: "1 rue d'Orléans, Rennes", ville_secteur_champ1: 'Centre-ville de Rennes' }), 'Rennes');
  assert.equal(villeDuProjet({ adresse_complete: '7 Bd Richard Wallace Puteaux', ville_secteur_champ1: 'Puteaux' }), 'Puteaux');
  // Un texte libre n'est pas une ville.
  assert.equal(villeDuProjet({ adresse_complete: '12 rue X', ville_secteur_champ1: 'Centre-Ville' }), '');
});
