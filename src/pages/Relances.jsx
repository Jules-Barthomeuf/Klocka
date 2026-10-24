import React from "react";
import { Navigate } from "react-router-dom";
import { createPageUrl } from "@/utils";

// Les relances ont rejoint la Prospection (16 oct. 2026, Jules) : l'ancienne adresse y mène.
export default function Relances() {
  return <Navigate to={`${createPageUrl("Prospection")}?partie=listes`} replace />;
}
