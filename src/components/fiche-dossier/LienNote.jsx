import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, Link2, Search, Sparkles, User, Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { J } from "@/design/jetons";

// L'icône lien de la saisie (19 nov. 2026, Jules : « mettre une icône link, on clique et on peut facilement choisir un
// agent, un bien, un ou des clients ») : elle remplace « Dossier : aucun » et la bascule Répondre / Produire. Une
// note liée part à l'assistant, qui la range sur ces fiches après un OK ; une demande liée part au chat avec le bien
// en contexte.

export const ICONE_GENRE = { bien: Building2, agent: User, client: Users };
const GROUPES = [["biens", "Biens"], ["agents", "Agents"], ["clients", "Clients"]];

function useRetarde(v, ms = 250) {
  const [x, setX] = useState(v);
  useEffect(() => { const t = setTimeout(() => setX(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return x;
}

/** Une pastille par fiche liée, retirable. */
export function PastilleLien({ l, onRetirer = null }) {
  const Icone = ICONE_GENRE[l.genre] || Building2;
  return (
    <span className="inline-flex h-8 min-w-0 max-w-[240px] items-center gap-1.5 rounded-full pl-2.5 pr-1 text-[13px] text-encre max-md:max-w-[170px]" style={{ background: J["barre-relief"] }}>
      <Icone className="h-3.5 w-3.5 flex-none text-menthe" />
      <span className="truncate">{l.nom}</span>
      {onRetirer ? (
        <button type="button" onClick={onRetirer} aria-label={`Retirer ${l.nom}`} title="Retirer" className="grid h-6 w-6 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>
      ) : <span className="w-1.5" />}
    </span>
  );
}

/**
 * `indices` : ce qui est écrit et les participants d'une conversation importée ; à l'ouverture, les fiches qu'ils nomment
 * sont proposées en premier (19 nov. 2026, Jules : « au lieu de lier, ça propose des liens »).
 * @param {{ liens: Array<{cle: string, genre: string, nom: string}>, onChange: (l: any[]) => void, versLeHaut?: boolean, libelle?: string, indices?: { texte?: string, noms?: string[] } }} props
 */
export default function LienNote({ liens, onChange, versLeHaut = false, libelle = "Lier", indices = null }) {
  const [ouvert, setOuvert] = useState(false);
  const [cherche, setCherche] = useState("");
  // La liste sort de la saisie (portail, position fixe) : sur l'Accueil, les raccourcis posés dessous passaient
  // par-dessus (19 nov. 2026, capture de Jules). Elle se place sous le bouton, ou au-dessus quand la saisie est en bas.
  const bouton = useRef(null);
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const placer = () => {
      const r = bouton.current?.getBoundingClientRect();
      if (!r) return;
      const largeur = Math.min(380, window.innerWidth - 32);
      const left = Math.max(16, Math.min(r.left, window.innerWidth - largeur - 16));
      const enHaut = versLeHaut || r.bottom + 400 > window.innerHeight;
      // La hauteur suit la place : le champ de recherche reste toujours à l'écran, la liste défile dessous (20 nov.
      // 2026, capture de Jules : la recherche sortait par le haut).
      const dispo = Math.max(220, Math.min(480, enHaut ? r.top - 26 : window.innerHeight - r.bottom - 24));
      setPlace(enHaut ? { left, width: largeur, bottom: window.innerHeight - r.top + 10, maxHeight: dispo } : { left, width: largeur, top: r.bottom + 8, maxHeight: dispo });
    };
    placer();
    // Ouverte, elle reste où elle est : faire défiler la page ne la déplace pas (20 nov. 2026, Jules).
    window.addEventListener("resize", placer);
    return () => window.removeEventListener("resize", placer);
  }, [ouvert, versLeHaut]);
  const q = useRetarde(cherche.trim());
  const { data, isFetching, isError } = useQuery({
    queryKey: ["fiche-dossier-chercher", q],
    queryFn: () => base44.request("GET", `/api/fiche-dossier/chercher?q=${encodeURIComponent(q)}`),
    enabled: ouvert, staleTime: 30_000, placeholderData: (precedent) => precedent,
  });
  const texteIndice = String(indices?.texte || "").trim().slice(0, 6000);
  const nomsIndice = indices?.noms || [];
  // Les mêmes propositions que pendant la frappe (liens-auto) : le sûr, puis ce qui hésite, le mot en raison.
  const clesLiees = liens.map((l) => l.cle).join("|");
  const { data: sugg, isFetching: suggEnCours } = useQuery({
    queryKey: ["fiche-dossier-liens-auto", texteIndice, clesLiees],
    queryFn: () => base44.request("POST", "/api/fiche-dossier/liens-auto", { body: { texte: texteIndice, liens: liens.map((l) => l.cle) } }),
    enabled: ouvert && !q && !!texteIndice, staleTime: 60_000, placeholderData: (precedent) => precedent,
  });
  // En tête, ce qui est déjà lié, coché ; puis ce que la note nomme et qui ne l'est pas encore.
  const proposes = !q ? [
    ...liens.map((l) => ({ ...l, pourquoi: l.auto ? "lié tout seul" : "lié" })),
    ...(sugg?.surs || []),
    ...(sugg?.choix || []).flatMap((c) => c.options.map((o) => ({ ...o, pourquoi: `« ${c.mot.replace(/ \?$/, "")} » ?` }))),
  ].filter((x, i, t) => t.findIndex((y) => y.cle === x.cle) === i) : [];
  const lie = (x) => liens.some((l) => l.cle === x.cle);
  const basculer = (x) => onChange(lie(x) ? liens.filter((l) => l.cle !== x.cle) : [...liens, { cle: x.cle, genre: x.genre, nom: x.nom, ...(x.detail ? { detail: x.detail } : {}) }]);
  const vide = data && !proposes.length && !GROUPES.some(([k]) => (data[k] || []).length);
  const ligne = (x, detail = x.detail, propose = false) => {
    const actif = lie(x);
    const Icone = ICONE_GENRE[x.genre] || Building2;
    return (
      <button key={x.cle} type="button" role="option" aria-selected={actif} onClick={() => basculer(x)}
        className="flex w-full items-center gap-2.5 rounded-champ px-3 py-2 text-left hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
        <Icone className={`h-3.5 w-3.5 flex-none ${propose ? "text-menthe" : "text-ardoise"}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] text-encre">{x.nom}</span>
          {detail && <span className="block truncate text-[12.5px] text-brume">{detail}</span>}
        </span>
        {actif && <Check className="h-3.5 w-3.5 flex-none text-menthe" />}
      </button>
    );
  };

  return (
    <>
      {liens.map((l) => <PastilleLien key={l.cle} l={l} onRetirer={() => onChange(liens.filter((x) => x.cle !== l.cle))} />)}
      <div className="relative">
        <button ref={bouton} type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="listbox"
          aria-label="Lier la note à un bien, un agent ou un client" title="Lier à un bien, un agent, un client"
          className="inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] transition-colors hover:bg-barre-relief"
          style={{ background: ouvert ? J["barre-relief"] : "transparent", color: liens.length ? J["encre"] : J["craie"] }}>
          <Link2 className="h-4 w-4 flex-none" style={{ color: liens.length ? J["menthe"] : undefined }} />
          {!liens.length && <span className="max-md:hidden">{libelle}</span>}
        </button>
        {ouvert && place && createPortal(
          <>
            <div className="fixed inset-0 z-[90]" data-crm-dehors onClick={() => setOuvert(false)} />
            <div role="listbox" aria-multiselectable="true" data-crm-dehors className="animate-in fade-in duration-150 fixed z-[91] flex flex-col rounded-[14px] border border-trait p-1.5 text-left shadow-[0_18px_40px_rgb(0_0_0/0.18)]"
              style={{ background: J["barre"], ...place }}>
              <div className="flex flex-none items-center gap-2 border-b border-trait px-2.5 pb-2 pt-1">
                <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
                <input autoFocus value={cherche} onChange={(e) => setCherche(e.target.value)} placeholder="Un bien, un agent, un client"
                  onKeyDown={(e) => { if (e.key === "Escape") setOuvert(false); }}
                  className="w-full border-0 bg-transparent py-1 text-[13.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
              </div>
              <div className="min-h-0 flex-auto overflow-y-auto pt-1">
                {!data && isFetching && <p className="m-0 px-3 py-2 text-[13px] text-brume">Recherche…</p>}
                {isError && <p className="m-0 px-3 py-2 text-[13px] text-alerte">La recherche ne répond pas. Réessayez.</p>}
                {vide && <p className="m-0 px-3 py-2 text-[13px] text-brume">{q ? "Rien ne correspond." : "Tapez un nom pour chercher."}</p>}
                {!q && (proposes.length > 0 || suggEnCours) && (
                  <div className="pb-1">
                    <p className="m-0 flex items-center gap-1.5 px-3 pb-1 pt-2 text-[11px] uppercase tracking-[.14em] text-menthe"><Sparkles className="h-3 w-3" />Proposés</p>
                    {proposes.length ? proposes.map((x) => ligne(x, [x.pourquoi, x.detail].filter(Boolean).join(" · "), true))
                      : <p className="m-0 px-3 py-2 text-[13px] text-brume">Je cherche ce que la note nomme…</p>}
                  </div>
                )}
                {data && GROUPES.map(([k, titre]) => {
                  const liste = (data[k] || []).filter((x) => !proposes.some((p) => p.cle === x.cle));
                  return liste.length > 0 && (
                    <div key={k} className="pb-1">
                      <p className="m-0 px-3 pb-1 pt-2 text-[11px] uppercase tracking-[.14em] text-brume">{titre}</p>
                      {liste.map((x) => ligne(x))}
                    </div>
                  );
                })}
              </div>
              {liens.length > 0 && (
                <div className="flex flex-none justify-end border-t border-trait px-2 pb-0.5 pt-1.5">
                  <button type="button" onClick={() => setOuvert(false)} className="h-8 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Fait</button>
                </div>
              )}
            </div>
          </>,
          document.body,
        )}
      </div>
    </>
  );
}
