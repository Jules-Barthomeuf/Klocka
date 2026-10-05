import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, ExternalLink, FileText, FolderOpen, Loader2, MessageSquare, PenLine, X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Les sources d'une LOI, sous la réponse du chat de la page Offres : d'où
// vient chaque champ de la lettre (la fiche ou le mail du dossier, le projet,
// ce qui a été dit au chat, le modèle). Un clic ouvre la source dans une
// fenêtre, sans quitter la page : les champs pris, et le document reçu avec
// la phrase relevée surlignée, ou le PDF lui-même.

const ICONES = { dossier: FileText, projet: FolderOpen, chat: MessageSquare, main: PenLine, modele: BookOpen };

/** Les liens sous la réponse. `sources` : { loi_id, liens: [{ id, titre, detail }] }. */
export default function SourcesLoi({ sources }) {
  const [ouverte, setOuverte] = useState(null);
  if (!sources?.loi_id || !sources.liens?.length) return null;
  return (
    <div className="mt-4">
      <p className="m-0 text-[12px] uppercase tracking-[0.14em] text-brume">Sources</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
        {sources.liens.map((s) => {
          const Icone = ICONES[s.id] || FileText;
          return (
            <button key={s.id} type="button" onClick={() => setOuverte(s.id)} title={s.detail || s.titre}
              className="inline-flex max-w-full items-center gap-1.5 text-[13.5px] text-craie underline decoration-trait underline-offset-4 transition-colors hover:text-encre hover:decoration-menthe"
              style={{ background: "transparent" }}>
              <Icone className="h-3.5 w-3.5 flex-none text-menthe" />
              <span className="truncate">{s.titre}</span>
            </button>
          );
        })}
      </div>
      {ouverte && <FenetreSources loiId={sources.loi_id} depart={ouverte} onFermer={() => setOuverte(null)} />}
    </div>
  );
}

function FenetreSources({ loiId, depart, onFermer }) {
  const [active, setActive] = useState(depart);
  const { data, isLoading, error } = useQuery({ queryKey: ["offre-sources", loiId], queryFn: () => base44.request("GET", `/api/offres/${loiId}/sources`) });
  const sources = data?.sources || [];
  const s = sources.find((x) => x.id === active) || sources[0] || null;

  // Échap ferme ; la page derrière ne défile plus.
  useEffect(() => {
    const clavier = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", clavier);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", clavier); document.body.style.overflow = avant; };
  }, [onFermer]);

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 md:left-[var(--k-barre-largeur,0px)]" role="dialog" aria-modal="true" aria-label="Sources de la lettre">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onFermer} />
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="k-grid relative flex h-[86vh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[20px] border border-bord-vif bg-fond shadow-[0_40px_120px_-24px_rgba(0,0,0,0.8)]">
        <div className="flex h-14 flex-none items-center gap-3 border-b border-trait px-5">
          <span className="text-[15px] text-encre">Sources de la lettre</span>
          {sources.length > 1 && (
            <div className="ml-2 flex min-w-0 gap-1 overflow-x-auto rounded-full bg-rail-actif p-1">
              {sources.map((x) => (
                <button key={x.id} type="button" onClick={() => setActive(x.id)}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[12.5px] transition-colors ${x.id === s?.id ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
                  style={x.id === s?.id ? undefined : { background: "transparent" }}>
                  {x.detail}
                </button>
              ))}
            </div>
          )}
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="ml-auto grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        ) : error || !s ? (
          <p className="m-auto text-[14px] text-brume">{error?.message || "Aucune source pour cette lettre."}</p>
        ) : (
          <Source key={s.id} s={s} />
        )}
      </motion.div>
    </div>,
    document.body,
  );
}

