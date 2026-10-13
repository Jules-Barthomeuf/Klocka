import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// « Une question ? » (13 oct. 2026, Jules) : le client écrit, la question
// arrive dans le Feedback de l'équipe avec le nom de la présentation. Rien
// d'autre ne se déclenche : Jules la lit et y répond lui-même (CLAUDE.md).

export default function QuestionClient({ id, titre, onFermer }) {
  const [texte, setTexte] = useState("");
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", `/api/client/presentations/${id}/question`, { body: { texte } }),
    onSuccess: () => { toast.success("Question envoyée : l'équipe Klocka vous répond au plus vite."); onFermer(); },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex w-full max-w-[520px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-trait px-5 py-3.5">
          <div className="min-w-0">
            <p className="m-0 text-[14.5px] text-encre">Une question ?</p>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">Sur « {titre} »</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4">
          <textarea autoFocus value={texte} onChange={(e) => setTexte(e.target.value)} rows={5} placeholder="Un chiffre à vérifier, une diapositive à reprendre, une pièce à fournir…"
            className="w-full resize-none rounded-[10px] border border-trait bg-surface px-3.5 py-3 text-[14px] leading-[1.5] text-encre outline-none placeholder:text-brume focus:border-bord-doux max-md:text-[16px]" />
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-trait px-5 py-3.5">
          <button type="button" onClick={onFermer} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
          <button type="button" onClick={() => envoyer.mutate()} disabled={!texte.trim() || envoyer.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
            {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer à Klocka
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
