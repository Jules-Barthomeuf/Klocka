// Le processus de la transcription en temps réel (15 nov. 2026) : il reçoit du serveur les connexions déjà vérifiées
// (le socket brut, ses en-têtes), fait la poignée de main WebSocket et relaie le son à Voxtral temps réel. À part du
// serveur, il ne dépend pas de sa charge.

import { WebSocketServer } from 'ws';
import { relayer } from './ecoute-relais.js';

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

process.on('message', (m, socket) => {
  if (m?.type !== 'client' || !socket) return;
  const req = { method: 'GET', url: m.url, headers: m.headers, socket };
  try {
    wss.handleUpgrade(req, socket, Buffer.from(m.tete || '', 'base64'), (client) => relayer(client, m.qui));
  } catch (e) {
    console.warn(`[écoute] connexion refusée : ${e?.message || e}`);
    socket.destroy();
  }
});
process.on('disconnect', () => process.exit(0));
