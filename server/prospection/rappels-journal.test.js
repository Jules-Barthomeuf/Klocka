import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lignesDeRappels } from './suivi-appels.js';

// 26 nov. 2026, Jules : un rappel abandonné vide n'est pas un appel ; il sort du journal. Avec un échange, il reste.
test('le journal ne garde pas les rappels abandonnés vides', () => {
  const rappels = [
    { id: 'a', etat: 'abandonne', par: 'maxime.p@klocka.immo', debut: '2026-11-20T10:00:00Z' },
    { id: 'b', etat: 'abandonne', agent_id: 'ag1', par: 'maxime.p@klocka.immo', debut: '2026-11-20T11:00:00Z' },
    { id: 'c', etat: 'a_identifier', par: 'maxime.p@klocka.immo', debut: '2026-11-20T12:00:00Z' },
    { id: 'd', etat: 'abandonne', par: 'maxime.p@klocka.immo', debut: '2026-11-20T13:00:00Z', notes: 'Il rappelle pour le local' },
  ];
  const ids = lignesDeRappels(rappels, new Set()).map((l) => l.id);
  assert.deepEqual(ids.sort(), ['rappel:b', 'rappel:c', 'rappel:d']);
});

// 26 nov. 2026, Jules : « trois fois 4 min 33 », « des répondeurs de 2 secondes ».
test('les durées recopiées ou impossibles sont lues comme inconnues', async () => {
  const { dureesFiables } = await import('./suivi-appels.js');
  const appels = [
    { id: '1', par: 'm', le: '2026-11-25T10:00:00Z', issue: 'rdv', duree_s: 273 },
    { id: '2', par: 'm', le: '2026-11-25T10:06:00Z', issue: 'pas_de_reponse', duree_s: 273 },
    { id: '3', par: 'm', le: '2026-11-25T10:07:00Z', issue: 'pas_de_reponse', duree_s: 273 },
    { id: '4', par: 'm', le: '2026-11-25T10:09:00Z', issue: 'repondeur', duree_s: 2 },
    { id: '5', par: 'n', le: '2026-11-25T10:10:00Z', issue: 'pas_de_reponse', duree_s: 30 },
  ];
  const d = Object.fromEntries(dureesFiables(appels).map((x) => [x.id, x.duree_s]));
  assert.deepEqual(d, { 1: 273, 2: null, 3: null, 4: null, 5: 30 });
});
