import test from 'node:test';
import assert from 'node:assert/strict';
import { cleVille, villeDeLAdresse, sortiesParVille, villeProposee } from './tableau-de-bord.js';

test('cleVille rapproche les écritures d\'une même ville', () => {
  assert.equal(cleVille('Paris 4e Arrondissement'), 'paris');
  assert.equal(cleVille('LYON'), 'lyon');
  assert.equal(cleVille('Saint-Étienne'), 'saint etienne');
  assert.equal(cleVille(''), '');
});

test('villeDeLAdresse lit la ville d\'une adresse écrite', () => {
  assert.equal(villeDeLAdresse('12 rue de la République, 69002 Lyon'), 'Lyon');
  assert.equal(villeDeLAdresse('48 rue de Rivoli, 75004 Paris'), 'Paris');
  assert.equal(villeDeLAdresse('3 Av. de la Gare, Firminy'), 'Firminy');
  assert.equal(villeDeLAdresse('5 Place de la Libération Lorient'), 'Lorient');
  assert.equal(villeDeLAdresse(''), null);
});

test('sortiesParVille compte les dossiers et projets du mois, par ville', () => {
  const depuis = '2026-11-01T00:00:00.000Z';
  const s = sortiesParVille({
    dossiers: [
      { deal_id: 'a', titre: 'A', cree_le: '2026-11-03T10:00:00Z', lots: [{ ville: 'Bordeaux' }] },
      { deal_id: 'b', titre: 'B', cree_le: '2026-11-05T10:00:00Z', lots: [{ ville: 'BORDEAUX' }] },
      { deal_id: 'c', titre: 'C', cree_le: '2026-10-20T10:00:00Z', lots: [{ ville: 'Bordeaux' }] },
      { deal_id: 'd', titre: 'D', cree_le: '2026-11-06T10:00:00Z', lots: [{ ville: 'Nice' }], test: true },
    ],
    projets: [{ id: 'p', titre: 'P', created_date: '2026-11-07T10:00:00Z', adresse_complete: '1 rue X, 06000 Nice' }],
  }, depuis);
  assert.deepEqual(s.map((x) => [x.ville, x.dossiers, x.projets]), [['Bordeaux', 2, 0], ['Nice', 0, 1]]);
});

test('villeProposee : là où sortent les dossiers, sinon la liste la moins avancée', () => {
  const villes = [
    { id: '1', ville: 'Bordeaux', agences: 100, fait_pourcent: 40 },
    { id: '2', ville: 'Nice', agences: 80, fait_pourcent: 10 },
    { id: '3', ville: 'Lille', agences: 50, fait_pourcent: 100 },
  ];
  assert.equal(villeProposee(villes, [{ ville: 'Bordeaux', total: 3 }, { ville: 'Nice', total: 1 }]).ville, 'Bordeaux');
  assert.equal(villeProposee(villes, [{ ville: 'Lille', total: 5 }]).ville, 'Nice');
  const sansListe = villeProposee(villes, [{ ville: 'Rennes', total: 2 }]);
  assert.equal(sansListe.ville, 'Rennes');
  assert.equal(sansListe.liste_id, null);
  assert.equal(villeProposee(villes, []).ville, 'Nice');
  assert.equal(villeProposee([], []), null);
});
