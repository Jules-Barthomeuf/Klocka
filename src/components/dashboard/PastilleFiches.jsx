import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown, FileText, User } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { dateJournal, ouvrirFiche } from "@/lib/fiche-dossier";

// « Fiches », en haut à gauche de l'accueil, à la place de l'Agenda (19 nov. 2026, Jules : « on range, on part, on
// revient dans la journée : il faut juste réouvrir facilement les fiches ; on passe la souris dessus, on a les fiches
// récentes, on clique et ça ouvre la fiche »). Même pilule que l'Agenda et les boîtes ; au survol (ou au tap), les dix
// fiches qu'on a ouvertes le plus récemment, les siennes (la fiche est la même pour tous) ; un clic l'ouvre à droite.

const ICONE = { bien: Building2, agent: User, client: User };

// `droite` (22 nov. 2026, Jules : « mets Fiches à gauche de À faire ») : posée dans le coin en haut à droite, sa liste
// s'ouvre alignée à droite, comme celle d'À faire, pour ne pas sortir de l'écran.
export default function PastilleFiches({ droite = false }) {
  const [ouvert, setOuvert] = useState(false);
  const fermer = useRef(null);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["fiche-dossier-recentes"], queryFn: () => base44.request("GET", "/api/fiche-dossier/recentes"), staleTime: 20_000, retry: false });
  const fiches = data?.fiches || [];
  // Les fiches remplies par l'import qui attendent sa relecture (22 nov. 2026, Jules : « chaque analyste valide ses
  // dossiers ») : les siennes d'abord, en tête de la liste.
  const relire = useQuery({ queryKey: ["fiche-dossier-a-relire"], queryFn: () => base44.request("GET", "/api/fiche-dossier/a-relire"), staleTime: 60_000, retry: false });
  const aRelire = relire.data?.fiches || [];
  // Un temps de grâce en sortant, pour aller de la pilule à la liste sans qu'elle se referme.
  const entrer = () => { clearTimeout(fermer.current); if (!ouvert) refetch(); setOuvert(true); };
  const sortir = () => { clearTimeout(fermer.current); fermer.current = setTimeout(() => setOuvert(false), 180); };
  const ouvrir = (cle) => { setOuvert(false); ouvrirFiche(cle); };
  // Au tap (téléphone), la liste se ferme d'un tap ailleurs ; un clic sur la pilule l'ouvre toujours.
  const boite = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);

  return (
    <div ref={boite} className="relative" onMouseEnter={entrer} onMouseLeave={sortir}>
      <button type="button" onClick={entrer} aria-expanded={ouvert} aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-doux">
        {/* Ni icône ni nombre (25 nov. 2026, Jules : « Fiches, pas besoin de mettre un chiffre ») : le mot seul. */}
        Fiches
        <ChevronDown className={`h-3 w-3 text-ardoise transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div role="menu" aria-label="Fiches récentes"
          className={`animate-in fade-in slide-in-from-top-1 absolute ${droite ? "right-0" : "left-0"} top-[calc(100%+8px)] z-40 w-[420px] max-w-[calc(100vw-32px)] rounded-[16px] border border-trait bg-surface-pleine py-2 shadow-[0_18px_48px_rgb(0_0_0/0.14)] duration-150`}>
          {aRelire.length > 0 && (
            <div className="mb-1 border-b border-trait pb-2">
              <p className="m-0 px-4 pb-1.5 pt-2 text-[13px] text-craie">À relire · {aRelire.length}</p>
              <ul className="m-0 list-none p-0">
                {aRelire.slice(0, 5).map((f) => {
                  const I = ICONE[f.genre] || FileText;
                  return (
                    <li key={f.cle}>
                      <button type="button" role="menuitem" onClick={() => ouvrir(f.cle)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
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
          <p className="m-0 px-4 pb-1.5 pt-2 text-[13px] text-craie">Fiches récentes</p>
          {/* La place des dix dernières, même quand il y en a moins (19 nov. 2026, Jules) : 10 lignes de 52 px. */}
          <div className="min-h-[520px]">
          {isLoading ? <p className="m-0 px-4 py-2 text-[13px] text-brume">Chargement…</p>
            : !fiches.length ? <p className="m-0 px-4 py-2 text-[13px] leading-[1.5] text-ardoise">Aucune fiche ouverte pour l'instant : elles viendront ici dès que tu en ouvres une.</p>
              : (
                <ul className="m-0 list-none p-0">
                  {fiches.map((f) => {
                    const I = ICONE[f.genre] || FileText;
                    return (
                      <li key={f.cle}>
                        <button type="button" role="menuitem" onClick={() => ouvrir(f.cle)} className="flex w-full items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
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
          </div>
        </div>
      )}
    </div>
  );
}
