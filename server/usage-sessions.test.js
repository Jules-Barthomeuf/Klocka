import test from 'node:test';
import assert from 'node:assert/strict';
import { decouperSessions, syntheseUsage, sessionsDePersonne } from './usage-sessions.js';
import { LECTURE_MS } from './clients-courbes.js';

const M = 60000;
const v = (page, le, par = 'maxime@klocka.immo') => ({ page, le, par, role: 'user' });

test('une pause de plus de 30 minutes coupe la session ; le temps sur une page va jusqu à la suivante', () => {
  const s = decouperSessions([v('Analyse', '2026-10-17T10:10:00Z'), v('Dashboard', '2026-10-17T10:00:00Z'), v('Prospection', '2026-10-17T11:30:00Z')]);
  assert.equal(s.length, 2);
  assert.deepEqual(s[0].pages.map((p) => p.page), ['Dashboard', 'Analyse']);
  assert.equal(s[0].pages[0].duree_ms, 10 * M);
  // Sans battement, la dernière page compte une minute, estimée.
  assert.equal(s[0].pages[1].duree_ms, LECTURE_MS);
  assert.equal(s[0].pages[1].estimee, true);
  assert.equal(s[0].duree_ms, 10 * M + LECTURE_MS);
});

test('le battement du navigateur mesure la dernière page, sans déborder sur la session suivante', () => {
  const pages = [v('Dashboard', '2026-10-17T10:00:00Z'), v('Analyse', '2026-10-17T10:05:00Z'), v('Prospection', '2026-10-17T11:00:00Z')];
  const s = decouperSessions(pages, [{ debut: '2026-10-17T10:00:00Z', fin: '2026-10-17T10:25:00Z' }]);
  assert.equal(s[0].pages[1].duree_ms, 20 * M);
  assert.equal(s[0].pages[1].estimee, false);
  // Un onglet resté ouvert des heures : 30 minutes au plus.
  const long = decouperSessions([v('Analyse', '2026-10-17T10:00:00Z')], [{ debut: '2026-10-17T09:59:00Z', fin: '2026-10-17T14:00:00Z' }]);
  assert.equal(long[0].duree_ms, 30 * M);
});

test('un doublon du navigateur (même page en moins de deux secondes) ne compte qu une fois', () => {
  const s = decouperSessions([v('Analyse', '2026-10-17T10:00:00.000Z'), v('Analyse', '2026-10-17T10:00:00.400Z')]);
  assert.equal(s[0].pages.length, 1);
});

test('une redirection (page quittée en moins d une seconde) disparaît', () => {
  const s = decouperSessions([v('Prospection', '2026-10-17T10:00:00.000Z'), v('Dashboard', '2026-10-17T10:00:00.080Z')]);
  assert.deepEqual(s[0].pages.map((p) => p.page), ['Dashboard']);
});

test('le tableau par personne : pages, dernière session, connexions sur 7 et 30 jours, admins compris', () => {
  const maintenant = new Date('2026-10-19T12:00:00Z');
  const visites = [
    v('Dashboard', '2026-09-25T09:00:00Z'),
    v('Dashboard', '2026-10-17T14:00:00Z'), v('Analyse', '2026-10-17T14:04:00Z'), v('Prospection', '2026-10-17T14:10:00Z'),
    { page: 'Suivi', le: '2026-10-19T08:00:00Z', par: 'jules@klocka.immo', role: 'admin' },
  ];
  const users = [{ email: 'Maxime@klocka.immo', full_name: 'Maxime P.', role: 'user' }, { email: 'jules@klocka.immo', role: 'admin' }];
  const r = syntheseUsage({ visites, users, jours: 7, maintenant });
  assert.equal(r.personnes.length, 2);
  const maxime = r.personnes.find((p) => p.email === 'maxime@klocka.immo');
  assert.equal(maxime.nom, 'Maxime P.');
  assert.equal(maxime.pages, 3);
  assert.equal(maxime.pages_derniere, 3);
  assert.equal(maxime.sessions_7j, 1);
  assert.equal(maxime.sessions_30j, 2);
  assert.equal(maxime.duree_moyenne_ms, 10 * M + LECTURE_MS);
  assert.equal(r.personnes.find((p) => p.email === 'jules@klocka.immo').role, 'admin');
  assert.equal(r.totaux.sessions, 2);
  assert.equal(r.serie.length, 7);
  // Le temps classe les pages : Analyse (6 min) devant Dashboard (4 min).
  assert.deepEqual(r.pages.slice(0, 2).map((p) => p.page), ['Analyse', 'Dashboard']);
});

test('les sessions d une personne, la plus récente d abord', () => {
  const r = sessionsDePersonne({ email: 'MAXIME@klocka.immo', visites: [v('Dashboard', '2026-10-10T09:00:00Z'), v('Analyse', '2026-10-17T14:00:00Z'), v('Analyse', '2026-10-17T14:00:00Z', 'autre@x.fr')] });
  assert.equal(r.total, 2);
  assert.equal(r.sessions[0].pages[0].page, 'Analyse');
});
