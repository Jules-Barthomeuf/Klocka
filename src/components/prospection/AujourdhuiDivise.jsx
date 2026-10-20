import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Loader2, Lock, Phone, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Chargement from "@/components/ui/Chargement";
import { AEnvoyer, Fiabilite } from "@/components/prospection/MaJournee";

// L'onglet Aujourd'hui (19 oct. 2026, Jules) : une page divisée, « À relancer » à gauche (on s'est parlé, la suite
// tombe aujourd'hui), « À rappeler » à droite (on n'a pas eu la bonne personne). Chaque analyste voit ses personnes,
// celles qu'il a appelées en premier ; « Toute l'équipe » montre tout le monde avec son analyste. Chaque ligne ouvre
// la transcription complète de ses appels : on relit ce qui a été dit, pas un résumé écrit par l'IA.

const initiales = (n = "") => String(n).split(/[\s.@-]+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" }) : "");
const heureCourte = (iso) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "");
const duree = (s) => (s ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}` : null);

function Ligne({ l, rang, tous, onAppeler, enCours, onFiche, onTranscriptions }) {
  const retard = l.retard > 0 ? `En retard de ${l.retard} j` : l.heure ? `Aujourd'hui, ${l.heure}` : "Aujourd'hui";
  return (
    <div style={{ animationDelay: `${Math.min(rang, 10) * 40}ms`, animationFillMode: "backwards" }}
      className="flex items-start gap-3.5 rounded-[14px] border border-trait bg-surface-pleine px-4 py-3.5 duration-300 ease-out animate-in fade-in-0 slide-in-from-bottom-2">
      <span className="mt-0.5 grid h-10 w-10 flex-none place-items-center rounded-full bg-relief text-[12.5px] text-craie">{initiales(l.nom)}</span>
      <div className="min-w-0 flex-1">
        <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-encre">
          {onFiche ? <button type="button" onClick={() => onFiche(l.id)} className="p-0 text-[15px] text-encre hover:text-menthe" style={{ background: "transparent" }}>{l.nom}</button> : l.nom}
          {l.agence && <span className="text-[13px] text-ardoise">{l.agence}</span>}
          <span className={`text-[12.5px] ${l.retard > 0 ? "text-ambre" : "text-craie"}`}>{retard}</span>
        </p>
        <p className="m-0 mt-1 text-[13.5px] leading-[1.45] text-craie">{l.quoi}</p>
        {l.dernier_appel && (
          <p className="m-0 mt-1 text-[12.5px] text-ardoise">
            Dernier appel le {jourCourt(l.dernier_appel.le)}{l.dernier_appel.par ? ` par ${l.dernier_appel.par}` : ""}{l.dernier_appel.issue ? ` · ${l.dernier_appel.issue}` : ""}
            {tous && l.proprietaire && l.proprietaire.prenom !== l.dernier_appel.par ? ` · à ${l.proprietaire.prenom}` : ""}
            {tous && !l.proprietaire ? " · à l'équipe" : ""}
          </p>
        )}
      </div>
      <div className="flex flex-none flex-col items-end gap-2">
        {l.verrou && !l.verrou.a_moi ? (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-ardoise"><Lock className="h-3.5 w-3.5" />{l.verrou.prenom} l'appelle</span>
        ) : (
          <button type="button" onClick={() => onAppeler({ id: l.id })} disabled={enCours}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] bg-encre px-3.5 text-[13.5px] text-fond transition-opacity hover:opacity-90 disabled:opacity-50">
            {enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}Appeler
          </button>
        )}
        {l.appels > 0 && (
          <button type="button" onClick={() => onTranscriptions(l.id)}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <FileText className="h-3.5 w-3.5" />Transcription{l.appels > 1 ? `s (${l.appels})` : ""}
          </button>
        )}
      </div>
    </div>
  );
}

