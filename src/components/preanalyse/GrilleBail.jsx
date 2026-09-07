import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Mono } from "./CadreEtapes";

// La grille du bail : un critère par ligne, la valeur lue, sa source, et le
// statut. Vert : la valeur est là, aucune règle ne s'allume. Orange : une
// règle s'allume, le motif dit laquelle. Gris : rien de lu.

const STATUT = {
  ok: ["#7fd1a8", "OK"], warning: ["#e8b04c", "À vérifier"], a_verifier: ["#e8b04c", "À vérifier"], vide: ["#4d545d", "Non trouvé"], non_lu: ["#4d545d", "Non lu"],
};

export default function GrilleBail({ dossier, onPreuve, apercu = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const { data: g, isLoading } = useQuery({
    queryKey: ["grille-bail", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/grille-bail`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  });
  const completer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille-bail/completer`, { body: {} }),
    onSuccess: (r) => { toast.success(r.rien ? "Tout est déjà lu" : `Lecture de ${r.colonnes.length} question${r.colonnes.length > 1 ? "s" : ""} lancée`); queryClient.invalidateQueries({ queryKey: ["grille-bail", dealId] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  if (isLoading || !g) return <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" /></div>;
  const enCours = g.remplissage?.etat === "en_cours";
  const { resume } = g;

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-md overflow-hidden">
      <header className="px-6 max-md:px-4 py-4 border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]">Grille · Bail</h2>
          <span className="text-[13px] text-[#9298a6]">Les critères Klocka, la valeur lue dans les pièces, et ce qui s'allume.</span>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-3 text-[12px]">
            <span className="inline-flex items-center gap-1.5 text-[#7fd1a8]"><span className="w-2 h-2 rounded-full bg-[#7fd1a8]" />{resume.ok} OK</span>
            <span className="inline-flex items-center gap-1.5 text-[#e8b04c]"><span className="w-2 h-2 rounded-full bg-[#e8b04c]" />{resume.warning + resume.a_verifier} à vérifier</span>
            {(resume.vide + resume.non_lu) > 0 && <span className="inline-flex items-center gap-1.5 text-[#6a7180]"><span className="w-2 h-2 rounded-full bg-[#4d545d]" />{resume.vide + resume.non_lu} sans valeur</span>}
          </span>
          {resume.non_lu > 0 && (enCours ? <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> lecture {g.remplissage.fait}/{g.remplissage.total ?? "…"}</span>
            : <button onClick={() => !apercu && completer.mutate()} disabled={apercu || completer.isPending} className="text-[12.5px] px-3.5 py-1.5 bg-[#96c0b8] text-[#0b0c0e] font-semibold hover:bg-[#abd0c8] disabled:opacity-40">Lire les {resume.non_lu} question{resume.non_lu > 1 ? "s" : ""} manquante{resume.non_lu > 1 ? "s" : ""}</button>)}
        </div>
      </header>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#1f2228]">
            <th className="text-left font-normal px-6 max-md:px-4 py-2.5 w-[260px]"><Mono>Critère</Mono></th>
            <th className="text-left font-normal px-4 py-2.5"><Mono>Valeur lue</Mono></th>
            <th className="text-left font-normal px-4 py-2.5 w-[220px]"><Mono>Source</Mono></th>
            <th className="text-left font-normal px-6 max-md:px-4 py-2.5 w-[240px]"><Mono>Statut</Mono></th>
          </tr>
        </thead>
        <tbody>
          {g.lignes.map((l) => {
            const [teinte, mot] = STATUT[l.statut] || STATUT.vide;
            return (
              <tr key={l.id} className="border-b border-[#15171b] align-top">
                <td className="px-6 max-md:px-4 py-3.5">
                  <p className="m-0 text-[14px] text-[#f2f3f5]">{l.libelle}</p>
                  <p className="m-0 mt-0.5 text-[11.5px] leading-[1.45] text-[#6a7180]">{l.regle}</p>
                </td>
                <td className="px-4 py-3.5">
                  {l.valeur ? <p className="m-0 text-[13.5px] leading-[1.55] text-[#d6d6db] line-clamp-3" title={l.valeur}>{l.valeur}</p> : <span className="text-[13px] text-[#4d545d]">—</span>}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-col gap-1">
                    {l.preuves.length ? l.preuves.slice(0, 3).map((p, i) => (
                      <button key={i} onClick={() => onPreuve?.(p)} title={p.citation || p.reponse} className="text-left font-mono text-[10.5px] tracking-[.06em] text-[#6a7180] hover:text-[#f2f3f5] truncate max-w-[200px]">{(p.document_nom || "").replace(/\.pdf$/i, "").slice(0, 22)}{p.page ? ` p. ${p.page}` : ""}</button>
                    )) : <Mono className="normal-case tracking-[.04em] text-[#4d545d]">aucune</Mono>}
                  </div>
                </td>
                <td className="px-6 max-md:px-4 py-3.5">
                  <span className="inline-flex items-center gap-2 text-[12.5px] font-medium" style={{ color: teinte }}><span className="w-2 h-2 rounded-full flex-none" style={{ background: teinte }} />{mot}</span>
                  {l.motif && <p className="m-0 mt-1 text-[12px] leading-[1.5] text-[#9298a6]">{l.motif}</p>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="m-0 px-6 max-md:px-4 py-3 text-[11.5px] text-[#6a7180]">Un clic sur une source ouvre la pièce à la page, avec la citation. Le loyer de signature est indexé à ~2 % par an depuis la prise d'effet pour la comparaison avec la fiche.</p>
    </div>
  );
}
