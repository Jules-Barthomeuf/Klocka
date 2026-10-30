import React, { useState } from "react";
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

export default function NoteCellule({ dealId, tableau, ligne, note = null, lectureSeule = false, noteIA = null }) {
  const queryClient = useQueryClient();
  const noter = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${encodeURIComponent(tableau)}/note/${encodeURIComponent(ligne)}`, { body: corps }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes-tableaux", dealId] });
      queryClient.invalidateQueries({ queryKey: ["grille"] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const modifiable = !lectureSeule && !!dealId;
  // La note de l'IA est une note comme une autre (30 oct. 2026, Jules) : elle s'écrit dans la case, se modifie ou
  // s'efface ; effacée, elle ne revient pas. Rien de tout cela ne touche à l'état de la ligne.
  // Sa forme (fiche de Jules, 30 oct. 2026) : le texte en sable (`lu-ia`), 13,5 px, interligne 1,55 ; une note de l'IA
  // porte « IA » en exposant après son dernier caractère (9 px, `encre`) ; une case sans note reste vide, sans rien.
  const [edition, setEdition] = useState(false);
  const ia = !note?.texte && !note?.ia_retiree && noteIA ? noteIA : null;
  const texte = note?.texte || ia || "";
  const enregistrer = (t) => noter.mutate(t ? { texte: t } : ia ? { texte: "", ia_retiree: true } : { texte: "" });
  const style = "text-[13.5px] font-normal leading-[1.55] text-lu-ia";
  if (edition && modifiable) {
    return <TexteEnPlace valeur={texte} autoFocus onQuitter={() => setEdition(false)} onEnregistrer={enregistrer} className={`${style} max-md:text-[16px]`} />;
  }
  return (
    <div className={`h-full min-w-0 ${modifiable ? "cursor-text" : ""}`} onClick={(e) => { e.stopPropagation(); if (modifiable) setEdition(true); }}
      title={note?.texte && note?.par ? `Note de ${note.par.split("@")[0]}` : undefined}>
      {texte && (
        <p className={`m-0 whitespace-pre-line ${style}`}>
          {texte}
          {ia && <sup className="ml-[3px] text-[9px] tracking-[.04em] text-encre">IA</sup>}
        </p>
      )}
    </div>
  );
}