function Colonne({ titre, aide, lignes, ...props }) {
  return (
    <section className="min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
        <h2 className="m-0 text-[17px] font-normal text-encre">{titre} <span className="text-[13px] tabular-nums text-ardoise">{lignes.length}</span></h2>
        <span className="text-[12.5px] text-brume">{aide}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {lignes.map((l, i) => <Ligne key={l.id} l={l} rang={i} {...props} />)}
        {!lignes.length && <p className="m-0 rounded-[14px] border border-dashed border-trait px-5 py-8 text-center text-[13.5px] text-brume">Personne aujourd'hui.</p>}
      </div>
    </section>
  );
}

/** Le panneau des transcriptions d'un agent : chaque appel, le plus récent d'abord, la transcription entière. */
function PanneauTranscriptions({ agentId, onFermer }) {
  const { data, isLoading } = useQuery({ queryKey: ["prospection-agent-appels", agentId], queryFn: () => base44.request("GET", `/api/prospection/agents/${agentId}/appels`) });
  useEffect(() => {
    const t = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", t);
    return () => window.removeEventListener("keydown", t);
  }, [onFermer]);
  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/30" onClick={onFermer} />
      <aside role="dialog" aria-label="Transcriptions" className="fixed inset-y-0 right-0 z-[61] flex w-[620px] max-w-full flex-col border-l border-bord-doux bg-rail shadow-[0_24px_60px_rgb(0_0_0/0.28)] duration-300 animate-in slide-in-from-right-4">
        <div className="flex items-start justify-between gap-3 border-b border-trait px-6 py-4">
          <div className="min-w-0">
            <p className="m-0 text-[17px] text-encre">{data?.agent?.nom || "Transcriptions"}</p>
            <p className="m-0 mt-0.5 truncate text-[13px] text-ardoise">{[data?.agent?.agence, data?.agent?.telephone].filter(Boolean).join(" · ")}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading ? <Chargement /> : (data?.appels || []).map((a) => (
            <article key={a.id} className="mb-6 border-b border-trait pb-6 last:border-0">
              <p className="m-0 text-[14px] text-encre">{a.sens} · {jourCourt(a.le)} à {heureCourte(a.le)}{a.par ? ` · ${a.par}` : ""}</p>
              <p className="m-0 mt-0.5 text-[12.5px] text-ardoise">{[a.issue, duree(a.duree_s)].filter(Boolean).join(" · ")}</p>
              {a.notes && <p className="m-0 mt-3 rounded-[12px] border border-trait px-3.5 py-2.5 text-[13.5px] leading-[1.5] text-craie"><span className="text-ardoise">Notes : </span>{a.notes}</p>}
              {a.transcription
                ? <p className="m-0 mt-3 whitespace-pre-line text-[14.5px] leading-[1.65] text-craie">{a.transcription}</p>
                : <p className="m-0 mt-3 text-[13.5px] text-brume">Transcription non gardée (appel d'avant le 13 oct. 2026, ou sans enregistrement).{a.passe || a.resume ? ` Ce que l'IA en avait retenu : « ${a.passe || a.resume} »` : ""}</p>}
            </article>
          ))}
          {!isLoading && !(data?.appels || []).length && <p className="m-0 text-[13.5px] text-brume">Aucun appel.</p>}
        </div>
      </aside>
    </>,
    document.body,
  );
}

export default function AujourdhuiDivise({ onAppeler, enCours = false, onCompte = null, onFiche = null, sousLesEnvois = null, enTete = null }) {
  const [tous, setTous] = useState(() => { try { return localStorage.getItem("klocka.aujourdhui.tous") === "1"; } catch { return false; } });
  const [transcriptions, setTranscriptions] = useState(null);
  const { data, isLoading } = useQuery({ queryKey: ["prospection-aujourdhui", tous], queryFn: () => base44.request("GET", `/api/prospection/aujourdhui${tous ? "?tous=1" : ""}`), refetchInterval: 30_000 });
  const annexe = useQuery({ queryKey: ["prospection-ma-journee", null], queryFn: () => base44.request("GET", "/api/prospection/ma-journee"), refetchInterval: 60_000 });
  useEffect(() => { if (!tous) onCompte?.((data?.relancer?.length || 0) + (data?.rappeler?.length || 0)); }, [data, tous, onCompte]);
  const choisir = (v) => { setTous(v); try { localStorage.setItem("klocka.aujourdhui.tous", v ? "1" : "0"); } catch { /* sans gravité */ } };
  const props = { tous, onAppeler, enCours, onFiche, onTranscriptions: setTranscriptions };
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <div className="inline-flex gap-1 rounded-full border border-trait p-1">
          {[[false, "Les miens"], [true, "Toute l'équipe"]].map(([v, mot]) => (
            <button key={mot} type="button" onClick={() => choisir(v)} aria-pressed={tous === v}
              className={`h-8 rounded-full px-3.5 text-[13.5px] transition-colors ${tous === v ? "bg-encre text-fond" : "text-craie hover:text-encre"}`} style={tous === v ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        {enTete}
      </div>
      {isLoading || !data ? <Chargement taille="grand" /> : (
        <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-trait">
          <div className="lg:pr-8"><Colonne titre="À relancer" aide="On s'est parlé, la suite tombe aujourd'hui" lignes={data.relancer} {...props} /></div>
          <div className="lg:pl-8"><Colonne titre="À rappeler" aide="On n'a pas eu la bonne personne" lignes={data.rappeler} {...props} /></div>
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-3">
        {annexe.data && <AEnvoyer envois={annexe.data.a_envoyer} />}
        {sousLesEnvois}
        {annexe.data && <Fiabilite f={annexe.data.fiabilite} />}
      </div>
      {transcriptions && <PanneauTranscriptions agentId={transcriptions} onFermer={() => setTranscriptions(null)} />}
    </div>
  );
}
