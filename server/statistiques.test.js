import test from 'node:test';
import assert from 'node:assert/strict';
import { parJourPersonne, parMois } from './statistiques.js';

test('projets entrés et offres faites, mois par mois : ce mois-ci, le mois dernier, rien hors de la fenêtre', () => {
  const r = parMois({
    projets: [{ created_date: '2026-11-03T10:00:00Z' }, { created_date: '2026-11-18T10:00:00Z' }, { created_date: '2026-10-30T10:00:00Z' }, { created_date: '2025-01-01T10:00:00Z' }, { created_date: null }],
    lettres: [{ cree_le: '2026-11-05T10:00:00Z' }, { created_date: '2026-09-02T10:00:00Z' }],
    mois: 3,
    maintenant: new Date('2026-11-20T12:00:00Z'),
  });
  assert.deepEqual(r.mois, [
    { mois: '2026-09', projets: 0, offres: 1 },
    { mois: '2026-10', projets: 1, offres: 0 },
    { mois: '2026-11', projets: 2, offres: 1 },
  ]);
  assert.deepEqual(r.ce_mois, { mois: '2026-11', projets: 2, offres: 1 });
  assert.deepEqual(r.mois_dernier, { mois: '2026-10', projets: 1, offres: 0 });
  assert.deepEqual(r.total, { projets: 5, offres: 2 });
});

test('un mois de janvier remonte bien sur l\'année d\'avant', () => {
  const r = parMois({ mois: 2, maintenant: new Date('2027-01-10T12:00:00Z') });
  assert.deepEqual(r.mois.map((x) => x.mois), ['2026-12', '2027-01']);
});

test('mes statistiques : par jour, la période et celle d\'avant, à la personne seule', () => {
  const r = parJourPersonne({
    email: 'Nora.L@klocka.immo', jours: 3, maintenant: new Date('2026-11-22T10:00:00Z'),
    fiches: [
      { le: '2026-11-22T08:00:00Z', analyste: 'nora.l@klocka.immo', dossier: true },
      { le: '2026-11-20T08:00:00Z', analyste: 'nora.l@klocka.immo' },
      { le: '2026-11-19T08:00:00Z', analyste: 'nora.l@klocka.immo' }, // la période d'avant
      { le: '2026-11-22T08:00:00Z', analyste: 'coralie.g@klocka.immo' },
      { le: '2026-11-21T08:00:00Z', analyste: 'nora.l@klocka.immo', ecartee: true },
      { le: '2026-11-10T08:00:00Z', analyste: 'nora.l@klocka.immo' }, // hors des deux fenêtres
    ],
    projets: [{ created_by: 'nora.l@klocka.immo', created_date: '2026-11-21T09:00:00Z' }],
    presentations: [{ cree_par: 'nora.l@klocka.immo', cree_le: '2026-11-17T09:00:00Z' }],
  });
  assert.deepEqual(r.serie.map((j) => j.jour), ['2026-11-20', '2026-11-21', '2026-11-22']);
  assert.deepEqual(r.serie.map((j) => [j.fiches, j.fiches_avant]), [[1, 0], [0, 0], [1, 1]]);
  assert.deepEqual(r.totaux, { fiches: { actuel: 2, avant: 1 }, dossiers: { actuel: 1, avant: 0 }, projets: { actuel: 1, avant: 0 }, presentations: { actuel: 0, avant: 1 } });
});


test('dossiers étudiés : les nouveaux dossiers créés depuis le lundi, ni test ni essai, un dossier rouvert compte à sa création', async () => {
  const { carteDossiersEntres } = await import('./statistiques.js');
  const deals = [
    { cree_le: '2026-11-23T09:00:00Z' }, { cree_le: '2026-11-24T08:00:00Z' },
    { cree_le: '2026-11-23T10:00:00Z', test: true }, { cree_le: '2026-11-24T10:00:00Z', essai_marche: true },
    // Rouvert cette semaine, créé en octobre : ne compte pas cette semaine.
    { cree_le: '2026-10-02T10:00:00Z', maj_le: '2026-11-24T10:00:00Z' },
    { cree_le: '2026-11-17T10:00:00Z' }, { cree_le: '2026-11-19T10:00:00Z' },
    // Dimanche 22 à 23 h 30 à Paris : encore la semaine du 16.
    { created_date: '2026-11-22T22:30:00Z' },
  ];
  const c = carteDossiersEntres(deals, { aujourdhui: '2026-11-24', n: 2 });
  assert.deepEqual([c.depuis, c.dossiers, c.avant], ['2026-11-23', 2, 1]);
  assert.deepEqual(c.semaines, [{ semaine: '2026-11-16', dossiers: 3 }, { semaine: '2026-11-23', dossiers: 2 }]);
});

test('projets entrés et offres faites : créés depuis le lundi, à leur date de création', async () => {
  const { carteSemaine } = await import('./statistiques.js');
  const c = carteSemaine(['2026-11-23T08:00:00Z', '2026-11-24T16:00:00Z', '2026-11-17T09:00:00Z', '2026-11-20T09:00:00Z', null], { aujourdhui: '2026-11-24', n: 2 });
  assert.deepEqual([c.depuis, c.n, c.avant], ['2026-11-23', 2, 1]);
  assert.deepEqual(c.semaines.map((s) => s.n), [2, 2]);
});

test('mes statistiques : ses fiches dans la Mémoire, ses dossiers créés, à la personne seule', async () => {
  const { parJourPersonne } = await import('./statistiques.js');
  const r = parJourPersonne({
    email: 'maxime.p@klocka.immo', jours: 7, maintenant: new Date('2026-11-24T12:00:00Z'),
    fiches: [{ le: '2026-11-24T09:00:00Z', analyste: 'maxime.p@klocka.immo', dossier: true, biens: 3 }],
    fichesMemoire: [{ le: '2026-11-23', analyste: 'maxime.p@klocka.immo' }, { le: '2026-11-24', analyste: 'maxime.p@klocka.immo' }, { le: '2026-11-24', analyste: 'nora.l@klocka.immo' }],
    dossiersCrees: [{ le: '2026-11-24T08:00:00Z', par: 'maxime.p@klocka.immo' }, { le: '2026-11-24T08:00:00Z', par: 'jules.b@klocka.immo' }],
  });
  assert.equal(r.totaux.fiches.actuel, 2);
  assert.equal(r.totaux.dossiers.actuel, 1);
});

test('les statistiques partent de la semaine du 16 novembre 2026 (24 nov. 2026, Jules)', async () => {
  const { carteSemaine, parJourPersonne: pj, DEBUT_STATISTIQUES } = await import('./statistiques.js');
  assert.equal(DEBUT_STATISTIQUES, '2026-11-16');
  const c = carteSemaine(['2026-11-10T09:00:00Z', '2026-11-17T09:00:00Z'], { aujourdhui: '2026-11-24', n: 8 });
  assert.deepEqual(c.semaines.map((s) => s.semaine), ['2026-11-16', '2026-11-23'], 'aucun bâton avant le 16');
  const p = pj({ email: 'maxime@klocka.immo', jours: 30, maintenant: new Date('2026-11-24T12:00:00Z'), fichesMemoire: [{ analyste: 'maxime@klocka.immo', le: '2026-11-03T10:00:00Z' }, { analyste: 'maxime@klocka.immo', le: '2026-11-18T10:00:00Z' }] });
  assert.equal(p.serie[0].jour, '2026-11-16', 'la courbe commence le 16');
  assert.equal(p.totaux.fiches.actuel, 1);
  assert.equal(p.totaux.fiches.avant, 0, 'rien d’avant le 16 ne compte');
});
