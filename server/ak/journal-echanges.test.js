// Le journal des échanges des chats (12 oct. 2026).

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-journal-'));
const J = await import('./journal-echanges.js');
const { Records } = await import('../db.js');

test('un échange garde la demande, les outils, les tours, le coût ; la consigne une seule fois', () => {
  const base = { chat: 'admin', par: 'Jules.B@klocka.immo', systeme: 'consigne longue', messages: [{ role: 'user', content: 'ancienne' }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'où en est Libourne ?' }], outils_declares: 75, tours: [{ stop_reason: 'end_turn', texte: 'r' }], appels: [{ outil: 'trouver_bien', arguments: { recherche: 'Libourne' }, resultat: '{}', echec: false }, { outil: 'etat_projet', arguments: {}, resultat: null, echec: true }], reponse: 'Prospect.', cout_usd: 0.01, modele: 'm', duree_ms: 1200 };
  const a = J.noterEchange(base);
  J.noterEchange({ ...base, chat: 'mandataire', erreur: 'boum' });
  assert.equal(Records.list(J.PROMPT).length, 1, 'la consigne identique n’est gardée qu’une fois');
  const l = J.lister();
  assert.equal(l.length, 2);
  const e = l.find((x) => x.id === a);
  assert.equal(e.demande, 'où en est Libourne ?');
  assert.equal(e.par, 'jules.b@klocka.immo');
  assert.deepEqual([e.n_outils, e.n_echecs, e.tours], [2, 1, 1]);
  assert.equal(J.lire(a).systeme, 'consigne longue');
  assert.equal(J.lister({ chat: 'mandataire' }).length, 1);
  assert.equal(J.lister({ echecs: true }).length, 2, 'un outil en échec ou une erreur : les deux sortent');
});

test('le contenu en blocs se lit en texte', () => {
  assert.equal(J.texteDuContenu([{ type: 'text', text: 'voici' }, { type: 'image' }]), 'voici\n[image]');
});

test('le journal ne garde que les plus récents', () => {
  for (let i = 0; i < 5; i++) J.noterEchange({ chat: 'admin', messages: [], reponse: String(i) });
  J.elaguer(3);
  assert.equal(Records.list(J.ECHANGE).length, 3);
});
