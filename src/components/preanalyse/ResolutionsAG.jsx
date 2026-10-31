import React, { useState } from "react";
import { Eye, EyeOff, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Onglets } from "@/components/ui/kit";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import { CELLULES, COLONNES, prenom } from "@/components/preanalyse/AnalysePieces";
import NoteCellule, { useNotesTableaux } from "@/components/preanalyse/NoteCellule";

// Les PV d'AG, un onglet par assemblée (30 oct. 2026, Jules : « PV d'AG 2023, 2024… un onglet par PV d'AG ») : une ligne
// par résolution, au dessin de la grille du dessus (Résolution, Issue, Source, Note). La case de la résolution porte
// l'état comme le nom d'une ligne de grille : sable « à vérifier », vert « vérifié », un clic passe de l'un à l'autre.
// Au survol de cette case, un œil la cache ; au survol de l'en-tête « Résolution », un œil réaffiche tout (Jules, même
// jour). Lu avec le PV : voir server/deal/analyse-pieces.js.

const ISSUE = {
  adoptee: ["Votée", "text-vert"],
  rejetee: ["Refusée", "text-alerte"],
  ajournee: ["Ajournée", "text-ambre"],
  sans_vote: ["Sans vote", "text-craie"],
};

const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/** Le nom de l'onglet : l'année de l'assemblée, la date quand deux assemblées tombent la même année. */
function titres(assemblees) {
  const parAnnee = {};
  for (const a of assemblees) parAnnee[a.annee] = (parAnnee[a.annee] || 0) + 1;
  return assemblees.map((a) => {
    if (!a.annee) return `PV d'AG · ${a.document_titre || "sans date"}`;
    if (parAnnee[a.annee] > 1 && a.date) return `PV d'AG ${new Date(a.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}`;
    return `PV d'AG ${a.annee}`;
  });
}

