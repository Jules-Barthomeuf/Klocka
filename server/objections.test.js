// Le clip d'objection : la phrase relevée par AK, quinze secondes autour, l'équipe y répond.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-objections-'));
const O = await import('./objections.js');
const { objectionDe } = await import('./prospection/appel.js');
const { morceauDeLaPhrase, decouper } = await import('../src/lib/clip-objection.js');
const { Records } = await import('./db.js');

const FREQ = 16000;
/** Un WAV de `s` secondes dont chaque échantillon vaut `v` (pour reconnaître d'où vient l'audio). */
function wav(s, v) {
  const n = Math.round(s * FREQ);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(FREQ, 24); b.writeUInt32LE(FREQ * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) b.writeInt16LE(v, 44 + i * 2);
  return new Uint8Array(b);
}

const TRANSCRIPTION = 'Bonjour, oui c’est Marc.\nNon merci, on ne travaille pas avec des investisseurs, on a nos propres clients.\nD’accord, je comprends, bonne journée.';

test('AK : l’objection non levée se garde si sa phrase se lit dans la transcription', () => {
  assert.deepEqual(objectionDe({ objection: { phrase: 'on ne travaille pas avec des investisseurs', sujet: 'pas d’investisseurs', resolue: false } }, TRANSCRIPTION), { phrase: 'on ne travaille pas avec des investisseurs', sujet: 'pas d’investisseurs' });
  assert.equal(objectionDe({ objection: { phrase: 'on ne travaille pas avec des investisseurs', resolue: true } }, TRANSCRIPTION), null, 'levée : rien');
  assert.equal(objectionDe({ objection: { phrase: 'le prix est beaucoup trop élevé pour nous', resolue: false } }, TRANSCRIPTION), null, 'inventée : rien');
  assert.equal(objectionDe({ objection: { phrase: '' } }, TRANSCRIPTION), null);
});

test('le morceau qui porte la phrase', () => {
  const textes = TRANSCRIPTION.split('\n');
  assert.equal(morceauDeLaPhrase(textes, 'On ne travaille pas avec des investisseurs'), 1);
  assert.equal(morceauDeLaPhrase(textes, 'rien à voir avec ce qui a été dit'), -1);
});

test('quinze secondes centrées sur le morceau, voisins compris', () => {
  const parts = [wav(8, 1), wav(8, 2), wav(8, 3)];
  const clip = decouper(parts, 1);
  const b = Buffer.from(clip);
  assert.equal(b.readUInt32LE(40), 15 * FREQ * 2);
  // Le milieu du clip tombe au milieu du morceau du centre ; les bords prennent ses voisins.
  assert.equal(b.readInt16LE(44 + (7.5 * FREQ) * 2), 2);
  assert.equal(b.readInt16LE(44), 1);
  assert.equal(b.readInt16LE(44 + (15 * FREQ - 1) * 2), 3);
  // Le premier morceau : le clip commence au début.
  const premier = Buffer.from(decouper(parts, 0));
  assert.equal(premier.readInt16LE(44), 1);
  assert.equal(premier.readUInt32LE(40), 15 * FREQ * 2);
  // Un appel plus court que quinze secondes : tout l'appel.
  assert.equal(Buffer.from(decouper([wav(8, 1)], 0)).readUInt32LE(40), 8 * FREQ * 2);
  assert.equal(decouper([null], 0), null);
});

test('le clip déposé, une fois par appel ; l’équipe répond et le résout ; l’audio s’efface après 30 jours', () => {
  const appel = Records.create('AppelAgent', { par: 'nora.l@klocka.immo', agent: 'Agence Démo', le: new Date().toISOString(), objection: { phrase: 'on ne travaille pas avec des investisseurs', sujet: 'pas d’investisseurs' } });
  const sans = Records.create('AppelAgent', { par: 'nora.l@klocka.immo', le: new Date().toISOString() });
  const clip = Buffer.from(decouper([wav(8, 1), wav(8, 2)], 1));
  assert.equal(O.deposer({ appel_id: sans.id, wav: clip }).ok, false, 'sans objection relevée');
  assert.equal(O.deposer({ appel_id: appel.id, wav: Buffer.from('pas un wav') }).ok, false);
  const r = O.deposer({ appel_id: appel.id, wav: clip, par: 'nora.l@klocka.immo' });
  assert.equal(r.ok, true);
  assert.equal(r.objection.agence, 'Agence Démo');
  assert.equal(O.deposer({ appel_id: appel.id, wav: clip }).deja, true);
  assert.ok(O.fichier(r.objection.id));
  O.repondre(r.objection.id, 'Nous apportons des acquéreurs qui achètent vite, sans condition de prêt.', { email: 'jules.b@klocka.immo' });
  assert.equal(O.liste({ ouvertes: true })[0].reponses.length, 1);
  O.resoudre(r.objection.id, true, { email: 'jules.b@klocka.immo' });
  assert.equal(O.liste({ ouvertes: true }).length, 0);
  assert.equal(O.liste().length, 1);
  assert.equal(O.purger({ maintenant: new Date(Date.now() + 31 * 86400000) }), 1);
  assert.equal(O.fichier(r.objection.id), null);
  assert.equal(O.liste()[0].phrase, 'on ne travaille pas avec des investisseurs', 'la phrase reste');
});
