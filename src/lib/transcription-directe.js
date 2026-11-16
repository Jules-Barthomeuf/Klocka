// La transcription en temps réel pendant l'appel, côté navigateur (15 nov. 2026, Jules : « délai très faible, sur tous
// les navigateurs ») : le son du micro est lu en continu (Web Audio, présent sur Chrome, Firefox et Safari), ramené à
// 16 kHz en PCM 16 bits, et envoyé par paquets de 100 ms au relais du serveur (server/ecoute-temps-reel.js), qui le
// passe à Voxtral temps réel. Les mots reviennent au fil de la parole. Le même flux de micro que l'enregistrement : rien
// ne se dispute le micro.

// Les noms propres corrigés à chaque mot reçu (15 nov. 2026, Jules : « Coralie Guillaud, Klocka, Jules Barthomeuf ») :
// les mêmes règles que la transcription par morceaux et la dictée (server/klocka-nom.js).
import { corrigerKlocka } from "../../server/klocka-nom.js";

/** Pure : ramène des échantillons (-1..1) d'une fréquence à 16 kHz, en PCM 16 bits. */
export function versPcm16(echantillons, de, vers = 16000) {
  const pas = de / vers;
  const n = Math.floor(echantillons.length / pas);
  const sortie = new Int16Array(n);
  for (let i = 0; i < n; i += 1) {
    const a = Math.floor(i * pas);
    const b = Math.min(echantillons.length, Math.max(a + 1, Math.floor((i + 1) * pas)));
    let somme = 0;
    for (let k = a; k < b; k += 1) somme += echantillons[k];
    const v = Math.max(-1, Math.min(1, somme / (b - a)));
    sortie[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return sortie;
}

/** Pure : le texte reçu, en phrases finies et le bout de phrase en cours. */
export function enPhrases(texte) {
  const t = String(texte || "").replace(/\s+/g, " ").trimStart();
  const phrases = [];
  const re = /[^.!?…]*[.!?…]+["»”)]?\s*/g;
  let x;
  let fin = 0;
  while ((x = re.exec(t))) { if (!x[0]) break; phrases.push(x[0].trim()); fin = re.lastIndex; }
  return { phrases: phrases.filter(Boolean), enCours: t.slice(fin).trim() };
}

/**
 * Ouvre la transcription en temps réel sur un flux de micro déjà ouvert. `onTexte(texteComplet)` à chaque mot reçu ;
 * `onEtat("pret" | "erreur", message?)`. Rend { arreter } : arreter() clôt et rend une promesse du texte final
 * (au plus trois secondes d'attente).
 */
export function ouvrirTranscriptionDirecte(flux, { onTexte = () => {}, onEtat = () => {} } = {}) {
  const Ctx = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!Ctx || typeof WebSocket === "undefined") { onEtat("erreur", "Navigateur sans Web Audio"); return null; }
  const ws = new WebSocket(`${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/api/prospection/ecoute`);
  ws.binaryType = "arraybuffer";
  let texte = "";
  let ferme = false;
  let finRecue = null;
  const finale = new Promise((ok) => { finRecue = ok; });
  ws.onmessage = (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === "pret") onEtat("pret");
    else if (m.type === "delta") { texte += m.texte || ""; onTexte(corrigerKlocka(texte)); }
    else if (m.type === "fin") { if (m.texte) texte = m.texte; onTexte(corrigerKlocka(texte)); finRecue(corrigerKlocka(texte)); }
    else if (m.type === "erreur") onEtat("erreur", m.message);
  };
  ws.onerror = () => onEtat("erreur", "Connexion à la transcription perdue");
  ws.onclose = () => { finRecue(corrigerKlocka(texte)); if (!ferme) onEtat("erreur", "Connexion à la transcription fermée"); };

  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(flux);
  const noeud = ctx.createScriptProcessor(4096, 1, 1);
  const muet = ctx.createGain();
  muet.gain.value = 0;
  let tampon = [];
  let taille = 0;
  noeud.onaudioprocess = (e) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    const pcm = versPcm16(e.inputBuffer.getChannelData(0), ctx.sampleRate);
    tampon.push(pcm); taille += pcm.length;
    if (taille >= 1600) {
      const paquet = new Int16Array(taille);
      let o = 0;
      for (const p of tampon) { paquet.set(p, o); o += p.length; }
      tampon = []; taille = 0;
      ws.send(paquet.buffer);
    }
  };
  source.connect(noeud);
  noeud.connect(muet);
  muet.connect(ctx.destination);

  const arreter = () => {
    if (ferme) return finale;
    ferme = true;
    try { noeud.disconnect(); source.disconnect(); ctx.close(); } catch { /* déjà fermé */ }
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "fin" }));
    const delai = new Promise((ok) => setTimeout(() => ok(corrigerKlocka(texte)), 3000));
    return Promise.race([finale, delai]).then((t) => { try { ws.close(); } catch { /* déjà fermée */ } return t; });
  };
  return { arreter, texte: () => corrigerKlocka(texte) };
}
