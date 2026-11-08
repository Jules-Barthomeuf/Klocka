import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Le bandeau de la Mise en vente (7 nov. 2026, Jules) : sous les onglets, visible de chacun, les compteurs de la vente
// (contacts, qualifiés, visites, offres, jours en ligne). Les six temps (Préparer … Offre acceptée) retirés le même jour.
// Le serveur : GET /api/mandataire/marches/:id/vente-etat.

/** L'état de la vente d'un bien : phases, compteurs, onglets et conseils de l'assistant (partagé avec la colonne du chat). */
export function useVenteEtat(marcheId) {
  return useQuery({
    queryKey: ["m-vente-etat", marcheId],
    queryFn: () => base44.request("GET", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/vente-etat`),
    enabled: !!marcheId,
  });
}

const COMPTEURS = [
  ["contacts", "contact", "contacts"],
  ["qualifies", "qualifié", "qualifiés"],
  ["visites", "visite", "visites"],
  ["offres", "offre", "offres"],
  ["jours_en_ligne", "jour en ligne", "jours en ligne"],
];

export default function BandeauVente({ marcheId }) {
  const { data: v, isError } = useVenteEtat(marcheId);
  if (isError || !v) return null;
  const c = v.compteurs || {};
  const chiffres = COMPTEURS.filter(([k]) => typeof c[k] === "number");
  if (!chiffres.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 py-2" aria-label="Où en est la vente">
      {/* Les six temps de la vente (Préparer … Offre acceptée) retirés le 7 nov. 2026 (Jules) : les compteurs seuls. */}
      {chiffres.length > 0 && (
        <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-ardoise">
          {chiffres.map(([k, un, plusieurs]) => (
            <span key={k} className="whitespace-nowrap"><span className="tabular-nums text-encre">{c[k]}</span> {c[k] > 1 ? plusieurs : un}</span>
          ))}
        </p>
      )}
    </div>
  );
}
