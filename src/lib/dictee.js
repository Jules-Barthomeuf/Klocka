import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// Dicter au lieu de taper. Le navigateur fait la reconnaissance lui-même
// (Web Speech API : Chrome, Edge, Safari) — rien ne part chez nous avant que
// le texte existe, et rien n'est enregistré. Sans prise en charge, le hook le
// dit et la dictée du clavier du téléphone reste possible dans le champ.

const Reconnaissance =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

// Firefox n'a pas la reconnaissance vocale du navigateur (Web Speech) : il
// sait enregistrer le micro, pas le transcrire. Là, on enregistre, on
// convertit en WAV (lu par tous les services, contrairement à l'Ogg de
// Firefox ou au WebM de Chrome), et le serveur transcrit.
const Enregistreur =
  typeof window !== "undefined" && window.MediaRecorder && navigator?.mediaDevices?.getUserMedia ? window.MediaRecorder : null;

/**
 * Un enregistrement du navigateur, décodé puis réécrit en WAV mono (16 kHz
 * par défaut ; 8 kHz, la qualité du téléphone, pour un appel entier).
 */
export async function versWav(blob, freq = 16000) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const son = await ctx.decodeAudioData(await blob.arrayBuffer());
  const hors = new OfflineAudioContext(1, Math.ceil(son.duration * freq), freq);
  const src = hors.createBufferSource();
  src.buffer = son;
  src.connect(hors.destination);
  src.start();
  const rendu = await hors.startRendering();
  ctx.close?.();
  const pcm = rendu.getChannelData(0);
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

// La dictée s'écrit dans le champ pendant qu'on parle, et ne s'arrête que sur
// le clic de la personne :
//  - avec la reconnaissance du navigateur, elle est relancée à chaque fois
//    que le navigateur la coupe (Chrome l'arrête après un silence) ;
//  - sans elle, ou quand le navigateur la refuse (Safari sans Siri, réseau),
//    le micro est enregistré par tranches de quelques secondes, et chaque
//    tranche transcrite s'ajoute au texte dès qu'elle revient.
const TRANCHE_MS = 4000;
const REFUS_DU_SERVICE = new Set(["service-not-allowed", "network", "language-not-supported"]);

/** Un morceau d'audio du navigateur, transcrit par le serveur. */
async function transcrire(blob, type) {
  const wav = await versWav(new Blob([blob], { type: type || "audio/ogg" }));
  const octets = new Uint8Array(await wav.arrayBuffer());
  let binaire = "";
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  const j = await base44.request("POST", "/api/dictee", { body: { audio: btoa(binaire) } });
  return String(j?.texte || "").trim();
}

const joindre = (...morceaux) => morceaux.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

/**
 * @param {{ onTexte?: (texte: string, final: boolean) => void, onFin?: (texte: string) => void }} options
 *   `onTexte` reçoit tout le texte dicté depuis le clic, à chaque nouveauté.
 * @returns {{ supporte: boolean, ecoute: boolean, demarrer: () => void, arreter: () => void, erreur: string|null, transcription: boolean }}
 */
export function useDictee({ onTexte, onFin } = {}) {
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [transcription, setTranscription] = useState(false);
  const rappels = useRef({ onTexte, onFin });
  rappels.current = { onTexte, onFin };

  // L'état d'une dictée : voulue tant que la personne n'a pas cliqué pour
  // arrêter ; le texte acquis (sessions finies, tranches transcrites).
  const voulue = useRef(false);
  const acquis = useRef("");
  const rec = useRef(null);
  const micro = useRef(null); // { flux, enregistreur, file: Promise }

  const finir = useCallback(() => {
    voulue.current = false;
    rec.current = null;
    setEcoute(false);
    const texte = acquis.current.trim();
    if (texte) rappels.current.onFin?.(texte);
  }, []);

  useEffect(() => () => {
    voulue.current = false;
    rec.current?.abort?.();
    micro.current?.flux?.getTracks?.().forEach((t) => t.stop());
  }, []);

  // --- Par tranches : enregistrer, transcrire, ajouter -----------------------
  const demarrerTranches = useCallback(async () => {
    setErreur(null);
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErreur("Le micro est refusé : autorisez-le dans le navigateur.");
      finir();
      return;
    }
    // Les tranches se transcrivent l'une après l'autre, dans l'ordre.
    const etat = { flux, enregistreur: null, file: Promise.resolve() };
    micro.current = etat;
    const tranche = () => {
      const morceaux = [];
      const m = new Enregistreur(flux);
      etat.enregistreur = m;
      m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
      m.onstop = () => {
        const encore = voulue.current;
        if (encore) tranche();
        if (morceaux.length) {
          etat.file = etat.file.then(async () => {
            setTranscription(true);
            try {
              const texte = await transcrire(new Blob(morceaux, { type: m.mimeType }), m.mimeType);
              if (texte) {
                acquis.current = joindre(acquis.current, texte);
                rappels.current.onTexte?.(acquis.current, true);
              }
            } catch (e) {
              setErreur(e?.message || "Transcription impossible.");
            } finally {
              setTranscription(false);
            }
          });
        }
        if (!encore) {
          etat.file.then(() => {
            flux.getTracks().forEach((t) => t.stop());
            micro.current = null;
            finir();
          });
        }
      };
      m.start();
      setTimeout(() => { if (m.state === "recording") m.stop(); }, TRANCHE_MS);
    };
    tranche();
  }, [finir]);

  // --- La reconnaissance du navigateur, relancée tant qu'on la veut ---------
  const ecouterNavigateur = useCallback(() => {
    const r = new Reconnaissance();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    let session = "";

    r.onresult = (e) => {
      let final = "";
      let interimaire = "";
      for (let i = 0; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interimaire += t;
      }
      session = final;
      rappels.current.onTexte?.(joindre(acquis.current, final, interimaire), !interimaire);
    };
    r.onerror = (e) => {
      if (REFUS_DU_SERVICE.has(e.error) && Enregistreur) {
        // Le navigateur a la reconnaissance mais ne la rend pas : on passe aux tranches.
        rec.current = null;
        r.onend = null;
        acquis.current = joindre(acquis.current, session);
        demarrerTranches();
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
      acquis.current = joindre(acquis.current, session);
      if (voulue.current) {
        // Coupée par le navigateur, pas par la personne : on reprend.
        try { ecouterNavigateur(); return; } catch { /* on s'arrête */ }
      }
      finir();
    };
    rec.current = r;
    r.start();
  }, [demarrerTranches, finir]);

  const demarrer = useCallback(() => {
    if (voulue.current) return;
    voulue.current = true;
    acquis.current = "";
    setErreur(null);
    setEcoute(true);
    if (Reconnaissance) {
      try { ecouterNavigateur(); return; } catch { /* repli ci-dessous */ }
    }
    if (Enregistreur) demarrerTranches();
    else finir();
  }, [ecouterNavigateur, demarrerTranches, finir]);

  const arreter = useCallback(() => {
    voulue.current = false;
    rec.current?.stop?.();
    const m = micro.current?.enregistreur;
    if (m?.state === "recording") m.stop();
  }, []);

  return { supporte: !!(Reconnaissance || Enregistreur), ecoute, demarrer, arreter, erreur, transcription };
}
