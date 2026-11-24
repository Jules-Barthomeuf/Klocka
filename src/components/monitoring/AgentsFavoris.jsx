import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import PhotoFiche from "@/components/fiche-dossier/PhotoFiche";
import { ouvrirFiche } from "@/lib/fiche-dossier";

// Les agents favoris (24 nov. 2026, Jules : « dans Statistiques, sous le record, un tableau des agents favoris, ceux avec
// une étoile ») : les agents étoilés par l'équipe, le plus étoilé d'abord. Même ligne que l'ancien classement des
// meilleurs agents (MeilleursAgents.jsx) : sa photo, son nom qui ouvre sa fiche, son agence et ses fiches reçues sur la
// période ; à droite, qui l'a étoilé. L'étoile se pose et se retire sur la fiche de l'agent, pas ici.

export default function AgentsFavoris({ jours = 30, teintes = {} }) {
  const { data } = useQuery({ queryKey: ["agents-favoris", jours], queryFn: () => base44.request("GET", `/api/statistiques/agents-favoris?jours=${jours}`), placeholderData: (prev) => prev, staleTime: 30_000 });
  const agents = data?.agents || [];
  return (
    <section className="k-verre p-4">
      <h2 className="m-0 flex items-center gap-1.5 text-[14px] font-normal text-encre"><Star aria-hidden className="h-3.5 w-3.5 fill-ambre text-ambre" strokeWidth={1.8} />Agents favoris</h2>
      <p className="m-0 mb-3 mt-1 text-[12px] text-brume">Les agents étoilés par l'équipe, et leurs fiches reçues sur la période.</p>
      {!data ? <p className="m-0 py-3 text-[12.5px] text-brume">Chargement…</p> : !agents.length ? (
        <p className="m-0 pb-1 text-[12.5px] text-brume">Aucun agent étoilé pour l'instant : l'étoile se met à côté du nom, sur la fiche d'un agent.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {agents.map((a) => (
            <li key={a.cle} className="flex items-center gap-2.5 rounded-[12px] px-2.5 py-2 hover:bg-encre/[0.03]">
              <PhotoFiche cle={a.cle} nom={a.nom} photo={a.photo} taille={34} />
              <button type="button" onClick={() => ouvrirFiche(a.cle)} title={`Voir la fiche de ${a.nom}`} className="flex min-w-0 flex-1 flex-col items-start overflow-hidden text-left" style={{ background: "transparent" }}>
                <span className="max-w-full truncate text-[13.5px] text-encre hover:underline">{a.nom}</span>
                <span className="max-w-full truncate text-[12px] text-ardoise">{[a.detail, `${a.fiches || 0} fiche${a.fiches > 1 ? "s" : ""}`].filter(Boolean).join(" · ")}</span>
              </button>
              {/* Qui l'a étoilé : sa pastille de couleur et son prénom ; à plusieurs, le premier et le nombre des autres. */}
              <span className="flex max-w-[96px] flex-none items-center gap-1.5 text-[11.5px] text-ardoise" title={`Étoilé par ${a.par.map((p) => p.prenom).join(", ")}`}>
                <span aria-hidden className={`inline-block h-1.5 w-1.5 flex-none rounded-full ${teintes[a.par[0]?.email] ? "" : "bg-ambre"}`} style={teintes[a.par[0]?.email] ? { background: teintes[a.par[0].email] } : undefined} />
                <span className="truncate">{a.par[0]?.prenom}{a.par.length > 1 ? ` +${a.par.length - 1}` : ""}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
