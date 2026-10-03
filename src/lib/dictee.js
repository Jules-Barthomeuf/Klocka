import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// Dicter au lieu de taper : on appuie, on parle, chaque mot s'écrit.
//
// UN SEUL micro à la fois. Deux voies :
//  - la reconnaissance du navigateur (Chrome, Edge, Safari) : le mot s'affiche
//    pendant qu'on le dit, et elle est relancée chaque fois que le navigateur
//    la coupe (Chrome s'arrête après un silence). Rien d'autre ne touche au
//    micro pendant ce temps : un second enregistreur en parallèle rendait la
//    reconnaissance muette sur certaines machines.
//  - sans elle (Firefox, Safari sans Siri, refus réseau) : le micro est lu en
//    continu (Web Audio), découpé en tranches envoyées au serveur au fil de
//    l'eau — l'enregistrement ne s'interrompt jamais, donc aucun mot n'est
//    coupé entre deux tranches — et le texte s'ajoute dès qu'une tranche
//    revient. À l'arrêt, l'enregistrement entier est retranscrit d'un bloc,
//    propre et ponctué.
//
// À l'arrêt de la voie navigateur, le texte est seulement renvoyé au serveur
// pour la ponctuation (du texte, pas de l'audio : une seconde au plus), et
// seulement s'il est long.

const Reconnaissance =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

const Audio = typeof window !== "undefined" ? window.AudioContext || window.webkitAudioContext : null;
const microDisponible = () => !!navigator?.mediaDevices?.getUserMedia;

// --- WAV --------------------------------------------------------------------

/** Pure : des échantillons PCM (-1..1) → un fichier WAV mono 16 bits. */
export function pcmVersWav(pcm, freq) {
  const tampon = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(tampon);
  const ecrire = (o, t) => { for (let i = 0; i < t.length; i += 1) v.setUint8(o + i, t.charCodeAt(i)); };
  ecrire(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); ecrire(8, "WAVE"); ecrire(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, freq, true);
  v.setUint32(28, freq * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); ecrire(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i += 1) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return new Blob([tampon], { type: "audio/wav" });
}

/** Pure : ramène le PCM vers 16 kHz en moyennant (il suffit pour la voix). */
export function reduire(pcm, de, vers = 16000) {
  if (de <= vers) return pcm;
  const pas = de / vers;
  const sortie = new Float32Array(Math.floor(pcm.length / pas));
  for (let i = 0; i < sortie.length; i += 1) {
    const debut = Math.floor(i * pas);
    const fin = Math.min(pcm.length, Math.max(debut + 1, Math.floor((i + 1) * pas)));
    let somme = 0;
    for (let k = debut; k < fin; k += 1) somme += pcm[k];
    sortie[i] = somme / (fin - debut);
  }
  return sortie;
}

/**
 * Un enregistrement du navigateur (webm, ogg…), décodé puis réécrit en WAV
 * mono (16 kHz par défaut ; 8 kHz pour un appel entier). Les panneaux d'appel
 * s'en servent toujours.
 */
export async function versWav(blob, freq = 16000) {
  const ctx = new Audio();
  const son = await ctx.decodeAudioData(await blob.arrayBuffer());
  const hors = new OfflineAudioContext(1, Math.ceil(son.duration * freq), freq);
  const src = hors.createBufferSource();
  src.buffer = son;
  src.connect(hors.destination);
  src.start();
  const rendu = await hors.startRendering();
  ctx.close?.();
  return pcmVersWav(rendu.getChannelData(0), freq);
}

// --- Les allers-retours serveur ----------------------------------------------

async function envoyerWav(wav) {
  const octets = new Uint8Array(await wav.arrayBuffer());
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  const j = await base44.request("POST", "/api/dictee", { body: { audio: btoa(binaire) } });
  return String(j?.texte || "").trim();
}

async function ponctuer(texte) {
  const j = await base44.request("POST", "/api/dictee", { body: { texte } });
  return String(j?.texte || "").trim();
}

const joindre = (...morceaux) => morceaux.map((m) => String(m || "").trim()).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

/**
 * Pure : les résultats d'une session de reconnaissance, sans doublon. Chrome
 * Android rend des résultats CUMULÉS (« bonjour », « bonjour je », « bonjour
 * je voudrais ») : un résultat qui reprend le précédent le remplace.
 */
