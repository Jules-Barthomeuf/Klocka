import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Folder, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// La recherche du rail : un champ, les projets et les dossiers qui répondent,
// Entrée ouvre le premier. ⌘K l'ouvre de n'importe quelle page.

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function RechercheRapide({ ouvert, onFermer }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [choix, setChoix] = useState(0);
  const champ = useRef(null);

  const projets = useQuery({ queryKey: ["recherche-projets"], queryFn: () => base44.entities.Project.list("-updated_date", 400), enabled: ouvert, staleTime: 60000 });
  const dossiers = useQuery({ queryKey: ["dossiers"], queryFn: () => base44.request("GET", "/api/preanalyse/dossiers"), enabled: ouvert, staleTime: 60000 });

  useEffect(() => { if (ouvert) { setQ(""); setChoix(0); setTimeout(() => champ.current?.focus(), 30); } }, [ouvert]);

  const resultats = useMemo(() => {
    const t = norm(q.trim());
    const listeDossiers = (Array.isArray(dossiers.data) ? dossiers.data : dossiers.data?.dossiers || []).filter((d) => !d.archived);
    const tous = [
      ...listeDossiers.map((d) => ({ cle: `d-${d.deal_id}`, genre: "Dossier", icone: Folder, titre: d.titre || d.nom || d.nom_fichier || "Dossier sans nom", detail: d.ville || "", vers: `/Dossiers?deal_id=${d.deal_id}` })),
      ...(projets.data || []).filter((p) => !p.archived).map((p) => ({ cle: `p-${p.id}`, genre: "Projet", icone: Building2, titre: p.titre || "Projet sans nom", detail: p.adresse_complete || p.ville_secteur_champ1 || "", vers: `/Projets?id=${p.id}` })),
    ];
    if (!t) return tous.slice(0, 8);
    return tous.filter((x) => norm(`${x.titre} ${x.detail}`).includes(t)).slice(0, 12);
  }, [q, projets.data, dossiers.data]);

  useEffect(() => { setChoix(0); }, [q]);
  if (!ouvert) return null;

  const ouvrir = (r) => { if (!r) return; onFermer(); navigate(r.vers); };
  const clavier = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setChoix((c) => Math.min(c + 1, resultats.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setChoix((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); ouvrir(resultats[choix]); }
    if (e.key === "Escape") onFermer();
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-fond/60 px-4 pt-[12vh] backdrop-blur-sm" onClick={onFermer} role="dialog" aria-modal="true" aria-label="Rechercher">
      <div className="w-full max-w-[640px] overflow-hidden rounded-[20px] border border-trait bg-surface-pleine shadow-[0_24px_60px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-trait px-5 py-4">
          <Search className="h-4 w-4 flex-none text-brume" />
          <input ref={champ} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={clavier} placeholder="Un projet, un dossier, une adresse…" className="w-full border-0 bg-transparent text-[16px] text-encre outline-none placeholder:text-brume" />
          <button type="button" onClick={onFermer} aria-label="Fermer" className="text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <ul className="m-0 max-h-[52vh] list-none overflow-y-auto p-2">
          {resultats.map((r, i) => {
            const Icone = r.icone;
            return (
              <li key={r.cle}>
                <button type="button" onMouseEnter={() => setChoix(i)} onClick={() => ouvrir(r)} className={`flex w-full items-center gap-3 rounded-[12px] px-3 py-2.5 text-left ${i === choix ? "bg-relief" : ""}`} style={{ background: i === choix ? undefined : "transparent" }}>
                  <Icone className="h-4 w-4 flex-none text-menthe" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-encre">{r.titre}</span>
                    <span className="block truncate text-[13px] text-ardoise">{r.genre}{r.detail ? ` · ${r.detail}` : ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {!resultats.length && <li className="px-3 py-6 text-center text-[14px] text-ardoise">{projets.isLoading || dossiers.isLoading ? "Lecture…" : "Rien ne répond à cette recherche."}</li>}
        </ul>
      </div>
    </div>
  );
}
