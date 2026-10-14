import React from "react";
import { useSearchParams } from "react-router-dom";
import Vacance from "@/components/outils/Vacance";
import TauxVacance from "@/components/outils/TauxVacance";

// Outils (13 oct. 2026) : le menu des outils de terrain de l'équipe. Le
// premier, Vacance, montre sur une carte les signaux publics qui annoncent
// qu'un local va se libérer autour d'une adresse.
export default function OutilsPage() {
  const [sp] = useSearchParams();
  // Le taux de vacance (14 oct. 2026) : « ?outil=taux ».
  return sp.get("outil") === "taux" ? <TauxVacance /> : <Vacance />;
}
