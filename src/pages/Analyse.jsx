import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

const ONGLETS = [
  { id: "analyse", label: "Deals" },
  { id: "documents", label: "Analyse" },
];

const SOUS_TITRES = {
  analyse: "Un deal, cinq étapes — du mail à la plateforme",
  documents: "Analyse libre de documents",
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

  // Compteur de relances affiché en permanence dans l'en-tête du module.
  const { data: pipeline } = useQuery({
    queryKey: ["preanalyse-pipeline"],
    queryFn: () => base44.request("GET", "/api/preanalyse/pipeline"),
    refetchOnWindowFocus: true,
  });

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

  // Mode test : deal fictif mais réel, tout le cycle jouable sans appel API.
  const creerDealTest = useMutation({
    mutationFn: () => base44.request("POST", "/api/preanalyse/test"),
    onSuccess: (d) => {
      rafraichirListes();
      montrerDeal(d.deal_id);
    },
    onError: (e) => toast.error(e?.message || "Création du deal de test impossible"),
  });

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
  const aRelancer = pipeline?.a_relancer || 0;

  return (
    <div className="bg-[#0a0c0c] min-h-screen text-[#edeae5] w-full max-w-full overflow-x-hidden">
      {/* En-tête du module : marque, bascule segmentée, relances en attente. */}
      <div className="flex items-center justify-between gap-6 px-5 md:px-10 py-3.5 border-b border-[#282b2a] bg-[#0e100f] sticky top-0 z-20">
        <div className="flex items-center gap-3.5">
          <div className="w-[26px] h-[26px] border border-[#35a79b] rounded flex items-center justify-center text-[#35a79b] text-[13px]">
            A
          </div>
          <div className="text-[15px] font-medium tracking-[.01em] hidden sm:block">Module d'analyse</div>
        </div>
        <div className="flex gap-1 p-[3px] border border-[#282b2a] rounded-[5px] bg-[#0c0e0d]">
          {ONGLETS.map((t) => (
            <button
              key={t.id}
              onClick={() => choisirOnglet(t.id)}
              className={`px-4 py-[7px] rounded text-[12.5px] transition-colors ${
                actif === t.id ? "bg-[#35a79b]/10 text-[#35a79b]" : "text-[#8b9391] hover:text-[#d3d8d6]"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div
          className={`text-xs hidden sm:block ${aRelancer ? "text-[#e2564d]" : "text-[#6b7270]"}`}
          title={SOUS_TITRES[actif]}
        >
          {aRelancer} relance(s) en attente
        </div>
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
              className="text-[#8b9391] hover:text-[#edeae5] text-xs flex items-center gap-1.5 mb-4 transition-colors"
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
              <div className="bg-[#0a0c0c] border border-[#242726] rounded-md p-8 text-center">
                <Loader2 className="w-6 h-6 text-[#35a79b] animate-spin mx-auto mb-3" />
                <p className="text-[#9aa19e] text-sm">Ouverture du dossier…</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-w-[1120px] mx-auto">
            {/* Bandeau éditorial : surtitre, titre, description, actions. */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 pb-5 border-b border-[#282b2a]">
              <div>
                <div className="text-[11px] tracking-[.16em] uppercase text-[#35a79b] mb-2.5">Pipeline</div>
                <h1 className="m-0 text-[30px] font-medium tracking-[-.01em]">Deals</h1>
                <p className="mt-2.5 mb-0 max-w-[52ch] text-[13.5px] leading-[1.65] text-[#9aa19e]">
                  Du premier mail à l'agent jusqu'à l'entrée du projet dans la plateforme. Le statut
                  d'un deal détermine son étape courante.
                </p>
              </div>
              <div className="flex gap-2.5 flex-none">
                <button
                  onClick={ouvrirApercu}
                  title="Parcourir les cinq étapes sur un deal fictif (lecture seule)"
                  className="px-4 py-[9px] text-[13px] text-[#9aa19e] border border-[#303332] rounded hover:border-[#35a79b] hover:text-[#edeae5] transition-colors"
                >
                  Aperçu
                </button>
                <button
                  onClick={() => creerDealTest.mutate()}
                  disabled={creerDealTest.isPending}
                  title="Jouer tout le cycle sur un deal fictif : chaque bouton agit réellement, mais aucun appel API n'est fait (mails simulés, documents fictifs)"
                  className="px-4 py-[9px] text-[13px] text-[#9aa19e] border border-[#303332] rounded hover:border-[#35a79b] hover:text-[#edeae5] transition-colors disabled:opacity-50"
                >
                  {creerDealTest.isPending ? "Création…" : "Mode test"}
                </button>
                <button
                  onClick={demarrerNouveau}
                  className="px-4 py-[9px] text-[13px] text-[#35a79b] border border-[#35a79b] rounded hover:bg-[#35a79b]/10 transition-colors"
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
