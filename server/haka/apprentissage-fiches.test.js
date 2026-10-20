// Ce que Haka apprend des fiches reçues (20 oct. 2026) : les Oui et les Non, dans les deux sens.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-apprentissage-'));
const { gabarit, verdictAppris } = await import('./apprentissage-fiches.js');

const mail = (de, ...noms) => ({ de_email: de, objet: 'Pour vous', texte: '', pieces_jointes: noms.map((nom) => ({ nom, piece_id: nom })) });
const non = (de, g, categorie = 'pas_une_fiche') => ({ de_email: de, gabarits: [g], choix: 'ignorer', categorie });
const oui = (de, g) => ({ de_email: de, gabarits: [g], choix: 'preanalyser' });

test('le gabarit ignore les chiffres et l\'extension', () => {
  assert.equal(gabarit('Relevé_2026-10.pdf'), 'relevé');
  assert.equal(gabarit('Fiche produit 358147.pdf'), 'fiche produit');
});

test('une pièce refusée comme « pas une fiche » n\'est plus proposée ; acceptée une fois, elle l\'est', () => {
  const m = mail('a@agence.fr', 'Plaquette agence 2026.pdf');
  assert.equal(verdictAppris(m, [non('b@autre.fr', 'plaquette agence')]).proposer, false);
  assert.equal(verdictAppris(m, [non('b@autre.fr', 'plaquette agence'), oui('c@x.fr', 'plaquette agence')]).proposer, null);
  // « Hors critères » ne dit rien de ce qu'est une fiche.
  assert.equal(verdictAppris(m, [non('b@autre.fr', 'plaquette agence', 'hors_criteres')]).proposer, null);
});

test('un expéditeur refusé deux fois n\'est plus proposé, sauf une pièce qui se dit fiche ; accepté, il l\'est toujours', () => {
  const refus = [non('robic@pro.bzh', 'x'), non('robic@pro.bzh', 'y')];
  assert.equal(verdictAppris(mail('robic@pro.bzh', 'scan.pdf'), refus).proposer, false);
  assert.equal(verdictAppris(mail('robic@pro.bzh', 'Fiche Lorient.pdf'), refus).proposer, null);
  assert.equal(verdictAppris(mail('robic@pro.bzh', 'scan.pdf'), [oui('robic@pro.bzh', 'autre')]).proposer, true);
  assert.equal(verdictAppris(mail('robic@pro.bzh'), [oui('robic@pro.bzh', 'autre')]).proposer, null, 'sans pièce, rien');
});
