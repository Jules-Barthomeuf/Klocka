import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, Loader2, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useAuthPeutEtre } from "@/lib/AuthContext";

// Le bien d'essai (29 oct. 2026, Jules : « naviguer de la 1 à la 6, faire tout le flow sans faire le travail ») : un
// bouton en bas à gauche, réservé à l'équipe en vue mandataire, ouvre les scénarios par étape. Un clic pose le « Bien
// d'essai » dans cet état (côté serveur, sans modèle ni envoi : server/bien-essai.js) et l'ouvre à la bonne étape.

const CLES = ["m-proprietaires", "m-estimations", "m-mandats", "m-dossiers", "m-marches", "m-fiche", "m-teaser", "m-dossier-vente", "m-apercu", "fil-dossier"];

export default function ScenariosEssai({ onAller }) {
  const auth = useAuthPeutEtre();
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const equipe = auth?.user?.role === "admin";
  const { data } = useQuery({ queryKey: ["m-essai"], queryFn: () => base44.request("GET", "/api/mandataire/essai"), enabled: equipe && ouvert, staleTime: Infinity });
  const rafraichir = () => CLES.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const poser = useMutation({
    mutationFn: (cle) => base44.request("POST", "/api/mandataire/essai/scenario", { body: { cle } }),
    onSuccess: async (r) => { rafraichir(); await queryClient.refetchQueries({ queryKey: ["m-proprietaires"] }); setOuvert(false); onAller?.(r.bien, r.etape); toast.success("Bien d'essai posé"); },
    onError: (e) => toast.error(e?.message || "Scénario impossible"),
  });
  const effacer = useMutation({
    mutationFn: () => base44.request("DELETE", "/api/mandataire/essai"),
    onSuccess: () => { rafraichir(); setOuvert(false); toast.success("Bien d'essai effacé"); },
  });
  if (!equipe) return null;
  return createPortal(
    <>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-label="Scénarios du bien d'essai" title="Scénarios du bien d'essai"
        className="fixed bottom-5 left-5 z-[70] inline-flex h-10 items-center gap-2 rounded-full border border-bord-vif bg-surface-pleine px-4 text-[13px] text-craie shadow-[0_10px_30px_rgb(0_0_0/0.25)] hover:text-encre max-md:bottom-[calc(env(safe-area-inset-bottom)+5.5rem)]">
        <FlaskConical className="h-4 w-4" />Scénarios
      </button>
      {ouvert && (
        <div role="dialog" aria-label="Scénarios du bien d'essai" className="fixed bottom-[4.25rem] left-5 z-[70] flex max-h-[75dvh] w-[360px] max-w-[calc(100vw-2.5rem)] flex-col rounded-[16px] border border-trait bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.3)] max-md:bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]">
          <div className="flex flex-none items-start gap-2 border-b border-trait px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[14px] text-encre">Bien d'essai</p>
              <p className="m-0 mt-0.5 text-[12px] text-ardoise">Un clic le pose à cette étape et l'ouvre. Rien n'est envoyé, aucun crédit.</p>
            </div>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-7 w-7 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {!data ? <p className="m-0 inline-flex items-center gap-2 px-2 py-3 text-[13px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Les scénarios…</p> : data.scenarios.map((g, i) => (
              <section key={g.etape} className="mb-2">
                <p className="m-0 px-2 pb-1 pt-2 text-[11px] uppercase tracking-[.14em] text-brume">{i + 1}. {g.titre}</p>
                {g.liste.map(([cle, titre, detail]) => (
                  <button key={cle} type="button" onClick={() => poser.mutate(cle)} disabled={poser.isPending}
                    className="flex w-full items-start gap-2 rounded-[10px] px-2 py-2 text-left hover:bg-relief/50 disabled:opacity-50" style={{ background: "transparent" }}>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] text-encre">{titre}</span>
                      <span className="block text-[12px] text-ardoise">{detail}</span>
                    </span>
                    {poser.isPending && poser.variables === cle && <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-ardoise" />}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="flex-none border-t border-trait px-4 py-2.5">
            <button type="button" onClick={() => effacer.mutate()} disabled={effacer.isPending} className="inline-flex items-center gap-1.5 text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
              <Trash2 className="h-3.5 w-3.5" />Effacer le bien d'essai
            </button>
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
