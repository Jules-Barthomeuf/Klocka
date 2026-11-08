// Un PDF qui réunit plusieurs documents se découpe (6 nov. 2026, banc d'import, S07).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { documentsDuPdf, titreDeLaPage, decouperSiPlusieurs } from './decouper-pdf.js';

test('le haut de chaque page dit quel document il ouvre', () => {
  assert.equal(titreDeLaPage('BAIL COMMERCIAL\nSoumis aux articles L.145-1').nature, 'bail');
  assert.equal(titreDeLaPage("Avis d'imposition — taxe foncière\nAVIS DE TAXES FONCIÈRES 2024").nature, 'taxe_fonciere');
  assert.equal(titreDeLaPage('ARTICLE 10 — CLAUSE RÉSOLUTOIRE'), null);
});

test('bail sur deux pages puis taxe foncière : deux documents ; un seul document ne se découpe pas', () => {
  const d = documentsDuPdf(['BAIL COMMERCIAL\n…', 'ARTICLE 10 — CLAUSE', "Avis d'imposition\nAVIS DE TAXES FONCIÈRES 2024"]);
  assert.deepEqual(d.map((x) => [x.nature, x.debut, x.fin]), [['bail', 0, 1], ['taxe_fonciere', 2, 2]]);
  assert.deepEqual(documentsDuPdf(['BAIL COMMERCIAL', 'ARTICLE 9', 'ARTICLE 10']), []);
  assert.deepEqual(documentsDuPdf(['Quittance de loyer — Juillet', 'Quittance de loyer — Août']), [], 'trois quittances à la suite : un seul document');
});

test('le scan du jeu de test se découpe en un bail et une taxe foncière 2024', async (t) => {
  const source = path.join(os.homedir(), 'Downloads/Jeu_test_import_KP/S07_Cannes_Institut_dossier_en_vrac/scan_docs_Giraud.pdf');
  if (!fs.existsSync(source)) return t.skip('jeu de test absent');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-decoupe-'));
  const copie = path.join(dir, 'scan.pdf');
  fs.copyFileSync(source, copie);
  const parts = await decouperSiPlusieurs({ nom: 'scan_docs_Giraud.pdf', chemin: copie });
  assert.deepEqual(parts.map((p) => p.nom), ['Bail commercial.pdf', 'Taxe foncière 2024.pdf']);
  assert.ok(parts.every((p) => fs.existsSync(p.chemin) && fs.statSync(p.chemin).size > 500));
});
