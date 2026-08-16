import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Clock, FileText, Inbox } from "lucide-react";
import { STATUTS_DEAL, VERDICTS } from "@/components/preanalyse/DealResultat";

// Onglet « Suivi » : le pipeline des deals, groupé par statut, avec les
// relances en attente. Un clic ouvre le dossier dans l'onglet Annonces.

const ORDRE_STATUTS = [
  "analyse",
  "documents_demandes",
  "documents_recus",
  "depouille",
  "projet_cree",
  "abandonne",
];

export default function PipelineDeals() {
  const [params, setParams] = useSearchParams();
  const [filtre, setFiltre] = useState(null); // statut sélectionné ou null (tous)
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

  if (isLoading) {
    return <p className="text-gray-500 text-sm">Chargement du pipeline…</p>;
  }

  const dossiers = (pipeline?.dossiers || []).filter((d) =>
    voirArchives ? true : d.statut !== "abandonne"
  );
  const filtres = filtre ? dossiers.filter((d) => d.statut === filtre) : dossiers;
  const aRelancer = dossiers.filter((d) => d.a_relancer);

  return (
    <div>
      <p className="text-gray-500 text-xs mb-4">
        Tous les deals en cours, du premier mail à la création du projet — cliquez pour ouvrir le
        workflow.
      </p>

      {/* Compteurs par statut, cliquables pour filtrer */}
      <div className="flex flex-wrap gap-2 mb-5">
        <FiltreChip
          actif={filtre === null}
          onClick={() => setFiltre(null)}
          libelle="Tous"
          compte={dossiers.length}
        />
        {ORDRE_STATUTS.map((s) => {
          const compte = (pipeline?.compteurs || {})[s] || 0;
          if (s === "abandonne" && !voirArchives) return null;
          if (!compte) return null;
          return (
            <FiltreChip
              key={s}
              actif={filtre === s}
              onClick={() => setFiltre(filtre === s ? null : s)}
              libelle={STATUTS_DEAL[s]?.libelle || s}
              compte={compte}
            />
          );
        })}
        <button
          onClick={() => setVoirArchives((v) => !v)}
          className="ml-auto text-gray-500 hover:text-white text-xs px-3 py-1.5 rounded-full border border-white/10 hover:border-white/25 transition-colors"
        >
          {voirArchives ? "Masquer les abandonnés" : "Voir les abandonnés"}
        </button>
      </div>

      {/* Relances en attente, en tête */}
      {aRelancer.length > 0 && !filtre && (
        <div className="mb-5 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
          <p className="text-red-300 text-xs font-medium mb-2 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> {aRelancer.length} dossier(s) à relancer
          </p>
          <div className="space-y-1.5">
            {aRelancer.map((d) => (
              <button
                key={d.deal_id}
                onClick={() => ouvrir(d.deal_id)}
                className="w-full text-left text-red-200/80 hover:text-white text-xs truncate transition-colors"
              >
                {d.lots?.[0]?.titre || d.nom_fichier || "Fiche"} — documents demandés le{" "}
                {d.dernier_suivi?.le ? new Date(d.dernier_suivi.le).toLocaleDateString("fr-FR") : "?"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Liste */}
      {filtres.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="w-10 h-10 text-[#2A9D8F]/30 mx-auto mb-4" />
          <p className="text-gray-500 text-sm">
            Aucun deal {filtre ? `au statut « ${STATUTS_DEAL[filtre]?.libelle} »` : "en cours"}. Analysez
            une fiche ci-dessus ou préanalysez un mail reçu depuis la page Mails.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtres.map((d) => {
            const s = STATUTS_DEAL[d.statut] || STATUTS_DEAL.analyse;
            return (
              <button
                key={d.deal_id}
                onClick={() => ouvrir(d.deal_id)}
                className="w-full text-left bg-[#0A0A0A] border border-white/[0.06] rounded-xl px-4 py-3 hover:border-[#2A9D8F]/30 transition-all flex items-center gap-3"
              >
                <FileText className="w-4 h-4 text-gray-600 flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-white text-sm truncate">
                    {d.lots?.[0]?.titre || d.nom_fichier || "Fiche"}
                  </p>
                  <p className="text-gray-600 text-xs truncate">
                    {new Date(d.cree_le).toLocaleDateString("fr-FR")}
                    {d.lots?.[0]?.ville ? ` · ${d.lots[0].ville}` : ""}
                    {d.contact_agent_email ? ` · ${d.contact_agent_email}` : ""}
                    {d.dernier_suivi?.detail ? ` · ${d.dernier_suivi.detail}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {d.a_relancer && (
                    <Badge className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> À relancer
                    </Badge>
                  )}
                  {(d.lots || []).slice(0, 2).map((l) => (
                    <Badge key={l.index} className={`${VERDICTS[l.verdict]?.classe || ""} text-[10px]`}>
                      {l.verdict}
                    </Badge>
                  ))}
                  <Badge className={`${s.classe} text-[10px]`}>{s.libelle}</Badge>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FiltreChip({ actif, onClick, libelle, compte }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
        actif
          ? "bg-[#2A9D8F]/20 border-[#2A9D8F]/40 text-[#71CCBA]"
          : "border-white/10 text-gray-400 hover:border-white/25 hover:text-white"
      }`}
    >
      {libelle} <span className="opacity-60">({compte})</span>
    </button>
  );
}
