import React from "react";
import { Navigate, useLocation } from "react-router-dom";

// « Outils » (13 oct. 2026) a rejoint K-Vacance le 19 oct. 2026 : les anciennes adresses /Outils?… mènent à la même
// recherche dans K-Vacance.
export default function OutilsPage() {
  const { search } = useLocation();
  return <Navigate to={`/KVacance${search}`} replace />;
}
