// Le filtre des clients Monday, contre une page telle que lireTableau() la
// rend vraiment (id, nom, colonnes en texte affiché).
//
// C'est la demande exacte de l'équipe : « aille chercher sur Monday
// exclusivement dans clients en cours en excluant les clients en Stand-by et
// clients signés ». Testé sans jeton Monday : clientsDe() est pure.

import test from 'node:test';
import assert from 'node:assert/strict';
import { clientsDe } from './clients.js';

const ligne = (nom, statut, colonnes = {}) => ({
  id: nom,
  nom,
  colonnes: {
    status1: statut,
    numeric_mkv6khwn: '',
    numeric_mkv27he0: '',
    numeric_mkv24e64: '',
    text_mkzm6pdz: '',
    color_mkzm7em7: '',
    ...colonnes,
  },
});

test('les statuts en cours passent, les Stand-by et signés sont exclus', () => {
  const lignes = [
    ligne('Recherche en cours', 'Recherche'),
    ligne('Vient de décider', 'Intérêt'),
    ligne('Stratégie', 'Def Strategie'),
    ligne('En négo', 'Négociation'),
    ligne('Finance', 'Financement'),
    ligne('Compromis signé', 'Compromis'),
    ligne('En pause', 'Stand-by'),
    ligne('Ne cherche plus', 'Abandonné'),
    ligne('Projet conclu', 'Projet Signé'),
    ligne('Mandat conclu', 'Mandat signé'),
  ];
  const noms = clientsDe(lignes).map((c) => c.nom);
  assert.deepEqual(noms, ['Recherche en cours', 'Vient de décider', 'Stratégie', 'En négo', 'Finance', 'Compromis signé']);
  assert.ok(!noms.includes('En pause'));
  assert.ok(!noms.includes('Ne cherche plus'));
  assert.ok(!noms.includes('Projet conclu'), 'un projet déjà signé ne doit plus être démarché');
  assert.ok(!noms.includes('Mandat conclu'));
});

test('le budget se lit malgré le formatage Monday', () => {
  const lignes = [
    ligne('A', 'Recherche', { numeric_mkv6khwn: '350 000' }),
    ligne('B', 'Recherche', { numeric_mkv6khwn: '350000' }),
    ligne('C', 'Recherche', { numeric_mkv6khwn: '' }),
    ligne('D', 'Recherche', { numeric_mkv6khwn: '0' }),
  ];
  const c = clientsDe(lignes);
  assert.equal(c[0].budget, 350000);
  assert.equal(c[1].budget, 350000);
  assert.equal(c[2].budget, null);
  assert.equal(c[3].budget, null, 'un budget à zéro vaut inconnu, pas gratuit');
});

test('un statut absent ou inconnu du tableau n’est pas exclu par erreur', () => {
  // Un statut qui n'existe pas dans HORS_JEU passe : seuls ces quatre-là
  // arrêtent le démarchage, pas une valeur imprévue.
  const c = clientsDe([ligne('Sans statut', '')]);
  assert.equal(c.length, 1);
});

test('aucune ligne ne fait une liste vide, pas une erreur', () => {
  assert.deepEqual(clientsDe([]), []);
  assert.deepEqual(clientsDe(null), []);
  assert.deepEqual(clientsDe(undefined), []);
});
