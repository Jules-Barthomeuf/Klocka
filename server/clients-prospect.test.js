// Le passage d'un prospect en client : ce qu'on lit de sa fiche, et ce qui
// prime quand l'appel de découverte dit autre chose.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-prospect-'));
const { champsDepuisProspect, fusionner, MANDAT_SIGNE } = await import('./clients-prospect.js');

// Une ligne telle que `lireTableau` la rend : les colonnes en objet, indexées
// par identifiant. Copiée d'un prospect réel du tableau.
const CHARLES = {
  id: '2142814606',
  nom: 'Charles DESLIS',
  colonnes: {
    text_mm324cr2: 'Charles',
    multiple_person_mkvpgyzx: 'Paul De Zulueta',
    text_mkvpz940: 'Orthoptiste en libérale (3 cabinets)',
    phone_mkvpvev7: '786371889',
    email_mkvpa5n9: 'Charl.Deslis@gmail.com',
    color_mkvvbzpv: 'R1 Visio',
    color_mm1stcp3: 'A DEFINIR',
    numeric_mkvp6zt4: '60000',
    numeric_mkvpkpv2: '40000',
    text_mkvpbre8: '1 RP + 1 LCD + 3 IC',
    long_text_mkvpgdkp: '2 et 3 jours par semaine de travail',
    location_mkvp6pfz: '',
    dropdown_mkvp693a: null,
  },
};

test('la fiche prospect se lit : les colonnes sont un objet, pas un tableau', () => {
  const c = champsDepuisProspect(CHARLES);
  // Le nom de l'élément porte « Prénom NOM » : le prénom vient de sa colonne,
  // le reste est le nom de famille.
  assert.equal(c.prenom, 'Charles');
  assert.equal(c.nom, 'DESLIS');
  // L'adresse se range en minuscules : c'est la clé du compte Klocka.
  assert.equal(c.email, 'charl.deslis@gmail.com');
  assert.equal(c.telephone, '786371889');
  assert.equal(c.fonction, 'Orthoptiste en libérale (3 cabinets)');
  assert.equal(c.revenu, 60000);
  assert.equal(c.fonds_propres, 40000);
  assert.equal(c.patrimoine, '1 RP + 1 LCD + 3 IC');
  assert.equal(c.information, '2 et 3 jours par semaine de travail');
  assert.equal(c.source, 'A DEFINIR');
  // Une colonne vide ou absente ne devient pas une chaîne vide : elle est nulle.
  assert.equal(c.localisation, null);
  // Il signe : c'est tout l'objet du passage.
  assert.equal(c.statut, MANDAT_SIGNE);
  assert.equal(c.mandat_signe, MANDAT_SIGNE);
});

test('un prospect sans prénom en colonne garde le nom de son élément', () => {
  const c = champsDepuisProspect({ id: '1', nom: 'Marie CURIE', colonnes: {} });
  assert.equal(c.prenom, 'Marie');
  assert.equal(c.nom, 'Marie CURIE');
  assert.equal(c.email, null);
  assert.equal(c.revenu, null);
});

test('ce que l\'appel vient d\'apprendre prime, le prospect comble les vides', () => {
  const duProspect = champsDepuisProspect(CHARLES);
  const fusion = fusionner(duProspect, {
    // L'appel a précisé le budget et corrigé le revenu.
    budget: 450000,
    revenu: 72000,
    // Un champ vide ne doit pas écraser ce que le prospect savait.
    patrimoine: '',
    telephone: null,
    // Et le statut dicté par l'appel ne tient pas : on passe en client.
    statut: 'Intérêt',
  });
  assert.equal(fusion.budget, 450000);
  assert.equal(fusion.revenu, 72000);
  assert.equal(fusion.patrimoine, '1 RP + 1 LCD + 3 IC', 'le vide n\'écrase pas');
  assert.equal(fusion.telephone, '786371889');
  assert.equal(fusion.fonds_propres, 40000, 'ce que seul le prospect savait reste');
  assert.equal(fusion.statut, MANDAT_SIGNE, 'le passage force le mandat signé');
  assert.equal(fusion.mandat_signe, MANDAT_SIGNE);
});
