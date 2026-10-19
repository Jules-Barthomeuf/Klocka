import React from "react";
import Vacance from "@/components/outils/Vacance";

// K-Vacance (19 oct. 2026, Jules : « remplace K-Vacance par les Signaux de vacance, mais garde le nom K-Vacance ») :
// la carte des signaux publics qui annoncent qu'un local va se libérer, avec le taux de vacance de la zone, de
// la rue et de la commune. L'ancienne lecture « devantures vides, rythme de rotation » (OpenStreetMap et
// registre) n'a plus d'écran ; ses anciennes recherches restent en base.
export default function KVacance() {
  return <Vacance />;
}
