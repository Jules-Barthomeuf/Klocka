import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import { DEFAUT, appliquerPrefs, ecrirePrefsLocales, lirePrefs, normaliser } from "@/lib/personnalisation";

// Les préférences de la personne, pour toute l'application.
//
// Au démarrage, la copie locale peint la page sans attendre. Quand le compte
// répond, ses préférences prennent le dessus et sont recopiées en local : un
// autre appareil retrouve ainsi les mêmes réglages dès qu'on s'y connecte.
// Chaque changement s'applique tout de suite, puis part au serveur après une
// courte pause, pour qu'un curseur qu'on promène ne fasse pas dix requêtes.

const Contexte = createContext(null);

export function PersonnalisationProvider({ children }) {
  const [prefs, poserPrefs] = useState(lirePrefs);
  const courantes = useRef(prefs);
  const { data: utilisateur } = useCurrentUser();
  const compteLu = useRef(null);
  const [etat, setEtat] = useState("ok"); // ok | enregistrement | erreur
  const minuterie = useRef(null);
  // Ce qui attend encore de partir au serveur : envoyé tout de suite si la
  // page se ferme ou passe en arrière-plan, pour qu'aucun réglage ne se perde.
  const enAttente = useRef(null);

  // Les réglages du compte, une fois l'utilisateur connu, et une fois par compte.
  useEffect(() => {
    if (!utilisateur?.id || compteLu.current === utilisateur.id) return;
    compteLu.current = utilisateur.id;
    if (utilisateur.preferences && typeof utilisateur.preferences === "object") {
      const p = normaliser(utilisateur.preferences);
      courantes.current = p;
      poserPrefs(p);
    }
  }, [utilisateur]);

  useEffect(() => {
    appliquerPrefs(prefs);
    ecrirePrefsLocales(prefs);
  }, [prefs]);

  // « Comme l'appareil » : on suit le système quand il change de côté.
  useEffect(() => {
    if (prefs.mode !== "appareil" || typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const suivre = () => appliquerPrefs(prefs);
    media.addEventListener("change", suivre);
    return () => media.removeEventListener("change", suivre);
  }, [prefs]);

  const enregistrer = useCallback((p) => {
    if (!utilisateur?.id) return;
    clearTimeout(minuterie.current);
    setEtat("enregistrement");
    enAttente.current = p;
    minuterie.current = setTimeout(async () => {
      enAttente.current = null;
      try {
        await base44.request("POST", "/api/moi/preferences", { body: p });
        setEtat("ok");
      } catch {
        setEtat("erreur");
      }
    }, 600);
  }, [utilisateur?.id]);

  useEffect(() => {
    const partir = () => {
      if (!enAttente.current) return;
      clearTimeout(minuterie.current);
      const p = enAttente.current;
      enAttente.current = null;
      base44.request("POST", "/api/moi/preferences", { body: p, keepalive: true }).catch(() => {});
    };
    const cache = () => { if (document.visibilityState === "hidden") partir(); };
    window.addEventListener("pagehide", partir);
    document.addEventListener("visibilitychange", cache);
    return () => { window.removeEventListener("pagehide", partir); document.removeEventListener("visibilitychange", cache); };
  }, []);

  const changer = useCallback((patch) => {
    const suivantes = normaliser({ ...courantes.current, ...patch });
    courantes.current = suivantes;
    poserPrefs(suivantes);
    enregistrer(suivantes);
  }, [enregistrer]);

  const reinitialiser = useCallback(() => changer({ ...DEFAUT }), [changer]);

  return (
    <Contexte.Provider value={{ prefs, changer, reinitialiser, etat, connecte: !!utilisateur?.id }}>
      {children}
    </Contexte.Provider>
  );
}

/** Les préférences et de quoi en changer. Hors du fournisseur : les défauts, figés. */
export function usePersonnalisation() {
  return useContext(Contexte) || { prefs: DEFAUT, changer: () => {}, reinitialiser: () => {}, etat: "ok", connecte: false };
}
