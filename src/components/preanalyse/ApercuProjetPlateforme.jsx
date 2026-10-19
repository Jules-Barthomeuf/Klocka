import React from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Calculator, Eye } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import CarteProjet, { statutLabels, ETAPES_PROJET } from "@/components/projet/CarteProjet";

// L'étape Plateforme d'un dossier entré (19 oct. 2026, Jules : « une preview, pas juste un bouton ») : la carte du
// projet telle que la page Projets la montre (photo, étape, chiffres), et à côté où il en est, avec les gestes.

export default function ApercuProjetPlateforme({ projetId }) {
  const navigate = useNavigate();
  const { data: projet, isLoading, isError } = useQuery({
    queryKey: ["projet-apercu", projetId],
    queryFn: () => base44.entities.Project.get(projetId),
    enabled: !!projetId,
    staleTime: 30_000,
  });
  const ouvrir = () => navigate(`/Projets?id=${projetId}`);
  const rang = Math.max(0, ETAPES_PROJET.indexOf(projet?.statut || "prospect"));
  const suivante = ETAPES_PROJET[rang + 1] || null;

  return (
    <div className="k-entree grid gap-6 rounded-[18px] border border-trait bg-surface p-5 md:grid-cols-[minmax(0,400px)_minmax(0,1fr)] md:p-6">
      <div className="min-w-0">
        {projet ? <CarteProjet project={projet} onOuvrir={ouvrir} />
          : <div className={`h-[380px] rounded-[18px] border border-trait bg-surface-pleine ${isLoading ? "animate-pulse" : ""}`} aria-hidden />}
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-5">
        <div>
          <p className="m-0 text-[12.5px] uppercase tracking-[.12em] text-menthe">Dans la plateforme</p>
          <h3 className="m-0 mt-2 text-[24px] font-normal leading-[1.25] tracking-[-0.01em] text-encre">Le deal est entré dans la plateforme</h3>
          <p className="m-0 mt-2 max-w-[520px] text-[14px] leading-[1.6] text-ardoise">
            {isError ? "Le projet ne s'est pas chargé : il s'ouvre quand même depuis le bouton." : "La fiche projet suit le client : message envoyé, retour oui ou non, puis la négociation et le financement."}
          </p>
        </div>
        {projet && (
          <div className="flex flex-wrap gap-x-8 gap-y-3 border-t border-trait pt-4 text-[13.5px]">
            <div><p className="m-0 text-ardoise">Étape</p><p className="m-0 mt-0.5 text-encre">{statutLabels[projet.statut] || "Prospect"}</p></div>
            {suivante && <div><p className="m-0 text-ardoise">Ensuite</p><p className="m-0 mt-0.5 text-encre">{statutLabels[suivante]}</p></div>}
            {projet.adresse_complete && <div className="min-w-0"><p className="m-0 text-ardoise">Adresse</p><p className="m-0 mt-0.5 truncate text-encre">{projet.adresse_complete}</p></div>}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="button" onClick={ouvrir} className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol">
            Ouvrir le projet <ArrowRight className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => window.open(`${createPageUrl("ProjetDetail")}?id=${projetId}`, "_blank")}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-bord-doux px-4 text-[14px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <Eye className="h-4 w-4" /> Vue client
          </button>
          <button type="button" onClick={() => window.open(`${createPageUrl("SimulateurRentabilite")}?projectId=${projetId}`, "_blank")}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-bord-doux px-4 text-[14px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <Calculator className="h-4 w-4" /> Simulateur
          </button>
        </div>
      </div>
    </div>
  );
}
