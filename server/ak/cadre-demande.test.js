// Les réglages d'une demande de l'Accueil : sources choisies, répondre ou produire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cadreDemande } from './cadre-demande.js';

test('rien de réglé : rien d\'ajouté', () => {
  assert.equal(cadreDemande(null), '');
  assert.equal(cadreDemande({ page: 'dossiers' }), '');
  assert.equal(cadreDemande({ sortie: 'autre', sources: [] }), '');
});

test('les sources cochées bornent la recherche ; produire demande un livrable', () => {
  const t = cadreDemande({ sources: [{ cle: 'documents', nom: 'Documents du dossier' }, 'DVF'], sortie: 'produire' });
  assert.match(t, /SOURCES CHOISIES PAR LA PERSONNE : Documents du dossier, DVF\./);
  assert.match(t, /n'appelle aucun autre outil/);
  assert.match(t, /VEUT UN LIVRABLE/);
  assert.doesNotMatch(t, /RÉPONSE DANS LA CONVERSATION/);
});

test('répondre : une réponse, pas de document', () => {
  assert.match(cadreDemande({ sortie: 'repondre' }), /Ne crée ni ne modifie de document/);
  assert.equal(cadreDemande({ sources: ['a\nb'.repeat(1)] }).includes('\nb'), false);
});
