import React, { useState } from "react";
import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Check, Loader2, Pencil, RotateCcw } from "lucide-react";

// Une grille de critères : critère, valeur lue au format voulu, statut en
// case colorée, source à droite. La règle se lit d'un clic sur le critère.

const FOND = { ok: "#2f7a5a", warning: "#a8752a", a_verifier: "#a8752a", no_go: "#9b3b32", vide: "#2c3139", non_lu: "#2c3139" };
const MOT = { ok: "OK", warning: "À vérifier", a_verifier: "À vérifier", no_go: "No go", vide: "Non trouvé", non_lu: "Non lu" };
const Th = ({ children, className = "" }) => <th className={`text-left text-[11.5px] font-semibold tracking-[.02em] text-[#9298a6] px-4 py-2.5 border-b border-r border-[#1f2228] last:border-r-0 ${className}`}>{children}</th>;

export function TableCriteres({ g, onPreuve, sansSources = false, titre = null, dealId = null, lectureSeule = false }) {
  const [ouverts, setOuverts] = useState(() => new Set());
  const [details, setDetails] = useState(() => new Set());
  const [choix, setChoix] = useState(null);
  const queryClient = useQueryClient();
  const bascule = (id) => setOuverts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const basculeDetail = (id) => setDetails((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const [edition, setEdition] = useState(null); // { id, texte }
  const corriger = useMutation({
    mutationFn: ({ critere, valeur }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${g.id}/valeur/${critere}`, { body: { valeur } }),
    onSuccess: () => { setEdition(null); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const decider = useMutation({
    mutationFn: ({ critere, statut }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille/${g.id}/statut/${critere}`, { body: { statut } }),
    onSuccess: () => { setChoix(null); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <div>
      {titre && <p className="m-0 px-5 pt-4 pb-2 text-[15px] font-semibold text-[#f2f3f5]">{titre}</p>}
      <table className="w-full border-collapse">
        <thead><tr><Th className="w-[240px]">Critère</Th><Th>Valeur lue</Th><Th className="w-[170px]">Statut</Th>{!sansSources && <Th className="w-[210px]">Source</Th>}</tr></thead>
        <tbody>
          {g.lignes.map((l) => (
            <tr key={l.id} className="align-top">
              <td className="px-4 py-3 border-b border-r border-[#1f2228]">
                <button onClick={() => bascule(l.id)} className="text-left text-[14px] text-[#f2f3f5] hover:text-[#ffffff]">{l.libelle}</button>
                {ouverts.has(l.id) && <p className="m-0 mt-1 text-[11.5px] leading-[1.45] text-[#6a7180]">{l.regle}</p>}
              </td>
              <td className={`px-4 py-3 border-b border-r border-[#1f2228] group ${l.details ? "cursor-pointer" : ""}`} onClick={() => l.details && !edition && basculeDetail(l.id)} title={l.details ? "Voir les valeurs comparées" : undefined}>
                {edition?.id === l.id ? (
                  <div onClick={(e) => e.stopPropagation()}>
                    <textarea autoFocus value={edition.texte} onChange={(e) => setEdition({ id: l.id, texte: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); corriger.mutate({ critere: l.id, valeur: edition.texte }); } if (e.key === "Escape") setEdition(null); }} rows={Math.min(8, Math.max(2, edition.texte.split("\n").length))} className="w-full bg-transparent border border-[#3a3f4a] focus:border-[#f2f3f5] rounded-md px-2.5 py-1.5 outline-none text-[14px] leading-[1.55] text-[#f2f3f5] resize-y" />
                    <div className="mt-1.5 flex items-center gap-2">
                      <button onClick={() => corriger.mutate({ critere: l.id, valeur: edition.texte })} disabled={corriger.isPending} className="inline-flex items-center gap-1 text-[12px] px-2.5 py-1 bg-[#f2f3f5] text-[#0b0c0e] font-semibold rounded-md"><Check className="w-3 h-3" /> OK</button>
                      <button onClick={() => setEdition(null)} className="text-[12px] text-[#9298a6] hover:text-[#f2f3f5]">Annuler</button>
                      {l.correction && <button onClick={() => corriger.mutate({ critere: l.id, valeur: "" })} className="inline-flex items-center gap-1 text-[12px] text-[#9298a6] hover:text-[#f2f3f5] ml-auto"><RotateCcw className="w-3 h-3" /> Revenir à la valeur lue</button>}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    {l.valeur ? <p className="m-0 flex-1 text-[14px] leading-[1.55] text-[#f2f3f5] whitespace-pre-line">{l.valeur}</p> : <span className="flex-1 text-[13px] text-[#4d545d]">—</span>}
                    {!lectureSeule && dealId && <button onClick={(e) => { e.stopPropagation(); setEdition({ id: l.id, texte: l.valeur || "" }); }} title="Modifier la valeur" className="flex-none text-[#4d545d] hover:text-[#f2f3f5] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity mt-0.5"><Pencil className="w-3.5 h-3.5" /></button>}
                  </div>
                )}
                {l.correction && edition?.id !== l.id && <p className="m-0 mt-1 text-[11px] text-[#d9b46a]">corrigé à la main{l.correction.par ? ` · ${l.correction.par.split("@")[0]}` : ""}{l.valeur_lue ? <span className="text-[#6a7180]"> · lu : {String(l.valeur_lue).slice(0, 60)}{String(l.valeur_lue).length > 60 ? "…" : ""}</span> : null}</p>}
                {l.motif && l.statut_calcule !== "ok" && <p className="m-0 mt-1 text-[12px] leading-[1.45] text-[#9298a6]">{l.motif}{l.details ? <span className="text-[#6a7180]"> · {details.has(l.id) ? "replier" : "voir les valeurs"}</span> : null}</p>}
                {l.details && details.has(l.id) && (
                  <div className="mt-2 border border-[#2c3139] rounded-lg px-3 py-2 space-y-1">
                    {l.details.map((d, i) => <p key={i} className="m-0 flex items-baseline justify-between gap-4 text-[12.5px]"><span className="text-[#9298a6]">{d.libelle}</span><span className="text-[#f2f3f5] tabular-nums font-light text-[14px]">{d.valeur}</span></p>)}
                  </div>
                )}
              </td>
              <td className={`px-4 py-3 border-b border-[#1f2228] relative ${sansSources ? "" : "border-r"} ${lectureSeule || !dealId ? "" : "cursor-pointer"}`} style={{ background: FOND[l.statut] || FOND.vide }} onClick={() => !lectureSeule && dealId && setChoix(choix === l.id ? null : l.id)} title={lectureSeule || !dealId ? undefined : "Changer le statut"}>
                <span className="text-[13px] font-medium text-[#ffffff]">{MOT[l.statut] || l.statut}</span>
                {l.decision && <span className="block text-[10.5px] text-[#ffffff]/70">décidé{l.decision.par ? ` · ${l.decision.par.split("@")[0]}` : ""}</span>}
                {choix === l.id && (
                  <div className="absolute left-2 top-full mt-1 z-20 bg-[#0f1114] border border-[#2c3139] rounded-lg shadow-[0_12px_30px_rgba(0,0,0,.5)] p-1.5 flex flex-col gap-1 min-w-[150px]" onClick={(e) => e.stopPropagation()}>
                    {[["ok", "OK"], ["a_verifier", "À vérifier"], ["no_go", "No go"]].map(([st, mot]) => (
                      <button key={st} onClick={() => decider.mutate({ critere: l.id, statut: st })} className="text-left text-[12.5px] text-[#ffffff] px-3 py-1.5 rounded-md" style={{ background: FOND[st] }}>{mot}</button>
                    ))}
                    {l.decision && <button onClick={() => decider.mutate({ critere: l.id, statut: null })} className="text-left text-[12px] text-[#9298a6] hover:text-[#f2f3f5] px-3 py-1">Revenir au calcul</button>}
                  </div>
                )}
              </td>
              {!sansSources && (
                <td className="px-4 py-3 border-b border-[#1f2228]">
                  <div className="flex flex-col gap-1">
                    {l.preuves?.length ? l.preuves.slice(0, 3).map((p, i) => (
                      <button key={i} onClick={() => onPreuve?.(p)} title={p.citation || p.reponse} className="text-left text-[12px] text-[#9298a6] hover:text-[#f2f3f5] truncate max-w-[190px]">{(p.document_nom || "").replace(/\.pdf$/i, "")}{p.page ? ` · p. ${p.page}` : ""}</button>
                    )) : <span className="text-[12px] text-[#4d545d]">—</span>}
                  </div>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Une grille chargée depuis le dossier, avec son en-tête et ses sous-tables.
export default function GrilleCriteres({ dossier, ids, titre, sousTitre, onPreuve, apercu = false }) {
  const dealId = dossier?.deal_id;
  const queryClient = useQueryClient();
  const requetes = useQueries({ queries: ids.map((id) => ({
    queryKey: ["grille", id, dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/grille/${id}`),
    enabled: !!dealId,
    refetchInterval: (q) => (q.state.data?.remplissage?.etat === "en_cours" ? 3000 : false),
  })) });
  const completer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/grille-bail/completer`, { body: {} }),
    onSuccess: (r) => { toast.success(r.rien ? "Tout est déjà lu" : `Lecture de ${r.colonnes.length} question${r.colonnes.length > 1 ? "s" : ""} lancée`); queryClient.invalidateQueries({ queryKey: ["grille"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const grilles = requetes.map((r) => r.data).filter(Boolean);
  const chargement = requetes.some((r) => r.isLoading);
  const resume = grilles.reduce((a, g) => ({ ok: a.ok + g.resume.ok, warning: a.warning + g.resume.warning + g.resume.a_verifier, no_go: a.no_go + (g.resume.no_go || 0), vide: a.vide + g.resume.vide + g.resume.non_lu, non_lues: a.non_lues + (g.non_lues || 0) }), { ok: 0, warning: 0, no_go: 0, vide: 0, non_lues: 0 });
  const enCours = grilles.some((g) => g.remplissage?.etat === "en_cours");

  return (
    <div className="bg-[#000000] border border-[#1f2228] rounded-[18px] overflow-hidden">
      <header className="px-5 py-4 border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="m-0 text-[17px] font-semibold text-[#f2f3f5]">{titre}</h2>
          {sousTitre && <span className="text-[13px] text-[#9298a6]">{sousTitre}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {grilles.length > 0 && (
            <span className="flex items-center gap-3 text-[12px] text-[#c9cdd6]">
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FOND.ok }} />{resume.ok} OK</span>
              <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FOND.warning }} />{resume.warning} à vérifier</span>
              {resume.no_go > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FOND.no_go }} />{resume.no_go} no go</span>}
              {resume.vide > 0 && <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: FOND.vide }} />{resume.vide} sans valeur</span>}
            </span>
          )}
          {resume.non_lues > 0 && (enCours ? <span className="inline-flex items-center gap-2 text-[12.5px] text-[#9298a6]"><Loader2 className="w-3.5 h-3.5 animate-spin" /> lecture…</span>
            : <button onClick={() => !apercu && completer.mutate()} disabled={apercu || completer.isPending} className="text-[12.5px] px-3.5 py-1.5 rounded-full bg-[#96c0b8] text-[#0b0c0e] font-semibold hover:bg-[#abd0c8] disabled:opacity-40">Lire les questions manquantes</button>)}
        </div>
      </header>
      {chargement && !grilles.length ? <div className="p-6"><Loader2 className="w-5 h-5 animate-spin text-[#9298a6]" /></div> : grilles.map((g, i) => (
        <div key={g.id} className={i > 0 ? "border-t border-[#1f2228]" : ""}>
          <TableCriteres g={g} onPreuve={onPreuve} dealId={dealId} titre={i > 0 ? g.titre : null} />
        </div>
      ))}
    </div>
  );
}
