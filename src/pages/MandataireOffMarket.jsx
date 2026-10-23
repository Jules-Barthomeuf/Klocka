import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Off-market, côté mandataire : depuis le 23 oct. 2026 (Jules), c'est l'onglet Prospecter de la Prospection.
// L'ancienne adresse y mène, pour les liens et les notifications d'avant.
export default function MandataireOffMarket() {
  return <Navigate to={createPageUrl("MandataireProspection")} replace />;
}
