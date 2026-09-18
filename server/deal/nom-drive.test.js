// Le nom d'un dossier Drive : la ville en tête, puis l'adresse.

import test from 'node:test';
import assert from 'node:assert/strict';
import { nomDossierDrive } from './nom-drive.js';

const dossier = (adresse, extra = {}) => ({ lots: [{ lot: { adresse: { valeur: adresse } }, ...extra }] });

test('la ville passe en tête, en capitales, suivie de l\'adresse', () => {
  assert.equal(
    nomDossierDrive(dossier({ rue: '12 rue de la Paix', code_postal: '44600', ville: 'Saint-Nazaire' })),
    'SAINT-NAZAIRE - 12 rue de la Paix',
  );
  // La commune enrichie prime sur celle lue dans la fiche : elle est vérifiée.
  assert.equal(
    nomDossierDrive(dossier({ rue: '45 rue Victor Hugo', ville: 'lyon 2' }, { enrichissement: { commune: { nom: 'Lyon' } } })),
    'LYON - 45 rue Victor Hugo',
  );
  // Sans rue, le code postal situe encore.
  assert.equal(nomDossierDrive(dossier({ rue: null, code_postal: '69009', ville: 'Lyon' })), 'LYON - 69009');
  assert.equal(nomDossierDrive(dossier({ ville: 'Nice' })), 'NICE');
});

test('sans ville on garde le titre, et rien ne casse un nom de dossier Drive', () => {
  assert.equal(
    nomDossierDrive({ lots: [{ synthese: { titre: 'Local commercial à Lyon : Verdict INSUFFISANT' } }] }),
    'Local commercial à Lyon : Verdict INSUFFISANT',
  );
  assert.equal(nomDossierDrive({ deal_id: 'D-42' }), 'D-42');
  assert.equal(nomDossierDrive(null), 'Dossier');
  // Un nom trop long est coupé au dernier mot entier : dans une liste Drive,
  // le reste serait tronqué à l'écran de toute façon.
  const long = nomDossierDrive(dossier({
    rue: '12 rue de la Grande-Borne (Cellule 3) & 3 avenue des Frères-Lumière (Cellules 1 & 2)',
    ville: 'Mitry-Mory',
  }));
  assert.ok(long.length <= 80, `nom trop long : ${long.length}`);
  assert.ok(long.startsWith('MITRY-MORY - 12 rue de la Grande-Borne'));
  assert.ok(!long.endsWith(' '), 'pas d\'espace en fin de nom');

  // Une barre oblique couperait le nom en deux chez Drive.
  assert.equal(
    nomDossierDrive(dossier({ rue: '3 rue A / B\nCellule 2', ville: 'Mitry-Mory' })),
    'MITRY-MORY - 3 rue A B Cellule 2',
  );
});
