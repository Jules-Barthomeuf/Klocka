// Le relais de la transcription en temps réel (15 nov. 2026) : une connexion du navigateur, le son du micro en continu
// (PCM 16 bits, 16 kHz, mono), passé à Voxtral temps réel (Mistral) ; les mots reviennent au fil de la parole. Il tourne
// dans un processus à part (server/ecoute-processus.js), pour que les traitements lourds du serveur ne le bloquent pas.
//
// Messages vers le navigateur : { type: "pret" }, { type: "delta", texte }, { type: "fin", texte }, { type: "erreur", message }.
// Du navigateur : du binaire (le son), ou { type: "fin" } pour clore.

import { WebSocket } from 'ws';

const MODELE = (process.env.VOXTRAL_TEMPS_REEL || 'voxtral-mini-transcribe-realtime-2602').trim();
const DELAI_MS = Number(process.env.VOXTRAL_TEMPS_REEL_DELAI_MS || 240);
/** Pure : le message de réglage de la session Mistral. Ce modèle refuse les mots-clés (« context biasing », essayé le
 * 15 nov. 2026) : le format du son et le délai seuls. */
export function reglageSession({ delai = DELAI_MS } = {}) {
  return { type: 'session.update', session: { audio_format: { encoding: 'pcm_s16le', sample_rate: 16000 }, target_streaming_delay_ms: delai } };
}

const envoyer = (ws, m) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

/** Relaie une connexion du navigateur vers Voxtral temps réel. `qui` : l'adresse, pour le journal. */
export function relayer(client, qui) {
  const cle = (process.env.MISTRAL_API_KEY || '').trim();
  if (!cle) { envoyer(client, { type: 'erreur', message: 'Transcription en temps réel indisponible (clé Mistral absente).' }); client.close(); return; }
  const debut = Date.now();
  let octets = 0;
  let pret = false;
  const enAttente = [];
  const amont = new WebSocket(`wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=${encodeURIComponent(MODELE)}`, { headers: { Authorization: `Bearer ${cle}` } });

  amont.on('message', (brut) => {
    let m;
    try { m = JSON.parse(brut.toString()); } catch { return; }
    if (m.type === 'session.created') {
      amont.send(JSON.stringify(reglageSession()));
      pret = true;
      for (const x of enAttente.splice(0)) amont.send(x);
      envoyer(client, { type: 'pret' });
    } else if (m.type === 'transcription.text.delta') envoyer(client, { type: 'delta', texte: m.text || '' });
    else if (m.type === 'transcription.done') { envoyer(client, { type: 'fin', texte: m.text || '' }); amont.close(); }
    else if (m.type === 'error') envoyer(client, { type: 'erreur', message: String(m.error?.message?.toString?.() || m.error?.message || 'erreur Mistral').slice(0, 300) });
  });
  amont.on('unexpected-response', (_r, res) => { envoyer(client, { type: 'erreur', message: `Mistral refuse la connexion (${res.statusCode})` }); client.close(); });
  amont.on('error', (e) => { envoyer(client, { type: 'erreur', message: String(e?.message || e).slice(0, 200) }); client.close(); });
  amont.on('close', () => {
    const s = Math.round(octets / 32000);
    if (s) console.log(`[écoute] ${qui || '?'} : ${s} s d'audio transcrits en temps réel (${MODELE}), session de ${Math.round((Date.now() - debut) / 1000)} s`);
    if (client.readyState === WebSocket.OPEN) client.close();
  });

  client.on('message', (data, binaire) => {
    if (binaire) {
      octets += data.length;
      const m = JSON.stringify({ type: 'input_audio.append', audio: Buffer.from(data).toString('base64') });
      if (pret && amont.readyState === WebSocket.OPEN) amont.send(m);
      else if (enAttente.length < 100) enAttente.push(m);
      return;
    }
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (m.type === 'fin' && amont.readyState === WebSocket.OPEN) {
      amont.send(JSON.stringify({ type: 'input_audio.flush' }));
      amont.send(JSON.stringify({ type: 'input_audio.end' }));
    }
  });
  client.on('close', () => { if (amont.readyState === WebSocket.OPEN || amont.readyState === WebSocket.CONNECTING) amont.terminate(); });
}
