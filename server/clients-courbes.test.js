import test from 'node:test';
import assert from 'node:assert/strict';
import { courbesClients, sessions, LECTURE_MS } from './clients-courbes.js';

const M = 60000;

test("les pages à moins de 30 minutes font une session ; plus d'une minute pour lire la dernière", () => {
  const s = sessions(['2026-10-18T10:00:00Z', '2026-10-18T10:20:00Z', '2026-10-18T10:45:00Z', '2026-10-18T12:00:00Z']);
  assert.equal(s.length, 2);
  assert.equal(s[0].duree_ms, 45 * M + LECTURE_MS);
  assert.equal(s[1].duree_ms, LECTURE_MS);
});

test("les courbes : comptes cumulés, déjà connectés, minutes par jour ; l'équipe et les mandataires ne comptent pas", () => {
  const maintenant = new Date('2026-10-18T15:00:00Z');
  const users = [
    { email: 'a@x.fr', role: 'user', cree_le: '2026-10-10T09:00:00Z' },
    { email: 'b@x.fr', role: 'user', cree_le: '2026-10-17T09:00:00Z' },
    { email: 'jules@klocka.immo', role: 'admin', cree_le: '2026-10-01T09:00:00Z' },
    { email: 'm@kp.fr', role: 'mandataire', cree_le: '2026-10-01T09:00:00Z' },
  ];
  const visites = [
    { par: 'a@x.fr', le: '2026-10-17T08:00:00Z' }, { par: 'a@x.fr', le: '2026-10-17T08:09:00Z' },
    { par: 'b@x.fr', le: '2026-10-18T08:00:00Z' },
    { par: 'jules@klocka.immo', le: '2026-10-18T08:00:00Z' }, { par: 'm@kp.fr', le: '2026-10-18T08:00:00Z' },
  ];
  const r = courbesClients({ users, visites, jours: 30, maintenant });
  assert.equal(r.serie.length, 30);
  const j17 = r.serie.find((x) => x.jour === '2026-10-17');
  const j18 = r.serie.at(-1);
  assert.equal(j18.jour, '2026-10-18');
  assert.deepEqual([j17.comptes, j17.deja_connectes, j17.minutes, j17.connectes, j17.moyenne], [2, 1, 10, 1, 10]);
  assert.deepEqual([j18.comptes, j18.deja_connectes, j18.minutes, j18.connectes], [2, 2, 1, 1]);
  assert.equal(r.serie.find((x) => x.jour === '2026-10-09').comptes, 0);
  assert.deepEqual(r.totaux, { comptes: 2, nouveaux: 2, deja_connectes: 2, connectes: 2, minutes: 11, moyenne: 6 });
});
