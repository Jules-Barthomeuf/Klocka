import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Le journal des appels (13 oct. 2026, Jules : « un journal d'appels par
// analyste, on doit pouvoir tous le consulter, voir les notes qu'on a prises,
// les transcriptions ») : chaque appel de l'équipe, le plus récent d'abord,
// par analyste ; un clic ouvre le résumé, les notes et la transcription. Les
// transcriptions sont gardées depuis le 13 octobre.

const quand = (iso) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const duree = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}` : `${s} s`);

export default function JournalAppels() {
  const [jours, setJours] = useState(14);
  const [qui, setQui] = useState("");
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["journal-appels", jours], queryFn: () => base44.request("GET", `/api/prospection/journal-appels?jours=${jours}`), refetchInterval: 60000 });
  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.journal || []).filter((x) => (!qui || x.par === qui) && (!t || [x.agence, x.ville, x.interlocuteur, x.notes, x.resume].filter(Boolean).join(" ").toLowerCase().includes(t)));
  }, [data, qui, q]);
  const ligne = "grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-4 border-t border-trait py-2.5 text-[13.5px] max-md:grid-cols-1 max-md:gap-1";

  return (
    <div className="k-points rounded-[16px] bg-rail px-5 pb-5 pt-4 max-md:px-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-full bg-rail-actif p-1">
          {[["", "Toute l'équipe"], ...(data?.analystes || []).map((a) => [a.prenom, `${a.prenom} · ${a.appels}`])].map(([k, mot]) => (
            <button key={k || "tous"} type="button" onClick={() => setQui(k)} aria-pressed={qui === k}
              className={`rounded-full px-3 py-1 text-[13px] transition-colors ${qui === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={qui === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <div className="flex min-w-[220px] max-w-[360px] flex-1 items-center gap-2.5 rounded-full border border-trait bg-surface px-4 py-2 focus-within:border-bord-doux">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Agence, ville, interlocuteur, notes" className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        <select value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période" className="ml-auto h-9 rounded-full border border-trait bg-transparent px-3 text-[13px] text-craie">
          {[[7, "7 jours"], [14, "14 jours"], [30, "30 jours"], [90, "90 jours"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        </select>
      </div>
      {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        : error ? <p className="m-0 py-8 text-center text-[13.5px] text-alerte">{error.message || "Le journal ne se charge pas."}</p>
          : (
            <div className="mt-4 border-y border-trait">
              {lignes.map((x) => {
                const on = ouvert === x.id;
                return (
                  <div key={x.id} className="border-t border-trait first:border-t-0">
                    <button type="button" onClick={() => setOuvert(on ? null : x.id)} aria-expanded={on}
                      className="grid w-full grid-cols-[120px_80px_minmax(0,1.3fr)_minmax(0,1fr)_20px] items-center gap-3 px-2 py-3 text-left text-[13.5px] hover:bg-relief/30 max-md:grid-cols-[minmax(0,1fr)_20px]" style={{ background: "transparent" }}>
                      <span className="tabular-nums text-ardoise max-md:hidden">{quand(x.le)}</span>
                      <span className="text-craie max-md:hidden">{x.par}</span>
                      <span className="min-w-0 truncate text-encre">{x.agence || "—"}{x.ville ? <span className="text-brume"> · {x.ville}</span> : null}<span className="text-brume md:hidden"> · {x.par} · {quand(x.le)}</span></span>
                      <span className="min-w-0 truncate text-craie max-md:hidden">{x.issue}{x.notes ? <span className="text-brume"> · notes</span> : null}{x.transcription ? <span className="text-brume"> · transcription</span> : null}</span>
                      <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${on ? "rotate-180" : ""}`} />
                    </button>
                    {on && (
                      <div className="flex flex-col bg-relief/30 px-3 pb-3 pt-1">
                        <div className={ligne}><span className="text-ardoise">Issue</span><span className="text-encre">{x.issue}{x.interlocuteur ? ` · ${x.interlocuteur}` : ""}{x.duree_s ? ` · ${duree(x.duree_s)}` : ""}</span></div>
                        <div className={ligne}><span className="text-ardoise">Résumé</span><span className="text-encre">{x.resume || "—"}</span></div>
                        <div className={ligne}><span className="text-ardoise">Notes</span><span className="whitespace-pre-line text-craie">{x.notes || "—"}</span></div>
                        <div className={ligne}><span className="text-ardoise">Transcription</span>{x.transcription ? <span className="max-h-[360px] overflow-y-auto whitespace-pre-line text-craie">{x.transcription}</span> : <span className="text-brume">Pas de transcription (appel non enregistré, ou d'avant le 13 octobre)</span>}</div>
                        {x.recu && <div className={ligne}><span className="text-ardoise">Fait</span><span className="flex flex-col gap-0.5 text-craie">{x.recu.monday && <span>Monday : {x.recu.monday.texte}</span>}{x.recu.mail && <span>Mail : {x.recu.mail.texte}</span>}{x.recu.relance && <span>{x.recu.relance}</span>}</span></div>}
                      </div>
                    )}
                  </div>
                );
              })}
              {!lignes.length && <p className="m-0 py-10 text-center text-[13.5px] text-brume">Aucun appel sur la période.</p>}
            </div>
          )}
    </div>
  );
}
