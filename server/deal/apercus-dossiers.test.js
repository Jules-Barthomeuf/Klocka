// Les aperçus en tête de la page Dossiers (14 nov. 2026) : la fiche reçue et deux pièces lisibles de la Data Room.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-apercus-'));
const { apercusDe } = await import('./index.js');

test('la fiche PDF reçue passe devant, deux pièces lisibles derrière', () => {
  const r = apercusDe({
    source: { type: 'pdf', url: '/uploads/fiche.pdf', nom_fichier: 'fiche.pdf' },
    documents_espace: [
      { url: '/uploads/bail.pdf', nom: 'Bail' },
      { url: '/uploads/note.docx', nom: 'Note' },
      { url: '/uploads/blob', mime: 'image/png', nom: 'Plan' },
      { url: '/uploads/dpe.pdf', nom: 'DPE' },
    ],
  });
  assert.deepEqual(r.fiche, { url: '/uploads/fiche.pdf', nom: 'fiche.pdf' });
  assert.deepEqual(r.pieces.map((p) => p.nom), ['Bail', 'Plan']);
  assert.equal(r.nb_pieces, 4);
});

test('un texte collé donne une page de texte, un mail rien', () => {
  const t = apercusDe({ source: { type: 'texte', url: null, texte: '  FICHE COMMERCIALE\nAdresse : 1 rue X  ' } });
  assert.equal(t.fiche, null);
  assert.equal(t.fiche_texte, 'FICHE COMMERCIALE\nAdresse : 1 rue X');
  assert.equal(apercusDe({ source: { type: 'texte', texte: 'x'.repeat(2000) } }).fiche_texte.length, 700);
  assert.equal(apercusDe({ source: { type: 'eml', url: '/uploads/m.eml' } }).fiche, null);
  assert.deepEqual(apercusDe({}), { fiche: null, fiche_texte: null, pieces: [], nb_pieces: 0 });
});

test('une fiche posée pour l\'aperçu passe devant le texte collé', () => {
  const r = apercusDe({ source: { type: 'texte', texte: 'FICHE' }, apercu_fiche: { url: '/uploads/fiche-essai.pdf', nom: 'Fiche' } });
  assert.deepEqual(r.fiche, { url: '/uploads/fiche-essai.pdf', nom: 'Fiche' });
  assert.equal(r.fiche_texte, null);
});
