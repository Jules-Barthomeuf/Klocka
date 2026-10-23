import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Off-market, côté mandataire : depuis le 23 oct. 2026 (Jules), il vit dans la Prospection, vue « Commerces ».
// L'ancienne adresse y mène, pour les liens et les notifications d'avant.
export default function MandataireOffMarket() {
  return <Navigate to={`${createPageUrl("MandataireProspection")}?vue=commerces`} replace />;
}
