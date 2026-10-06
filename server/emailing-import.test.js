// L'import de contacts de l'emailing : les colonnes se reconnaissent d'elles-
// mêmes et chaque contact entre dans la liste, sans étape de correspondance.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-emailing-import-'));
const { cibleDeEntete, importer } = await import('./emailing/contacts.js');
const { Records } = await import('./db.js');

test('les intitulés réels des fichiers se reconnaissent', () => {
  const cas = {
    'Email': 'email', 'Adresse e-mail': 'email', 'E-mail professionnel': 'email', 'Courriel': 'email',
    'Prénom': 'prenom', 'Prénom du contact': 'prenom', 'First name': 'prenom',
    'Nom': 'nom', 'Nom de famille': 'nom', 'NOM': 'nom', 'Last Name': 'nom',
    "Nom de l'entreprise": 'entreprise', 'Société': 'entreprise', 'Raison sociale': 'entreprise',
    'Ville': 'ville', 'Commune': 'ville', 'Tags': 'tags', 'Téléphone': null,
  };
  for (const [entete, attendu] of Object.entries(cas)) assert.equal(cibleDeEntete(entete), attendu, entete);
});

test("un fichier s'importe d'un coup dans sa liste, prénom, nom et email repris", () => {
  const csv = "Prénom;Nom;Adresse e-mail;Société;Téléphone\nMarie;Durand;marie.durand@exemple.fr;Durand SA;0601020304\nPaul;Martin;PAUL.MARTIN@exemple.fr;;\nSans;Adresse;;;\n";
  const r = importer(csv, { liste: 'Webinaire 12 oct.' });
  assert.equal(r.ok, true);
  assert.deepEqual([r.nouveaux, r.mis_a_jour, r.invalides, r.liste], [2, 0, 1, 'Webinaire 12 oct.']);
  const marie = Records.list('EmailingContact').find((c) => c.email === 'marie.durand@exemple.fr');
  assert.ok(marie, 'contact créé');
  assert.deepEqual([marie.prenom, marie.nom, marie.entreprise], ['Marie', 'Durand', 'Durand SA']);
  assert.equal(marie.listes.length, 1);
  // Le même fichier une seconde fois : mis à jour, jamais dupliqué.
  const r2 = importer(csv, { liste: 'Webinaire 12 oct.' });
  assert.deepEqual([r2.nouveaux, r2.mis_a_jour], [0, 2]);
});
