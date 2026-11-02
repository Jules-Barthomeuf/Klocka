import React from "react";
import SuiviActivite from "@/pages/SuiviActivite";

// Le tableau de bord du mandataire (2 nov. 2026, Jules : « je ne le vois pas dans la nav barre », depuis l'espace
// mandataire) : le tableau de bord de l'équipe, sur ses seuls biens, sans le tableau par mandataire.
export default function MandataireTableauDeBord() {
  return <SuiviActivite pourMandataire />;
}