/** Une source : ses champs à gauche, le document à droite quand il y en a un. */
function Source({ s }) {
  const doc = s.document && (s.document.texte || s.document.url) ? s.document : null;
  const [vue, setVue] = useState(doc?.texte ? "texte" : "pdf");
  const [choisie, setChoisie] = useState(null);
  const zone = useRef(null);
  const citations = useMemo(() => s.champs.map((c) => c.citation).filter(Boolean), [s]);

  // Un champ cliqué : sa phrase dans le document vient au milieu.
  const montrer = (c) => {
    if (!c.citation) return;
    setChoisie(c.citation);
    setVue("texte");
    requestAnimationFrame(() => zone.current?.querySelector(`[data-citation="${CSS.escape(c.citation)}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
  };

  const champs = (
    <div className={doc ? "min-h-0 overflow-y-auto border-r border-trait p-5 max-md:border-r-0 max-md:border-b" : "min-h-0 overflow-y-auto p-6"}>
      <p className="m-0 text-[17px] text-encre">{s.titre}</p>
      {s.lien && (
        <a href={s.lien} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre">
          {s.type === "projet" ? "Ouvrir le projet" : "Ouvrir le dossier"} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <div className={`mt-5 ${doc ? "space-y-4" : "grid gap-4 sm:grid-cols-2"}`}>
        {s.champs.map((c) => (
          <button key={c.cle} type="button" onClick={() => montrer(c)} disabled={!c.citation}
            className={`block w-full rounded-[14px] px-3 py-2.5 text-left transition-colors ${c.citation ? "cursor-pointer hover:bg-rail-actif" : "cursor-default"} ${choisie && choisie === c.citation ? "bg-rail-actif" : ""}`}
            style={choisie && choisie === c.citation ? undefined : { background: "transparent" }}>
            <span className="block text-[12.5px] text-ardoise">{c.libelle}</span>
            <span className="mt-0.5 block text-[15px] text-encre">{c.valeur}</span>
            {c.citation && <span className="mt-1.5 block border-l-2 border-menthe pl-2.5 text-[13px] italic leading-[1.5] text-craie">« {c.citation} »</span>}
          </button>
        ))}
      </div>
    </div>
  );
  if (!doc) return <div className="min-h-0 flex-1">{champs}</div>;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,360px)_minmax(0,1fr)] max-md:grid-cols-1 max-md:grid-rows-[auto_minmax(0,1fr)]">
      {champs}
      <div className="flex min-h-0 flex-col">
        {doc.texte && doc.url && (
          <div className="flex flex-none gap-1 self-start p-3">
            <div className="flex gap-1 rounded-full bg-rail-actif p-1">
              {[["texte", "Le texte relevé"], ["pdf", doc.nom || "Le document"]].map(([v, l]) => (
                <button key={v} type="button" onClick={() => setVue(v)}
                  className={`max-w-[260px] truncate rounded-full px-3 py-1 text-[12.5px] ${vue === v ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
                  style={vue === v ? undefined : { background: "transparent" }}>{l}</button>
              ))}
            </div>
          </div>
        )}
        {vue === "pdf" && doc.url ? (
          <iframe title={doc.nom || "Document"} src={doc.url} className="min-h-0 w-full flex-1 border-0 bg-white" />
        ) : (
          <div ref={zone} className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
            <TexteSurligne texte={doc.texte} citations={citations} choisie={choisie} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Le texte du document, les phrases relevées surlignées. */
function TexteSurligne({ texte, citations, choisie }) {
  const morceaux = useMemo(() => {
    const t = String(texte || "");
    // Chaque citation, à sa première place dans le texte ; celles qu'on ne retrouve pas mot pour mot restent à gauche.
    const places = [];
    for (const c of [...new Set(citations)]) {
      const i = t.indexOf(c);
      if (i >= 0 && !places.some((p) => i < p.fin && i + c.length > p.debut)) places.push({ debut: i, fin: i + c.length, c });
    }
    places.sort((a, b) => a.debut - b.debut);
    const out = [];
    let curseur = 0;
    for (const p of places) {
      if (p.debut > curseur) out.push({ t: t.slice(curseur, p.debut) });
      out.push({ t: t.slice(p.debut, p.fin), c: p.c });
      curseur = p.fin;
    }
    out.push({ t: t.slice(curseur) });
    return out;
  }, [texte, citations]);
  return (
    <p className="m-0 whitespace-pre-wrap text-[14px] leading-[1.7] text-craie">
      {morceaux.map((m, i) => (m.c ? (
        <mark key={i} data-citation={m.c} className={`rounded-[4px] px-0.5 text-encre ${m.c === choisie ? "bg-menthe/45" : "bg-menthe/20"}`}>{m.t}</mark>
      ) : <React.Fragment key={i}>{m.t}</React.Fragment>))}
    </p>
  );
}
