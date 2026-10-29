import React from "react";
import Loader from "@/components/ui/Loader";
import { useAuthPeutEtre } from "@/lib/AuthContext";
import { vueDe } from "@/lib/vue";

// Le chargement, partout le même (16 oct. 2026, Jules : « harmonise ») : depuis le 28 oct. 2026, l'animation de la marque,
// en grand au milieu de sa zone. K Partners en vue mandataire (violet, « kp_ »), Klocka ailleurs (menthe, le logo de
// Klocka OS). Les tailles d'avant restent acceptées : « grand » pour une page, « moyen » et « petit » pour un cadre.

const ETATS = ["Je rassemble les informations", "Je les mets en ordre", "J'affiche"];

export default function Chargement({ taille = "moyen", titre = "Un instant", etats = ETATS, className = "" }) {
  const auth = useAuthPeutEtre();
  const marque = vueDe(auth?.user) === "mandataire" ? "kp" : "klocka";
  const phrase = (etats?.length ? etats : ETATS)[0];
  return <Loader marque={marque} titre={titre} sousTitre={phrase} taille={taille === "grand" ? "lg" : "md"} className={className} />;
}
