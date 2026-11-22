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

