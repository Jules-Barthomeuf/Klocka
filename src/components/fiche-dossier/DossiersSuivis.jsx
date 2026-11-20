import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { dateJournal, ouvrirFiche } from "@/lib/fiche-dossier";

// Dans le CRM (19 nov. 2026, Jules : « quand on clique sur un agent, on voit la fiche tournée autour de lui et des
// deals qu'il nous a envoyés ») : sur la fiche Twenty d'un agent ou d'un client, les dossiers auxquels des notes l'ont
// lié, avec leur étape et la dernière impression qu'il a laissée. Twenty garde les coordonnées ; ceci, le contexte.

export const OBJETS_SUIVIS = ["agentImmobilier", "clients"];

export default function DossiersSuivis({ objet, id, Partie, ouverte, onBasculer }) {
  const cle = `twenty:${objet}:${id}`;
  const { data: f } = useQuery({
    queryKey: ["fiche-dossier", cle],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/fiche?cle=${encodeURIComponent(cle)}`).catch(() => null),
    staleTime: 30_000,
  });
  if (!f || (!f.liees.length && !f.journal.length)) return null;
  return (
    <Partie titre="Dossiers suivis" nombre={f.liees.length} ouverte={ouverte} onBasculer={onBasculer}
      actions={<button type="button" onClick={() => ouvrirFiche(cle)} className="inline-flex h-8 items-center gap-1 rounded-full border border-trait px-3 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Historique<ArrowRight className="h-3.5 w-3.5" /></button>}>
      {f.resume && <p className="m-0 mb-3 text-[14px] leading-[1.55] text-craie">{f.resume}</p>}
      {f.liees.length ? (
        <ul className="m-0 list-none overflow-hidden rounded-[12px] border border-bord-doux p-0">
          {f.liees.map((l) => (
            <li key={l.cle} className="border-t border-trait first:border-t-0">
              <button type="button" onClick={() => ouvrirFiche(l.cle)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-relief" style={{ background: "transparent" }}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-encre">{l.nom}{l.etape ? <span className="text-ardoise"> · {l.etape}</span> : null}</span>
                  {l.resume && <span className="mt-0.5 block truncate text-[13px] text-ardoise">{l.resume}</span>}
                </span>
                {l.maj_le && <span className="flex-none text-[12.5px] text-brume">{dateJournal(l.maj_le)}</span>}
                <ArrowRight className="h-3.5 w-3.5 flex-none text-ardoise" />
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="m-0 text-[13.5px] text-brume">Des notes, pas encore de dossier lié.</p>}
    </Partie>
  );
}