export default function ResolutionsAG({ dealId, assemblees = [], onOuvrir }) {
  const queryClient = useQueryClient();
  const [choisie, setChoisie] = useState(null);
  const notes = useNotesTableaux(dealId);
  const statuer = useMutation({
    mutationFn: ({ cle, ...corps }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/resolutions/${encodeURIComponent(cle)}`, { body: corps }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] }),
    onError: (e) => toast.error(e?.message || "Statut non enregistré"),
  });
  const relire = useMutation({
    mutationFn: (docId) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/documents/${docId}/relire`, { body: {} }),
    onSuccess: () => { toast.success("Relecture lancée"); queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] }); },
    onError: (e) => toast.error(e?.message || "Relecture impossible"),
  });

  if (!assemblees.length) return null;
  const noms = titres(assemblees);
  const items = assemblees.map((a, i) => ({ cle: a.document_id, titre: noms[i] }));
  // Par défaut, la dernière assemblée.
  const a = assemblees.find((x) => x.document_id === choisie) || assemblees.at(-1);
  const enLecture = ["en_attente", "en_cours"].includes(a.extraction?.statut);
  const visibles = a.resolutions.filter((r) => !r.cachee);
  const cachees = a.resolutions.length - visibles.length;
  const toutAfficher = () => statuer.mutate({ cle: a.document_id, cachee: false });
  const oeil = "grid h-7 w-7 flex-none place-items-center rounded-full text-craie transition-opacity hover:bg-encre/[0.06] hover:text-encre disabled:opacity-40";

  return (
    <section>
      <Onglets taille="page" items={items} valeur={a.document_id} onChange={setChoisie} className="mb-4" />
      <div className="relative overflow-hidden lg:rounded-[14px] lg:border lg:border-bord-doux">
        <div className={`grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3 text-[13.5px] text-craie max-lg:hidden lg:border-t-0 lg:[&>*]:py-3.5`}>
          <div className="group/tete flex min-w-0 items-center justify-between gap-2">
            <span className="text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-encre">Résolution</span>
            {cachees > 0 && (
              <button type="button" onClick={toutAfficher} disabled={statuer.isPending} className={`${oeil} -my-1.5 opacity-0 focus-visible:opacity-100 group-hover/tete:opacity-100`}
                title={cachees > 1 ? `Réafficher les ${cachees} résolutions cachées` : "Réafficher la résolution cachée"} aria-label="Réafficher les résolutions cachées" style={{ background: "transparent" }}>
                <Eye className="h-4 w-4" />
              </button>
            )}
          </div>
          <span>Issue</span><span>Source</span><span>Note</span>
        </div>
        {cachees > 0 && (
          <button type="button" onClick={toutAfficher} disabled={statuer.isPending} className="flex w-full items-center gap-2 border-t border-bord-doux px-3.5 py-3 text-left text-[13px] text-craie lg:hidden" style={{ background: "transparent" }}>
            <Eye className="h-4 w-4" /> Réafficher {cachees > 1 ? `les ${cachees} résolutions cachées` : "la résolution cachée"}
          </button>
        )}
        {enLecture ? (
          <p className="m-0 flex items-center gap-2 border-t border-bord-doux px-3.5 py-4 text-[13.5px] text-craie"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> Lecture du PV en cours…</p>
        ) : !a.resolutions.length ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-bord-doux px-3.5 py-4">
            <p className="m-0 text-[13.5px] text-craie">{a.lu_sans_resolutions ? "Ce PV a été lu avant la liste des résolutions : relisez-le pour les avoir." : a.extraction ? "Aucune résolution lue dans ce PV." : "Ce PV n'est pas encore lu."}</p>
            <button type="button" onClick={() => relire.mutate(a.document_id)} disabled={relire.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {relire.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {a.extraction ? "Relire le PV" : "Lire le PV"}
            </button>
          </div>
        ) : visibles.map((r) => {
          const [issue, teinte] = ISSUE[r.issue] || ["Non dit", "text-brume"];
          const detail = [r.tantiemes, r.montant != null ? euros(r.montant) : null, r.majorite].filter(Boolean).join(" · ");
          const ok = r.statut === "verifie";
          const basculer = () => { if (!statuer.isPending) statuer.mutate({ cle: r.cle, statut: ok ? "a_verifier" : "verifie" }); };
          return (
            <div key={r.cle} className={`grid ${COLONNES} ${CELLULES} border-t border-bord-doux py-3.5 transition-colors hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 lg:[&>*]:py-3.5`}>
              <div role="button" tabIndex={0} aria-pressed={ok} onClick={basculer}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); basculer(); } }}
                title={ok ? `Vérifié${r.par ? ` par ${prenom(r.par)}` : ""} · cliquer pour revenir à « à vérifier »` : "À vérifier · cliquer quand c'est vérifié"}
                className={`group/res flex min-w-0 cursor-pointer select-none items-start justify-between gap-2 text-[14.5px] leading-[1.5] text-craie transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 ${ok ? "bg-vert/15 hover:bg-vert/25" : "bg-lu-ia/25 hover:bg-lu-ia/35"}`}>
                <span className="min-w-0">{r.numero && <span>{r.numero}. </span>}{r.nom}</span>
                <button type="button" disabled={statuer.isPending} onClick={(e) => { e.stopPropagation(); statuer.mutate({ cle: r.cle, cachee: true }); }}
                  className={`${oeil} -my-0.5 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover/res:opacity-100`} title="Cacher cette résolution" aria-label="Cacher cette résolution" style={{ background: "transparent" }}>
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0">
                <p className={`m-0 text-[14.5px] ${teinte}`}>{issue}</p>
                {detail && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-craie">{detail}</p>}
              </div>
              <button type="button" onClick={() => onOuvrir?.({ document_id: a.document_id, document_nom: a.document_nom, document_url: a.document_url, mime: a.mime, page: r.page, citation: r.citation })}
                className="flex min-w-0 items-center gap-3 text-left hover:opacity-80" style={{ background: "transparent" }} aria-label={`Ouvrir le PV${r.page ? `, page ${r.page}` : ""}`}>
                <MiniaturePiece url={a.document_url} largeur={40} className={r.verifiee === false ? "ring-1 ring-ambre" : ""} />
                <span className="min-w-0 text-[13px] leading-[1.35] text-encre"><span className="line-clamp-2">{a.document_titre || "PV d'AG"}{r.page ? <span className="text-craie"> · page {r.page}</span> : null}</span></span>
              </button>
              <div className="min-w-0"><NoteCellule dealId={dealId} tableau="resolutions" ligne={r.cle} note={notes[`resolutions.${r.cle}`]} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
