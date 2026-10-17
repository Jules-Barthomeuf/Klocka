// Haka : les compétences. L'amorçage depuis les fiches, le brouillon qui ne
// s'applique pas, la publication qui fait une version et exporte, la lecture par AK.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-comp-'));
process.env.HAKA_EXPORT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-haka-export-'));
const C = await import('./competences.js');
const jules = { email: 'jules@test.local', role: 'admin' };

test('les neuf fiches sont amorcées une fois, publiées en version 1, avec leur en-tête', () => {
  assert.equal(C.amorcer(), 9);
  assert.equal(C.amorcer(), 0);
  const d = C.lire('data-room');
  assert.equal(d.etat, 'publiee');
  assert.ok(d.version >= 1);
  assert.ok(d.outils.some((o) => o.cle === 'documents' && o.obligatoire));
  assert.ok(d.corps.length > 50, 'le corps vient du fichier');
  assert.ok(C.pourDeclencheur('dossier').some((c) => c.cle === 'data-room'));
  assert.ok(!C.pourDeclencheur('dossier').some((c) => c.cle === 'emailing'));
});

test('un brouillon ne change pas ce qu\'AK lit ; publier fait une version, exporte, et AK la lit', () => {
  const avant = C.pourAK('loi');
  assert.match(avant, /^RÉDIGER UNE LOI/);
  const r = C.enregistrerBrouillon('loi', { corps: 'Nouvelle recette de la LOI.', outils: ['dossiers', { cle: 'modele_klocka', obligatoire: true }, 'inconnu'], declencheurs: ['chat', 'dossier', 'nimporte'], entrees: 'Le prix\nL\'apport\n' }, jules);
  assert.equal(r.ok, true);
  assert.equal(C.pourAK('loi'), avant, 'le brouillon ne s\'applique pas');
  const b = C.lire('loi').brouillon;
  assert.deepEqual(b.outils, [{ cle: 'dossiers', obligatoire: false }, { cle: 'modele_klocka', obligatoire: true }]);
  assert.deepEqual(b.declencheurs, ['chat', 'dossier']);
  assert.deepEqual(b.entrees, ['Le prix', "L'apport"]);
  const v = C.lire('loi').version;
  const p = C.publier('loi', jules);
  assert.equal(p.ok, true);
  assert.equal(p.competence.version, v + 1);
  assert.equal(p.competence.brouillon, null);
  assert.equal(p.competence.par, 'jules@test.local');
  assert.equal(p.competence.versions.at(-1).version, v + 1);
  assert.match(C.pourAK('loi'), /Nouvelle recette de la LOI/);
  assert.match(C.pourAK('loi'), /modele_klocka \(obligatoire\)/);
  // Exporté dans le dépôt, relisible.
  assert.equal(p.exporte.ok, true);
  const texte = fs.readFileSync(path.join(process.env.HAKA_EXPORT_DIR, 'loi.md'), 'utf8');
  const relu = C.depuisFichier(texte);
  assert.equal(relu.version, v + 1);
  assert.equal(relu.corps, 'Nouvelle recette de la LOI.');
  assert.equal(C.publier('loi', jules).statut, 400, 'rien à publier deux fois');
});

test('depuisFichier lit un fichier d\'avant (sans en-tête) comme un corps seul', () => {
  assert.deepEqual(C.depuisFichier('LA LOI\n\n- règle'), { corps: 'LA LOI\n\n- règle' });
  const f = C.versFichier({ cle: 'x', nom: 'X', version: 3, declencheurs: ['chat'], outils: [{ cle: 'web', obligatoire: false }], corps: 'Corps' });
  const r = C.depuisFichier(f);
  assert.equal(r.nom, 'X'); assert.equal(r.version, 3); assert.deepEqual(r.declencheurs, ['chat']); assert.equal(r.corps, 'Corps');
});
