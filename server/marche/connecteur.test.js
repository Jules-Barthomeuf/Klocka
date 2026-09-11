// Le moteur de réessai. On lui donne une attente factice : les tests
// vérifient les délais demandés, ils ne les subissent pas.

import test from 'node:test';
import assert from 'node:assert/strict';
import { tenter, ATTENTES_MS } from './connecteur.js';
import { ErreurSource, DEFINITIVE, SANS_DONNEE } from './erreurs.js';

/** Une attente qui note ce qu'on lui demande au lieu de dormir. */
function attenteFactice() {
  const demandees = [];
  return { demandees, patienter: async (ms) => { demandees.push(ms); } };
}

const source = (lire) => ({ cle: 'source-test', service: 'Test', lire });

test('un 502 est réessayé trois fois, à 5 s puis 15 s puis 45 s', async () => {
  const { demandees, patienter } = attenteFactice();
  let appels = 0;
  const r = await tenter(
    source(async () => { appels++; throw new ErreurSource('Le service a répondu 502.', { statut: 502 }); }),
    {},
    { patienter }
  );
  assert.equal(r.ok, false);
  assert.equal(appels, 4, 'un essai, puis trois réessais');
  assert.deepEqual(demandees, ATTENTES_MS);
  assert.deepEqual(demandees, [5000, 15000, 45000]);
  assert.equal(r.tentatives.length, 4);
  assert.deepEqual(r.tentatives.map((t) => t.essai), [1, 2, 3, 4]);
});

test('une panne qui se répare est rattrapée sans aller au bout des essais', async () => {
  const { demandees, patienter } = attenteFactice();
  let appels = 0;
  const r = await tenter(
    source(async () => {
      appels++;
      if (appels < 3) throw new ErreurSource('Le service a répondu 503.', { statut: 503 });
      return { valeur: 42 };
    }),
    {},
    { patienter }
  );
  assert.equal(r.ok, true);
  assert.deepEqual(r.resultat, { valeur: 42 });
  assert.equal(appels, 3);
  assert.deepEqual(demandees, [5000, 15000], 'on n’attend pas après le succès');
  assert.equal(r.tentatives.at(-1).ok, true);
});

test('des identifiants refusés ne sont jamais réessayés', async () => {
  const { demandees, patienter } = attenteFactice();
  let appels = 0;
  const r = await tenter(
    source(async () => { appels++; throw new Error('Connexion à Data-B refusée (identifiants refusés).'); }),
    {},
    { patienter }
  );
  assert.equal(appels, 1);
  assert.deepEqual(demandees, []);
  assert.equal(r.classe, DEFINITIVE);
});

test('une absence de donnée ne se réessaie pas non plus', async () => {
  const { demandees, patienter } = attenteFactice();
  let appels = 0;
  const r = await tenter(
    source(async () => { appels++; throw new Error('Le Figaro ne publie pas de prix pour cette commune.'); }),
    {},
    { patienter }
  );
  assert.equal(appels, 1);
  assert.deepEqual(demandees, []);
  assert.equal(r.classe, SANS_DONNEE);
});

test('chaque tentative est datée, chronométrée et motivée', async () => {
  let t = 1000;
  const r = await tenter(
    source(async () => { t += 250; throw new ErreurSource('502', { statut: 502 }); }),
    {},
    { patienter: async () => {}, maintenant: () => t, attentes: [5000] }
  );
  assert.equal(r.tentatives.length, 2);
  for (const x of r.tentatives) {
    assert.equal(x.source, 'source-test');
    assert.equal(x.service, 'Test');
    assert.equal(x.ms, 250);
    assert.equal(x.classe, 'temporaire');
    assert.match(x.debut, /^\d{4}-\d{2}-\d{2}T/);
    assert.ok(x.erreur);
  }
  assert.equal(r.tentatives[0].attente_ms, 5000, 'le délai avant le réessai est tracé');
});

test('le nombre de réessais suit la liste d’attentes fournie', async () => {
  let appels = 0;
  await tenter(
    source(async () => { appels++; throw new ErreurSource('502', { statut: 502 }); }),
    {},
    { patienter: async () => {}, attentes: [10, 20] }
  );
  assert.equal(appels, 3);
});
