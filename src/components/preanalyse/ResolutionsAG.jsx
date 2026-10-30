import React, { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Onglets } from "@/components/ui/kit";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import { CELLULES } from "@/components/preanalyse/AnalysePieces";

// Les PV d'AG, un onglet par assemblée (30 oct. 2026, Jules : « PV d'AG 2023, 2024… un onglet par PV d'AG ») : une ligne
// par résolution, quatre colonnes (Résolution, Issue, Source, Statut). Le statut part de « À vérifier » et change d'un
// clic sur sa case, sans menu, comme les autres tableaux de l'analyse. Lu avec le PV : voir server/deal/analyse-pieces.js.

const COLONNES_AG = "grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_minmax(0,1fr)_minmax(130px,0.7fr)]";

const ISSUE = {
  adoptee: ["Votée", "text-vert"],
  rejetee: ["Refusée", "text-alerte"],
  ajournee: ["Ajournée", "text-ambre"],
  sans_vote: ["Sans vote", "text-craie"],
};

// L'ordre du clic : À vérifier, Important, Pas important, Vérifié, puis À vérifier.
const STATUT = {
  a_verifier: ["À vérifier", "bg-lu-ia/25 text-craie hover:bg-lu-ia/35", "important"],
  important: ["Important", "bg-ambre/15 text-ambre hover:bg-ambre/25", "pas_important"],
  pas_important: ["Pas important", "bg-rail-actif text-craie hover:brightness-110", "verifie"],
  verifie: ["Vérifié", "bg-vert/15 text-vert hover:bg-vert/25", "a_verifier"],
};

const euros = (n) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const prenom = (email) => { const t = String(email || "").split("@")[0].split(/[._-]/)[0]; return t ? t[0].toUpperCase() + t.slice(1) : ""; };

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
  const statuer = useMutation({
    mutationFn: ({ cle, statut }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/resolutions/${encodeURIComponent(cle)}`, { body: { statut } }),
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

  return (
    <section>
      <Onglets taille="page" items={items} valeur={a.document_id} onChange={setChoisie} className="mb-4" />
      <div className="relative overflow-hidden lg:rounded-[14px] lg:border lg:border-bord-doux">
        <div className={`grid ${COLONNES_AG} ${CELLULES} border-t border-bord-doux py-3 text-[13.5px] text-craie max-lg:hidden lg:border-t-0 lg:[&>*]:py-3.5`}>
          <span className="text-[15px] font-medium leading-[1.3] tracking-[-0.01em] text-encre">Résolution</span><span>Issue</span><span>Source</span><span>Statut</span>
        </div>
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
        ) : a.resolutions.map((r) => {
          const [issue, teinte] = ISSUE[r.issue] || ["Non dit", "text-brume"];
          const detail = [r.tantiemes, r.montant != null ? euros(r.montant) : null, r.majorite].filter(Boolean).join(" · ");
          const [mot, classe, suivant] = STATUT[r.statut] || STATUT.a_verifier;
          return (
            <div key={r.cle} className={`grid ${COLONNES_AG} ${CELLULES} border-t border-bord-doux py-3.5 transition-colors hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 lg:[&>*]:py-3.5`}>
              <p className="m-0 min-w-0 text-[14.5px] leading-[1.5] text-encre">
                {r.numero && <span className="text-craie">{r.numero}. </span>}{r.nom}
              </p>
              <div className="min-w-0">
                <p className={`m-0 text-[14.5px] ${teinte}`}>{issue}</p>
                {detail && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-craie">{detail}</p>}
              </div>
              <button type="button" onClick={() => onOuvrir?.({ document_id: a.document_id, document_nom: a.document_nom, document_url: a.document_url, mime: a.mime, page: r.page, citation: r.citation })}
                className="flex min-w-0 items-center gap-3 text-left hover:opacity-80" style={{ background: "transparent" }} aria-label={`Ouvrir le PV${r.page ? `, page ${r.page}` : ""}`}>
                <MiniaturePiece url={a.document_url} largeur={40} className={r.verifiee === false ? "ring-1 ring-ambre" : ""} />
                <span className="min-w-0 text-[13px] leading-[1.35] text-encre"><span className="line-clamp-2">{a.document_titre || "PV d'AG"}{r.page ? <span className="text-craie"> · page {r.page}</span> : null}</span></span>
              </button>
              <button type="button" disabled={statuer.isPending} onClick={() => statuer.mutate({ cle: r.cle, statut: suivant })}
                title={`${r.par && r.statut !== "a_verifier" ? `${mot} par ${prenom(r.par)} · ` : ""}cliquer : ${STATUT[suivant][0]}`}
                className={`m-0 select-none text-left text-[13px] transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 ${classe}`}>
                {mot}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
