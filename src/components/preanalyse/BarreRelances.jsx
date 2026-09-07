import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, RefreshCw } from "lucide-react";

// Relancer la pré-analyse (puis l'analyse) ou relire toutes les pièces. En
// dehors de la carte : entre les onglets et la carte, et sous la carte.
export default function BarreRelances({ dossier, onRefresh, apercu = false, bas = false, nue = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const nbDocs = (dossier?.documents_espace || []).length;
  const tout = () => ["etape1", "etape2", "etape3", "etape4", "carte", "matrice", "fiche", "livrables", "preanalyse-documents"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k, dealId] }));
  const { data: relance } = useQuery({
    queryKey: ["preanalyse-documents", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/preanalyse-documents`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.etat === "en_cours" ? 3000 : false),
  });
  const { data: m } = useQuery({
    queryKey: ["matrice", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/matrice`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  });
  const relancerPre = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/relancer-preanalyse`, { body: {} }),
    onSuccess: () => { toast.success("Pré-analyse relancée — l'analyse suivra"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const relancerAnalyse = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/relancer-analyse`, { body: {} }),
    onSuccess: () => { toast.success("Relecture de toutes les pièces lancée"); tout(); },
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  React.useEffect(() => { if (relance?.etat === "pret" && relance?.relance) { onRefresh?.(); tout(); } }, [relance?.etat]);
  React.useEffect(() => { if (m?.remplissage?.etat === "pret") tout(); }, [m?.remplissage?.etat]);
  const preEnCours = relance?.etat === "en_cours";
  const lectureEnCours = m?.remplissage?.etat === "en_cours";
  const occupe = preEnCours || lectureEnCours;

  return (
    <div className={`flex flex-wrap items-center gap-3 ${nue ? "" : bas ? "mt-5" : "mb-5"}`}>
      <button onClick={() => !apercu && window.confirm("Relancer la pré-analyse depuis le teaser (ou les pièces), puis relire la data room ?") && relancerPre.mutate()} disabled={apercu || occupe || relancerPre.isPending} className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">
        <RefreshCw className="w-3.5 h-3.5" /> Relancer la pré-analyse
      </button>
      <button onClick={() => !apercu && window.confirm(`Relire les ${nbDocs} pièce${nbDocs > 1 ? "s" : ""} de la data room ?`) && relancerAnalyse.mutate()} disabled={apercu || occupe || !nbDocs || relancerAnalyse.isPending} title={nbDocs ? "Relit toutes les pièces, même celles déjà lues" : "Importez des documents d'abord"} className="inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-[#96c0b8] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#abd0c8] disabled:opacity-40">
        <RefreshCw className="w-3.5 h-3.5" /> Relancer l'analyse
      </button>
      {occupe && (
        <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><Loader2 className="w-3.5 h-3.5 animate-spin" />
          {preEnCours ? (relance.phase === "preanalyse" ? "Pré-analyse en cours…" : `Relecture ${relance.fait ?? 0}/${relance.total ?? "…"}`) : `Lecture ${m.remplissage.fait}/${m.remplissage.total ?? "…"} — ${m.remplissage.document || ""}`}
        </span>
      )}
      {relance?.etat === "erreur" && <span className="text-[12.5px] text-[#e8746a]">{relance.erreur}</span>}
    </div>
  );
}
