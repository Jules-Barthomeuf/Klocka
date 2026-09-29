import React from "react";
import { useQueries } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { ArrowUpRight, Building2, Folder } from "lucide-react";

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

export default function ReprisePlace({ limite = 5 }) {
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
        detail: ["Dossier", ETAPES[Math.max(0, (Number(d.etape_max) || 1) - 1)], d.ville].filter(Boolean).join(" · "),
        date: dateDe(d),
        icone: Folder,
        vers: `/Dossiers?deal_id=${d.deal_id}`,
      })),
    ...(projets.data || [])
      .filter((p) => !p.archived)
      .map((p) => ({
        cle: `p-${p.id}`,
        titre: p.titre || "Projet sans nom",
        detail: ["Projet", p.ville_secteur_champ1, p.nom_locataire].filter(Boolean).join(" · "),
        date: dateDe(p),
        icone: Building2,
        vers: `/Projets?id=${p.id}`,
      })),
  ]
    .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))
    .slice(0, limite);

  if (dossiers.isLoading || projets.isLoading || !liste.length) return null;

  return (
    <section>
      <p className="m-0 border-b border-bord pb-2.5 text-[13.5px] text-craie">Reprenez là où vous en étiez</p>
      <ul className="m-0 list-none p-0">
        {liste.map((x) => {
          const Icone = x.icone;
          return (
            <li key={x.cle}>
              <button
                type="button"
                onClick={() => navigate(x.vers)}
                title={[x.detail, x.date ? quand(x.date) : ""].filter(Boolean).join(" · ")}
                className="group flex w-full items-center gap-2.5 py-2.5 text-left"
                style={{ background: "transparent" }}
              >
                <Icone className="h-[15px] w-[15px] flex-none text-menthe" />
                <span className="min-w-0 flex-1 truncate text-[14.5px] text-encre">{x.titre}</span>
                <ArrowUpRight className="h-3.5 w-3.5 flex-none text-ardoise transition-colors group-hover:text-menthe" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
