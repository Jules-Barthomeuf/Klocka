// 26 nov. 2026, Jules : « trop de fichiers, 20 au maximum », l'appel n'a pas été lu. Un appel de plus de deux minutes
// envoie plus de 20 morceaux audio : la règle des appels en accepte 400, la règle commune reste à 20.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import express from 'express';

process.env.KLOCKA_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'klocka-upload-audio-'));
const { upload, uploadAudio, MORCEAUX_AUDIO_MAX } = await import('./contexte.js');

async function envoyer(route, n) {
  const app = express();
  app.post('/audio', uploadAudio.array('audio', MORCEAUX_AUDIO_MAX), (req, res) => res.json({ n: req.files.length }));
  app.post('/commun', upload.array('audio', 80), (req, res) => res.json({ n: req.files.length }));
  app.use((err, req, res, next) => res.status(400).json({ code: err.code }));
  const serveur = app.listen(0);
  const f = new FormData();
  for (let i = 0; i < n; i += 1) f.append('audio', new Blob([new Uint8Array(64)], { type: 'audio/wav' }), `m${i}.wav`);
  try {
    const r = await fetch(`http://127.0.0.1:${serveur.address().port}${route}`, { method: 'POST', body: f });
    return await r.json();
  } finally { serveur.close(); }
}

test("un appel de 30 morceaux passe par la règle des appels, pas par la règle commune", async () => {
  assert.deepEqual(await envoyer('/audio', 30), { n: 30 });
  assert.equal((await envoyer('/commun', 30)).code, 'LIMIT_FILE_COUNT');
});
