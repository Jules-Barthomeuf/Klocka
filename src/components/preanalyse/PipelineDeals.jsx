import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Inbox } from "lucide-react";

// Liste des deals, groupés par statut : intitulé de section + compteur + filet,
// puis une ligne par deal — pastille d'état, adresse, ville · contact, prix en
// chiffres tabulaires, note de relance et fraîcheur. Un clic ouvre le workflow.

const GROUPES = [
  { statut: "analyse", nom: "Pré-analyse" },
  { statut: "documents_demandes", nom: "Documents en attente" },
  { statut: "documents_recus", nom: "Documents reçus" },
  { statut: "depouille", nom: "Décision" },
  { statut: "projet_cree", nom: "Plateforme" },
  { statut: "abandonne", nom: "Abandonné" },
];

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

function fraicheur(iso) {
  if (!iso) return "";
  const jours = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (jours <= 0) return "aujourd'hui";
  if (jours === 1) return "hier";
  return `il y a ${jours} j`;
}

function joursDepuis(iso) {
  return iso ? Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)) : null;
}

export default function PipelineDeals() {
  const [params, setParams] = useSearchParams();
  const [voirArchives, setVoirArchives] = useState(false);

  const { data: pipeline, isLoading } = useQuery({
    queryKey: ["preanalyse-pipeline"],
    queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"),
    refetchOnWindowFocus: true,
  });

  const ouvrir = (dealId) => {
    const suivant = new URLSearchParams(params);
    suivant.delete("tab");
    suivant.set("deal_id", dealId);
    setParams(suivant);
  };

  if (isLoading) return <p className="text-[#7f9995] text-sm">Chargement du pipeline…</p>;

  const dossiers = pipeline?.dossiers || [];
  const groupes = GROUPES.map((g) => ({
    ...g,
    deals: dossiers.filter((d) => d.statut === g.statut),
  })).filter((g) => g.deals.length && (voirArchives || g.statut !== "abandonne"));

  if (!groupes.length) {
    return (
      <div className="text-center py-16">
        <Inbox className="w-10 h-10 text-[#33d6c0]/30 mx-auto mb-4" />
        <p className="text-[#7f9995] text-sm">
          Aucun deal en cours. Lancez « Nouveau deal » ou préanalysez un mail reçu depuis la page Mails.
        </p>
      </div>
    );
  }

  return (
    <div>
      {groupes.map((g) => (
        <div key={g.statut} className="mt-9 first:mt-0">
          <div className="flex items-center gap-3.5 mb-3.5">
            <div className="text-[11.5px] tracking-[.1em] uppercase text-[#c4d5d1]">{g.nom}</div>
            <div className="text-[11.5px] text-[#5e7672] tabular-nums">
              {String(g.deals.length).padStart(2, "0")}
            </div>
            <div className="h-px flex-1 bg-[#1c2725]" />
          </div>
          <div className="flex flex-col gap-2">
            {g.deals.map((d, iDeal) => {
              const lot = d.lots?.[0] || {};
              const enRetard = d.a_relancer;
              const attente =
                d.statut === "documents_demandes" ? joursDepuis(d.dernier_suivi?.le) : null;
              const note =
                d.statut === "abandonne"
                  ? d.dernier_suivi?.detail || ""
                  : enRetard
                    ? `relance en retard · J+${attente ?? "?"}`
                    : d.statut === "documents_demandes" && d.relance_prevue_le
                      ? `relance le ${new Date(d.relance_prevue_le).toLocaleDateString("fr-FR")}`
                      : lot.verdict || "";
              return (
                <button
                  key={d.deal_id}
                  onClick={() => ouvrir(d.deal_id)}
                  className={`flex items-center gap-4 w-full px-4 py-3.5 bg-[#0a0f0e] border rounded-[5px] text-left transition-colors hover:border-[#33d6c0] animate-in fade-in slide-in-from-bottom-1 duration-300 ease-out fill-mode-both ${
                    enRetard ? "border-[#e2564d]/40" : "border-[#1c2725]"
                  }`}
                  style={{ animationDelay: `${Math.min(iDeal * 40, 400)}ms` }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-none"
                    style={{
                      background:
                        d.statut === "abandonne" ? "#4a5b58" : enRetard ? "#e2564d" : "#33d6c0",
                    }}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-[#e6efed] truncate mb-0.5">
                      {d.test && (
                        <span className="inline-block mr-2 px-1.5 py-px rounded border border-amber-500/40 text-amber-300/90 text-[9.5px] tracking-[.08em] uppercase align-middle">
                          Test
                        </span>
                      )}
                      {lot.adresse || lot.titre || d.nom_fichier || "Fiche"}
                    </span>
                    <span className="block text-xs text-[#7f9995] truncate">
                      {[lot.ville, d.contact_agent_email].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="flex-none w-[110px] text-right text-[12.5px] text-[#c4d5d1] tabular-nums">
                    {euros(lot.prix_fai)}
                  </span>
                  <span
                    className={`hidden sm:block flex-none w-[190px] text-right text-[11px] truncate ${
                      enRetard ? "text-[#e2564d]" : "text-[#5e7672]"
                    }`}
                  >
                    {note}
                  </span>
                  <span className="hidden md:block flex-none w-[84px] text-right text-[11px] text-[#5e7672] whitespace-nowrap">
                    {fraicheur(d.dernier_suivi?.le || d.cree_le)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={() => setVoirArchives((v) => !v)}
        className="mt-7 text-[#5e7672] hover:text-white text-xs px-3 py-1.5 rounded border border-[#24312f] hover:border-[#33d6c0] transition-colors"
      >
        {voirArchives ? "Masquer les abandonnés" : "Voir les abandonnés"}
      </button>
    </div>
  );
}
