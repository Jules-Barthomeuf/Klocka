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

/** Un enregistrement du navigateur, décodé puis réécrit en WAV mono 16 kHz. */
async function versWav(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const son = await ctx.decodeAudioData(await blob.arrayBuffer());
  const freq = 16000;
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

/**
 * @param {{ onTexte?: (texte: string, final: boolean) => void, onFin?: (texte: string) => void }} options
 * @returns {{ supporte: boolean, ecoute: boolean, demarrer: () => void, arreter: () => void, erreur: string|null }}
 */
export function useDictee({ onTexte, onFin } = {}) {
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState(null);
  const rec = useRef(null);
  const cumul = useRef("");
  const rappels = useRef({ onTexte, onFin });
  rappels.current = { onTexte, onFin };

  const [transcription, setTranscription] = useState(false);
  const enregistreur = useRef(null);
  useEffect(() => () => { rec.current?.abort?.(); enregistreur.current?.stream?.getTracks?.().forEach((t) => t.stop()); }, []);

  // Le repli : enregistrer, puis transcrire au serveur à l'arrêt.
  const demarrerEnregistrement = useCallback(async () => {
    setErreur(null);
    let flux;
    try {
      flux = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErreur("Le micro est refusé : autorisez-le dans le navigateur.");
      return;
    }
    const morceaux = [];
    const m = new Enregistreur(flux);
    m.ondataavailable = (e) => { if (e.data?.size) morceaux.push(e.data); };
    m.onstop = async () => {
      flux.getTracks().forEach((t) => t.stop());
      enregistreur.current = null;
      setEcoute(false);
      if (!morceaux.length) return;
      setTranscription(true);
      try {
        const wav = await versWav(new Blob(morceaux, { type: m.mimeType || "audio/ogg" }));
        const octets = new Uint8Array(await wav.arrayBuffer());
        let binaire = "";
        for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
        const j = await base44.request("POST", "/api/dictee", { body: { audio: btoa(binaire) } });
        const texte = String(j?.texte || "").trim();
        if (texte) {
          rappels.current.onTexte?.(texte, true);
          rappels.current.onFin?.(texte);
        }
      } catch (e) {
        setErreur(e?.message || "Transcription impossible.");
      } finally {
        setTranscription(false);
      }
    };
    enregistreur.current = { m, stream: flux };
    m.start();
    setEcoute(true);
  }, []);

  const demarrer = useCallback(() => {
    if (ecoute) return;
    if (!Reconnaissance) {
      if (Enregistreur) demarrerEnregistrement();
      return;
    }
    const r = new Reconnaissance();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    cumul.current = "";
    setErreur(null);

    r.onresult = (e) => {
      let final = "";
      let interimaire = "";
      for (let i = 0; i < e.results.length; i += 1) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t;
        else interimaire += t;
      }
      cumul.current = final;
      rappels.current.onTexte?.((final + " " + interimaire).replace(/\s+/g, " ").trim(), !interimaire);
    };
    r.onerror = (e) => {
      // « no-speech » et « aborted » ne sont pas des erreurs pour l'utilisateur.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setErreur(
          e.error === "not-allowed"
            ? "Le micro est refusé : autorisez-le dans le navigateur."
            : `Dictée interrompue (${e.error}).`
        );
      }
    };
    r.onend = () => {
      setEcoute(false);
      rec.current = null;
      const texte = cumul.current.trim();
      if (texte) rappels.current.onFin?.(texte);
    };
    rec.current = r;
    setEcoute(true);
    try {
      r.start();
    } catch {
      setEcoute(false);
      rec.current = null;
    }
  }, [ecoute, demarrerEnregistrement]);

  const arreter = useCallback(() => {
    rec.current?.stop?.();
    if (enregistreur.current?.m?.state === "recording") enregistreur.current.m.stop();
  }, []);

  return { supporte: !!(Reconnaissance || Enregistreur), ecoute, demarrer, arreter, erreur, transcription };
}
