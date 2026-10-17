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
/** Fait « tourner » les tests sans dossier réel : marque le brouillon comme testé, comme le fait `tester` quand tous ont tourné. */
const { Records } = await import('../db.js');
function require_tests(b) {
  const c = C.lire('loi');
  Records.update('HakaCompetence', c.id, { brouillon: { ...b, tests_pour: C.empreinte(b) } });
}

test('les neuf fiches et la pré-analyse de la spec sont amorcées une fois, publiées en version 1, avec leur en-tête', () => {
  assert.equal(C.amorcer(), 10);
  assert.equal(C.amorcer(), 0);
  const d = C.lire('data-room');
  assert.equal(d.etat, 'publiee');
  assert.ok(d.version >= 1);
  assert.ok(d.outils.some((o) => o.cle === 'documents' && o.obligatoire));
  assert.ok(d.corps.length > 50, 'le corps vient du fichier');
  assert.ok(C.pourDeclencheur('dossier').some((c) => c.cle === 'data-room'));
  assert.ok(!C.pourDeclencheur('dossier').some((c) => c.cle === 'emailing'));
  // La pré-analyse de la spec remplace l'ancienne fiche dans les cartes.
  const pre = C.lire('pre-analyse-fiche');
  assert.equal(pre.version, 1);
  assert.equal(pre.regles.rendement_brut_min, 5);
  assert.match(pre.corps, /Critères éliminatoires/);
  assert.equal(C.lire('preanalyse').desactivee, true);
  assert.ok(C.pourDeclencheur('chat').some((c) => c.cle === 'pre-analyse-fiche'));
  assert.ok(!C.pourDeclencheur('chat').some((c) => c.cle === 'preanalyse'));
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
  // La publication est gardée : format valide, tests tournés sur ce brouillon, note de version.
  assert.equal(C.publier('loi', jules, { note: 'x' }).ok, false);
  C.enregistrerBrouillon('loi', { resume: "Rédige la lettre d'intention d'un acquéreur.", dossiers_test: ['d-un', 'd-deux'], mode_execution: 'temps_reel', destination: 'file' }, jules);
  const avantTest = C.publier('loi', jules, { note: 'Nouvelle recette' });
  assert.equal(avantTest.ok, false);
  assert.match(avantTest.error, /dossiers de test n'ont pas tourné/);
  const brouillon = C.lire('loi').brouillon;
  require_tests(brouillon);
  const p = C.publier('loi', jules, { note: 'Nouvelle recette' });
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
  assert.equal(C.publier('loi', jules, { note: 'encore' }).statut, 400, 'rien à publier deux fois');
  assert.equal(p.competence.versions.at(-1).note, 'Nouvelle recette');
});

test('depuisFichier lit un fichier d\'avant (sans en-tête) comme un corps seul', () => {
  assert.deepEqual(C.depuisFichier('LA LOI\n\n- règle'), { corps: 'LA LOI\n\n- règle' });
  const f = C.versFichier({ cle: 'x', nom: 'X', version: 3, declencheurs: ['chat'], outils: [{ cle: 'web', obligatoire: false }], corps: 'Corps' });
  const r = C.depuisFichier(f);
  assert.equal(r.nom, 'X'); assert.equal(r.version, 3); assert.deepEqual(r.declencheurs, ['chat']); assert.equal(r.corps, 'Corps');
});
