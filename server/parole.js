// La part de parole de l'analyste (16 oct. 2026, Jules) : sur un appel, le temps
// où il parle, contre celui de ses interlocuteurs. Voxtral sépare les voix
// (diarize : un `speaker_id` par segment, stable sur tout l'appel) ; l'analyste
// est la voix la plus forte, le micro étant devant lui, l'agent n'arrivant que
// par le haut-parleur du téléphone. Une règle à vérifier sur de vrais appels :
// les volumes mesurés sont gardés avec la part, pour la contrôler.

const MIN_VOIX_S = 1.5; // en dessous, une « voix » n'est qu'un parasite
const MIN_TOTAL_S = 10; // un appel plus court ne dit rien

/** Pure : l'échantillonnage et la place des données d'un WAV PCM 16 bits mono. */
export function lireWav(wav) {
  const i = wav.indexOf('data');
  if (i < 12 || wav.length < i + 8) return null;
  return { freq: wav.readUInt32LE(24), debut: i + 8, octets: Math.min(wav.readUInt32LE(i + 4), wav.length - (i + 8)) };
}

/**
 * Pure : la part de parole de l'analyste.
 * @param {{start:number, end:number, speaker_id:string}[]} segments
 * @param {Buffer} wav  l'audio diarisé, WAV PCM 16 bits mono
 * @returns {{pct:number, analyste_s:number, autres_s:number, locuteurs:number, volumes:Object<string,number>}|null}
 */
export function partDeParole(segments, wav) {
  const w = lireWav(wav);
  if (!w || !Array.isArray(segments)) return null;
  const voix = new Map();
  for (const s of segments) {
    const debut = Number(s.start); const fin = Number(s.end);
    if (!s.speaker_id || !(fin > debut)) continue;
    const v = voix.get(s.speaker_id) || { secondes: 0, carres: 0, n: 0 };
    v.secondes += fin - debut;
    const a = w.debut + Math.max(0, Math.floor(debut * w.freq)) * 2;
    const b = Math.min(w.debut + w.octets, w.debut + Math.floor(fin * w.freq) * 2);
    for (let o = a; o + 1 < b; o += 2) { const x = wav.readInt16LE(o) / 32768; v.carres += x * x; v.n += 1; }
    voix.set(s.speaker_id, v);
  }
  const gardees = [...voix.entries()].filter(([, v]) => v.secondes >= MIN_VOIX_S && v.n > 0);
  const total = gardees.reduce((t, [, v]) => t + v.secondes, 0);
  if (gardees.length < 2 || total < MIN_TOTAL_S) return null;
  const volume = (v) => Math.sqrt(v.carres / v.n);
  const [idAnalyste] = gardees.reduce((m, x) => (volume(x[1]) > volume(m[1]) ? x : m));
  const analyste = voix.get(idAnalyste).secondes;
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    pct: Math.round((analyste / total) * 100),
    analyste_s: r1(analyste),
    autres_s: r1(total - analyste),
    locuteurs: gardees.length,
    volumes: Object.fromEntries(gardees.map(([id, v]) => [id, Math.round(volume(v) * 1000) / 1000])),
  };
}
