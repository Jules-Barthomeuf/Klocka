import React from "react";
import { useMutation } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";

// Envoyer un dossier ou un projet dans le tableau Monday « Propriétés ».
//
// Idempotent côté serveur : rejouer met à jour l'élément existant plutôt que
// d'en créer un second. Le bouton peut donc servir de bouton de mise à jour.

export default function BoutonMonday({ dealId, projetId, dejaPose = false, className = "" }) {
  const envoyer = useMutation({
    mutationFn: () =>
      base44.request(
        "POST",
        dealId ? `/api/monday/dossiers/${dealId}` : `/api/monday/projets/${projetId}`
      ),
    onSuccess: (r) => {
      const url = r?.id
        ? `https://klocka-company.monday.com/boards/2110621762/pulses/${r.id}`
        : null;
      toast.success(r?.cree ? "Ajouté à Monday" : "Mis à jour dans Monday", {
        action: url ? { label: "Ouvrir", onClick: () => window.open(url, "_blank", "noopener") } : undefined,
      });
    },
    onError: (e) => toast.error(e?.message || "Envoi vers Monday impossible"),
  });

  return (
    <button
      onClick={() => envoyer.mutate()}
      disabled={envoyer.isPending}
      title={dejaPose ? "Mettre à jour la fiche Monday" : "Envoyer dans le tableau Monday « Propriétés »"}
      className={`inline-flex items-center gap-1.5 px-3 h-9 rounded-md border border-[#22262d] text-[13px] text-[#c9cdd6] hover:text-[#f2f3f5] hover:border-[#3a3f4a] disabled:opacity-50 transition-colors ${className}`}
    >
      {envoyer.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
      {dejaPose ? "Mettre à jour Monday" : "Envoyer dans Monday"}
    </button>
  );
}
