import { base44 } from "@/api/base44Client";

// La requête du Suivi des appels, partagée par la page et par le survol de l'onglet « Appels » (15 nov. 2026, Jules :
// « le temps de chargement de Suivi appels est trop élevé ») : les chiffres se lisent avant le clic.
export const cleSuiviAppels = (jours, dansProspection) => ["suivi-appels", jours, dansProspection];
export const lireSuiviAppels = (jours, dansProspection) => base44.request("GET", `${dansProspection ? "/api/prospection/suivi-appels" : "/api/monitoring/appels"}?jours=${jours}`);
// Lus il y a moins de 15 s : montrés sans relire (le survol vient d'aller les chercher).
export const FRAIS_SUIVI_APPELS = 15_000;

export function prechargerSuiviAppels(queryClient) {
  queryClient.prefetchQuery({ queryKey: cleSuiviAppels(30, false), queryFn: () => lireSuiviAppels(30, false), staleTime: FRAIS_SUIVI_APPELS }).catch(() => {});
}
