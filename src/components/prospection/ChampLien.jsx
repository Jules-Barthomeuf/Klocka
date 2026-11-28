import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La page donnée par l'équipe (28 nov. 2026, Jules : « je te donne juste les liens ») : on colle le lien de la page de la
// personne (ou de la page équipe de l'agence, sans `nom`), le serveur la lit et range numéro, mail, note et biens
// (server/prospection/page-donnee.js). La carte se relit ensuite avec ce qui a été trouvé.
export default function ChampLien({ agenceId, nom = null, libelle, onLu = null }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState("");
  const lire = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/mode-appel/agences/${encodeURIComponent(agenceId)}/page`, { body: { url, nom } }),
    onSuccess: (r) => {
      setUrl("");
      queryClient.invalidateQueries({ queryKey: ["mode-appel-file"] });
      queryClient.invalidateQueries({ queryKey: ["crm-fiche"] });
      if (nom) {
        const p = r?.personne || {};
        const trouve = [p.telephone && "le numéro", p.email && "le mail", p.note && "la note", p.biens?.length && `${p.biens.length} bien${p.biens.length > 1 ? "s" : ""}`].filter(Boolean);
        toast.success(trouve.length ? `Sa page est lue : ${trouve.join(", ")}.` : "Sa page est lue, sans numéro ni mail écrits dessus.");
      } else {
        const n = r?.personnes?.length || 0;
        toast.success(n ? `Page équipe lue : ${n} personne${n > 1 ? "s" : ""}.` : "Page équipe lue, sans personne nommée dessus.");
      }
      onLu?.(r);
    },
    onError: (e) => toast.error(e?.message || "La page n'a pas pu être lue."),
  });
  const envoyer = (e) => { e.preventDefault(); e.stopPropagation(); if (url.trim() && !lire.isPending) lire.mutate(); };
  return (
    <form onSubmit={envoyer} onClick={(e) => e.stopPropagation()} className="flex min-w-0 items-center gap-2">
      <input type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder={libelle} aria-label={libelle}
        className="h-9 min-w-0 flex-1 rounded-champ border border-bord-doux bg-transparent px-3 text-[13.5px] text-encre placeholder:text-brume focus:border-bord-vif focus:outline-none max-md:text-[16px]" />
      <button type="submit" disabled={!url.trim() || lire.isPending}
        className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50" style={{ background: "transparent" }}>
        {lire.isPending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />Lecture</> : "Lire la page"}
      </button>
    </form>
  );
}
