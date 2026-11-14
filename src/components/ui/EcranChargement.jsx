import React, { useEffect, useState } from "react";
import { useAuthPeutEtre } from "@/lib/AuthContext";
import { vueDe } from "@/lib/vue";

// L'écran de chargement d'une page (14 nov. 2026, Jules, sur une maquette : « enlève le truc qui tourne, à la place un
// écran noir avec Klocka ») : fond noir, le nom au centre en gris clair, une bande de lumière blanche qui le traverse de
// gauche à droite en boucle (index.css, .k-ecran-chargement). « K Partners » dans l'espace mandataire, jamais Klocka.
// `plein` : tout l'écran (ouverture de l'app) ; sinon la zone de la page, sous la barre de navigation. `delai` : rien
// les premières millisecondes, pour qu'un chargement court ne fasse pas clignoter le noir.

export default function EcranChargement({ plein = false, delai = 0 }) {
  const auth = useAuthPeutEtre();
  const nom = vueDe(auth?.user) === "mandataire" ? "K Partners" : "Klocka";
  const [voir, setVoir] = useState(!delai);
  useEffect(() => {
    if (!delai) return undefined;
    const t = setTimeout(() => setVoir(true), delai);
    return () => clearTimeout(t);
  }, [delai]);
  if (!voir) return null;
  return (
    <div className={`k-ecran-chargement ${plein ? "fixed inset-0 z-[100]" : "min-h-[100dvh]"}`} role="status" aria-label={`${nom} se charge`}>
      <h1>{nom}</h1>
    </div>
  );
}
