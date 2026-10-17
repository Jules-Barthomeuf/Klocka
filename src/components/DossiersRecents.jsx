import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Sous « Administration » dans la barre (17 oct. 2026, Jules ; d'abord sous Projets) : les projets récemment ouverts par
// l'équipe, cinq au plus, le plus récent en tête. Un clic ouvre le dossier. Repliable, et
// le choix reste dans le navigateur.

export default function DossiersRecents({ onNaviguer }) {
  const { search, pathname } = useLocation();
  const [ouvert, setOuvert] = useState(() => { try { return localStorage.getItem("klocka.recents.ouvert") !== "0"; } catch { return true; } });
  const { data } = useQuery({ queryKey: ["dossiers-recents"], queryFn: () => base44.request("GET", "/api/preanalyse/recents"), staleTime: 30_000, refetchInterval: 60_000, retry: false });
  const liste = data?.dossiers || [];
  if (!liste.length) return null;
  const actuel = /Dossiers|Analyse/i.test(pathname) ? new URLSearchParams(search).get("deal_id") : null;
  const basculer = () => setOuvert((o) => { try { localStorage.setItem("klocka.recents.ouvert", o ? "0" : "1"); } catch { /* navigation privée */ } return !o; });
  return (
    <div className="mb-1 mt-1">
      <button type="button" onClick={basculer} aria-expanded={ouvert}
        className="flex items-center gap-1.5 rounded-[10px] px-3 py-[5px] text-[13px] text-brume transition-colors hover:text-encre" style={{ background: "transparent" }}>
        Projets récents<ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${ouvert ? "" : "-rotate-90"}`} />
      </button>
      {ouvert && (
        <div className="flex flex-col gap-0.5 duration-200 animate-in fade-in-0 slide-in-from-top-1">
          {liste.map((d) => (
            <Link key={d.deal_id} to={`/Dossiers?deal_id=${d.deal_id}`} onClick={onNaviguer} title={d.titre}
              className={`ml-4 flex items-center gap-2 rounded-[10px] px-3 py-[5px] transition-colors ${actuel === d.deal_id ? "bg-rail-actif text-encre" : "text-ardoise hover:bg-rail-actif hover:text-encre"}`}>
              <Building2 className="h-[14px] w-[14px] flex-none" strokeWidth={1.7} />
              <span className="min-w-0 flex-1 truncate text-[13.5px]">{d.titre}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
