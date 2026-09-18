// Le thème : sombre par défaut, clair au choix.
//
// Tout tient dans un attribut posé sur <html>. Les couleurs de l'application
// sont des variables CSS (index.css), et Tailwind ne connaît que leurs noms :
// changer cet attribut repeint les quelque cinq mille usages de classes d'un
// coup, sans qu'aucun écran ait à savoir qu'un thème existe.
//
// La classe « dark » suit le même interrupteur : c'est elle que lisent les
// composants shadcn, dont les variables sont déjà calées sur nos jetons.

import { useCallback, useEffect, useState } from "react";

const CLE = "klocka-theme";
export const SOMBRE = "sombre";
export const CLAIR = "clair";

/** Le thème retenu, ou le sombre — c'est là que Klocka s'ouvre. */
export function lireTheme() {
  try {
    return localStorage.getItem(CLE) === CLAIR ? CLAIR : SOMBRE;
  } catch {
    // Navigation privée, stockage refusé : le sombre reste.
    return SOMBRE;
  }
}

/** Pose le thème sur <html>. Appelé au démarrage, avant le premier rendu. */
export function appliquerTheme(theme) {
  const clair = theme === CLAIR;
  const racine = document.documentElement;
  if (clair) racine.setAttribute("data-theme", CLAIR);
  else racine.removeAttribute("data-theme");
  racine.classList.toggle("dark", !clair);
  // Les éléments natifs — ascenseurs, champs de formulaire — suivent aussi.
  racine.style.colorScheme = clair ? "light" : "dark";
}

/**
 * Le thème et de quoi en changer. Le choix se retient d'une fois sur l'autre,
 * et vaut pour l'appareil, pas pour le compte : un même dossier se relit dans
 * le train en sombre et au bureau en clair.
 */
export function useTheme() {
  const [theme, poser] = useState(lireTheme);

  useEffect(() => {
    appliquerTheme(theme);
    try {
      localStorage.setItem(CLE, theme);
    } catch { /* stockage refusé : le thème vaut pour cette session */ }
  }, [theme]);

  const basculer = useCallback(() => poser((t) => (t === CLAIR ? SOMBRE : CLAIR)), []);
  return { theme, clair: theme === CLAIR, poser, basculer };
}