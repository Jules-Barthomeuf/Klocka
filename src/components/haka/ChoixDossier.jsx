import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, FolderOpen, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J } from "@/design/jetons";

// « Dossier : aucun ▾ » dans la saisie de l'Accueil (17 oct. 2026, Jules) :
// choisir un dossier donne à Haka son contexte, comme un projet. La demande
// part alors avec ce dossier ; « aucun » revient à la boîte qui fait le tri.

/**
 * @param {{ valeur: {deal_id: string, titre?: string}|null, onChoisir: (d: {deal_id: string, titre: string}|null) => void, versLeHaut?: boolean }} props
 */
export default function ChoixDossier({ valeur, onChoisir, versLeHaut = false }) {
  const [ouvert, setOuvert] = useState(false);
  const [cherche, setCherche] = useState("");
  // La même liste que la page Dossiers : une seule requête pour les deux.
  const { data, isLoading } = useQuery({ queryKey: ["preanalyse-pipeline"], queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"), enabled: ouvert, staleTime: 60_000 });
  const liste = useMemo(() => {
    const q = cherche.trim().toLowerCase();
    return (data?.dossiers || [])
      .filter((d) => !d.archived && !d.test)
      .filter((d) => !q || String(d.titre || "").toLowerCase().includes(q))
      .slice(0, 40);
  }, [data, cherche]);
  const choisir = (d) => { onChoisir(d ? { deal_id: d.deal_id, titre: d.titre || d.deal_id } : null); setOuvert(false); setCherche(""); };

  return (
    <div className="relative min-w-0">
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="listbox"
        title={valeur ? `La demande part avec le dossier « ${valeur.titre} »` : "Choisir un dossier : Haka l'aura en contexte"}
        className="inline-flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors hover:bg-barre-relief"
        style={{ background: valeur ? J["barre-relief"] : "transparent", color: valeur ? J["encre"] : J["craie"] }}>
        <FolderOpen className="h-3.5 w-3.5 flex-none" style={{ color: valeur ? J["menthe"] : undefined }} />
        <span className="truncate"><span className="max-md:hidden">Dossier : </span>{valeur ? valeur.titre : "aucun"}</span>
        <ChevronDown className="h-3 w-3 flex-none opacity-70" />
      </button>
      {valeur && (
        <button type="button" onClick={() => choisir(null)} aria-label="Retirer le dossier" title="Retirer le dossier"
          className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-trait bg-surface-pleine text-brume hover:text-encre">
          <X className="h-2.5 w-2.5" />
        </button>
      )}
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div role="listbox" className={`animate-in fade-in duration-150 absolute left-0 z-20 w-[340px] max-w-[calc(100vw-2rem)] rounded-bloc border border-trait p-1.5 text-left shadow-[0_20px_50px_rgb(0_0_0/0.16)] ${versLeHaut ? "bottom-full mb-3" : "top-full mt-2"}`}
            style={{ background: J["barre"] }}>
            <div className="flex items-center gap-2 border-b border-trait px-2.5 pb-2 pt-1">
              <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
              <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Chercher un dossier"
                className="w-full border-0 bg-transparent py-1 text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
            </div>
            <div className="max-h-[300px] overflow-y-auto pt-1">
              <button type="button" role="option" aria-selected={!valeur} onClick={() => choisir(null)}
                className="flex w-full items-center gap-2 rounded-champ px-3 py-2 text-left text-[13.5px] text-craie hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
                <span className="flex-1">Aucun</span>{!valeur && <Check className="h-3.5 w-3.5 text-menthe" />}
              </button>
              {isLoading && <p className="m-0 px-3 py-2 text-[13px] text-brume">Chargement…</p>}
              {!isLoading && !liste.length && <p className="m-0 px-3 py-2 text-[13px] text-brume">{cherche ? "Aucun dossier ne correspond." : "Aucun dossier."}</p>}
              {liste.map((d) => {
                const actif = valeur?.deal_id === d.deal_id;
                return (
                  <button key={d.deal_id} type="button" role="option" aria-selected={actif} onClick={() => choisir(d)}
                    className="flex w-full items-center gap-2 rounded-champ px-3 py-2 text-left hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
                    <span className="min-w-0 flex-1 truncate text-[13.5px] text-encre">{d.titre || d.deal_id}</span>
                    {d.statut && data?.libelles?.[d.statut] && <span className="flex-none text-[12px] text-brume">{data.libelles[d.statut]}</span>}
                    {actif && <Check className="h-3.5 w-3.5 flex-none text-menthe" />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
