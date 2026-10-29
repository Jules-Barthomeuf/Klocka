import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import TexteEnPlace from "@/components/ui/texte-en-place";

// La colonne Notes des tableaux du dossier (19 oct. 2026, Jules : « dans chaque tableau, une colonne Notes ») :
// un commentaire libre par ligne, pour l'équipe. Les grilles gardent leur note ; Bien et les croisements de la
// Synthèse écrivent au même endroit, sous leur nom de tableau.

/** Les notes de tous les tableaux du dossier, par « tableau.ligne ». */
export function useNotesTableaux(dealId) {
  const q = useQuery({ queryKey: ["notes-tableaux", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/notes-tableaux`), enabled: !!dealId, staleTime: 60_000, retry: false });
  return q.data?.notes || {};
}

export default function NoteCellule({ dealId, tableau, ligne, note = null, lectureSeule = false }) {
  const queryClient = useQueryClient();
  const noter = useMutation({
    mutationFn: (t) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${encodeURIComponent(tableau)}/note/${encodeURIComponent(ligne)}`, { body: { texte: t } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes-tableaux", dealId] });
      queryClient.invalidateQueries({ queryKey: ["grille"] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const modifiable = !lectureSeule && !!dealId;
  if (!modifiable && !note?.texte) return <span className="text-[13px] text-encre">·</span>;
  // On écrit directement dans la case (29 oct. 2026, Jules) : « Ajouter une note » n'apparaît qu'au survol de la ligne.
  return (
    <div className="min-w-0">
      <TexteEnPlace valeur={note?.texte || ""} disabled={!modifiable} onEnregistrer={(t) => noter.mutate(t)}
        placeholder="Ajouter une note"
        className="text-[13px] leading-[1.45] text-encre placeholder:text-transparent focus:placeholder:text-brume group-hover/ligne:placeholder:text-brume max-md:text-[16px] max-md:placeholder:text-brume" />
      {note?.par && <span className="mt-0.5 block text-[11.5px] text-craie">{note.par.split("@")[0]}</span>}
    </div>
  );
}
