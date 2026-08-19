import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import PipelineDeals from "@/components/preanalyse/PipelineDeals";

// Analyse — tout le cycle d'un deal sur une seule page, en cinq étapes :
// Mail (ou passer) → Pré-analyse (décision Oui/Non) → Documents → Décision
// (mail Oui/Non) → Plateforme (projet). « Nouveau deal » démarre le workflow
// à l'étape 1, avant même l'analyse ; ?deal_id= rouvre un deal en cours.

export default function Analyse() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal_id");
  const nouveau = params.get("nouveau") === "1";

  const [dossier, setDossier] = useState(null);

  // Compteur de relances affiché en permanence dans le bandeau.
  const { data: pipeline } = useQuery({
    queryKey: ["preanalyse-pipeline"],
    queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"),
    refetchOnWindowFocus: true,
  });

  const montrerDeal = (id) => {
    const suivant = new URLSearchParams(params);
    suivant.delete("nouveau");
    if (id) suivant.set("deal_id", id);
    else suivant.delete("deal_id");
    setParams(suivant);
  };

  const demarrerNouveau = () => {
    const suivant = new URLSearchParams(params);
    suivant.delete("deal_id");
    suivant.set("nouveau", "1");
    setParams(suivant);
    setDossier(null);
  };

  const rafraichirListes = () => {
    queryClient.invalidateQueries({ queryKey: ["preanalyse-pipeline"] });
  };

  const ouvrirDossier = useMutation({
    mutationFn: (id) => base44.request("GET", `/api/preanalyse/dossiers/${id}`),
    onSuccess: (d) => setDossier(d),
    onError: (e) => toast.error(e?.message || "Dossier introuvable"),
  });

  // Charge le dossier désigné par l'URL (pipeline, boîte de réception, lien).
  useEffect(() => {
    if (dealId && dossier?.deal_id !== dealId && !ouvrirDossier.isPending) {
      ouvrirDossier.mutate(dealId);
    }
    if (!dealId && !nouveau && dossier) setDossier(null);
  }, [dealId, nouveau]);

  const recharger = () => {
    if (dealId) ouvrirDossier.mutate(dealId);
    rafraichirListes();
  };

  const majLot = useMutation({
    mutationFn: ({ index, saisie }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${index}`, { body: saisie }),
    onSuccess: (r) => {
      setDossier((d) => {
        if (!d) return d;
        const lots = [...d.lots];
        lots[r.lot.index] = r.lot;
        return { ...d, lots };
      });
      toast.success("Verdict recalculé");
    },
    onError: (e) => toast.error(e?.message || "Recalcul impossible"),
  });

  const enWorkflow = dealId || nouveau;
  const aRelancer = pipeline?.a_relancer || 0;

  return (
    <div className="bg-[#0a0c0c] min-h-screen text-[#edeae5] w-full max-w-full overflow-x-hidden">
      <div
        key={dealId || (nouveau ? "nouveau" : "accueil")}
        className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {enWorkflow ? (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => montrerDeal(null)}
              className="text-[#8b9391] hover:text-[#edeae5] text-xs flex items-center gap-1.5 mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tous les deals
            </button>
            {nouveau && !dealId ? (
              <WorkflowDeal
                dossier={null}
                onAnalyse={(d) => {
                  setDossier(d);
                  montrerDeal(d.deal_id);
                  rafraichirListes();
                }}
              />
            ) : dossier?.deal_id === dealId ? (
              <WorkflowDeal
                dossier={dossier}
                enCours={majLot.isPending}
                onSaisie={(index, saisie) => majLot.mutate({ index, saisie })}
                onRefresh={recharger}
              />
            ) : (
              <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-8 text-center">
                <Loader2 className="w-6 h-6 text-[#8b9391] animate-spin mx-auto mb-3" />
                <p className="text-[#9aa19e] text-sm">Ouverture du dossier…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[1120px] mx-auto">
            {/* Bandeau éditorial : surtitre, titre, description, action. */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-5 border-b border-[#282b2a]">
              <div>
                <div className="text-[11px] tracking-[.16em] uppercase text-[#8b9391] mb-2.5">Pipeline</div>
                <h1 className="m-0 text-[30px] font-medium tracking-[-.01em]">Deals</h1>
                <p className="mt-2.5 mb-0 max-w-[52ch] text-[13.5px] leading-[1.65] text-[#9aa19e]">
                  Du premier mail à l'agent jusqu'à l'entrée du projet dans la plateforme. Le statut
                  d'un deal détermine son étape courante.
                </p>
              </div>
              <div className="flex items-center gap-4 flex-none">
                <span className={`text-xs ${aRelancer ? "text-[#e2564d]" : "text-[#6b7270]"}`}>
                  {aRelancer} relance(s) en attente
                </span>
                <button
                  onClick={demarrerNouveau}
                  className="px-4 py-[9px] text-[13px] text-[#0c0e0d] bg-[#edeae5] border border-[#edeae5] rounded hover:bg-[#d8d5d0] transition-colors"
                >
                  Nouveau deal
                </button>
              </div>
            </div>
            <PipelineDeals />
          </div>
        )}
      </div>
    </div>
  );
}
