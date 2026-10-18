import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Depliant } from "@/components/haka/ReglagesDemande";

// L'onglet Bien du module d'analyse (18 oct. 2026, maquette de Jules) : une ligne par information,
// ce qu'on y lit, ses sources en pastilles (document et page, ou calcul), et son statut. Une ligne
// à plusieurs valeurs se déplie, une par document. « Non trouvé » dit les sources consultées.

const STATUT = {
  info: ["Info", "bg-rail-actif text-craie"],
  signale: ["Signalé", "bg-ambre/15 text-ambre"],
  bloquant: ["Bloquant", "bg-alerte/15 text-alerte"],
  ok: ["OK", "text-menthe"],
  non_trouve: ["Non trouvé", "text-brume"],
};

function Pastille({ s }) {
  const corps = <span className="inline-flex h-7 items-center rounded-full border border-trait px-2.5 text-[12.5px] text-craie">{s.libelle}</span>;
  return s.document_url
    ? <a href={`${s.document_url}${s.page ? `#page=${s.page}` : ""}`} target="_blank" rel="noopener noreferrer" title={s.citation || undefined} className="transition-opacity hover:opacity-80">{corps}</a>
    : <span title={s.citation || undefined}>{corps}</span>;
}

function Ligne({ l }) {
  const [ouvert, setOuvert] = useState(false);
  const [mot, classe] = STATUT[l.statut] || STATUT.info;
  return (
    <div className="grid grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_96px] gap-x-6 border-t border-trait px-5 py-3.5 transition-colors duration-200 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5">
      <p className="m-0 text-[14.5px] text-craie">{l.ligne}</p>
      <div className="min-w-0">
        <p className={`m-0 text-[14.5px] leading-[1.5] ${l.statut === "non_trouve" ? "text-ardoise" : "text-encre"}`}>{l.valeur}</p>
        {l.motif && <p className={`m-0 mt-0.5 text-[13px] ${l.statut === "bloquant" ? "text-alerte" : "text-ambre"}`}>{l.motif}</p>}
        {l.note && <p className="m-0 mt-0.5 text-[12.5px] text-brume">{l.note}</p>}
        {l.consultees?.length > 0 && l.statut === "non_trouve" && <p className="m-0 mt-0.5 text-[12.5px] text-brume">Consultées : {l.consultees.join(", ")}</p>}
        {l.par_document?.length > 1 && (
          <>
            <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} className="mt-1 inline-flex items-center gap-1 text-[12.5px] text-menthe" style={{ background: "transparent" }}>
              <ChevronRight className={`h-3 w-3 transition-transform ${ouvert ? "rotate-90" : ""}`} />{l.par_document.length} valeurs, une par document
            </button>
            <Depliant ouvert={ouvert}><ul className="m-0 mt-1 list-none p-0 text-[13px] text-craie">{l.par_document.map((x, i) => <li key={i} className="py-0.5"><span className="text-brume">{x.source} · </span>{x.valeur}</li>)}</ul></Depliant>
          </>
        )}
      </div>
      <div className="flex flex-wrap content-start gap-1.5">{l.sources.map((s, i) => <Pastille key={i} s={s} />)}</div>
      <div>{l.statut === "ok" || l.statut === "non_trouve" ? <span className={`text-[13px] ${classe}`}>{mot}</span> : <span className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] ${classe}`}>{mot}</span>}</div>
    </div>
  );
}

export default function TableauBienAnalyse({ dealId }) {
  const q = useQuery({ queryKey: ["bien-analyse", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/bien`), enabled: !!dealId, staleTime: 60_000, retry: false });
  const lignes = q.data?.lignes || [];
  if (!lignes.length) return null;
  return (
    <section className="overflow-hidden rounded-[16px] border border-trait bg-rail">
      <div className="grid grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_96px] gap-x-6 px-5 py-3 text-[13px] text-ardoise max-lg:hidden">
        <span>Ligne</span><span>Ce qu'on y lit</span><span>Sources</span><span>Statut</span>
      </div>
      <div className="k-cascade">{lignes.map((l) => <Ligne key={l.id} l={l} />)}</div>
    </section>
  );
}
