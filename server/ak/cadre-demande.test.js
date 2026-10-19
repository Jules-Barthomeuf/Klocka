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
  // Un programme dit à Haka : une réponse et une question, rien de lancé (19 oct. 2026).
  assert.match(cadreDemande({ sortie: 'repondre' }), /ne lance rien.*demande ce qu'elle veut faire maintenant.*rappel/s);
  assert.doesNotMatch(cadreDemande({ sortie: 'produire' }), /ne lance rien/);
  assert.equal(cadreDemande({ sources: ['a\nb'.repeat(1)] }).includes('\nb'), false);
});

test('une compétence choisie : sa méthode fait foi, et les sources éteintes sont dites dans le livrable', () => {
  const t = cadreDemande({ sources_eteintes: [{ cle: 'dvf', nom: 'DVF' }] }, { competence: { nom: "Pré-analyse d'une fiche", texte: '1. Lire la fiche.' } });
  assert.match(t, /COMPÉTENCE « Pré-analyse d'une fiche »/);
  assert.match(t, /1\. Lire la fiche\./);
  assert.match(t, /SOURCES ÉTEINTES POUR CE LANCEMENT : DVF/);
  assert.match(t, /analyse faite sans DVF/);
  assert.equal(cadreDemande({ sources_eteintes: ['DVF'] }, { competence: null }), '', 'sans compétence, rien à dire des sources éteintes');
});

test('Paramètres > Haka : la longueur et les tableaux de la personne entrent dans le cadre', () => {
  assert.match(cadreDemande({ haka: { longueur: 'tres_courte', tableaux: 'jamais' } }), /TRÈS COURTES[\s\S]*PAS DE TABLEAU/);
  // Une ou deux lignes (19 oct. 2026) : la consigne la plus courte, et elle seule.
  assert.match(cadreDemande({ haka: { longueur: 'deux_lignes' } }), /UNE OU DEUX LIGNES AU PLUS/);
  assert.doesNotMatch(cadreDemande({ haka: { longueur: 'deux_lignes' } }), /TRÈS COURTES/);
  assert.match(cadreDemande({ haka: { longueur: 'detaillee' } }), /PLUS DÉTAILLÉES/);
  // « Courtes » est la consigne de base : rien à ajouter.
  assert.equal(cadreDemande({ haka: { longueur: 'courte', tableaux: 'utiles' } }), '');
});
