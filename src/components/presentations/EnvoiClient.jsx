import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Search, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";

// Envoyer une présentation à des clients (13 oct. 2026, Jules) : on coche
// parmi les comptes clients, le client du projet en tête. Elle apparaît dans
// leur page Présentations, éditable, sans le chat. L'équipe la garde toujours.

const API = "/api/admin/presentations-bancaires";

export default function EnvoiClient({ id, titre, onFermer }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["presentation-clients", id], queryFn: () => base44.request("GET", `${API}/${id}/clients`) });
  const clients = data?.clients || [];
  const [choisis, setChoisis] = useState(null);
  // Déjà envoyée : ses destinataires cochés ; jamais envoyée : le client du projet, pré-coché.
  useEffect(() => {
    if (!data || choisis !== null) return;
    const deja = clients.filter((c) => c.envoyee);
    setChoisis(new Set((deja.length ? deja : clients.filter((c) => c.du_projet)).map((c) => c.email)));
  }, [data]);
  const [recherche, setRecherche] = useState("");
  const trouves = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return clients.filter((c) => !q || `${c.nom || ""} ${c.email}`.toLowerCase().includes(q)).slice(0, 60);
  }, [clients, recherche]);
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", `${API}/${id}/envoyer`, { body: { emails: [...(choisis || [])] } }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["presentations-bancaires"] });
      queryClient.invalidateQueries({ queryKey: ["presentation-bancaire", id] });
      toast.success(r.envoye_a.length ? `Envoyée à ${r.envoye_a.length} client${r.envoye_a.length > 1 ? "s" : ""} : elle est dans leur page Présentations.` : "Plus envoyée à aucun client.");
      onFermer();
    },
    onError: (e) => toast.error(e?.message || "Envoi impossible"),
  });
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const basculer = (email) => setChoisis((s) => { const n = new Set(s || []); if (n.has(email)) n.delete(email); else n.add(email); return n; });

  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-trait px-5 py-3.5">
          <div className="min-w-0">
            <p className="m-0 text-[14.5px] text-encre">Envoyer au client</p>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{titre}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 pt-4">
          <div className="flex items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux">
            <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
            <input autoFocus value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom ou adresse du client"
              className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {isLoading ? (
            <Chargement />
          ) : !trouves.length ? (
            <p className="py-10 text-center text-[13.5px] text-brume">Aucun client ne correspond.</p>
          ) : (
            <div className="border-y border-trait">
              {trouves.map((c) => {
                const on = choisis?.has(c.email);
                return (
                  <button key={c.email} type="button" onClick={() => basculer(c.email)} aria-pressed={on}
                    className="flex w-full items-center gap-3 border-t border-trait px-2 py-3 text-left first:border-t-0 hover:bg-encre/[0.02]" style={{ background: "transparent" }}>
                    <span className={`grid h-5 w-5 flex-none place-items-center rounded-[6px] border ${on ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-doux"}`}>{on && <Check className="h-3.5 w-3.5" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] text-encre">{c.nom || c.email}</span>
                      <span className="block truncate text-[12.5px] text-ardoise">{c.nom ? c.email : ""}</span>
                    </span>
                    {c.du_projet && <span className="flex-none text-[12px] text-menthe">client du projet</span>}
                    {c.envoyee && !c.du_projet && <span className="flex-none text-[12px] text-brume">déjà envoyée</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-trait px-5 py-3.5">
          <p className="m-0 text-[12.5px] text-ardoise">Elle part chez le client et reste chez tous les admins, vue client comprise.</p>
          <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending || choisis === null}
            className="inline-flex h-9 flex-none items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-60">
            {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Envoyer{choisis?.size ? ` (${choisis.size})` : ""}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
