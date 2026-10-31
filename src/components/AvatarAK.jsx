import React from "react";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { PERSONNAGES_HAKA } from "@/lib/personnalisation";

// Le portrait de l'assistant, le même dans tous les chats : le personnage choisi dans Paramètres > Personnalisation (18 oct. 2026, Jules).
export default function AvatarAK({ className = "h-9 w-9" }) {
  const { prefs } = usePersonnalisation();
  const src = PERSONNAGES_HAKA[prefs?.personnage_haka] || PERSONNAGES_HAKA["haka-1"];
  return <img src={src} alt="Assistant KPartners" draggable={false} className={`${className} flex-none select-none rounded-full object-cover`} />;
}