export function lireResultats(resultats) {
  const finals = [];
  let interim = "";
  for (let i = 0; i < resultats.length; i += 1) {
    const t = String(resultats[i][0]?.transcript || "").trim();
    if (!t) continue;
    if (resultats[i].isFinal) {
      const prec = finals.at(-1);
      if (prec && t.toLowerCase().startsWith(prec.toLowerCase())) finals[finals.length - 1] = t;
      else if (!(prec && prec.toLowerCase().endsWith(t.toLowerCase()))) finals.push(t);
    } else {
      interim = interim && t.toLowerCase().startsWith(interim.toLowerCase()) ? t : joindre(interim, t);
    }
  }
  const final = joindre(...finals);
  if (interim && final.toLowerCase().endsWith(interim.toLowerCase())) interim = "";
  return { final, interim };
}

const TRANCHE_MS = 1800;
const PONCTUATION_DES = 80; // caractères : en deçà, rien à reponctuer
const RELECTURE_DES_S = 4; // secondes : en deçà, les tranches suffisent
const REFUS_DU_SERVICE = new Set(["service-not-allowed", "network", "language-not-supported", "audio-capture"]);

/**
 * @param {{ onTexte?: (texte: string, final: boolean) => void, onFin?: (texte: string) => void }} options
 *   `onTexte` reçoit tout le texte dicté depuis le clic, à chaque nouveauté.
 * @returns {{ supporte: boolean, ecoute: boolean, demarrer: () => void, arreter: () => void, erreur: string|null, transcription: boolean, finalisation: boolean }}
 */
