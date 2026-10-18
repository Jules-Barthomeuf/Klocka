import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-pm-'));
const M = await import('./socle/imports/personnes-morales.js');
const { grouperProprietaires } = await import('./kfoncier.js');

const ENTETES = 'Département;Code Direction;Code Commune;Nom de la commune;Préfixe;Section;N° plan;Bâtiment;Entrée;Niveau;Porte;N° voirie;Indice de répétition;Code voie MAJIC;Code voie Rivoli;Nature voie;Nom voie;Code droit;N° Majic;N° SIREN;Groupe personne;Forme juridique;Forme juridique abrégée;Dénomination'.split(';');

test('les sections : une lettre devient « 0A », deux restent', () => {
  assert.equal(M.sectionNormale(' A'), '0A');
  assert.equal(M.sectionNormale('KT'), 'KT');
  assert.equal(M.sectionNormale('0a'), '0A');
});

test("une ligne du fichier devient un local, lisible par grouperProprietaires de K-Foncier", () => {
  const l = M.lireLigne('06;0;088;NICE;; LC;0006;A;01;00;91001;0020; ;00074;1234;AV;JEAN MEDECIN;P - Propriétaire;PBX;402313944;0 - Personnes morales non remarquables ;6540;SC;SOCIETE CIVILE NICIM'.split(';'), ENTETES);
  assert.deepEqual([l.commune, l.section, l.plan, l.siren, l.numero, l.denomination], ['06088', 'LC', '0006', '402313944', '20', 'SOCIETE CIVILE NICIM']);
});

test('le répertoire du zip et le fichier du département', () => {
  const nom = Buffer.from('fichier des locaux (situation 2025)/PM_25_B_060.csv');
  const rec = Buffer.alloc(46); rec.writeUInt32LE(0x02014b50, 0); rec.writeUInt16LE(8, 10); rec.writeUInt32LE(4761327, 20); rec.writeUInt32LE(78452947, 24); rec.writeUInt16LE(nom.length, 28); rec.writeUInt32LE(15403668, 42);
  const entrees = M.repertoireZip(Buffer.concat([Buffer.from('xx'), rec, nom]));
  const e = M.fichierDuDepartement(entrees, '06');
  assert.deepEqual([e.offset, e.compresse, e.methode], [15403668, 4761327, 8]);
  assert.equal(M.fichierDuDepartement(entrees, '75'), null);
});

test("sans import, la section n'est pas dans l'entrepôt (null : K-Foncier garde le miroir)", () => {
  assert.equal(M.lignesSection('06088', 'LC'), null);
  assert.equal(typeof grouperProprietaires, 'function');
});
