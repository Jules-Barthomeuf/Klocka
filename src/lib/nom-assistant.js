import { useAuthPeutEtre } from "@/lib/AuthContext";
import { vueDe } from "@/lib/vue";

// Un moteur, deux noms à l'écran (10 nov. 2026, Jules : « je ne veux pas que l'on voie Assistant KPartners en
// admin et Assistant Klocka en partie mandataires ») : l'équipe Klocka voit l'Assistant Klocka, les mandataires
// du réseau (et l'admin en Vue Mandataire) l'Assistant KPartners. Jamais Haka ni AK côté mandataire.

export const NOM_KLOCKA = "Assistant Klocka";
export const NOM_KPARTNERS = "Assistant KPartners";

/** Pure : le nom de l'assistant dans une vue ("admin" | "client" | "mandataire"). */
export function nomAssistant(vue) {
  return vue === "mandataire" ? NOM_KPARTNERS : NOM_KLOCKA;
}

/** Le nom de l'assistant pour la vue de la personne connectée (sans erreur hors du fournisseur d'authentification). */
export function useNomAssistant() {
  const auth = useAuthPeutEtre();
  return nomAssistant(vueDe(auth?.user));
}
