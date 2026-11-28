import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { TexteRecap } from "@/components/fiche-dossier/BlocRecap";

// Les récaps de la semaine reçus (27 nov. 2026, Jules : « la personne voit son récap dès qu'elle ouvre la page, en début
// de semaine prochaine ») : à l'ouverture de Klocka, à partir du lundi qui suit l'envoi, une fenêtre par récap, le plus
// ancien d'abord ; « J'ai lu » le range pour de bon. La croix le remet à la prochaine ouverture.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) : "");

export default function RecapsRecus() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["recaps-recus"], queryFn: () => base44.request("GET", "/api/recap-semaine/recus"), staleTime: 5 * 60_000, retry: false });
  const [fermes, setFermes] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const r = (data?.recaps || []).find((x) => !fermes.has(x.id));
  if (!r) return null;
  const reste = (data?.recaps || []).filter((x) => !fermes.has(x.id)).length - 1;
  const lu = async () => {
    setEnCours(true);
    try { await base44.request("POST", `/api/recap-semaine/${r.id}/lu`); } catch { /* il reviendra à la prochaine ouverture */ }
    setEnCours(false);
    setFermes((s) => new Set(s).add(r.id));
    qc.invalidateQueries({ queryKey: ["recaps-recus"] });
  };
  return createPortal(
    <div className="fixed inset-0 z-[120] grid place-items-center bg-black/50 p-4 duration-200 animate-in fade-in-0" role="dialog" aria-label={`Récap de ${r.de}`}>
      <div className="k-verre-plein flex max-h-[min(720px,90dvh)] w-[min(640px,100%)] flex-col overflow-hidden rounded-[20px] shadow-[0_24px_60px_rgb(0_0_0/0.4)]">
        <div className="flex items-start justify-between gap-4 border-b border-trait px-6 py-4 max-md:px-4">
          <div className="min-w-0">
            <p className="m-0 text-[12.5px] text-ardoise">Récap de {r.de}{r.avec?.length ? `, aussi pour ${r.avec.join(", ")}` : ""}</p>
            <p className="m-0 mt-0.5 text-[12.5px] text-brume">Envoyé {jour(r.cree_le)}</p>
          </div>
          <button type="button" onClick={() => setFermes((s) => new Set(s).add(r.id))} aria-label="Plus tard" title="Plus tard : il reviendra à la prochaine ouverture"
            className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4"><TexteRecap recap={r.recap} /></div>
        <div className="flex items-center justify-between gap-3 border-t border-trait px-6 py-3.5 max-md:px-4">
          <p className="m-0 text-[12.5px] text-brume">{reste > 0 ? `${reste} autre${reste > 1 ? "s" : ""} récap${reste > 1 ? "s" : ""} ensuite` : ""}</p>
          <button type="button" onClick={lu} disabled={enCours} className="inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">J'ai lu</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
