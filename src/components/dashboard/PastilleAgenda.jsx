import React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";

// L'Agenda, en haut à gauche du Dashboard (16 oct. 2026, Jules : « une pill comme les deux boîtes, avec Agenda :
// on clique et on voit la page »). Même dessin que la pilule des boîtes mail ; un point ambre quand quelque chose
// attend dans l'Agenda : un briefing à faire, ou un résumé à relire.
export default function PastilleAgenda() {
  const { data } = useQuery({ queryKey: ["agenda"], queryFn: () => base44.request("GET", "/api/semaine"), staleTime: 60_000, retry: false });
  const attend = !!(data?.a_faire || []).some((a) => !a.fait) || !!(data?.a_relire || []).length;
  return (
    <Link
      to={createPageUrl("Semaine")}
      className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-doux"
      title={attend ? "Quelque chose vous attend dans l'Agenda" : "Ouvrir l'Agenda"}
    >
      <CalendarDays className="h-3.5 w-3.5 text-ardoise" strokeWidth={1.7} />
      Agenda
      {attend && <span className="h-[7px] w-[7px] rounded-full bg-ambre" aria-label="À faire" />}
    </Link>
  );
}
