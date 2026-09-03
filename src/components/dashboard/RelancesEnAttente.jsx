import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { ArrowUpRight, Loader2 } from "lucide-react";

// Tout ce qui attend une relance, lu dans Monday : la date dans sa case, les
// remarques comme résumé. Ce que la note d'appel a écrit, le tableau de bord
// le relit — une seule source, et la liste dit exactement où on en est.

const GROUPES = [
  ["en_retard", "En retard", "#e8746a"],
  ["aujourdhui", "Aujourd'hui", "#d9b46a"],
  ["cette_semaine", "Cette semaine", "#96c0b8"],
  ["plus_tard", "Plus tard", "#3a3f4a"],
  ["sans_responsable", "Sans responsable", "#3a3f4a"],
];

const dateCourte = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "");
const quand = (r) => (r.dans < 0 ? `en retard de ${-r.dans} j` : r.dans === 0 ? "aujourd'hui" : r.dans === 1 ? "demain" : `dans ${r.dans} j`);
// La première ligne des remarques est la plus récente : elle fait le résumé.
const resume = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";

export function ListeRelances({ compact = false }) {
  const { data, isLoading } = useQuery({
    queryKey: ["relances-agents"],
    queryFn: () => base44.request("GET", "/api/assistant/relances"),
    refetchInterval: 5 * 60000,
  });
  if (isLoading) {
    return <p className="m-0 text-[12.5px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Je relis les fiches…</p>;
  }
  if (!data?.total) return <p className="m-0 text-[13.5px] text-[#9298a6]">Aucune relance en attente pour vous.</p>;
  return (
    <div className="space-y-5">
      {GROUPES.map(([cle, libelle, teinte]) => {
        const liste = data[cle] || [];
        if (!liste.length) return null;
        return (
          <section key={cle}>
            <p className="m-0 mb-2 text-[10.5px] tracking-[.18em] uppercase" style={{ color: teinte === "#3a3f4a" ? "#9298a6" : teinte }}>
              {libelle} · {liste.length}
            </p>
            <div className="space-y-2">
              {liste.slice(0, compact ? 4 : 50).map((r) => (
                <a
                  key={r.id}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex gap-3 border border-[#1f2228] rounded-xl bg-[#0f1114] px-4 py-3 hover:border-[#2c3139] transition-colors"
                >
                  <div className="w-[2px] flex-none self-stretch rounded" style={{ background: teinte }} />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 text-[13.5px] text-[#f2f3f5] leading-[1.5]">
                      <span className="font-medium">{r.nom}</span>
                      {r.entreprise ? <span className="text-[#9298a6]"> · {r.entreprise}</span> : null}
                      <span className="text-[#9298a6]"> — {dateCourte(r.relance)}, {quand(r)}</span>
                    </p>
                    {resume(r.remarques) && (
                      <p className="m-0 mt-0.5 text-[12.5px] leading-[1.55] text-[#9298a6] line-clamp-2">{resume(r.remarques)}</p>
                    )}
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 flex-none mt-1 text-[#3a3f4a] group-hover:text-[#96c0b8] transition-colors" />
                </a>
              ))}
              {compact && liste.length > 4 && <p className="m-0 text-[12px] text-[#6a7180]">et {liste.length - 4} de plus</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export default function RelancesEnAttente() {
  return (
    <section>
      <div className="flex items-baseline justify-between gap-4 mb-5">
        <div>
          <p className="m-0 text-[10.5px] tracking-[.18em] uppercase text-[#9298a6]">En attente — les vôtres seulement</p>
          <h2 className="m-0 mt-1.5 text-[20px] font-light tracking-[-.015em] text-[#f2f3f5]">Vos relances</h2>
        </div>
      </div>
      <ListeRelances compact />
    </section>
  );
}
