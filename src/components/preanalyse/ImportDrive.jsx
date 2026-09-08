import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Search, X } from "lucide-react";

// Choisir des fichiers dans le Drive de l'équipe et les rapatrier dans le
// dossier : mêmes pièces, même extraction qu'un dépôt à la main.

const poids = (o) => (o > 1e6 ? `${(o / 1e6).toFixed(1)} Mo` : o > 1e3 ? `${Math.round(o / 1e3)} ko` : `${o} o`);
const quand = (iso) => (iso && !isNaN(new Date(iso)) ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" }) : "");

export default function ImportDrive({ dealId, onFermer, onImporte }) {
  const queryClient = useQueryClient();
  const [recherche, setRecherche] = useState("");
  const [choisis, setChoisis] = useState(() => new Set());

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const compte = (statutMail?.accounts || []).find((c) => c.peut_drive)?.id || null;

  const { data, isLoading, error } = useQuery({
    queryKey: ["drive-fichiers", dealId, compte, recherche],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/drive/fichiers?compte=${encodeURIComponent(compte)}&recherche=${encodeURIComponent(recherche)}`),
    enabled: !!compte,
  });

  const importer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/drive/importer`, { body: { compte, fichiers: [...choisis] } }),
    onSuccess: (r) => {
      if (r.importes?.length) toast.success(`${r.importes.length} fichier${r.importes.length > 1 ? "s" : ""} importé${r.importes.length > 1 ? "s" : ""}`, { description: "L'extraction se fait toute seule." });
      if (r.erreurs?.length) toast.error(r.erreurs[0]);
      queryClient.invalidateQueries({ queryKey: ["dossier", dealId] });
      onImporte?.();
      onFermer?.();
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });

  const basculer = (id) => setChoisis((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const fichiers = data?.fichiers || [];

  return (
    <div onClick={onFermer} className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-6">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[720px] max-h-[80vh] flex flex-col bg-[#0a0a0b] border border-[#22262d] rounded-[18px] overflow-hidden shadow-[0_30px_80px_rgba(0,0,0,.6)]">
        <header className="flex items-center justify-between gap-4 px-5 py-4 border-b border-[#1f2228]">
          <div className="min-w-0">
            <p className="m-0 text-[15px] font-semibold text-[#f2f3f5]">Importer depuis le Drive</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-[#6a7180]">
              {data?.dossier_du_deal ? "Le dossier Drive de ce deal." : "Les documents récents du compte connecté."}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {data?.folder_url && (
              <a href={data.folder_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[12.5px] text-[#9298a6] hover:text-[#f2f3f5]"><ExternalLink className="w-3.5 h-3.5" /> Ouvrir</a>
            )}
            <button onClick={onFermer} className="text-[#6a7180] hover:text-[#f2f3f5]" aria-label="Fermer"><X className="w-4 h-4" /></button>
          </div>
        </header>

        {!compte ? (
          <p className="m-0 px-5 py-8 text-[13.5px] text-[#9298a6]">Aucun compte Google avec accès Drive n'est connecté. Connectez-en un depuis le dashboard, en accordant l'accès Drive.</p>
        ) : (
          <>
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1f2228]">
              <Search className="w-4 h-4 text-[#6a7180] flex-shrink-0" />
              <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Chercher par nom…" className="w-full bg-transparent border-0 outline-none text-[14px] text-[#f2f3f5] placeholder:text-[#4d545d]" />
            </div>
            <div className="flex-1 overflow-y-auto">
              {isLoading ? (
                <p className="m-0 px-5 py-8 text-[13px] text-[#9298a6] inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lecture du Drive…</p>
              ) : error ? (
                <p className="m-0 px-5 py-8 text-[13.5px] text-[#e8746a]">{error?.message || "Drive injoignable"}</p>
              ) : fichiers.length === 0 ? (
                <p className="m-0 px-5 py-8 text-[13.5px] text-[#6a7180]">Aucun fichier ici.</p>
              ) : (
                fichiers.map((f) => {
                  const pris = choisis.has(f.id);
                  return (
                    <button key={f.id} onClick={() => basculer(f.id)} className="w-full flex items-center gap-4 px-5 py-3 border-b border-[#15171b] text-left hover:bg-[#f2f3f5]/[0.02] transition-colors">
                      <span className={`w-4 h-4 rounded-[5px] border flex items-center justify-center flex-none ${pris ? "bg-[#96c0b8] border-[#96c0b8]" : "border-[#3a3f4a]"}`}>
                        {pris && <Check className="w-3 h-3 text-[#000000]" strokeWidth={3} />}
                      </span>
                      <span className="flex-1 min-w-0 text-[13.5px] text-[#f2f3f5] truncate">{f.nom}</span>
                      <span className="flex-none text-[12px] text-[#6a7180] tabular-nums">{f.taille ? poids(f.taille) : ""}</span>
                      <span className="flex-none w-[70px] text-right text-[12px] text-[#6a7180]">{quand(f.modifie_le)}</span>
                    </button>
                  );
                })
              )}
            </div>
            <footer className="flex items-center justify-between gap-4 px-5 py-4 border-t border-[#1f2228]">
              <span className="text-[12.5px] text-[#6a7180]">{choisis.size ? `${choisis.size} fichier${choisis.size > 1 ? "s" : ""} choisi${choisis.size > 1 ? "s" : ""}` : "Cochez ce qu'il faut rapatrier."}</span>
              <button onClick={() => importer.mutate()} disabled={!choisis.size || importer.isPending} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-[#f2f3f5] text-[#0b0c0e] text-[13px] font-semibold hover:bg-[#ffffff] disabled:opacity-40">
                {importer.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Importer
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
