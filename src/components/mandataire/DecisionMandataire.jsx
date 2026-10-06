import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

/** La décision pour le mandataire : Go, compléments (pièces à cocher), no-go. */
export default function DecisionMandataire({ dossierId }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["fil-dossier", dossierId, "analyste"], queryFn: () => base44.request("GET", `/api/mandataire/admin/dossiers/${dossierId}/fil`) });
  const [mode, setMode] = useState(null);
  const [cochees, setCochees] = useState([]);
  const [libre, setLibre] = useState("");
  const [motif, setMotif] = useState("");
  const decider = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/mandataire/admin/dossiers/${dossierId}/decision`, { body: corps }),
    onSuccess: () => { setMode(null); setCochees([]); setLibre(""); setMotif(""); queryClient.invalidateQueries({ queryKey: ["fil-dossier", dossierId] }); queryClient.invalidateQueries({ queryKey: ["k-conversations"] }); toast.success("Décision envoyée au mandataire"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const statut = data?.dossier?.statut;
  if (!statut) return null;
  if (statut !== "en_etude") {
    const mots = { go: "Go envoyé : mise en marché ouverte, projet créé.", no_go: "No-go envoyé.", complements: "Compléments demandés : en attente du mandataire.", documents_en_cours: "Pièces en cours de dépôt par le mandataire.", complet: "Dossier complet, pas encore envoyé par le mandataire." };
    return <p className="m-0 rounded-[12px] border border-trait px-3.5 py-2.5 text-[13px] text-craie">{mots[statut] || statut}</p>;
  }
  const PIECES = [["bail", "Bail commercial"], ["quittances", "Quittances"], ["kbis", "Kbis du locataire"], ["copropriete", "Copropriété, PV d'AG"], ["diagnostics", "Diagnostics"], ["taxe_fonciere", "Taxe foncière"]];
  return (
    <div className="rounded-[14px] border border-trait p-3.5">
      <p className="m-0 text-[11.5px] uppercase tracking-[.1em] text-brume">Décision pour le mandataire</p>
      <div className="mt-2.5 flex gap-2">
        <button type="button" onClick={() => decider.mutate({ decision: "go" })} disabled={decider.isPending} className="rounded-full bg-menthe px-3.5 py-1.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Go</button>
        <button type="button" onClick={() => setMode(mode === "complements" ? null : "complements")} className="rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie" style={{ background: "transparent" }}>Compléments</button>
        <button type="button" onClick={() => setMode(mode === "no_go" ? null : "no_go")} className="rounded-full border border-bord-doux px-3.5 py-1.5 text-[13px] text-craie hover:text-alerte" style={{ background: "transparent" }}>No-go</button>
      </div>
      {mode === "complements" && (
        <div className="mt-3 space-y-2">
          {PIECES.map(([cle, mot]) => (
            <label key={cle} className="flex items-center gap-2 text-[13px] text-craie">
              <input type="checkbox" checked={cochees.includes(cle)} onChange={() => setCochees((c) => (c.includes(cle) ? c.filter((x) => x !== cle) : [...c, cle]))} /> {mot}
            </label>
          ))}
          <input value={libre} onChange={(e) => setLibre(e.target.value)} placeholder="Autre pièce (ex. plan du local)" className="w-full rounded-[10px] border border-trait bg-surface-pleine px-3 py-2 text-[13px] text-encre outline-none max-md:text-[16px]" />
          <button type="button" disabled={decider.isPending || (!cochees.length && !libre.trim())} onClick={() => decider.mutate({ decision: "complements", pieces: [...cochees, ...(libre.trim() ? [libre.trim()] : [])] })}
            className="rounded-full bg-menthe px-3.5 py-1.5 text-[13px] text-sur-menthe disabled:opacity-40">Demander ces pièces</button>
        </div>
      )}
      {mode === "no_go" && (
        <div className="mt-3 space-y-2">
          <textarea value={motif} onChange={(e) => setMotif(e.target.value)} rows={3} placeholder="La raison, le mandataire la lira" className="w-full rounded-[10px] border border-trait bg-surface-pleine px-3 py-2 text-[13px] text-encre outline-none max-md:text-[16px]" />
          <button type="button" disabled={decider.isPending || !motif.trim()} onClick={() => decider.mutate({ decision: "no_go", commentaire: motif.trim() })}
            className="rounded-full border border-alerte px-3.5 py-1.5 text-[13px] text-alerte disabled:opacity-40" style={{ background: "transparent" }}>Envoyer le no-go</button>
        </div>
      )}
    </div>
  );
}
