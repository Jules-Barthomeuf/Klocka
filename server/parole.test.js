// La part de parole de l'analyste : les voix séparées, la plus forte est la sienne.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partDeParole, lireWav } from './parole.js';
import { fusionnerWav } from '../src/lib/parole.js';

const FREQ = 16000;
/** Un WAV PCM 16 bits mono : `blocs` = [secondes, amplitude]. */
function wav(blocs) {
  const echantillons = blocs.flatMap(([s, a]) => Array.from({ length: Math.round(s * FREQ) }, (_, i) => Math.round(Math.sin(i / 7) * a * 32767)));
  const b = Buffer.alloc(44 + echantillons.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + echantillons.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(FREQ, 24); b.writeUInt32LE(FREQ * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(echantillons.length * 2, 40);
  echantillons.forEach((x, i) => b.writeInt16LE(x, 44 + i * 2));
  return b;
}

// 0-6 s : l'analyste, fort ; 6-10 s : l'agent, faible ; 10-14 s : l'analyste.
const SEGMENTS = [
  { start: 0, end: 6, speaker_id: 'speaker_2' },
  { start: 6, end: 10, speaker_id: 'speaker_1' },
  { start: 10, end: 14, speaker_id: 'speaker_2' },
];
const AUDIO = wav([[6, 0.6], [4, 0.1], [4, 0.6]]);

test('lit l’en-tête d’un WAV', () => {
  assert.deepEqual({ ...lireWav(AUDIO) }, { freq: 16000, debut: 44, octets: 14 * FREQ * 2 });
});

test('la voix la plus forte est l’analyste : 10 s sur 14', () => {
  const r = partDeParole(SEGMENTS, AUDIO);
  assert.equal(r.pct, 71);
  assert.equal(r.analyste_s, 10);
  assert.equal(r.autres_s, 4);
  assert.equal(r.locuteurs, 2);
  assert.ok(r.volumes.speaker_2 > r.volumes.speaker_1);
});

test('l’étiquette ne décide pas : si l’autre voix est la plus forte, c’est elle', () => {
  const r = partDeParole(SEGMENTS.map((s) => ({ ...s, speaker_id: s.speaker_id === 'speaker_2' ? 'speaker_1' : 'speaker_2' })), AUDIO);
  assert.equal(r.pct, 71);
});

test('une seule voix, un appel trop court ou un parasite : pas de mesure', () => {
  assert.equal(partDeParole([{ start: 0, end: 14, speaker_id: 'a' }], AUDIO), null);
  assert.equal(partDeParole([{ start: 0, end: 3, speaker_id: 'a' }, { start: 3, end: 6, speaker_id: 'b' }], AUDIO), null);
  assert.equal(partDeParole([{ start: 0, end: 12, speaker_id: 'a' }, { start: 12, end: 12.5, speaker_id: 'b' }], AUDIO), null);
  assert.equal(partDeParole(SEGMENTS, Buffer.from('pas un wav')), null);
});

test('les morceaux d’un appel se recollent en un seul WAV', async () => {
  const [a, b] = [wav([[1, 0.5]]), wav([[2, 0.5]])];
  const fusion = Buffer.from(await (await fusionnerWav([new Blob([a]), null, new Blob([b])])).arrayBuffer());
  assert.equal(lireWav(fusion).octets, 3 * FREQ * 2);
  assert.equal(fusion.length, 44 + 3 * FREQ * 2);
  assert.equal(await fusionnerWav([]), null);
});
