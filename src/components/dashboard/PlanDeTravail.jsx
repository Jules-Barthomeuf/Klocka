import React from "react";
import ReprisePlace from "./ReprisePlace";
import CeQuiVousAttend from "@/components/dashboard/CeQuiVousAttend";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { J, alpha } from "@/design/jetons";

// Le plan de travail (maquette du 28 septembre 2026) : le salut, le chat au
// centre, puis deux colonnes, ce qui est dû et ce qu'on avait laissé en plan.
// Rien ne part vers l'extérieur sans que le texte ait été relu : une action
// « mail » ouvre un brouillon éditable, jamais un envoi.

export default function PlanDeTravail({ chat = null }) {
  const utilisateur = useUser();
  const brut = (utilisateur?.full_name || utilisateur?.email || "").split(/[ @]/)[0] || "";
  const prenom = brut ? brut.charAt(0).toUpperCase() + brut.slice(1) : "";

  const { data: sante } = useQuery({ queryKey: ["sante"], queryFn: () => base44.request("GET", "/api/health"), staleTime: 60000 });

  return (
    <div>
      <header className="flex flex-col items-center pt-8 text-center max-md:pt-5">
        <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>
          Bonjour{prenom ? ` ${prenom}` : ""}. Que puis-je faire pour vous ?
        </h1>
        {chat && <div className="mt-6 w-full max-w-[660px] max-md:mt-5">{chat}</div>}
      </header>

      {/* Le stockage, tant qu'il n'est pas sûr : on ne découvre pas la perte après coup. */}
      {sante?.hebergeur === "render" && !sante?.base?.persistante && (
        <div className="mt-8 rounded-bloc border px-5 py-4" style={{ borderColor: alpha("alerte", 0.4), background: J["surface-pleine"] }}>
          <p className="m-0 text-[11px] uppercase tracking-[.18em] text-alerte">La base sera effacée au prochain déploiement</p>
          <p className="m-0 mt-1.5 text-[13.5px] leading-[1.6] text-craie">{sante.base?.diagnostic}</p>
          <p className="m-0 mt-1.5 text-[12.5px] text-brume">
            Chemin : {sante.base?.emplacement} · déclaré : {sante.base?.declaree ? "oui" : "non"} · disque monté : {sante.base?.disque_monte ? "oui" : "non"}
          </p>
        </div>
      )}

      {/* Ce qui est dû à gauche, ce qu'on avait laissé en plan à droite. Un
          bloc vide se cache : une barre au-dessus du néant ne sépare rien. */}
      <div className="mx-auto mt-12 grid max-w-[880px] gap-x-12 gap-y-8 md:grid-cols-2 max-md:mt-8">
        <CeQuiVousAttend />
        <ReprisePlace />
      </div>
    </div>
  );
}
