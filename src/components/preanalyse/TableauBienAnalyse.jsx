import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Depliant } from "@/components/haka/ReglagesDemande";
import NoteCellule, { useNotesTableaux } from "@/components/preanalyse/NoteCellule";
import { EtatTrois, ValeurModifiable, corpsDuChoix, useGeste } from "@/components/preanalyse/AnalysePieces";

// L'onglet Bien du module d'analyse (18 oct. 2026, maquette de Jules) : une ligne par information,
// ce qu'on y lit, ses sources en pastilles (document et page, ou calcul), et son statut. Une ligne
// à plusieurs valeurs se déplie, une par document. « Non trouvé » dit les sources consultées.

const STATUT = {
  info: ["Info", "bg-rail-actif text-craie"],
  signale: ["À vérifier", "bg-ambre/15 text-ambre"],
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

function Ligne({ l, dealId, note }) {
  const [ouvert, setOuvert] = useState(false);
  const [mot, classe] = STATUT[l.statut] || STATUT.info;
  // Chaque valeur se modifie, l'état se choisit : Lu par l'IA, Modifié par, OK (29 oct. 2026, Jules).
  const geste = useGeste(dealId);
  const changer = (corps) => geste.mutate({ chemin: `cases/bien/${l.id}`, corps });
  return (
    <div className="group/ligne grid grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_96px_minmax(0,1.3fr)] border-t border-trait px-5 py-3.5 transition-colors duration-200 hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 lg:divide-x lg:divide-trait lg:px-0 lg:py-0 lg:[&>*]:px-4 lg:[&>*]:py-3.5">
      <p className="m-0 text-[14.5px] text-craie">{l.ligne}</p>
      <div className="min-w-0">
        <ValeurModifiable valeur={l.statut === "non_trouve" && l.etat === "ia" ? null : l.valeur} vide={l.valeur || "Non trouvé"} occupe={geste.isPending}
          onEnregistrer={(t) => changer({ action: "corriger", valeur: t })} />
        {l.etat === "corrige" && l.valeur_lue && <p className="m-0 mt-0.5 text-[12.5px] text-brume">Lu : {String(l.valeur_lue).slice(0, 120)}</p>}
        {l.motif && l.etat !== "corrige" && <p className={`m-0 mt-0.5 text-[13px] ${l.statut === "bloquant" ? "text-alerte" : "text-ambre"}`}>{l.motif}</p>}
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
      <EtatTrois etat={l.statut === "non_trouve" && l.etat === "ia" ? "non_trouve" : l.etat} par={l.par} valeur={l.statut === "non_trouve" && l.etat === "ia" ? null : l.valeur} defaut={[mot, classe, !(l.statut === "ok" || l.statut === "non_trouve")]} occupe={geste.isPending}
        onChoix={(id) => changer(corpsDuChoix(id, l.valeur, l.valeur_main))} />
      <div className="min-w-0"><NoteCellule dealId={dealId} tableau="bien-analyse" ligne={l.id} note={note} /></div>
    </div>
  );
}

export default function TableauBienAnalyse({ dealId }) {
  const q = useQuery({ queryKey: ["bien-analyse", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/bien`), enabled: !!dealId, staleTime: 60_000, retry: false });
  const lignes = q.data?.lignes || [];
  const notes = useNotesTableaux(dealId);
  if (!lignes.length) return null;
  return (
    // Tout le tableau a ses lignes, comme les grilles (29 oct. 2026, Jules) ; posé sur la carte du dossier, sans fond à lui.
    <section className="border-trait lg:border">
      <div className="grid grid-cols-[minmax(150px,0.9fr)_minmax(0,2.4fr)_minmax(0,1.4fr)_96px_minmax(0,1.3fr)] px-5 py-3 text-[13px] text-ardoise max-lg:hidden lg:divide-x lg:divide-trait lg:px-0 lg:py-0 lg:[&>*]:px-4 lg:[&>*]:py-3">
        <span>Ligne</span><span>Ce qu'on y lit</span><span>Sources</span><span>Statut</span><span>Notes</span>
      </div>
      <div className="k-cascade">{lignes.map((l) => <Ligne key={l.id} l={l} dealId={dealId} note={notes[`bien-analyse.${l.id}`]} />)}</div>
    </section>
  );
}