export function useDictee({ onTexte, onFin } = {}) {
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [transcription, setTranscription] = useState(false);
  // Entre le clic d'arrêt et le texte final (la ponctuation, ou la relecture
  // de l'enregistrement) : l'écran doit dire que le texte arrive.
  const [finalisation, setFinalisation] = useState(false);
  const garde = useRef(null);
  const rappels = useRef({ onTexte, onFin });
  rappels.current = { onTexte, onFin };

  const voulue = useRef(false);
  const acquis = useRef("");
  const rec = useRef(null);
  const flux = useRef(null); // { ctx, source, processeur, media, freq, tampons, depuisTranche, minuterie, file, arreter }
  const fini = useRef(false);

  const fermerFlux = useCallback(() => {
    const f = flux.current;
    flux.current = null;
    if (!f) return;
    clearInterval(f.minuterie);
    try { f.processeur.disconnect(); f.source.disconnect(); } catch { /* déjà fermé */ }
    f.media.getTracks().forEach((t) => t.stop());
    f.ctx.close?.();
  }, []);

  const finir = useCallback((texteFinal = null) => {
    if (fini.current) return;
    fini.current = true;
    voulue.current = false;
    rec.current = null;
    setEcoute(false);
    setFinalisation(false);
    clearTimeout(garde.current);
    const texte = (texteFinal ?? acquis.current).trim();
    if (texte) rappels.current.onFin?.(texte);
  }, []);

  useEffect(() => () => {
    voulue.current = false;
    clearTimeout(garde.current);
    rec.current?.abort?.();
    fermerFlux();
  }, [fermerFlux]);

  // --- Le flux continu : Web Audio, des tranches envoyées au fil de l'eau ----
  const demarrerFlux = useCallback(async () => {
    setErreur(null);
    let media;
    try {
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErreur("Le micro est refusé : autorisez-le dans le navigateur.");
      finir();
      return;
    }
    if (!voulue.current || !Audio) { media.getTracks().forEach((t) => t.stop()); finir(); return; }
    const ctx = new Audio();
    await ctx.resume?.();
    const source = ctx.createMediaStreamSource(media);
    // ScriptProcessor : déprécié mais présent partout. Le micro ne s'arrête
    // jamais : aucun mot n'est coupé entre deux tranches.
    const processeur = ctx.createScriptProcessor(4096, 1, 1);
    const f = { ctx, source, processeur, media, freq: ctx.sampleRate, tampons: [], depuisTranche: [], minuterie: null, file: Promise.resolve() };
    flux.current = f;
    processeur.onaudioprocess = (e) => {
      const copie = new Float32Array(e.inputBuffer.getChannelData(0));
      f.tampons.push(copie);
      f.depuisTranche.push(copie);
    };
    source.connect(processeur);
    processeur.connect(ctx.destination);

    const total = (liste) => liste.reduce((n, t) => n + t.length, 0);
    const coller = (liste) => {
      const tout = new Float32Array(total(liste));
      let o = 0;
      for (const t of liste) { tout.set(t, o); o += t.length; }
      return tout;
    };
    const envoyerTranche = () => {
      if (total(f.depuisTranche) < f.freq * 0.5) return; // moins d'une demi-seconde : rien à dire
      const pcm = coller(f.depuisTranche);
      f.depuisTranche = [];
      f.file = f.file.then(async () => {
        setTranscription(true);
        try {
          const texte = await envoyerWav(pcmVersWav(reduire(pcm, f.freq), Math.min(f.freq, 16000)));
          if (texte && !fini.current) {
            acquis.current = joindre(acquis.current, texte);
            rappels.current.onTexte?.(acquis.current, true);
          }
        } catch (e) {
          setErreur(e?.message || "Transcription impossible.");
        } finally {
          setTranscription(false);
        }
      });
    };
    f.minuterie = setInterval(() => { if (voulue.current) envoyerTranche(); }, TRANCHE_MS);

    f.arreter = async () => {
      const entier = coller(f.tampons);
      const duree = entier.length / f.freq;
      fermerFlux();
      await f.file; // les tranches déjà parties s'affichent d'abord
      // Puis l'enregistrement entier, d'un bloc : propre, ponctué, sans
      // raccords. Il remplace l'à-peu-près des tranches.
      if (duree >= RELECTURE_DES_S) {
        try {
          const propre = await envoyerWav(pcmVersWav(reduire(entier, f.freq), Math.min(f.freq, 16000)));
          if (propre && propre.length >= acquis.current.length * 0.6) {
            acquis.current = propre;
            rappels.current.onTexte?.(propre, true);
          }
        } catch { /* les tranches font foi */ }
      }
      finir();
    };
  }, [fermerFlux, finir]);

  // --- La reconnaissance du navigateur : le mot s'écrit quand on le dit ------
  const ecouterNavigateur = useCallback(() => {
    const r = new Reconnaissance();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let session = "";
    let enSuspens = "";

    r.onresult = (e) => {
      const { final, interim } = lireResultats(e.results);
      session = final;
      enSuspens = interim;
      rappels.current.onTexte?.(joindre(acquis.current, final, interim), !interim);
    };
    r.onerror = (e) => {
      if (REFUS_DU_SERVICE.has(e.error) && microDisponible() && Audio) {
        // Le navigateur a la reconnaissance mais ne la rend pas : le flux continu prend le relais.
        rec.current = null;
        r.onend = null;
        acquis.current = joindre(acquis.current, session, enSuspens);
        demarrerFlux();
        return;
      }
      if (e.error === "not-allowed") {
        setErreur("Le micro est refusé : autorisez-le dans le navigateur.");
        voulue.current = false;
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setErreur(`Dictée interrompue (${e.error}).`);
      }
    };
    r.onend = () => {
      // La phrase en cours au moment de la coupure est gardée, pas jetée.
      acquis.current = joindre(acquis.current, session, enSuspens);
      if (voulue.current) {
        // Coupée par le navigateur, pas par la personne : on reprend sans attendre.
        try { ecouterNavigateur(); return; } catch { /* on s'arrête */ }
      }
      // À l'arrêt : la ponctuation du texte (pas de l'audio), s'il est long.
      const texte = acquis.current.trim();
      if (texte.length >= PONCTUATION_DES) {
        ponctuer(texte)
          .then((propre) => finir(propre && propre.length >= texte.length * 0.7 ? propre : texte))
          .catch(() => finir(texte));
        return;
      }
      finir();
    };
    rec.current = r;
    r.start();
  }, [demarrerFlux, finir]);

  const demarrer = useCallback(() => {
    if (voulue.current) return;
    voulue.current = true;
    fini.current = false;
    acquis.current = "";
    setErreur(null);
    setEcoute(true);
    if (Reconnaissance) {
      try { ecouterNavigateur(); return; } catch { /* repli ci-dessous */ }
    }
    if (microDisponible() && Audio) demarrerFlux();
    else finir();
  }, [ecouterNavigateur, demarrerFlux, finir]);

  const arreter = useCallback(() => {
    const enRoute = voulue.current;
    voulue.current = false;
    if (enRoute) {
      setFinalisation(true);
      // Un service qui ne répond jamais ne doit pas laisser tourner l'attente.
      clearTimeout(garde.current);
      garde.current = setTimeout(() => setFinalisation(false), 45000);
    }
    rec.current?.stop?.();
    flux.current?.arreter?.();
  }, []);

  return { supporte: !!(Reconnaissance || (microDisponible() && Audio)), ecoute, demarrer, arreter, erreur, transcription, finalisation };
}
