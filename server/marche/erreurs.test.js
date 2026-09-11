// Ce que vaut une erreur : c'est de cette lecture que dépend tout le reste.
// Les messages testés ici ne sont pas inventés — ce sont ceux que data-b.js,
// equimmox.js et figaro.js écrivent réellement aujourd'hui.

import test from 'node:test';
import assert from 'node:assert/strict';
import { classer, ErreurSource, statutDe, TEMPORAIRE, DEFINITIVE, SANS_DONNEE } from './erreurs.js';

const CAS = [
  // Des pannes : le service reviendra.
  ['Data-B a répondu 502.', TEMPORAIRE],
  ['Data-B a répondu 503.', TEMPORAIRE],
  ['Le Figaro a répondu 504.', TEMPORAIRE],
  ['Data-B ne répond pas comme attendu (pas de session).', TEMPORAIRE],
  ['Equimmox : le menu Analyse est introuvable.', TEMPORAIRE],
  ['Equimmox : impossible de régler le rayon à 500 m.', TEMPORAIRE],
  ["Data-B n'accepte qu'une session à la fois : quelqu'un est connecté au même compte.", TEMPORAIRE],
  // Des murs : réessayer ne servirait à rien.
  ['Connexion à Data-B refusée (identifiants refusés).', DEFINITIVE],
  ['Connexion à Data-B refusée (compte suspendu).', DEFINITIVE],
  ['Connexion à Equimmox refusée : vérifiez le compte dans .env.', DEFINITIVE],
  ["Equimmox n'est pas configuré : EQUIMMOX_EMAIL et EQUIMMOX_MOT_DE_PASSE manquent dans .env.", DEFINITIVE],
  ['Equimmox : « Analyse de loyer » est introuvable (plan Premium ?).', DEFINITIVE],
  ["Data-B refuse la session : vérifiez le compte dans .env.", DEFINITIVE],
  ["Equimmox a besoin d'un navigateur, et le serveur n'en a pas.", DEFINITIVE],
  // Des absences : le service marche, il n'a rien sur cette adresse.
  ["Equimmox n'a rendu aucune fourchette pour cette adresse.", SANS_DONNEE],
  ['Le Figaro ne publie pas de prix pour Trifouillis-les-Oies.', SANS_DONNEE],
  ["Adresse introuvable dans la Base Adresse Nationale : « zzz ».", SANS_DONNEE],
  ['Aucune transaction de fonds trouvée autour de cette adresse.', SANS_DONNEE],
  ['Commune non identifiée : le code INSEE manque.', SANS_DONNEE],
  ["Data-B n'a pas rendu d'estimation pour cette adresse.", SANS_DONNEE],
];

test('chaque message des scrapers tombe dans la bonne classe', () => {
  for (const [message, attendu] of CAS) {
    assert.equal(classer(new Error(message)).classe, attendu, message);
  }
});

test('le statut HTTP prime sur le texte', () => {
  const e = new ErreurSource('Equimmox : le menu Analyse est introuvable.', { statut: 502 });
  const v = classer(e);
  assert.equal(v.classe, TEMPORAIRE);
  assert.equal(v.statut, 502);
});

test('un 403 est un mur, un 404 une absence', () => {
  assert.equal(classer(new ErreurSource('Refusé', { statut: 403 })).classe, DEFINITIVE);
  assert.equal(classer(new ErreurSource('Rien ici', { statut: 404 })).classe, SANS_DONNEE);
});

test('la classe portée par le connecteur prime sur tout', () => {
  const e = new ErreurSource('Data-B a répondu 502.', { classe: DEFINITIVE });
  assert.equal(classer(e).classe, DEFINITIVE);
});

test('le statut se lit dans le message quand il n’est pas porté', () => {
  assert.equal(statutDe(new Error('Le Figaro a répondu 429.')), 429);
  assert.equal(statutDe(new Error('rien à voir')), null);
});

test('une coupure réseau est une panne', () => {
  const e = new Error('fetch failed');
  e.cause = { code: 'ECONNRESET' };
  assert.equal(classer(e).classe, TEMPORAIRE);
  const t = new Error('Timeout 30000ms exceeded');
  t.name = 'TimeoutError';
  assert.equal(classer(t).classe, TEMPORAIRE);
});

test('une erreur inconnue est réessayée, mais signalée comme non reconnue', () => {
  const v = classer(new Error('Boum inattendu depuis les tréfonds.'));
  assert.equal(v.classe, TEMPORAIRE);
  assert.equal(v.reconnue, false);
});
