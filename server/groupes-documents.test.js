import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTRES_DOCUMENTS, GROUPES_PAR_DEFAUT, documentsParGroupe, groupesDuProjet } from '../src/lib/groupes-documents.js';
import { piecesDuProjet } from './deal/projet.js';

test('sans liste posée, les parties par défaut, puis celles que portent les pièces', () => {
  const p = { fichiers_projet: [{ nom: 'a', groupe: 'Plans' }, { nom: 'b', groupe: 'Bail' }] };
  assert.deepEqual(groupesDuProjet(p), [...GROUPES_PAR_DEFAUT, 'Plans']);
});

test('la liste du projet fait foi pour l\'ordre et les parties vides', () => {
  const p = { groupes_documents: ['Quittances', 'Vide'], fichiers_projet: [{ nom: 'q', groupe: 'Quittances' }] };
  const parties = documentsParGroupe(p);
  assert.deepEqual(parties.map((x) => x.nom), ['Quittances', 'Vide']);
  assert.equal(parties[0].fichiers[0].idx, 0);
});

test('une pièce sans partie va dans « Autres documents », en dernier', () => {
  const p = { groupes_documents: ['Bail'], fichiers_projet: [{ nom: 'x' }, { nom: 'y', groupe: 'Bail' }] };
  const parties = documentsParGroupe(p);
  assert.deepEqual(parties.map((x) => [x.nom, x.fichiers.map((f) => f.idx)]), [['Bail', [1]], [AUTRES_DOCUMENTS, [0]]]);
  assert.equal(parties[1].autres, true);
});

test('les pièces de l\'Analyse arrivent dans leur partie', () => {
  const analyse = { emplacements: [
    { id: 'avenants', titre: 'Avenants', documents: [{ nom: 'av.pdf', url: '/uploads/av.pdf' }] },
    { id: 'pv_ag', titre: "PV d'AG", documents: [{ nom: 'pv.pdf', url: '/uploads/pv.pdf' }] },
    { id: 'fiche', titre: 'Fiche du bien', documents: [{ nom: 'f.pdf', url: '/uploads/f.pdf' }] },
  ] };
  assert.deepEqual(piecesDuProjet(analyse).fichiers_projet.map((f) => f.groupe), ['Bail', "PV d'AG"]);
});
