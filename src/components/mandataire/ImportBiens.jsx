import React, { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "framer-motion";
import { FileUp, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Panneau } from "@/components/mandataire/Visites";
import { euros } from "@/components/mandataire/kit";

// Les biens déjà en mandat (31 oct. 2026, Jules, PLAN.md 3.2) : le PDF d'un mandat, le registre en Excel ou CSV, ou une
// liste collée. L'Assistant KPartners lit, le mandataire relit (une case par bien, et « Signé chez K Partners »), puis
// un tap crée les biens à la bonne étape (server/biens-import.js). Rien ne part vers le CRM.

const API = "/api/mandataire/biens/import";
const jour = (d) => (d ? d.split("-").reverse().join("/") : null);

export default function ImportBiens({ onFermer }) {
  const qc = useQueryClient();
  const ref = useRef(null);
  const [texte, setTexte] = useState("");
  const [survol, setSurvol] = useState(false);
  const [lus, setLus] = useState(null);

  const lire = useMutation({
    mutationFn: ({ fichier = null, colle = "" }) => {
      const corps = new FormData();
      if (fichier) corps.append("fichier", fichier);
      if (colle) corps.append("texte", colle);
      return base44.request("POST", `${API}/lire`, { body: corps });
    },
    onSuccess: (r) => setLus(r.biens.map((b) => ({ ...b, garder: !b.deja }))),
    onError: (e) => toast.error(e?.message || "Lecture impossible"),
  });
  const importer = useMutation({
    mutationFn: (biens) => base44.request("POST", API, { body: { biens } }),
    onSuccess: async (r) => {
      await qc.refetchQueries({ queryKey: ["m-proprietaires"] });
      toast.success(`${r.ajoutes} bien${r.ajoutes > 1 ? "s" : ""} importé${r.ajoutes > 1 ? "s" : ""}${r.doublons ? `, ${r.doublons} déjà là` : ""}`);
      onFermer();
    },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });
  const changer = (i, champs) => setLus((l) => l.map((b, k) => (k === i ? { ...b, ...champs } : b)));
  const gardes = (lus || []).filter((b) => b.garder);

  return (
    <AnimatePresence>
      <Panneau large titre="Importer mes mandats" sous={lus ? `${lus.length} mandat${lus.length > 1 ? "s" : ""} lu${lus.length > 1 ? "s" : ""} : relisez avant d'importer` : "Le PDF d'un mandat, votre registre en Excel ou CSV, ou une liste collée"} onFermer={onFermer}>
        {!lus ? (
          <>
            <button type="button" onClick={() => ref.current?.click()} disabled={lire.isPending}
              onDragOver={(e) => { e.preventDefault(); setSurvol(true); }} onDragLeave={() => setSurvol(false)}
              onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer.files?.[0]; if (f) lire.mutate({ fichier: f }); }}
              className={`flex min-h-[150px] w-full flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed p-6 text-center transition-colors ${survol ? "border-menthe bg-menthe/[0.06]" : "border-bord hover:border-bord-vif"}`} style={survol ? undefined : { background: "transparent" }}>
              {lire.isPending ? <Loader2 className="h-5 w-5 animate-spin text-menthe" /> : <FileUp className="h-5 w-5 text-ardoise" />}
              <span className="text-[13.5px] text-encre">{lire.isPending ? "L'Assistant KPartners lit vos mandats…" : "Cliquez ou glissez votre fichier"}</span>
              <span className="text-[12.5px] text-brume">.pdf, .xlsx ou .csv</span>
            </button>
            <input ref={ref} type="file" accept=".pdf,.xlsx,.csv,.txt,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) lire.mutate({ fichier: f }); }} />
            <p className="m-0 mt-5 text-[13.5px] text-ardoise">Ou collez vos mandats, tels quels :</p>
            <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={4} placeholder={"Boulangerie, 12 rue Masséna à Nice, SCI Dupont 06 12 34 56 78, 450 k€, mandat 2026-0007 signé le 3/09\nPharmacie, 3 rue Neuve à Nice, mandat Century 21 jusqu'au 15/03/2027, 800 k€"}
              className="mt-2 w-full resize-y rounded-[14px] border border-trait bg-surface px-4 py-3 text-[13.5px] leading-[1.55] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
            <button type="button" onClick={() => lire.mutate({ colle: texte.trim() })} disabled={!texte.trim() || lire.isPending}
              className="mt-3 inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {lire.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Lire la liste
            </button>
          </>
        ) : (
          <>
            <ul className="m-0 list-none divide-y divide-trait border-y border-trait p-0">
              {lus.map((b, i) => (
                <li key={i} className={`flex items-start gap-3 py-3 ${b.garder ? "" : "opacity-55"}`}>
                  <input type="checkbox" checked={b.garder} onChange={(e) => changer(i, { garder: e.target.checked })} aria-label="Importer ce bien" className="mt-1 h-4 w-4 flex-none accent-menthe" />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-[14px] text-encre">{[b.commerce || b.activite || b.adresse, b.ville].filter(Boolean).join(" · ")}</p>
                    <p className="m-0 mt-0.5 text-[13px] leading-[1.5] text-ardoise">
                      {[b.adresse, b.proprietaire, b.prix ? euros(b.prix) : null, b.numero ? `n° ${b.numero}` : null, b.echeance ? `échéance ${jour(b.echeance)}` : null, b.exclusif ? "exclusif" : null].filter(Boolean).join(" · ")}
                    </p>
                    {b.deja && <p className="m-0 mt-0.5 text-[12.5px] text-brume">Déjà dans vos biens</p>}
                    <label className="mt-1.5 inline-flex items-center gap-2 text-[13px] text-craie">
                      <input type="checkbox" checked={b.k_partners} onChange={(e) => changer(i, { k_partners: e.target.checked })} className="h-3.5 w-3.5 accent-menthe" />
                      Signé chez K Partners
                      {!b.k_partners && <span className="text-ardoise">· à re-signer{b.enseigne ? ` (signé chez ${b.enseigne})` : ""}</span>}
                    </label>
                  </div>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 text-[12.5px] leading-[1.5] text-brume">Un mandat K Partners entre à l'étape Mandat faite. Un mandat signé ailleurs reste à son agence : le bien entre avec son prix, et une relance pour le re-signer un mois avant l'échéance.</p>
            <div className="mt-4 flex items-center justify-end gap-2.5">
              <button type="button" onClick={() => setLus(null)} className="inline-flex h-10 items-center rounded-full border border-trait px-5 text-[13.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>Recommencer</button>
              <button type="button" onClick={() => importer.mutate(gardes)} disabled={!gardes.length || importer.isPending}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                {importer.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Importer {gardes.length} bien{gardes.length > 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </Panneau>
    </AnimatePresence>
  );
}
