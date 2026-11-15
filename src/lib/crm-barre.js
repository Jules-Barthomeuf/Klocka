import { base44 } from "@/api/base44Client";
import { apercuAdmin } from "@/lib/vue";

// La barre du CRM (espaces, pages, vues, colonnes) sans attendre (15 nov. 2026, Jules : « réduis le temps de
// chargement du crm ») : la dernière reçue est gardée dans le navigateur, montrée tout de suite à l'ouverture, et le
// tableau part aussitôt pendant qu'on la relit derrière. Elle se lit aussi au survol du lien CRM, avant le clic.
// Elle ne porte que la structure du CRM et les membres de l'équipe, pas les fiches.

/** L'espace mandataire quand Jules regarde Klocka comme un mandataire ; sinon rien. */
export const espaceCrm = () => (apercuAdmin() === "mandataire" ? "mandataire" : "");
export const cleBarreCrm = () => ["crm-barre", espaceCrm()];
export const lireBarreCrm = () => base44.request("GET", espaceCrm() ? "/api/crm/ecran?espace=mandataire" : "/api/crm/ecran");

const cleLocale = (email) => `crm-barre-v1-${String(email || "").toLowerCase()}-${espaceCrm() || "equipe"}`;

/** La dernière barre reçue par cette personne dans ce navigateur, ou undefined. */
export function barreGardee(email) {
  if (!email) return undefined;
  try {
    const b = JSON.parse(localStorage.getItem(cleLocale(email)));
    return b && Array.isArray(b.dossiers) ? b : undefined;
  } catch { return undefined; }
}

export function garderBarre(email, barre) {
  if (!email) return;
  try {
    if (barre) localStorage.setItem(cleLocale(email), JSON.stringify(barre));
    else localStorage.removeItem(cleLocale(email));
  } catch { /* navigateur sans stockage, ou plein : la barre se relit à chaque ouverture */ }
}

/** Au survol du lien CRM : la barre se lit déjà ; le clic la trouve prête. */
export function prechargerBarreCrm(queryClient) {
  queryClient.prefetchQuery({ queryKey: cleBarreCrm(), queryFn: lireBarreCrm, staleTime: 120_000, retry: false }).catch(() => {});
}
