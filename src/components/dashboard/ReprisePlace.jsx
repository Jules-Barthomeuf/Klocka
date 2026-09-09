import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowUpRight, Building2, FolderSearch } from "lucide-react";

// Reprenez là où vous en étiez : les derniers dossiers et projets ouverts, du
// plus récemment touché au plus ancien. On repart d'un clic, sans chercher.

const ETAPES = ["Mail", "Pré-analyse", "Analyse", "Plateforme", "Présentation"];

const quand = (iso) => {
  if (!iso || isNaN(new Date(iso))) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `il y a ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  const j = Math.floor(s / 86400);
  if (j === 1) return "hier";
  return j < 30 ? `il y a ${j} j` : new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
};
const dateDe = (x) => x?.maj_le || x?.updated_date || x?.modifie_le || x?.cree_le || x?.created_date || null;

export default function ReprisePlace({ limite = 6 }) {
  const navigate = useNavigate();
  const [dossiers, projets] = useQueries({
    queries: [
      { queryKey: ["dossiers"], queryFn: () => base44.request("GET", "/api/preanalyse/dossiers"), staleTime: 60000 },
      { queryKey: ["projets-recents"], queryFn: () => base44.entities.Project.list("-updated_date", 12), staleTime: 60000 },
    ],
  });

  const liste = [
    ...(Array.isArray(dossiers.data) ? dossiers.data : dossiers.data?.dossiers || [])
      .filter((d) => !d.archived)
      .map((d) => ({
        cle: `d-${d.deal_id}`,
        titre: d.titre || d.nom || d.nom_fichier || "Dossier sans nom",
        detail: [ETAPES[Math.max(0, (Number(d.etape_max) || 1) - 1)], d.ville].filter(Boolean).join(" · "),
        date: dateDe(d),
        icone: FolderSearch,
        vers: `/Analyse?deal_id=${d.deal_id}`,
        genre: "Dossier",
      })),
    ...(projets.data || [])
      .filter((p) => !p.archived)
      .map((p) => ({
        cle: `p-${p.id}`,
        titre: p.titre || "Projet sans nom",
        detail: [p.ville_secteur_champ1, p.nom_locataire].filter(Boolean).join(" · "),
        date: dateDe(p),
        icone: Building2,
        vers: `/AdminProjets?id=${p.id}`,
        genre: "Projet",
      })),
  ]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limite);

  if (dossiers.isLoading || projets.isLoading || !liste.length) return null;

  return (
    <section>
      <p className="m-0 mb-4 text-[13.5px] text-[#6a7180]">Reprenez là où vous en étiez</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {liste.map((x) => {
          const Icone = x.icone;
          return (
            <button
              key={x.cle}
              onClick={() => navigate(x.vers)}
              className="group text-left rounded-xl border border-[#1f2228] bg-[#0f1114] px-4 py-3.5 hover:border-[#2c3139] transition-colors"
            >
              <div className="flex items-start gap-3">
                <Icone className="w-4 h-4 text-[#96c0b8] flex-none mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="m-0 text-[14px] leading-[1.45] text-[#f2f3f5] truncate">{x.titre}</p>
                  <p className="m-0 mt-1 text-[12px] text-[#6a7180] truncate">
                    {x.genre}{x.detail ? ` · ${x.detail}` : ""}{x.date ? ` · ${quand(x.date)}` : ""}
                  </p>
                </div>
                <ArrowUpRight className="w-3.5 h-3.5 text-[#3a3f4a] group-hover:text-[#96c0b8] flex-none transition-colors" />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
