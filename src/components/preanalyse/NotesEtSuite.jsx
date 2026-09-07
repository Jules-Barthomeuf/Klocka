import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
import { Mono } from "./CadreEtapes";

// Les notes de l'analyste et ce qu'il reste à faire, sur le dossier. Les
// notes s'enregistrent toutes seules ; les tâches se cochent, se rattachent à
// l'étape où on les écrit.
export default function NotesEtSuite({ dealId, etape, apercu = false }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["notes", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/notes`), enabled: !!dealId });
  const [notes, setNotes] = useState("");
  const [nouvelle, setNouvelle] = useState("");
  const charge = useRef(false);
  useEffect(() => { if (data && !charge.current) { setNotes(data.notes || ""); charge.current = true; } }, [data]);
  const enregistrer = useMutation({
    mutationFn: (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/notes`, { body: corps }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", dealId] }),
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });
  // Les notes partent d'elles-mêmes, une seconde après la dernière frappe.
  const minuterie = useRef(null);
  const changerNotes = (v) => { setNotes(v); clearTimeout(minuterie.current); minuterie.current = setTimeout(() => enregistrer.mutate({ notes: v }), 1000); };
  const taches = data?.taches || [];
  const majTaches = (liste) => enregistrer.mutate({ taches: liste });
  const ajouter = () => { const t = nouvelle.trim(); if (!t) return; majTaches([...taches, { id: Date.now().toString(36), texte: t, fait: false, etape }]); setNouvelle(""); };
  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5 px-6 max-md:px-4 py-5 border-b border-[#1f2228] bg-[#050506]">
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2"><Mono>Notes</Mono>{data?.maj_le && <Mono className="normal-case tracking-[.04em]">{enregistrer.isPending ? "enregistrement…" : `enregistré · ${new Date(data.maj_le).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}${data.maj_par ? ` · ${data.maj_par}` : ""}`}</Mono>}</div>
        <textarea value={notes} onChange={(e) => changerNotes(e.target.value)} disabled={apercu} rows={6} placeholder="Ce que vous retenez, ce qui vous gêne, ce que l'agent a dit au téléphone…" className="w-full bg-transparent border border-[#1f2228] focus:border-[#3a3f4a] outline-none px-3 py-2.5 text-[13.5px] leading-[1.65] text-[#f2f3f5] placeholder:text-[#4d545d] resize-y" />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3 mb-2"><Mono>La suite</Mono><Mono className="normal-case tracking-[.04em]">{aFaire.length} à faire{faites.length ? ` · ${faites.length} fait${faites.length > 1 ? "es" : "e"}` : ""}</Mono></div>
        <div className="flex items-center gap-2 mb-2">
          <input value={nouvelle} onChange={(e) => setNouvelle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} disabled={apercu} placeholder="Quoi faire ensuite — Entrée pour ajouter" className="flex-1 bg-transparent border border-[#1f2228] focus:border-[#3a3f4a] outline-none px-3 py-2 text-[13.5px] text-[#f2f3f5] placeholder:text-[#4d545d]" />
          <button onClick={ajouter} disabled={apercu || !nouvelle.trim()} className="w-9 h-9 border border-[#2c3139] text-[#c9cdd6] hover:text-[#f2f3f5] flex items-center justify-center disabled:opacity-40"><Plus className="w-4 h-4" /></button>
        </div>
        <ul className="m-0 p-0 list-none">
          {[...aFaire, ...faites].map((t) => (
            <li key={t.id} className="flex items-start gap-3 py-2 border-t border-[#15171b] group">
              <button onClick={() => !apercu && majTaches(taches.map((x) => (x.id === t.id ? { ...x, fait: !x.fait } : x)))} className={`mt-[2px] w-4 h-4 border flex items-center justify-center flex-none ${t.fait ? "bg-[#f2f3f5] border-[#f2f3f5] text-[#000000]" : "border-[#3a3f4a] hover:border-[#f2f3f5]"}`}>{t.fait && <Check className="w-3 h-3" strokeWidth={3} />}</button>
              <span className={`flex-1 text-[13.5px] leading-[1.5] ${t.fait ? "text-[#6a7180] line-through" : "text-[#f2f3f5]"}`}>{t.texte}{t.etape ? <Mono className="ml-2 normal-case tracking-[.04em]">étape {t.etape}</Mono> : null}</span>
              <button onClick={() => !apercu && majTaches(taches.filter((x) => x.id !== t.id))} className="opacity-0 group-hover:opacity-100 text-[#6a7180] hover:text-[#e8746a]"><X className="w-3.5 h-3.5" /></button>
            </li>
          ))}
          {!taches.length && <li className="py-2 text-[12.5px] text-[#4d545d]">Rien pour l'instant.</li>}
        </ul>
      </div>
    </div>
  );
}
