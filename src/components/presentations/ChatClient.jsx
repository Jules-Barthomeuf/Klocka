import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La note du design, côté client (16 oct. 2026, Jules). Le chat du client est
// désormais celui de l'équipe (ChatDashboard, espace « presentation_client »).

/** En bas à droite : « Comment aimez-vous le design de la présentation ? », cinq étoiles, dans le Feedback de l'équipe. */
export function NoteDesign({ id }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["note-design", id], queryFn: () => base44.request("GET", `/api/client/presentations/${id}/note`) });
  const [survol, setSurvol] = useState(0);
  const note = data?.note || 0;
  const noter = useMutation({
    mutationFn: (n) => base44.request("POST", `/api/client/presentations/${id}/note`, { body: { note: n } }),
    onSuccess: (r) => { queryClient.setQueryData(["note-design", id], { note: r.note }); toast("Merci pour votre avis"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const montree = survol || note;
  return (
    <div className="fixed bottom-5 right-5 z-[75] flex flex-col items-end gap-1.5 rounded-[16px] border border-trait bg-fond/80 px-4 py-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)] backdrop-blur-xl max-md:bottom-20 max-md:right-3">
      <span className="text-[12.5px] text-craie">{note ? "Merci ! Votre note du design" : "Comment aimez-vous le design de la présentation ?"}</span>
      <div className="flex gap-1" onMouseLeave={() => setSurvol(0)} role="radiogroup" aria-label="Note du design, de 1 à 5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={note === n} aria-label={`${n} étoile${n > 1 ? "s" : ""}`} disabled={noter.isPending}
            onMouseEnter={() => setSurvol(n)} onClick={() => noter.mutate(n)} className="grid h-8 w-8 place-items-center rounded-full p-0 transition-transform hover:scale-110" style={{ background: "transparent" }}>
            <Star className={`h-[22px] w-[22px] ${n <= montree ? "fill-ambre text-ambre" : "text-brume"}`} strokeWidth={1.6} />
          </button>
        ))}
      </div>
    </div>
  );
}
