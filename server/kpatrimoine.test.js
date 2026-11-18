// K-Patrimoine : les lignes du fichier des personnes morales, l'adresse, les biens d'une société.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-kpatrimoine-'));
const {
  lireLigne, voieCorrespond, voieSansType, grouperBiens, classerBiens, classerProprietaires, fenetreNaissance, departementDe, resumePatrimoine, adresseDe,
} = await import('./kpatrimoine.js');

// Des lignes réelles du millésime 2026 (Metz, Angers).
const GAMBETTA_SCI = '57;0;463;METZ;;31;0086;A;01;00;03001;0018; ;00828;2740;RUE;GAMBETTA;P - Propriétaire;PBFP4Q;878554161;0 - Personnes morales non remarquables ;6540;SCI;SCI BERLIOZ';
const GAMBETTA_BANQUE = '57;0;463;METZ;;31;0288;B;01;00;01001;0018; ;00828;2740;RUE;GAMBETTA;P - Propriétaire;P996F5;356801571;0 - Personnes morales non remarquables ;5192;SCCP;BANQUE POPULAIRE ALSACE LORRAINE CHAMPAGNE';
const FOURNIRUE = '57;0;463;METZ;;38;0087;B;01;00;02001;0044; ;00804;2570;RUE;EN FOURNIRUE;P - Propriétaire;PBFP4Q;878554161;0 - Personnes morales non remarquables ;6540;SCI;SCI BERLIOZ';
const ANGERS_ETAGE = '49;0;007;ANGERS;;DE;0099;A;01;02;01001;0037; ;01358;7050;RUE;SAINT AUBIN;P - Propriétaire;PBBTTF;453786592;0 - Personnes morales non remarquables ;6540;SCI;LES SEMENCES';
const ANGERS_RDC = '49;0;007;ANGERS;;DE;0099;A;01;00;01002;0037; ;01358;7050;RUE;SAINT AUBIN;P - Propriétaire;PBD3HG;812658128;0 - Personnes morales non remarquables ;6540;SCI;KERMURS';

test('une ligne du fichier devient un local, avec la parcelle au format DVF', () => {
  const l = lireLigne(GAMBETTA_SCI);
  assert.equal(l.siren, '878554161');
  assert.equal(l.insee, '57463');
  assert.equal(l.idu, '57463000310086');
  assert.equal(l.numero, '18');
  assert.equal(l.niveau, '00');
  assert.equal(adresseDe(l), '18 RUE GAMBETTA');
  assert.equal(lireLigne('Département;Code Direction;Code Commune'), null);
  assert.equal(lireLigne(GAMBETTA_SCI.replace('878554161', '')), null);
});

test('la voie de la BAN se reconnaît au fichier, type compris quand les deux le disent', () => {
  assert.equal(voieSansType('Rue Saint-Aubin'), 'SAINT AUBIN');
  assert.equal(voieSansType('En Fournirue'), 'EN FOURNIRUE');
  assert.equal(voieCorrespond('RUE', 'SAINT AUBIN', 'Rue Saint-Aubin'), true);
  assert.equal(voieCorrespond('RUE', 'EN FOURNIRUE', 'En Fournirue'), true);
  assert.equal(voieCorrespond('AV', 'FOCH', 'Avenue Foch'), true);
  // Le boulevard Gambetta n'est pas la rue Gambetta.
  assert.equal(voieCorrespond('RUE', 'GAMBETTA', 'Boulevard Gambetta'), false);
  assert.equal(voieCorrespond('RUE', 'GAMBETTA', 'Rue de la Gare'), false);
});

test('le propriétaire du rez-de-chaussée passe en tête, une société civile avant une banque', () => {
  const p = classerProprietaires([ANGERS_ETAGE, ANGERS_ETAGE.replace('01001', '01003'), ANGERS_RDC].map(lireLigne));
  assert.equal(p[0].nom, 'KERMURS');
  assert.equal(p[0].rdc, true);
  assert.equal(p[1].locaux.length, 2);
  const m = classerProprietaires([GAMBETTA_BANQUE, GAMBETTA_SCI].map(lireLigne));
  assert.equal(m[0].nom, 'SCI BERLIOZ');
});

test('les locaux d\'une société se regroupent en biens, la commune du bien en vente d\'abord', () => {
  const autre = GAMBETTA_SCI.replace('57;0;463;METZ', '78;0;158;LE CHESNAY-ROCQUENCOURT');
  const biens = classerBiens(grouperBiens([autre, GAMBETTA_SCI, FOURNIRUE, FOURNIRUE.replace('02001', '02002')].map(lireLigne)), '57463');
  assert.equal(biens.length, 3);
  assert.equal(biens[0].insee, '57463');
  assert.equal(biens[2].departement, '78');
  const fournirue = biens.find((b) => b.adresse === '44 RUE EN FOURNIRUE');
  assert.equal(fournirue.locaux.length, 2);
  assert.equal(fournirue.rdc, true);
  assert.deepEqual(resumePatrimoine(biens), { biens: 3, locaux: 4, rdc: 3, communes: 2, departements: ['57', '78'] });
});

test('la naissance d\'un dirigeant se cherche sur son mois, et le département se lit au nommage de la DGFiP', () => {
  assert.deepEqual(fenetreNaissance('1986-10'), { min: '1986-10-01', max: '1986-10-31' });
  assert.deepEqual(fenetreNaissance('1984-02'), { min: '1984-02-01', max: '1984-02-29' });
  assert.equal(fenetreNaissance(null), null);
  assert.equal(departementDe('57463'), '57');
  assert.equal(departementDe('2A004'), '2A');
  assert.equal(departementDe('97411'), '974');
});
