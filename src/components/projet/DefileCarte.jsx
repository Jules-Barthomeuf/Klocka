import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import { Visionneuse } from "@/components/preanalyse/AnalyseDocuments";

// Une carte qui défile une étape à la fois (26 nov. 2026, Jules : la chronologie du bail, puis « pareil dans l'Analyse du
// bail, avec les clauses ; voir la source s'ouvre dans la carte »). Un défilement vertical aimanté : l'étape centrée
// allumée et dépliée, ses voisines au-dessus et au-dessous repliées sur leur en-tête et leur titre, assombries. On
// défile (molette, doigt, flèches du clavier ou les deux boutons) ; « Voir la source » ouvre la pièce dans l'étape même,
// à sa page, le passage surligné, et devient « Masquer la source ». À gauche, un rail de points reliés pour sauter à
// une étape (le nom au survol).
//
// `etapes` : [{ cle, rail (nom au survol), entete (nœud), titre (nœud, en grand), corps (nœud, l'étape allumée),
// source ({ document_id, document_nom, document_url, page, citation }) | null, libelleSource, passee, accent }].
// `courante` / `onCourante` : l'étape choisie, pilotée du dehors (la liste des clauses) ; sinon `depart`.

export default function DefileCarte({ titre, etapes, depart = 0, courante: pilotee = null, onCourante = null, dealId = null, apres = null, hauteur = 600, tailleTitre = "text-[34px] max-md:text-[26px]", sansRail = false, sansCadre = false }) {
  const defile = useRef(null);
  const cartes = useRef([]);
  const [courante, setCourante] = useState(-1);
  const [ouverte, setOuverte] = useState(-1);
  const doux = typeof window === "undefined" || !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const vise = useRef(null);

  const aller = useCallback((i, instant = false) => {
    const j = Math.max(0, Math.min(etapes.length - 1, i));
    const c = cartes.current[j];
    const d = defile.current;
    if (!c || !d) return;
    vise.current = j;
    d.scrollTo({ top: c.offsetTop - (d.clientHeight - c.offsetHeight) / 2, behavior: instant || !doux ? "auto" : "smooth" });
  }, [etapes.length, doux]);

  const allumer = useCallback(() => {
    const d = defile.current;
    if (!d) return;
    const milieu = d.scrollTop + d.clientHeight / 2;
    let meilleur = 0;
    let ecart = Infinity;
    cartes.current.forEach((c, i) => { if (!c) return; const e = Math.abs(c.offsetTop + c.offsetHeight / 2 - milieu); if (e < ecart) { ecart = e; meilleur = i; } });
    setCourante(meilleur);
    // Pendant un saut demandé, on ne renvoie pas les étapes traversées.
    if (vise.current == null || vise.current === meilleur) { vise.current = null; onCourante?.(meilleur); }
  }, [onCourante]);

  // On arrive sur l'étape de départ.
  useLayoutEffect(() => {
    aller(pilotee ?? depart, true);
    allumer();
  }, [etapes.length]);
  // Une étape choisie du dehors (la liste des clauses).
  useEffect(() => { if (pilotee != null && pilotee !== courante) aller(pilotee); }, [pilotee]);
  // On quitte l'étape dont la source est ouverte : elle se referme.
  useEffect(() => { if (ouverte >= 0 && ouverte !== courante) setOuverte(-1); }, [courante, ouverte]);
  // Une source ouverte : l'étape grandit, on la recentre.
  useEffect(() => { if (ouverte >= 0) requestAnimationFrame(() => aller(ouverte)); }, [ouverte, aller]);

  const raf = useRef(null);
  const surDefilement = () => { if (raf.current) return; raf.current = requestAnimationFrame(() => { raf.current = null; allumer(); }); };
  const surTouche = (e) => {
    if (e.target.closest("textarea, input, [contenteditable=true]")) return;
    if (e.key === "ArrowDown" || e.key === "PageDown") { e.preventDefault(); aller(courante + 1); }
    if (e.key === "ArrowUp" || e.key === "PageUp") { e.preventDefault(); aller(courante - 1); }
    if (e.key === "Escape" && ouverte >= 0) setOuverte(-1);
  };

  if (!etapes.length) return null;
  const marge = Math.round(hauteur * 0.28);

  return (
    // Sans points derrière (26 nov. 2026, Jules : « mets le fond sans points »).
    <div className={`${sansCadre ? "" : "k-carte sans-grille "}k-chrono pt-6`}>
      <div className="flex items-center gap-1.5 px-7 max-md:px-5">
        <span className="mr-auto text-[16px] font-medium text-encre">{titre}</span>
        <button type="button" onClick={() => aller(courante - 1)} disabled={courante <= 0} aria-label="Étape précédente"
          className="grid h-9 w-9 place-items-center rounded-full border border-bord-doux text-craie transition-colors hover:border-encre hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
          <ChevronUp className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => aller(courante + 1)} disabled={courante >= etapes.length - 1} aria-label="Étape suivante"
          className="grid h-9 w-9 place-items-center rounded-full border border-bord-doux text-craie transition-colors hover:border-encre hover:text-encre disabled:opacity-30" style={{ background: "transparent" }}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      {/* `sansRail` : quand une liste à côté pilote déjà la carte (les clauses), le rail ferait doublon. */}
      <div className={`mt-4 grid ${sansRail ? "grid-cols-[12px_minmax(0,1fr)]" : "grid-cols-[40px_minmax(0,1fr)] max-md:grid-cols-[28px_minmax(0,1fr)]"}`}>
        {/* Le rail sans dates (26 nov. 2026, Jules : « pas besoin des petites dates ») : les points reliés, le nom au survol. */}
        <nav aria-label="Les étapes" className={`flex flex-col justify-center gap-0.5 pl-[22px] max-md:pl-2.5 ${sansRail ? "invisible" : ""}`}>
          {etapes.map((e, i) => {
            const ici = i === courante;
            return (
              <button key={e.cle} type="button" onClick={() => aller(i)} aria-current={ici ? "true" : undefined} aria-label={e.rail} title={e.rail}
                className="relative flex h-[22px] items-center text-left" style={{ background: "transparent" }}>
                {i < etapes.length - 1 && <span aria-hidden className="absolute left-[2px] top-4 h-3.5 w-[2px] rounded-full bg-menthe/70" />}
                <span aria-hidden className={`relative z-[1] h-1.5 w-1.5 flex-none rounded-full transition-all ${ici ? "scale-[1.35] bg-menthe ring-[3px] ring-menthe/25" : e.passee ? "bg-menthe/60" : "bg-brume/70"}`} />
              </button>
            );
          })}
        </nav>
        <div ref={defile} tabIndex={0} onScroll={surDefilement} onKeyDown={surTouche} aria-label={`${titre}, une étape à la fois`}
          className={`k-chrono-defile snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none ${ouverte >= 0 ? "k-chrono-lecture" : ""}`} style={{ height: hauteur }}>
          <div style={{ height: marge }} />
          {etapes.map((e, i) => {
            const active = i === courante;
            const lue = ouverte === i;
            return (
              <article key={e.cle} ref={(el) => { cartes.current[i] = el; }}
                onClick={(ev) => { if (!active && !ev.target.closest("button")) aller(i); }}
                aria-hidden={active ? undefined : "true"}
                className={`k-chrono-etape flex snap-center flex-col justify-center gap-2.5 overflow-hidden py-[18px] pl-[18px] pr-7 max-md:pl-2 max-md:pr-[18px] ${lue || active ? "min-h-[260px]" : "h-[260px] max-md:h-[300px]"} ${active ? "is-active" : Math.abs(i - courante) === 1 ? "is-proche cursor-pointer" : "cursor-pointer"}`}>
                <div className="flex items-center gap-2.5 text-[12.5px] tracking-[.02em] text-ardoise">{e.entete}</div>
                <div className={`${tailleTitre} font-medium leading-[1.15] tracking-[-0.015em] [text-wrap:balance] ${e.accent ? "text-menthe" : "text-encre"}`} style={{ fontVariantNumeric: "tabular-nums" }}>{e.titre}</div>
                {active && (
                  <>
                    {e.corps}
                    {e.source?.document_url && (
                      <button type="button" aria-expanded={lue} onClick={() => setOuverte(lue ? -1 : i)}
                        className="mt-1 inline-flex items-center gap-1.5 self-start border-b border-bord-doux pb-px text-[13.5px] text-craie transition-colors hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}>
                        <FileText className="h-3.5 w-3.5" />{lue ? "Masquer la source" : (e.libelleSource || `Voir la source${e.source.page ? ` · p. ${e.source.page}` : ""}`)}
                      </button>
                    )}
                    {lue && (
                      <div className="mt-1 max-w-[58ch]">
                        <Visionneuse extraction={{ document_id: e.source.document_id, document_nom: e.source.document_nom, document_url: e.source.document_url }}
                          ligne={{ page: e.source.page, citation: e.source.citation, element: e.rail }} dealId={dealId} hauteur="h-[360px]" />
                      </div>
                    )}
                  </>
                )}
              </article>
            );
          })}
          <div style={{ height: marge }} />
        </div>
      </div>
      {apres}
    </div>
  );
}
