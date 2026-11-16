import { base44 } from "@/api/base44Client";

// La requête du Suivi > Usage, partagée par la page et par le survol de ses liens (16 nov. 2026, Jules : « pour
// charger Suivi ça charge trop lentement ») : les chiffres des 30 jours se lisent avant le clic.
export const cleUsage = (jours) => ["monitoring-usage", jours];
export const lireUsage = (jours) => base44.request("GET", `/api/monitoring/usage?jours=${jours}`);
// Lus il y a moins de 15 s : montrés sans relire (le survol vient d'aller les chercher).
export const FRAIS_USAGE = 15_000;

export function prechargerUsage(queryClient) {
  queryClient.prefetchQuery({ queryKey: cleUsage(30), queryFn: () => lireUsage(30), staleTime: FRAIS_USAGE }).catch(() => {});
}
