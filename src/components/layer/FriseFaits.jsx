import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import Chargement from "@/components/ui/Chargement";

// Les faits validés de l'Intelligence (14 oct. 2026), du plus récent au plus ancien,
// chacun cliquable vers sa source : la page Intelligence (Savoir) et l'onglet
// Historique des fiches dossier et agent.

export const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");
export const TYPES = { decision: "Décision", information: "Information", engagement: "Engagement", savoir: "Savoir" };
export const TEINTES = { decision: "text-menthe", information: "text-craie", engagement: "text-ambre", savoir: "text-bleu" };
export const SOURCES = { compte_rendu: "Compte rendu", appel: "Appel", debrief: "Débrief", decision: "Réponse à une question", mail: "Mail", evenement: "Twenty CRM" };

/** Une liste de faits validés, du plus récent au plus ancien, chacun avec sa source. */
export function FriseFaits({ faits }) {
  const [ouverte, setOuverte] = useState(null);
  return (
    <>
      <div className="border-y border-trait">
        {faits.map((f) => (
          <article key={f.id} className="border-t border-trait py-3.5 first:border-t-0">
            <p className="m-0 text-[14px] leading-[1.5] text-encre">
              <span className={`mr-2 text-[11px] uppercase tracking-[.12em] ${TEINTES[f.type] || "text-craie"}`}>{TYPES[f.type] || f.type}</span>{f.resume}
            </p>
            <p className="m-0 mt-1 text-[12.5px] text-ardoise">
              {quand(f.date)}{f.personne ? ` · ${f.personne}` : ""} ·{" "}
              {f.source ? (
                <button type="button" onClick={() => setOuverte(f.source.id)} className="text-craie underline decoration-trait underline-offset-2 hover:text-encre" style={{ background: "transparent" }}>
                  {SOURCES[f.source.type] || f.source.type}{f.source.titre ? ` « ${f.source.titre} »` : ""}
                </button>
              ) : "source perdue"}
              {f.statut && f.statut !== "valide" && <span className="text-ambre"> · {f.statut === "a_rattacher" ? "à rattacher" : "à valider"}</span>}
            </p>
          </article>
        ))}
      </div>
      {ouverte && <FenetreSource id={ouverte} onFermer={() => setOuverte(null)} />}
    </>
  );
}

/** Le journal brut d'une source, tel qu'il est entré. */
export function FenetreSource({ id, onFermer }) {
  const q = useQuery({ queryKey: ["layer", "source", id], queryFn: () => base44.request("GET", `/api/layer/sources/${id}`) });
  const s = q.data?.source;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[80vh] w-full max-w-[720px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3.5">
          <span className="min-w-0 truncate text-[14.5px] text-encre">{s ? `${SOURCES[s.type] || s.type} · ${quand(s.date)}${s.titre ? ` · ${s.titre}` : ""}` : "Source"}</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {!s ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-ardoise" /> : <pre className="m-0 whitespace-pre-wrap font-sans text-[13.5px] leading-[1.6] text-craie">{s.contenu}</pre>}
        </div>
        {s?.lien_original && <div className="border-t border-trait px-5 py-3 text-[12.5px]"><a href={s.lien_original} {...(/^https?:/.test(s.lien_original) ? { target: "_blank", rel: "noreferrer" } : {})} className="text-craie underline underline-offset-2 hover:text-encre">{/monday\.com/.test(s.lien_original) ? "Ouvrir sur Twenty CRM" : "Ouvrir l'original"}</a></div>}
      </div>
    </div>
  );
}


/** L'onglet Historique d'une fiche (dossier, agent, agence) : ses faits validés, avec leur source. */
export function HistoriqueLayer({ type, id }) {
  const q = useQuery({ queryKey: ["layer", "historique", type, id], queryFn: () => base44.request("GET", `/api/layer/historique/${type}/${encodeURIComponent(id)}`), enabled: !!id });
  if (q.isLoading) return <Chargement />;
  const faits = q.data?.faits || [];
  if (!faits.length) return <p className="m-0 py-6 text-[13.5px] text-brume">Rien à l'Intelligence sur cette fiche pour l'instant : ce qui en sera dit en réunion, en appel ou en débrief arrivera ici une fois validé.</p>;
  return <FriseFaits faits={faits} />;
}
