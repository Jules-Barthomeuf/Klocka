import React, { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { FolderOpen, List, MoreHorizontal, Plus, Search, Send, X } from "lucide-react";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { J } from "@/design/jetons";
import { base44 } from "@/api/base44Client";
import {
  ChoixAnalyste, Conversation, FicheDossier, NouveauDossier, Pieces, STATUTS, ajoutPossible, court, depuisMandataire, euros, quand, teinteStatut, useGestes,
} from "@/components/conversations/EspaceConversations";

// Les dossiers du mandataire. Ce sont les siens : Klocka ne les voit qu'une
// fois transférés, d'un bouton (ou quand il écrit à son analyste). On arrive
// sur tous ses dossiers ; un clic ouvre le classeur, un onglet par bien, avec
// à droite la conversation, qui s'allume quand Klocka a écrit.

/** L'état d'un dossier tel que la carte le dit : le mot et sa couleur. */
function etatDe(c) {
  const requises = c.checklist.lignes.filter((l) => l.requise);
  const recues = requises.filter((l) => l.recue).length;
  if (c.statut === "go") return { mot: "Go", teinte: J["vert"] };
  if (c.statut === "no_go") return { mot: "No-go", teinte: J["alerte"] };
  if (c.statut === "complements") return { mot: "Compléments", teinte: J["ambre"] };
  if (c.transfere) return { mot: "À l'étude", teinte: J["menthe"] };
  if (c.checklist.envoyable) return { mot: "Prêt à envoyer", teinte: J["menthe"] };
  return { mot: "À compléter", teinte: recues ? J["ambre"] : J["brume"] };
}

/** Le point qui s'allume : un message de Klocka pas encore lu. */
export function PointNouveau({ n = 0, grand = false, className = "" }) {
  if (!n) return null;
  const taille = grand ? "h-3 w-3" : "h-2.5 w-2.5";
  return (
    <span className={`relative inline-flex flex-none ${taille} ${className}`} aria-label={`${n} message${n > 1 ? "s" : ""} non lu${n > 1 ? "s" : ""}`}>
      <span className="absolute inset-0 animate-ping rounded-full bg-menthe opacity-60" />
      <span className={`relative rounded-full bg-menthe shadow-[0_0_12px_rgb(var(--k-menthe-rgb)/0.95)] ${taille}`} />
    </span>
  );
}

/**
 * À droite du dossier : ses pièces, ou la conversation avec l'analyste, d'un
 * interrupteur en haut. On arrive sur la conversation quand Klocka a écrit.
 */
function ColonneDroite({ c, mode, onMode }) {
  const gestes = useGestes(c);
  const modifiable = ajoutPossible(c);
  const recues = c.checklist.lignes.filter((l) => l.recue).length;
  return (
    <div className="flex flex-col gap-3 lg:sticky lg:top-0">
      <div className="flex justify-end">
        <div className="flex gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Pièces ou conversation">
          {[["pieces", `Pièces · ${recues}/${c.checklist.lignes.length}`], ["conversation", "Conversation"]].map(([cle, mot]) => (
            <button key={cle} type="button" role="tab" aria-selected={mode === cle} onClick={() => onMode(cle)}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-[7px] text-[13.5px] ${mode === cle ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
              style={mode === cle ? undefined : { background: "transparent" }}>
              {mot}{cle === "conversation" && mode !== cle && c.transfere && <PointNouveau n={c.non_lus} />}
            </button>
          ))}
        </div>
      </div>
      {mode === "conversation" ? (
        <div className="flex h-[calc(100dvh-300px)] min-h-[480px] overflow-hidden rounded-[16px] border border-trait">
          <Conversation key={c.id} c={c} cote="mandataire" bord={false} />
        </div>
      ) : (
        <div className="k-grid rounded-[16px] border border-trait px-6 py-5">
          <Pieces c={c} gestes={modifiable ? gestes : null} />
          {modifiable && <p className="m-0 mt-3 text-[12.5px] text-brume">Vous pouvez aussi glisser un fichier dans la conversation : il se range ici.</p>}
        </div>
      )}
    </div>
  );
}

export default function DossiersMandataire() {
  const [params, setParams] = useSearchParams();
  const { data, isLoading, isError } = useQuery({ queryKey: ["m-dossiers"], queryFn: () => base44.request("GET", "/api/mandataire/dossiers"), refetchInterval: 20_000 });
  const [recherche, setRecherche] = useState("");
  const tous = useMemo(() => (data?.dossiers || []).map(depuisMandataire), [data]);
  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return tous.filter((c) => !t || `${c.bien} ${c.adresse || ""} ${c.proprietaire || ""}`.toLowerCase().includes(t));
  }, [tous, recherche]);
  const poser = (maj) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(maj)) (v == null ? n.delete(k) : n.set(k, v));
    return n;
  }, { replace: true });
  const creation = params.get("nouveau") === "1";
  const ouvert = creation ? null : tous.find((c) => c.id === params.get("dossier")) || null;
  const demandeConversation = params.get("conv") === "1";
  // Un dossier pas encore transféré n'a jamais de point : Klocka ne l'a pas.
  const aLire = (c) => (c.transfere ? c.non_lus || 0 : 0);
  const nonLus = tous.reduce((n, c) => n + aLire(c), 0);
  const ouvrir = (id, conv = false) => { poser({ dossier: id, nouveau: null, conv: conv ? "1" : null }); };
  // À droite, la conversation si Klocka a écrit (ou si la notification y mène), sinon les pièces.
  const [mode, setMode] = useState("pieces");
  useEffect(() => {
    if (!ouvert) return;
    setMode(demandeConversation || aLire(ouvert) > 0 ? "conversation" : "pieces");
  }, [ouvert?.id]);

  // L'arrivée : tous les dossiers, en cartes.
  if (!ouvert && !creation) {
    return (
      <div className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8 md:py-7">
        <header className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
          <label className="flex h-11 w-full max-w-[340px] items-center gap-2.5 rounded-full border border-trait px-[18px] text-ardoise max-md:order-2">
            <Search className="h-4 w-4 flex-none" />
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un dossier…" aria-label="Rechercher un dossier"
              className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
          </label>
          <h1 className="m-0 text-center text-[30px] font-medium tracking-[-0.01em] text-encre max-md:order-1 max-md:text-left max-md:text-[26px]">Vos dossiers</h1>
          <div className="flex md:justify-end max-md:order-3">
            <button type="button" onClick={() => poser({ nouveau: "1" })}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-encre px-5 text-[14px] font-medium text-fond hover:opacity-90">
              <Plus className="h-3.5 w-3.5" /> Nouveau dossier
            </button>
          </div>
        </header>

        {isLoading && <p className="m-0 mt-8 text-[13.5px] text-brume">Chargement des dossiers…</p>}
        {isError && <p className="m-0 mt-8 text-[13.5px] text-alerte">Les dossiers ne se chargent pas. Rechargez la page.</p>}
        {!isLoading && !tous.length && <p className="m-0 mt-16 text-center text-[14px] text-brume">Aucun dossier encore : il s'ouvre seul quand un mandat est signé, ou avec « Nouveau dossier ».</p>}
        {!!tous.length && !liste.length && <p className="m-0 mt-10 text-center text-[13.5px] text-brume">Rien ne correspond.</p>}

        {!!liste.length && (
          <div className="mt-[26px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
            {liste.map((c) => <CarteDossier key={c.id} c={c} nonLus={aLire(c)} onOuvrir={() => ouvrir(c.id, aLire(c) > 0)} />)}
          </div>
        )}
      </div>
    );
  }

  // Un dossier ouvert : le classeur.
  return (
    <div className="flex w-full flex-col gap-[22px] px-5 py-6 md:px-8 md:py-7 lg:h-[100dvh]">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="m-0 text-[30px] font-medium tracking-[-0.01em] text-encre">Dossiers</h1>
      </header>

      <div className="flex min-h-0 flex-1 flex-col">
        <div role="tablist" aria-label="Dossiers" className="relative z-[2] flex items-end gap-1.5 overflow-x-auto [scrollbar-width:none]">
          <button type="button" onClick={() => poser({ dossier: null, nouveau: null, conv: null })}
            className="flex h-11 flex-none items-center gap-2 rounded-t-[14px] px-4 text-[14px] text-ardoise hover:bg-surface hover:text-craie" style={{ background: "transparent" }}>
            <List className="h-4 w-4" /> Tous les dossiers
          </button>
          {liste.map((c) => {
            const actif = c.id === ouvert?.id;
            return (
              <button key={c.id} type="button" role="tab" aria-selected={actif} onClick={() => ouvrir(c.id)} title={c.bien}
                className={`flex flex-none items-center gap-2.5 rounded-t-[14px] text-[14px] ${actif
                  ? "h-[50px] border border-b-0 border-bord-doux bg-rail px-[22px] font-medium text-encre"
                  : "h-11 bg-surface px-5 text-ardoise hover:text-craie"}`}>
                {aLire(c) > 0 && !(actif && mode === "conversation")
                  ? <PointNouveau n={aLire(c)} grand />
                  : <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: teinteStatut(c.statut) }} />}
                <span className="max-w-[220px] truncate">{court(c.bien)}</span>
              </button>
            );
          })}
          <button type="button" role="tab" aria-selected={creation} onClick={() => poser({ nouveau: "1", conv: null })}
            className={`flex flex-none items-center gap-2 rounded-t-[14px] text-[14px] ${creation
              ? "h-[50px] border border-b-0 border-bord-doux bg-rail px-[22px] font-medium text-encre"
              : "h-11 px-5 text-ardoise hover:bg-surface hover:text-craie"}`}
            style={creation ? undefined : { background: "transparent" }}>
            <Plus className="h-4 w-4" /> Nouveau dossier
          </button>
        </div>

        <div className="relative z-[1] -mt-px flex min-h-[560px] flex-1 overflow-hidden rounded-[16px] border border-bord-doux bg-rail max-lg:flex-col">
          {creation ? (
            <NouveauDossier onCree={(id) => poser({ dossier: id, nouveau: null })} onAnnuler={() => poser({ nouveau: null })} />
          ) : (
            <>
              {ouvert && (
                <FicheDossier key={ouvert.id} c={ouvert} cote="mandataire" estimations={data?.estimations || []}
                  onSupprime={() => poser({ dossier: null, conv: null })}
                  droite={<ColonneDroite c={ouvert} mode={mode} onMode={(m) => { setMode(m); poser({ conv: m === "conversation" ? "1" : null }); }} />} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * La carte d'un dossier, au dessin de celle de Klocka (Analyse) : la grille de
 * points avec l'état et la date, le menu ⋯, le bien, chez qui il est, et ses
 * pièces obligatoires en segments.
 */
function CarteDossier({ c, nonLus, onOuvrir }) {
  const gestes = useGestes(c);
  const [choix, setChoix] = useState(false);
  const [menu, setMenu] = useState(false);
  const zone = useFermerAuClicAilleurs(menu, () => setMenu(false));
  const etat = etatDe(c);
  const requises = c.checklist.lignes.filter((l) => l.requise);
  const recues = requises.filter((l) => l.recue).length;
  const k = c.carte || {};
  const lieu = [k.ville, k.surface_m2 ? `${k.surface_m2} m²` : null, (k.prix || c.prix) ? euros(k.prix || c.prix) : null].filter(Boolean).join(" · ") || c.adresse || "Adresse à compléter";
  const geste = "flex w-full items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06]";
  return (
    <article className="relative flex cursor-pointer flex-col rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux" onClick={onOuvrir}>
      <div className="k-grid k-grid-toujours relative h-[112px] flex-none rounded-t-[17px] border-b border-trait">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: etat.teinte }} />{etat.mot}
        </span>
        <span className="absolute right-4 top-[18px] inline-flex items-center gap-2 text-[12px] tabular-nums text-brume">
          <PointNouveau n={nonLus} />{c.activite ? new Date(c.activite).toLocaleDateString("fr-FR") : ""}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-[18px]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 truncate text-[17px] font-medium text-encre" title={c.bien}>{c.bien}</p>
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
            {c.transfere && <span className="flex-none rounded-full border border-menthe/40 px-2.5 py-[3px] text-[12px] text-menthe">Chez {c.analyste_nom || "Klocka"}</span>}
            <span className="truncate text-[13px] text-ardoise">{lieu}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between text-[12px] text-ardoise"><span>Pièces obligatoires</span><span className="tabular-nums">{recues} / {requises.length}</span></div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(requises.length, 1)}, minmax(0, 1fr))` }}>
            {requises.map((l) => <span key={l.cle} className={`h-1 rounded-full ${l.recue ? "bg-menthe" : "bg-encre/[0.12]"}`} />)}
          </div>
        </div>
      </div>
      <div ref={zone} className="contents" onClick={(e) => e.stopPropagation()}>
        <button type="button" onClick={() => setMenu(!menu)} aria-label="Actions" title="Actions"
          className="absolute right-4 top-[84px] text-ardoise transition-colors hover:text-encre" style={{ background: "transparent" }}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menu && (
          <div className="absolute right-4 top-[106px] z-20 min-w-[210px] rounded-[14px] border border-trait bg-surface-pleine py-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
            <button type="button" onClick={() => { setMenu(false); onOuvrir(); }} className={geste} style={{ background: "transparent" }}><FolderOpen className="h-3.5 w-3.5" /> Ouvrir le dossier</button>
            {!c.transfere && (c.checklist.envoyable ? (
              <button type="button" onClick={() => { setMenu(false); setChoix(true); }} className={geste} style={{ background: "transparent" }}><Send className="h-3.5 w-3.5" /> Envoyer à un analyste</button>
            ) : (
              <p className="m-0 flex items-center gap-2.5 px-3.5 py-2 text-[12.5px] text-brume"><Send className="h-3.5 w-3.5" /> Une pièce avant l'envoi</p>
            ))}
          </div>
        )}
      </div>
      {choix && <span onClick={(e) => e.stopPropagation()}><ChoixAnalyste c={c} gestes={gestes} onFermer={() => setChoix(false)} /></span>}
    </article>
  );
}
