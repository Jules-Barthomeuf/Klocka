import React, { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, FileText, Loader2, RefreshCw } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Filtres, Statut } from "@/components/mandataire/elements";
import { CADRE_GRILLE, CELLULES, COLONNES, ENTETE_GRILLE, LIGNE_GRILLE, LigneSource, prenom } from "@/components/preanalyse/AnalysePieces";
import NoteCellule, { useNotesTableaux } from "@/components/preanalyse/NoteCellule";
import { SourceSeule } from "@/components/preanalyse/AnalyseDocuments";

// Les PV d'AG, un onglet par assemblée (30 oct. 2026, Jules : « PV d'AG 2023, 2024… un onglet par PV d'AG ») : une ligne
// par résolution, au dessin de la grille du dessus (Résolution, Issue, Source, Note). La case de la résolution porte
// l'état comme le nom d'une ligne de grille : sable « à vérifier », vert « vérifié », un clic passe de l'un à l'autre.
// Au survol de cette case, un œil la cache ; au survol de l'en-tête « Résolution », un œil réaffiche tout (Jules, même
// jour). Lu avec le PV : voir server/deal/analyse-pieces.js.

const ISSUE = {
  adoptee: ["Votée", "menthe"],
  rejetee: ["Refusée", "corail"],
  ajournee: ["Ajournée", "ambre"],
  sans_vote: ["Sans vote", "gris"],
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

// `lectureSeule` : le même tableau dans l'onglet Copropriété du projet (26 nov. 2026, Jules : « exactement les mêmes
// tableaux que dans l'Analyse ») : sans vérifier, cacher ni noter ; les résolutions cachées n'y sont pas, la note de chaque
// résolution vient avec elle (`r.note`), la case de la résolution reste neutre.
// `onCacher(cle)` / `onReafficher(documentId)` : en lecture seule, l'éditeur du projet cache une résolution ou réaffiche
// celles d'une assemblée (26 nov. 2026, Jules : « masquer des lignes dans la partie projet ; ça la masque aussi dans
// l'analyse, ce qui est logique »).
export default function ResolutionsAG({ dealId, assemblees = [], onOuvrir, lectureSeule = false, onCacher = null, onReafficher = null, enCours = false, apercu = false }) {
  if (lectureSeule && apercu) return <ResolutionsEtSource dealId={dealId} assemblees={assemblees} onOuvrir={onOuvrir} onCacher={onCacher} onReafficher={onReafficher} enCours={enCours} />;
  return <ResolutionsGrille dealId={dealId} assemblees={assemblees} onOuvrir={onOuvrir} lectureSeule={lectureSeule} onCacher={onCacher} onReafficher={onReafficher} enCours={enCours} />;
}

// L'issue en deux mots dans le projet (26 nov. 2026, Jules : « Issue, tu mets juste voté pour ou voté contre »).
const ISSUE_COURTE = {
  adoptee: ["Voté pour", "menthe"],
  rejetee: ["Voté contre", "corail"],
  ajournee: ["Ajournée", "ambre"],
  sans_vote: ["Sans vote", "gris"],
};
const OEIL = "grid h-7 w-7 flex-none place-items-center rounded-full text-craie transition-opacity hover:bg-encre/[0.06] hover:text-encre disabled:opacity-40";

/**
 * Le tableau des PV d'AG dans le projet, la source à côté (26 nov. 2026, Jules : « résolution et issue, plus ni source ni
 * note ; à droite, un écran avec la source surlignée dans le document : on passe la souris sur une ligne, on voit dans le
 * PV ce qu'il y a exactement »). À gauche Résolution et Issue ; à droite la page du PV, le passage de la résolution
 * survolée surligné, la dernière survolée restant affichée. Au téléphone, pas de survol : un appui ouvre le volet.
 */
function ResolutionsEtSource({ dealId, assemblees, onOuvrir, onCacher, onReafficher, enCours }) {
  const [choisie, setChoisie] = useState(null);
  const [survolee, setSurvolee] = useState(null);
  const minuterie = useRef(null);
  useEffect(() => () => clearTimeout(minuterie.current), []);
  if (!assemblees.length) return null;
  const noms = titres(assemblees);
  const items = assemblees.map((x, i) => ({ cle: x.document_id, titre: noms[i] }));
  const a = assemblees.find((x) => x.document_id === choisie) || assemblees.at(-1);
  const visibles = a.resolutions.filter((r) => !r.cachee);
  const cachees = onReafficher ? a.cachees || 0 : 0;
  const montree = visibles.find((r) => r.cle === survolee) || null;
  const doc = a.document_url ? { id: a.document_id, nom: a.document_nom, url: a.document_url, mime: a.mime } : null;
  // Un léger délai : la souris qui traverse le tableau ne recharge pas la page à chaque ligne.
  const survoler = (cle) => { clearTimeout(minuterie.current); minuterie.current = setTimeout(() => setSurvolee(cle), 120); };
  const appui = (r) => {
    if (typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches) { setSurvolee(r.cle); return; }
    if (onOuvrir && doc) onOuvrir({ document_id: a.document_id, document_nom: a.document_nom, document_url: a.document_url, mime: a.mime, page: r.page, citation: r.citation, titre: r.nom });
  };
  const colonnes = "grid-cols-[minmax(0,1fr)_120px]";
  return (
    <section>
      {items.length > 1
        ? <Filtres label="Les assemblées" className="mb-2.5" valeur={a.document_id} onChange={(v) => { setChoisie(v); setSurvolee(null); }} options={items.map((x) => [x.cle, x.titre])} />
        : <p className="m-0 mb-2.5 text-[14px] text-encre">{items[0].titre}</p>}
      <div className={`${CADRE_GRILLE} lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]`}>
        <div className="min-w-0">
          <div className={`grid ${colonnes} ${CELLULES} ${ENTETE_GRILLE}`}>
            <div className="group/tete flex min-w-0 items-center justify-between gap-2">
              <span className="text-[13.5px] text-encre">Résolution</span>
              {cachees > 0 && (
                <button type="button" onClick={() => onReafficher(a.document_id)} disabled={enCours} className={`${OEIL} -my-1.5 opacity-0 focus-visible:opacity-100 group-hover/tete:opacity-100`}
                  title={cachees > 1 ? `Réafficher les ${cachees} résolutions cachées` : "Réafficher la résolution cachée"} aria-label="Réafficher les résolutions cachées" style={{ background: "transparent" }}>
                  <Eye className="h-4 w-4" />
                </button>
              )}
            </div>
            <span>Issue</span>
          </div>
          {visibles.map((r) => {
            const [issue, teinte] = ISSUE_COURTE[r.issue] || ["Non dit", "gris"];
            const active = r.cle === survolee;
            return (
              <div key={r.cle} onMouseEnter={() => survoler(r.cle)} onFocus={() => setSurvolee(r.cle)} onClick={() => appui(r)} tabIndex={0}
                className={`grid ${colonnes} ${CELLULES} ${LIGNE_GRILLE} cursor-pointer outline-none max-lg:grid-cols-[minmax(0,1fr)_auto] max-lg:items-start ${active ? "bg-encre/[0.04]" : ""}`}>
                <div className="group/res flex min-w-0 items-start justify-between gap-2 text-[13.5px] leading-[1.4] text-encre">
                  <span className="min-w-0">{r.numero && <span>{r.numero}. </span>}{r.nom}</span>
                  {onCacher && (
                    <button type="button" disabled={enCours} onClick={(e) => { e.stopPropagation(); onCacher(r.cle); }}
                      className={`${OEIL} -my-0.5 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover/res:opacity-100`} title="Cacher cette résolution (ici et dans l'Analyse)" aria-label="Cacher cette résolution" style={{ background: "transparent" }}>
                      <EyeOff className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="min-w-0"><Statut couleur={teinte}>{issue}</Statut></div>
              </div>
            );
          })}
        </div>
        {/* La colonne Document du tableau, à la place de Source et Note : son en-tête, puis la page du PV sur toute la hauteur. */}
        {/* La hauteur est celle du tableau, 480 px au moins : la page du PV défile dedans, elle n'allonge pas le tableau. */}
        <div className="relative min-h-[480px] min-w-0 border-l border-trait max-lg:hidden">
          <div className="absolute inset-0 flex flex-col overflow-hidden">
          <p className="m-0 flex-none truncate px-2.5 py-2 text-[12.5px] leading-[20px] text-ardoise">Document{montree ? ` · ${montree.page ? `page ${montree.page} · ` : ""}${montree.nom}` : ""}</p>
          {montree && doc ? (
            <div className="flex min-h-0 flex-1 flex-col border-t border-trait">
              <SourceSeule dealId={dealId} doc={doc} page={montree.page} citation={montree.citation} />
            </div>
          ) : (
            <div className="grid flex-1 place-items-center border-t border-trait px-8 text-center">
              <div className="flex flex-col items-center gap-3">
                <FileText className="h-6 w-6 text-brume" />
                <p className="m-0 max-w-[260px] text-[13.5px] leading-[1.5] text-ardoise">{doc ? "Passez la souris sur une résolution pour voir sa source dans le PV." : "Le PV de cette assemblée n'est pas joint."}</p>
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </section>
  );
}

function ResolutionsGrille({ dealId, assemblees = [], onOuvrir, lectureSeule = false, onCacher = null, onReafficher = null, enCours = false }) {
  const queryClient = useQueryClient();
  const [choisie, setChoisie] = useState(null);
  const notesDossier = useNotesTableaux(lectureSeule ? null : dealId);
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
  const cachees = lectureSeule ? (onReafficher ? a.cachees || 0 : 0) : a.resolutions.length - visibles.length;
  const toutAfficher = () => (lectureSeule ? onReafficher?.(a.document_id) : statuer.mutate({ cle: a.document_id, cachee: false }));
  const oeil = "grid h-7 w-7 flex-none place-items-center rounded-full text-craie transition-opacity hover:bg-encre/[0.06] hover:text-encre disabled:opacity-40";

  return (
    <section>
      {items.length > 1 ? <Filtres label="Les assemblées" className="mb-2.5" valeur={a.document_id} onChange={setChoisie} options={items.map((x) => [x.cle, x.titre])} /> : <p className="m-0 mb-2.5 text-[14px] text-encre">{items[0].titre}</p>}
      <div className={CADRE_GRILLE}>
        <div className={`grid ${COLONNES} ${CELLULES} ${ENTETE_GRILLE}`}>
          <div className="group/tete flex min-w-0 items-center justify-between gap-2">
            <span className="text-[13.5px] text-encre">Résolution</span>
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
          <button type="button" onClick={toutAfficher} disabled={statuer.isPending} className="flex w-full items-center gap-2 border-t border-trait px-2.5 py-3 text-left text-[13px] text-craie lg:hidden" style={{ background: "transparent" }}>
            <Eye className="h-4 w-4" /> Réafficher {cachees > 1 ? `les ${cachees} résolutions cachées` : "la résolution cachée"}
          </button>
        )}
        {enLecture && !lectureSeule ? (
          <p className="m-0 flex items-center gap-2 border-t border-trait px-2.5 py-4 text-[13.5px] text-craie"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> Lecture du PV en cours…</p>
        ) : !a.resolutions.length && !lectureSeule ? (
          <div className="flex flex-wrap items-center gap-3 border-t border-trait px-2.5 py-4">
            <p className="m-0 text-[13.5px] text-craie">{a.lu_sans_resolutions ? "Ce PV a été lu avant la liste des résolutions : relisez-le pour les avoir." : a.extraction ? "Aucune résolution lue dans ce PV." : "Ce PV n'est pas encore lu."}</p>
            <button type="button" onClick={() => relire.mutate(a.document_id)} disabled={relire.isPending}
              className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {relire.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} {a.extraction ? "Relire le PV" : "Lire le PV"}
            </button>
          </div>
        ) : visibles.map((r) => {
          const [issue, teinte] = ISSUE[r.issue] || ["Non dit", "gris"];
          const detail = [r.tantiemes, r.montant != null ? euros(r.montant) : null, r.majorite].filter(Boolean).join(" · ");
          const ok = r.statut === "verifie";
          const basculer = () => { if (!lectureSeule && !statuer.isPending) statuer.mutate({ cle: r.cle, statut: ok ? "a_verifier" : "verifie" }); };
          if (lectureSeule) {
            return (
              <div key={r.cle} className={`grid ${COLONNES} ${CELLULES} ${LIGNE_GRILLE}`}>
                <div className="group/res flex min-w-0 items-start justify-between gap-2 text-[13.5px] leading-[1.4] text-encre">
                  <span className="min-w-0">{r.numero && <span>{r.numero}. </span>}{r.nom}</span>
                  {onCacher && (
                    <button type="button" disabled={enCours} onClick={() => onCacher(r.cle)}
                      className={`${oeil} -my-0.5 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover/res:opacity-100`} title="Cacher cette résolution (ici et dans l'Analyse)" aria-label="Cacher cette résolution" style={{ background: "transparent" }}>
                      <EyeOff className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="min-w-0">
                  <Statut couleur={teinte}>{issue}</Statut>
                  {detail && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-craie">{detail}</p>}
                </div>
                {onOuvrir && a.document_url
                  ? <LigneSource titre={a.document_titre || "PV d'AG"} page={r.page} onClick={() => onOuvrir({ document_id: a.document_id, document_nom: a.document_nom, document_url: a.document_url, mime: a.mime, page: r.page, citation: r.citation, titre: r.nom })} />
                  : <span className="min-w-0 text-[12.5px] text-brume">{r.page ? `PV p. ${r.page}` : "PV"}</span>}
                <div className="min-w-0"><NoteCellule lectureSeule note={r.note ? { texte: r.note } : null} /></div>
              </div>
            );
          }
          return (
            <div key={r.cle} className={`grid ${COLONNES} ${CELLULES} ${LIGNE_GRILLE}`}>
              <div role="button" tabIndex={0} aria-pressed={ok} onClick={basculer}
                onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); basculer(); } }}
                title={ok ? `Vérifié${r.par ? ` par ${prenom(r.par)}` : ""} · cliquer pour revenir à « à vérifier »` : "À vérifier · cliquer quand c'est vérifié"}
                className={`group/res flex min-w-0 cursor-pointer select-none items-start justify-between gap-2 text-[13.5px] leading-[1.4] text-encre transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 ${ok ? "bg-menthe/15 hover:bg-menthe/25" : "bg-lu-ia/25 hover:bg-lu-ia/35"}`}>
                <span className="min-w-0">{r.numero && <span>{r.numero}. </span>}{r.nom}</span>
                <button type="button" disabled={statuer.isPending} onClick={(e) => { e.stopPropagation(); statuer.mutate({ cle: r.cle, cachee: true }); }}
                  className={`${oeil} -my-0.5 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover/res:opacity-100`} title="Cacher cette résolution" aria-label="Cacher cette résolution" style={{ background: "transparent" }}>
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
              <div className="min-w-0">
                <Statut couleur={teinte}>{issue}</Statut>
                {detail && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-craie">{detail}</p>}
              </div>
              <LigneSource titre={a.document_titre || "PV d'AG"} page={r.page} alerte={r.verifiee === false}
                onClick={() => onOuvrir?.({ document_id: a.document_id, document_nom: a.document_nom, document_url: a.document_url, mime: a.mime, page: r.page, citation: r.citation })} />
              <div className="min-w-0"><NoteCellule dealId={dealId} tableau="resolutions" ligne={r.cle} note={notesDossier[`resolutions.${r.cle}`]} /></div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
