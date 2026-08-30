import { useCallback, useEffect, useRef, useState } from "react";

// Dicter au lieu de taper. Le navigateur fait la reconnaissance lui-même
// (Web Speech API : Chrome, Edge, Safari) — rien ne part chez nous avant que
// le texte existe, et rien n'est enregistré. Sans prise en charge, le hook le
// dit et la dictée du clavier du téléphone reste possible dans le champ.

const Reconnaissance =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

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

  useEffect(() => () => rec.current?.abort?.(), []);

  const demarrer = useCallback(() => {
    if (!Reconnaissance || ecoute) return;
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
  }, [ecoute]);

  const arreter = useCallback(() => {
    rec.current?.stop?.();
  }, []);

  return { supporte: !!Reconnaissance, ecoute, demarrer, arreter, erreur };
}
