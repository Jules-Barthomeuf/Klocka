import test from 'node:test';
import assert from 'node:assert/strict';
import { idDrive, fichierDepose, piecesDeclarees } from './pieces-projet.js';

test('idDrive lit les adresses Drive usuelles', () => {
  assert.equal(idDrive('https://drive.google.com/file/d/1OC9C1joAbB7jd-mi9CZSYD22aSX-yMk-/view?usp=sharing'), '1OC9C1joAbB7jd-mi9CZSYD22aSX-yMk-');
  assert.equal(idDrive('https://drive.google.com/open?id=1K7L2JxTvn1whPAeytbGT22WjU7SnrgPB'), '1K7L2JxTvn1whPAeytbGT22WjU7SnrgPB');
  assert.equal(idDrive('https://docs.google.com/document/d/1AQekz4x2yloVbmeiwBEyOOfBDnzEsfXS/edit'), '1AQekz4x2yloVbmeiwBEyOOfBDnzEsfXS');
  assert.equal(idDrive('https://exemple.fr/file/d/1AQekz4x2yloVbmeiwBEyOOfBDnzEsfXS'), null);
  assert.equal(idDrive(''), null);
});

test('fichierDepose ne reconnaît que les dépôts de la plateforme', () => {
  assert.equal(fichierDepose('/uploads/1788-bail.pdf'), '1788-bail.pdf');
  assert.equal(fichierDepose('/uploads/../.env'), null);
  assert.equal(fichierDepose('https://site.fr/uploads/a.pdf'), null);
});

test('piecesDeclarees : Drive et dépôts se joignent, le reste reste un lien, sans doublon', () => {
  const projet = {
    fichiers_projet: [
      { nom: 'Bail commercial (2003)', url: 'https://drive.google.com/file/d/1K7L2JxTvn1whPAeytbGT22WjU7SnrgPB/view' },
      { nom: 'Bail (copie)', url: 'https://drive.google.com/file/d/1K7L2JxTvn1whPAeytbGT22WjU7SnrgPB/view?usp=sharing' },
      { nom: 'Plan', url: '/uploads/plan.pdf' },
      { nom: 'Annonce', url: 'https://www.leboncoin.fr/ad/123' },
    ],
  };
  const p = piecesDeclarees(projet);
  assert.deepEqual(p.map((x) => [x.id, x.joignable]), [
    ['drive:1K7L2JxTvn1whPAeytbGT22WjU7SnrgPB', true],
    ['upload:plan.pdf', true],
    [null, false],
  ]);
  assert.equal(p[0].nom, 'Bail commercial (2003)');
  assert.deepEqual(piecesDeclarees({}), []);
});
