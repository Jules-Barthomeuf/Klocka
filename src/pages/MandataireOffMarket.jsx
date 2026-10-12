import React from "react";
import OffMarket from "@/components/off-market/OffMarket";

// Off-market, côté mandataire K Partners : les villes de son secteur, son
// propre pipeline. Le nom de la page commence par « Mandataire » : c'est ce
// qui l'ouvre à ce rôle.
export default function MandataireOffMarket() {
  return <OffMarket espace="mandataire" />;
}
