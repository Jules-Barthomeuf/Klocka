import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// L'Équipe a rejoint Utilisateurs (3 nov. 2026, Jules : « plus simple avec clients, admin et mandataire ») : une
// seule page, deux cases par ligne. L'ancienne adresse /Equipe y mène, filtre Admins.
export default function AdminEquipe() {
  return <Navigate to={`${createPageUrl("AdminUtilisateurs")}`} replace />;
}
