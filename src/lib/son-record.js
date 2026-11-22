// La musique de la pop-up « Record de l'équipe » (22 nov. 2026, Jules, maquette : « Synthwave », environ 3,5 s), jouée
// par le navigateur, sans fichier. Le même déroulé que l'animation (src/components/RecordEquipe.jsx) :
//   0 s     une nappe de synthé (do majeur 7) et une basse grave montent doucement ;
//   0,9 s   un arpège rapide de seize notes, style années 80, avec un écho ;
//   1,4 s   un souffle monte vers le final ;
//   2,7 s   un accord brillant et une cloche aiguë ;
//   2,9 s   la nappe s'éteint.
// Les navigateurs coupent le son tant qu'on n'a pas cliqué sur la page : `bloque` le dit, la carte propose « Activer le son ».

const VOLUME = 0.5;
const note = (n) => 440 * 2 ** ((n - 69) / 12); // numéro MIDI → hertz
const C2 = 36;
const NAPPE = [48, 52, 55, 59]; // do3, mi3, sol3, si3
const ARPEGE = [60, 64, 67, 71, 72, 71, 67, 64, 62, 65, 69, 72, 74, 72, 76, 79];
const FINAL = [72, 76, 79, 83, 84];

/**
 * Joue la musique. Rend { bloque, muet(oui), arreter() }.
 * @param {{ muet?: boolean, surDeblocage?: () => void }} o
 */
export function jouerRecord({ muet = false, surDeblocage = () => {} } = {}) {
  const C = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
  if (!C) return { bloque: false, muet: () => {}, arreter: () => {} };
  let ctx;
  try { ctx = new C(); } catch { return { bloque: false, muet: () => {}, arreter: () => {} }; }
  const bloque = ctx.state !== "running";
  if (bloque) ctx.resume().then(() => { if (ctx.state === "running") surDeblocage(); }).catch(() => {});

  const sortie = ctx.createGain();
  sortie.gain.value = muet ? 0 : VOLUME;
  const compresseur = ctx.createDynamicsCompressor();
  sortie.connect(compresseur).connect(ctx.destination);
  const t0 = ctx.currentTime + 0.05;

  const osc = (type, f, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    o.detune.value = detune;
    return o;
  };
  const filtre = (type, f, q = 0.7) => {
    const b = ctx.createBiquadFilter();
    b.type = type;
    b.frequency.value = f;
    b.Q.value = q;
    return b;
  };

  // La nappe : deux dents de scie légèrement désaccordées par note, filtrées, qui montent puis s'éteignent à 2,9 s.
  const nappe = ctx.createGain();
  const fNappe = filtre("lowpass", 900);
  fNappe.frequency.setValueAtTime(700, t0);
  fNappe.frequency.linearRampToValueAtTime(1800, t0 + 2.7);
  nappe.connect(fNappe).connect(sortie);
  nappe.gain.setValueAtTime(0, t0);
  nappe.gain.linearRampToValueAtTime(0.06, t0 + 0.9);
  nappe.gain.setValueAtTime(0.06, t0 + 2.9);
  nappe.gain.linearRampToValueAtTime(0, t0 + 3.6);
  for (const n of NAPPE) for (const d of [-9, 9]) {
    const o = osc("sawtooth", note(n), d);
    o.connect(nappe);
    o.start(t0);
    o.stop(t0 + 3.7);
  }
  // La basse grave.
  const basse = ctx.createGain();
  basse.gain.setValueAtTime(0, t0);
  basse.gain.linearRampToValueAtTime(0.16, t0 + 0.7);
  basse.gain.setValueAtTime(0.16, t0 + 2.9);
  basse.gain.linearRampToValueAtTime(0, t0 + 3.6);
  const ob = osc("sawtooth", note(C2));
  ob.connect(filtre("lowpass", 220)).connect(basse).connect(sortie);
  ob.start(t0);
  ob.stop(t0 + 3.7);

  // L'arpège : seize notes carrées, une double-croche chacune, avec un écho.
  const echo = ctx.createDelay(1);
  echo.delayTime.value = 0.18;
  const retour = ctx.createGain();
  retour.gain.value = 0.32;
  const arp = ctx.createGain();
  arp.gain.value = 1;
  const fArp = filtre("lowpass", 2600, 2);
  arp.connect(fArp);
  fArp.connect(sortie);
  fArp.connect(echo);
  echo.connect(retour).connect(echo);
  retour.connect(sortie);
  ARPEGE.forEach((n, i) => {
    const t = t0 + 0.9 + i * 0.1;
    const o = osc("square", note(n));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    o.connect(g).connect(arp);
    o.start(t);
    o.stop(t + 0.13);
  });

  // Le souffle : un bruit blanc filtré dont la fréquence et le volume montent jusqu'au final.
  const bruit = ctx.createBuffer(1, ctx.sampleRate * 1.4, ctx.sampleRate);
  const data = bruit.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const souffle = ctx.createBufferSource();
  souffle.buffer = bruit;
  const fSouffle = filtre("bandpass", 400, 1.2);
  fSouffle.frequency.setValueAtTime(400, t0 + 1.4);
  fSouffle.frequency.exponentialRampToValueAtTime(6000, t0 + 2.7);
  const gSouffle = ctx.createGain();
  gSouffle.gain.setValueAtTime(0, t0 + 1.4);
  gSouffle.gain.linearRampToValueAtTime(0.09, t0 + 2.65);
  gSouffle.gain.linearRampToValueAtTime(0, t0 + 2.72);
  souffle.connect(fSouffle).connect(gSouffle).connect(sortie);
  souffle.start(t0 + 1.4);
  souffle.stop(t0 + 2.8);

  // Le final : un accord brillant, filtre ouvert, et une cloche aiguë (deux partiels inharmoniques).
  const tf = t0 + 2.7;
  const accord = ctx.createGain();
  accord.gain.setValueAtTime(0, tf);
  accord.gain.linearRampToValueAtTime(0.07, tf + 0.02);
  accord.gain.exponentialRampToValueAtTime(0.0008, tf + 1.3);
  const fAccord = filtre("lowpass", 5000);
  fAccord.frequency.setValueAtTime(5000, tf);
  fAccord.frequency.exponentialRampToValueAtTime(900, tf + 1.2);
  accord.connect(fAccord).connect(sortie);
  for (const n of FINAL) for (const d of [-7, 7]) {
    const o = osc("sawtooth", note(n), d);
    o.connect(accord);
    o.start(tf);
    o.stop(tf + 1.4);
  }
  for (const [f, v, duree] of [[note(96), 0.09, 1.6], [note(96) * 2.76, 0.035, 0.9]]) {
    const o = osc("sine", f);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, tf);
    g.gain.linearRampToValueAtTime(v, tf + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0005, tf + duree);
    o.connect(g).connect(sortie);
    o.start(tf);
    o.stop(tf + duree + 0.05);
  }

  let ferme = false;
  const arreter = () => {
    if (ferme) return;
    ferme = true;
    try {
      sortie.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => ctx.close().catch(() => {}), 250);
    } catch { /* rien */ }
  };
  // Fermé de lui-même une fois la musique finie.
  setTimeout(arreter, 4500);
  return {
    bloque,
    muet: (oui) => { if (!ferme) sortie.gain.setTargetAtTime(oui ? 0 : VOLUME, ctx.currentTime, 0.03); },
    arreter,
  };
}
