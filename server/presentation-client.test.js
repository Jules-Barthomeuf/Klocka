// Le client et sa présentation : le chat n'y touche qu'à elle, la note du design va dans le Feedback.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-presentation-client-'));
const C = await import('./presentation-client.js');
const P = await import('./presentation-bancaire.js');
const { Records } = await import('./db.js');

const client = { email: 'helene@exemple.invalid', full_name: 'Hélène Test', role: 'user' };
const autre = { email: 'autre@exemple.invalid', role: 'user' };

function presentation() {
  const p = Records.create('PresentationBancaire', { titre: 'Pharmacie Lyon', diapos: [{ id: 'couverture', type: 'couverture', titre: 'Ancien titre' }], envoye_a: [client.email] });
  return p;
}

test('l’historique du chat est borné', () => {
  const h = C.historiqueCourt(Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'client', texte: `m${i}` })));
  assert.equal(h.length, 10);
  assert.equal(h.at(-1).role, 'AK');
});

test('le chat retouche la présentation du client, et pas celle d’un autre', async () => {
  const p = presentation();
  assert.ok(P.lirePourClient(p.id, client));
  const invoke = async () => ({ reponse: 'C’est fait.', changements: [{ diapo: 'couverture', chemin: 'titre', valeur: 'Nouveau titre' }] });
  const r = await C.discuter(p.id, client, { texte: 'Changez le titre' }, { invoke: async (o) => invoke(o) });
  assert.equal(r.ok, true);
  assert.equal(r.changes, 1);
  assert.equal(Records.get('PresentationBancaire', p.id).diapos.find((d) => d.id === 'couverture').titre, 'Nouveau titre');
  assert.equal((await C.discuter(p.id, autre, { texte: 'Changez le titre' }, { invoke })).ok, false, 'un autre client ne peut rien');
});

test('la note du design : une par client et par présentation, dans le Feedback', async () => {
  const p = presentation();
  assert.equal((await C.noter(p.id, client, 6)).ok, false);
  await C.noter(p.id, client, 3);
  await C.noter(p.id, client, 5);
  const notes = Records.list('Suggestion').filter((s) => s.type === 'note_design' && s.presentation_id === p.id);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].note_design, 5);
  assert.match(notes[0].contenu, /★★★★★ \(5\/5\)/);
  assert.equal(C.maNote(p.id, client), 5);
  assert.equal((await C.noter(p.id, autre, 4)).ok, false);
});
