import { useCallback, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";

// L'oreille d'AK : écouter le bureau en continu et lui envoyer ce qui se dit.
//
// Même reconnaissance que la dictée (le navigateur, Web Speech), mais sans
// fin : quand le navigateur s'arrête (il le fait au bout d'une minute de
// silence, ou toutes les quelques minutes), on repart. Chaque phrase finie
// part au serveur ; rien n'est gardé ici. L'écoute survit aux changements de
// page (le composant vit dans la mise en page), pas au rechargement : c'est
// voulu, personne ne doit se retrouver écouté sans l'avoir relancé.

const Reconnaissance =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export function useOreille() {
  const [ecoute, setEcoute] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoyes, setEnvoyes] = useState(0);
  const rec = useRef(null);
  const voulu = useRef(false);
  const dernierIndex = useRef(0);

  const envoyer = useCallback((texte) => {
    const t = texte.trim();
    if (t.length < 3) return;
    base44.request("POST", "/api/ak/oreille", { body: { texte: t } })
      .then(() => setEnvoyes((n) => n + 1))
      .catch((e) => setErreur(e?.message || "L'envoi a échoué."));
  }, []);

  const lancerUneFois = useCallback(() => {
    if (!Reconnaissance || !voulu.current) return;
    const r = new Reconnaissance();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.maxAlternatives = 1;
    dernierIndex.current = 0;
    r.onresult = (e) => {
      for (let i = dernierIndex.current; i < e.results.length; i += 1) {
        if (e.results[i].isFinal) { envoyer(e.results[i][0].transcript); dernierIndex.current = i + 1; }
      }
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed") { setErreur("Le micro est refusé : autorisez-le dans le navigateur."); voulu.current = false; setEcoute(false); }
      // « no-speech », « network », « aborted » : on repart au prochain onend.
    };
    r.onend = () => {
      rec.current = null;
      if (voulu.current) setTimeout(lancerUneFois, 300);
      else setEcoute(false);
    };
    rec.current = r;
    try { r.start(); setEcoute(true); } catch { setTimeout(lancerUneFois, 1000); }
  }, [envoyer]);

  const demarrer = useCallback(() => {
    if (!Reconnaissance || voulu.current) return;
    voulu.current = true;
    setErreur(null);
    lancerUneFois();
  }, [lancerUneFois]);

  const arreter = useCallback(() => {
    voulu.current = false;
    rec.current?.stop?.();
    setEcoute(false);
  }, []);

  useEffect(() => () => { voulu.current = false; rec.current?.abort?.(); }, []);

  return { supporte: !!Reconnaissance, ecoute, demarrer, arreter, erreur, envoyes };
}
