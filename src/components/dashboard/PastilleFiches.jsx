import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, User } from "lucide-react";
import { CadreEpingle } from "@/components/dashboard/CadreEpingle";
import { base44 } from "@/api/base44Client";
import { dateJournal, ouvrirFiche } from "@/lib/fiche-dossier";

// « Fiches », en haut à gauche de l'accueil, à la place de l'Agenda (19 nov. 2026, Jules : « on range, on part, on
// revient dans la journée : il faut juste réouvrir facilement les fiches ; on passe la souris dessus, on a les fiches
// récentes, on clique et ça ouvre la fiche ») : les dix fiches qu'on a ouvertes le plus récemment, les siennes (la fiche
// est la même pour tous) ; un clic l'ouvre à droite.

const ICONE = { bien: Building2, agent: User, client: User };

// Depuis le 28 nov. 2026 (Jules : « Brouillon, Fiches et À faire marchent pareil ») : un panneau épinglé à droite du chat
// (voir CadreEpingle.jsx), plus un survol ; les fiches à relire, puis les dix dernières ouvertes.
export default function ListeFiches() {
  const { data, isLoading } = useQuery({ queryKey: ["fiche-dossier-recentes"], queryFn: () => base44.request("GET", "/api/fiche-dossier/recentes"), staleTime: 20_000, refetchOnMount: "always", retry: false });
  const fiches = data?.fiches || [];
  // Les fiches remplies par l'import qui attendent sa relecture (22 nov. 2026, Jules : « chaque analyste valide ses
  // dossiers ») : les siennes d'abord, en tête de la liste.
  const relire = useQuery({ queryKey: ["fiche-dossier-a-relire"], queryFn: () => base44.request("GET", "/api/fiche-dossier/a-relire"), staleTime: 60_000, retry: false });
  const aRelire = relire.data?.fiches || [];
  const ouvrir = (cle) => ouvrirFiche(cle);

  return (
    <CadreEpingle titre="Fiches">
      {aRelire.length > 0 && (
        <div className="pb-1">
          <h3 className="m-0 px-6 pb-1 pt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-brume">À relire · {aRelire.length}</h3>
          <ul className="m-0 list-none p-0">
            {aRelire.slice(0, 5).map((f) => {
              const I = ICONE[f.genre] || FileText;
              return (
                <li key={f.cle}>
                  <button type="button" onClick={() => ouvrir(f.cle)} className="flex w-full items-center gap-3 px-6 py-2 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                    <I className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />
                    <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{f.nom}</span>
                    <span className="flex-none text-[12px] tabular-nums text-brume">{f.lignes} ligne{f.lignes > 1 ? "s" : ""}{f.a_moi ? "" : " · équipe"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      <h3 className="m-0 px-6 pb-1 pt-5 text-[12px] font-medium uppercase tracking-[0.08em] text-brume">Fiches récentes</h3>
      {isLoading ? <p className="m-0 px-6 py-2 text-[13px] text-brume">Chargement…</p>
        : !fiches.length ? <p className="m-0 px-6 py-2 text-[13px] leading-[1.5] text-ardoise">Aucune fiche ouverte pour l'instant : elles viendront ici dès que tu en ouvres une.</p>
          : (
            <ul className="m-0 list-none p-0 pb-2">
              {fiches.map((f) => {
                const I = ICONE[f.genre] || FileText;
                return (
                  <li key={f.cle}>
                    <button type="button" onClick={() => ouvrir(f.cle)} className="flex w-full items-center gap-3 px-6 py-2 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                      <I className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-encre">{f.nom}</span>
                        {f.sous && <span className="block truncate text-[12.5px] text-ardoise">{f.sous}</span>}
                      </span>
                      <span className="flex-none text-[12px] tabular-nums text-brume">{dateJournal(f.le)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
    </CadreEpingle>
  );
}
