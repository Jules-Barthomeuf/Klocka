import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import PipelineDeals from "@/components/preanalyse/PipelineDeals";
import DepouillementDocuments from "@/components/preanalyse/DepouillementDocuments";
import { dossierDemo } from "@/components/preanalyse/dossierDemo";

// Analyse — tout le cycle d'un deal sur une seule page, en cinq étapes :
// Mail (ou passer) → Pré-analyse (décision Oui/Non) → Documents → Décision
// (mail Oui/Non) → Plateforme (projet). « Nouveau deal » démarre le workflow
// à l'étape 1, avant même l'analyse ; ?deal_id= rouvre un deal en cours.
// L'onglet Documents reste l'outil de dépouillement libre, hors cycle.

// « Dépouillement » plutôt que « Documents » : l'étape 3 du workflow porte
// déjà ce nom, la confusion serait immédiate.
const ONGLETS = [
  { id: "analyse", label: "Deals" },
  { id: "documents", label: "Dépouillement" },
];

const SOUS_TITRES = {
  analyse: "Un deal, cinq étapes — du mail à la plateforme",
  documents: "Dépouillement libre de documents",
};

export default function Analyse() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal_id");
  const nouveau = params.get("nouveau") === "1";
  // Mode aperçu : deal fictif, les cinq étapes ouvertes, aucune action réelle.
  const apercu = params.get("apercu") === "1";
  const tab = params.get("tab");
  const actif = dealId || nouveau || apercu ? "analyse" : ONGLETS.some((o) => o.id === tab) ? tab : "analyse";

  const [dossier, setDossier] = useState(null);

  const choisirOnglet = (id) => {
    const suivant = new URLSearchParams(params);
    if (id === "analyse") suivant.delete("tab");
    else suivant.set("tab", id);
    if (id !== "analyse") {
      suivant.delete("deal_id");
      suivant.delete("nouveau");
      suivant.delete("apercu");
    }
    setParams(suivant, { replace: true });
  };

  const montrerDeal = (id) => {
    const suivant = new URLSearchParams(params);
    suivant.delete("nouveau");
    suivant.delete("apercu");
    if (id) suivant.set("deal_id", id);
    else suivant.delete("deal_id");
    setParams(suivant);
  };

  const demarrerNouveau = () => {
    const suivant = new URLSearchParams(params);
    suivant.delete("deal_id");
    suivant.delete("apercu");
    suivant.set("nouveau", "1");
    setParams(suivant);
    setDossier(null);
  };

  const ouvrirApercu = () => {
    const suivant = new URLSearchParams(params);
    suivant.delete("deal_id");
    suivant.delete("nouveau");
    suivant.set("apercu", "1");
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId, nouveau, apercu]);

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

  const enWorkflow = dealId || nouveau || apercu;

  return (
    <div className="bg-black min-h-screen text-white w-full max-w-full overflow-x-hidden">
      {/* Barre d'onglets, calquée sur celle du simulateur */}
      <div className="flex items-center justify-between border-b border-white/[0.08] px-4 h-11 sticky top-0 bg-black z-10">
        <div className="flex items-center gap-5 h-full">
          <span className="text-white text-xs font-medium tracking-wide">Analyse</span>
          <span className="h-4 w-px bg-white/[0.08]" />
          {ONGLETS.map((t) => (
            <button
              key={t.id}
              onClick={() => choisirOnglet(t.id)}
              className={`text-xs h-full flex items-center border-b-2 transition-all duration-500 ease-out ${
                actif === t.id
                  ? "border-[#2A9D8F] text-white"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="hidden sm:block text-gray-600 text-[11px]">{SOUS_TITRES[actif]}</span>
      </div>

      <div
        key={`${actif}-${dealId || (nouveau ? "nouveau" : "accueil")}`}
        className="p-4 md:p-6 animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out"
      >
        {actif === "documents" ? (
          <DepouillementDocuments />
        ) : enWorkflow ? (
          <div className="max-w-5xl mx-auto">
            <button
              onClick={() => montrerDeal(null)}
              className="text-gray-500 hover:text-white text-xs flex items-center gap-1.5 mb-4 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Tous les deals
            </button>
            {apercu ? (
              <WorkflowDeal dossier={dossierDemo} apercu />
            ) : nouveau && !dealId ? (
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
              <div className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl p-8 text-center">
                <Loader2 className="w-6 h-6 text-[#2A9D8F] animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">Ouverture du dossier…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center justify-between gap-3 mb-5">
              <p className="text-gray-500 text-xs">
                Chaque deal suit cinq étapes : Mail, Pré-analyse, Documents, Décision, Plateforme.
              </p>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  onClick={ouvrirApercu}
                  className="bg-white/5 hover:bg-white/10 text-gray-300 border-0"
                  title="Parcourir les cinq étapes sur un deal fictif"
                >
                  <Eye className="w-4 h-4 mr-2" /> Aperçu
                </Button>
                <Button
                  onClick={demarrerNouveau}
                  className="bg-[#2A9D8F] hover:bg-[#238277] text-white"
                >
                  <Plus className="w-4 h-4 mr-2" /> Nouveau deal
                </Button>
              </div>
            </div>
            <PipelineDeals />
          </div>
        )}
      </div>
    </div>
  );
}
