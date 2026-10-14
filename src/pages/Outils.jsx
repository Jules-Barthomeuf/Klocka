import React from "react";
import Vacance from "@/components/outils/Vacance";

// Outils (13 oct. 2026) : le menu des outils de terrain de l'équipe. Le
// premier, Vacance, montre sur une carte les signaux publics qui annoncent
// qu'un local va se libérer autour d'une adresse.
export default function OutilsPage() {
  // Le taux de vacance est dans Vacance, panneau de droite (14 oct. 2026).
  return <Vacance />;
}
