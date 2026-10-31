import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Projets, côté mandataire : retiré du menu le 31 oct. 2026 (Jules, PLAN.md 0.3). Un mandataire suit ses biens dans
// Biens ; l'ancienne adresse y mène, pour les liens et les notifications d'avant.
export default function MandataireProjets() {
  return <Navigate to={createPageUrl("MandataireBiens")} replace />;
}
