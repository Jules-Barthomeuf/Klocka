// Le petit son d'une note rangée (19 nov. 2026, Jules : « petit son pour lui dire quand il a structuré les notes »).
// Joué seulement après un geste (le OK), jamais tout seul.
//
// Le son choisi par Jules le 19 nov. 2026, parmi neuf écoutés (« Accord », version longue) : trois notes ensemble
// (do, mi, sol), posées et calmes, environ une seconde et demie. Deux notifications ou plus en même temps ne font
// qu'un son (Jules, même jour) : un appel pendant que le son joue encore est ignoré.

const NOTES = [523.25, 659.25, 783.99];
const VOLUME = 0.045;
const ATTAQUE = 0.03;
const DUREE = 1.375;
// Le temps pendant lequel un nouvel appel ne rejoue pas le son : sa durée entière.
const SILENCE_MS = (DUREE + 0.1) * 1000;

let ctx = null;
let dernier = 0;

export function sonRange() {
  try {
    const maintenant = Date.now();
    if (maintenant - dernier < SILENCE_MS) return;
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return;
    ctx = ctx || new C();
    if (ctx.state === "suspended") ctx.resume();
    dernier = maintenant;
    const t = ctx.currentTime + 0.02;
    for (const f of NOTES) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(VOLUME, t + ATTAQUE);
      g.gain.exponentialRampToValueAtTime(0.0001, t + DUREE);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + DUREE + 0.05);
    }
  } catch { /* pas de son : rien de grave */ }
}
