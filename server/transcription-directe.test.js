import test from 'node:test';
import assert from 'node:assert/strict';
import { versPcm16, enPhrases } from '../src/lib/transcription-directe.js';
import { reglageSession } from './ecoute-relais.js';

test('le son du micro est ramené à 16 kHz, en PCM 16 bits borné', () => {
  const pcm = versPcm16(new Float32Array([1, 1, 1, -1, -1, -1, 0, 0, 0]), 48000);
  assert.equal(pcm.length, 3);
  assert.deepEqual([...pcm], [32767, -32768, 0]);
  assert.equal(versPcm16(new Float32Array([2, 2, 2]), 48000)[0], 32767, 'un échantillon hors bornes est écrêté');
});

test('le texte reçu se range en phrases finies et en phrase en cours', () => {
  assert.deepEqual(enPhrases('Oui bonjour, Agence du port. Vous travaillez gratuitement, vous? Bon, envoyez'), { phrases: ['Oui bonjour, Agence du port.', 'Vous travaillez gratuitement, vous?'], enCours: 'Bon, envoyez' });
  assert.deepEqual(enPhrases(''), { phrases: [], enCours: '' });
  assert.deepEqual(enPhrases('Une seule phrase sans fin'), { phrases: [], enCours: 'Une seule phrase sans fin' });
});

test('la session Mistral : son 16 kHz, délai court, sans mots-clés (refusés par ce modèle)', () => {
  const m = reglageSession();
  assert.equal(m.type, 'session.update');
  assert.deepEqual(m.session.audio_format, { encoding: 'pcm_s16le', sample_rate: 16000 });
  assert.equal(m.session.target_streaming_delay_ms, 240);
  assert.equal(m.session.context_bias, undefined);
});
