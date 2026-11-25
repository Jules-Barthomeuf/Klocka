import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Link2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J } from "@/design/jetons";

// « Lier » en bas à gauche de la saisie de la page Présentations (25 nov. 2026, Jules : « dans un chat comme avant, juste
// en bas à gauche tu mets Lier, on clique dessus, on lie et c'est tout ») : on choisit le projet, il devient une pastille ;
// la demande part avec lui (« commence la présentation » la lance sur ce projet). Sur le dessin de « Dossier : aucun ».

/**
 * @param {{ valeur: {id: string, titre: string}|null, onChoisir: (p: {id: string, titre: string}|null) => void, versLeHaut?: boolean }} props
 */
export default function LierProjet({ valeur, onChoisir, versLeHaut = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [cherche, setCherche] = useState("");
  const { data: projets = [], isLoading } = useQuery({
    queryKey: ["all-projects-presentations"],
    queryFn: () => base44.entities.Project.list("-created_date"),
    enabled: ouvert, staleTime: 60_000,
  });
  const liste = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    return projets.filter((p) => !q || [p.titre, p.adresse_complete, p.nom_locataire, p.client_email].filter(Boolean).join(" ").toLowerCase().includes(q)).slice(0, 40);
  }, [projets, cherche]);
  const choisir = (p) => { onChoisir(p ? { id: p.id, titre: p.titre || p.adresse_complete || "Sans titre" } : null); setOuvert(false); setCherche(""); };

  if (valeur) {
    return (
      <span className="inline-flex h-8 min-w-0 max-w-[260px] items-center gap-1.5 rounded-full pl-2.5 pr-1 text-[13px] text-encre" style={{ background: J["barre-relief"] }}
        title={`La demande part avec le projet « ${valeur.titre} »`}>
        <Building2 className="h-3.5 w-3.5 flex-none" style={{ color: J["menthe"] }} />
        <span className="truncate">{valeur.titre}</span>
        <button type="button" onClick={() => choisir(null)} aria-label="Retirer le projet" title="Retirer le projet"
          className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  }
  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="listbox" title="Lier un projet : la présentation se construit depuis ses données"
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-craie transition-colors hover:bg-barre-relief hover:text-encre" style={{ background: "transparent" }}>
        <Link2 className="h-3.5 w-3.5 flex-none" />Lier
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div role="listbox" className={`absolute left-0 z-20 w-[360px] max-w-[calc(100vw-2rem)] rounded-bloc border border-trait p-1.5 text-left shadow-[0_20px_50px_rgb(0_0_0/0.16)] duration-150 animate-in fade-in ${versLeHaut ? "bottom-full mb-3" : "top-full mt-2"}`}
            style={{ background: J["barre"] }}>
            <div className="flex items-center gap-2 border-b border-trait px-2.5 pb-2 pt-1">
              <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
              <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher un projet (titre, adresse, locataire)"
                className="w-full border-0 bg-transparent py-1 text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" style={{ background: "transparent" }} />
            </div>
            <div className="max-h-[300px] overflow-y-auto pt-1">
              {isLoading && <p className="m-0 px-3 py-2 text-[13px] text-brume">Chargement…</p>}
              {!isLoading && !liste.length && <p className="m-0 px-3 py-2 text-[13px] text-brume">{cherche ? "Aucun projet ne correspond." : "Aucun projet."}</p>}
              {liste.map((p) => (
                <button key={p.id} type="button" role="option" aria-selected={false} onClick={() => choisir(p)}
                  className="flex w-full flex-col rounded-champ px-3 py-2 text-left hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
                  <span className="truncate text-[13.5px] text-encre">{p.titre || "Sans titre"}</span>
                  {(p.adresse_complete || p.nom_locataire) && <span className="truncate text-[12px] text-ardoise">{[p.adresse_complete, p.nom_locataire].filter(Boolean).join(" · ")}</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
