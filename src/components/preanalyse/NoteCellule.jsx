import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Pencil } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La colonne Notes des tableaux du dossier (19 oct. 2026, Jules : « dans chaque tableau, une colonne Notes ») :
// un commentaire libre par ligne, pour l'équipe. Les grilles gardent leur note ; Bien et les croisements de la
// Synthèse écrivent au même endroit, sous leur nom de tableau.

/** Les notes de tous les tableaux du dossier, par « tableau.ligne ». */
export function useNotesTableaux(dealId) {
  const q = useQuery({ queryKey: ["notes-tableaux", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/notes-tableaux`), enabled: !!dealId, staleTime: 60_000, retry: false });
  return q.data?.notes || {};
}

export default function NoteCellule({ dealId, tableau, ligne, note = null, lectureSeule = false }) {
  const [texte, setTexte] = useState(null);
  const queryClient = useQueryClient();
  const noter = useMutation({
    mutationFn: (t) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${encodeURIComponent(tableau)}/note/${encodeURIComponent(ligne)}`, { body: { texte: t } }),
    onSuccess: () => {
      setTexte(null);
      queryClient.invalidateQueries({ queryKey: ["notes-tableaux", dealId] });
      queryClient.invalidateQueries({ queryKey: ["grille"] });
    },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const modifiable = !lectureSeule && !!dealId;

  if (texte != null) return (
    <div onClick={(e) => e.stopPropagation()}>
      <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); noter.mutate(texte); } if (e.key === "Escape") setTexte(null); }}
        rows={2} placeholder="Une note pour l'équipe" className="w-full resize-y rounded-[10px] border border-menthe bg-surface px-3 py-2 text-[13.5px] text-encre outline-none max-md:text-[16px]" />
      <div className="mt-1.5 flex items-center gap-2">
        <button onClick={() => noter.mutate(texte)} disabled={noter.isPending} className="inline-flex items-center gap-1 rounded-full bg-menthe px-2.5 py-1 text-[12.5px] font-semibold text-sur-menthe"><Check className="h-3 w-3" /> Enregistrer</button>
        <button onClick={() => setTexte(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
      </div>
    </div>
  );
  if (note?.texte) return (
    <button type="button" disabled={!modifiable} onClick={(e) => { e.stopPropagation(); setTexte(note.texte); }}
      className="block w-full text-left text-[13px] leading-[1.45] text-craie disabled:cursor-default" style={{ background: "transparent" }}>
      {note.texte}
      {note.par && <span className="mt-0.5 block text-[11.5px] text-brume">{note.par.split("@")[0]}</span>}
    </button>
  );
  if (!modifiable) return <span className="text-[13px] text-brume">·</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); setTexte(""); }}
      className="inline-flex items-center gap-1 text-[12.5px] text-brume opacity-0 transition-opacity hover:text-ardoise focus-visible:opacity-100 group-hover/ligne:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
      <Pencil className="h-3 w-3" /> Ajouter
    </button>
  );
}
