import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { Check, ChevronDown, List, Loader2, Mail, Paperclip, Plus, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { BoutonFichier, Frise, MotDeKlocka, formDe } from "@/components/mandataire/kit";
import DecisionMandataire from "@/components/mandataire/DecisionMandataire";
import { devinerPiece } from "@/lib/pieces-dossier";

// Les dossiers mandataires, une conversation chacun, des deux côtés :
// Klocka (`cote="klocka"`, page Conversations) et le mandataire
// (`cote="mandataire"`). Un onglet par dossier (le classeur), la liste
// complète dans un tiroir, et pour le dossier ouvert un double onglet :
// la conversation (avec le bien à droite) ou le dossier en entier. Le
// mandataire crée un dossier depuis le dernier onglet.

export const STATUTS = {
  klocka: { documents_en_cours: "Documents en cours", complet: "Complet, à envoyer", en_etude: "À étudier", complements: "Compléments", go: "Go", no_go: "No-go" },
  mandataire: { documents_en_cours: "Pièces à déposer", complet: "Prêt à transférer", en_etude: "Klocka l'étudie", complements: "Compléments demandés", go: "Go", no_go: "No-go" },
};
export const ETAPES = [["documents_en_cours", "Pièces"], ["complet", "Complet"], ["en_etude", "Étude"], ["decision", "Décision"]];
export const ISSUES = {
  go: { mot: "Go", teinte: J["vert"] },
  complements: { mot: "Compléments", teinte: J["ambre"] },
  no_go: { mot: "No-go", teinte: J["alerte"] },
};
export const MODIFIABLES = ["documents_en_cours", "complet", "complements"];
/** Pendant l'étude, le mandataire ajoute encore des pièces (sans en retirer) : elles vont dans l'analyse. */
export const ajoutPossible = (c) => MODIFIABLES.includes(c.statut) || (c.statut === "en_etude" && !!c.deal_id);
export const teinteStatut = (s) => (s === "go" ? J["vert"] : s === "no_go" ? J["alerte"] : s === "en_etude" || s === "complements" ? J["ambre"] : J["brume"]);
const teinteEvenement = (t = "") =>
  /^(go\b|décision : go)/i.test(t) ? J["vert"]
    : /no-go/i.test(t) ? J["alerte"]
      : /compléments demandés/i.test(t) ? J["ambre"]
        : /mandat signé|dossier ouvert/i.test(t) ? J["brume"]
          : J["menthe"];
const heure = (d) => (d ? new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : "");
const jour = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
export const quand = (d) => (!d ? "" : new Date(d).toDateString() === new Date().toDateString() ? heure(d) : jour(d));
const initiales = (n = "") => String(n).split(/[\s.@]+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
export const euros = (n) => (n ? `${Number(n).toLocaleString("fr-FR")} €` : null);
/** Le nom court d'un onglet : sans numéro de référence ni précision entre parenthèses. */
export const court = (bien = "") => String(bien).replace(/\s*\(.*?\)\s*/g, " ").replace(/\s+\d{4,}\b/g, "").trim() || bien;

/** Les dossiers du mandataire, mis à la forme de la liste de Klocka. */
export const depuisMandataire = (d) => ({
  id: d.id, bien: d.bien, adresse: d.adresse || null, statut: d.statut, deal_id: d.deal_id || null, prix: d.prix || null,
  commentaire: d.commentaire || null, proprietaire: d.proprietaire || null, proprietaire_email: d.proprietaire_email || null,
  mandataire_nom: "Vous", analyste_nom: d.analyste_nom || null, non_lus: d.fil_non_lus || 0,
  dernier: d.dernier || null, activite: d.activite || d.cree_le || null, checklist: d.checklist, relance: d.relance || null,
  transfere: !!d.transfere, carte: d.carte || {}, estimation: d.estimation || null, mandat: d.mandat || null, photos: d.photos || [], en_etude_le: d.en_etude_le || null,
});

export default function EspaceConversations({ cote = "klocka" }) {
  const klocka = cote === "klocka";
  const mots = STATUTS[cote];
  const [params, setParams] = useSearchParams();
  const cleListe = klocka ? ["k-conversations"] : ["m-dossiers"];
  const { data, isLoading, isError } = useQuery({
    queryKey: cleListe,
    queryFn: () => base44.request("GET", klocka ? "/api/mandataire/admin/conversations" : "/api/mandataire/dossiers"),
    refetchInterval: 20_000,
  });
  const [portee, setPortee] = useState("miens");
  const [recherche, setRecherche] = useState("");
  const [tiroir, setTiroir] = useState(false);
  const toutes = useMemo(() => (klocka ? data?.conversations || [] : (data?.dossiers || []).map(depuisMandataire)), [data, klocka]);
  const miens = useMemo(() => toutes.filter((c) => c.a_moi), [toutes]);
  const porteeEffective = !klocka ? "tous" : portee === "miens" && !miens.length ? "tous" : portee;
  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (porteeEffective === "miens" ? miens : toutes).filter((c) => !t || `${c.bien} ${c.mandataire_nom || ""} ${c.adresse || ""}`.toLowerCase().includes(t));
  }, [toutes, miens, porteeEffective, recherche]);
  const voulu = params.get("dossier");
  const creation = !klocka && (params.get("nouveau") === "1" || (!isLoading && !toutes.length));
  const ouvert = creation ? null : liste.find((c) => c.id === voulu) || liste[0] || toutes.find((c) => c.id === voulu) || null;
  const vue = params.get("vue") === "dossier" ? "dossier" : "conversation";
  const poser = (maj) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(maj)) (v == null ? n.delete(k) : n.set(k, v));
    return n;
  }, { replace: true });
  const ouvrir = (id) => { setTiroir(false); poser({ dossier: id, nouveau: null }); };

  return (
    <div className="flex w-full flex-col gap-[22px] px-5 py-6 md:px-8 md:py-7 lg:h-[100dvh]">
      <header className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <label className="flex h-11 w-full max-w-[340px] items-center gap-2.5 rounded-full border border-trait px-[18px] text-ardoise max-md:order-2">
          <Search className="h-4 w-4 flex-none" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder={klocka ? "Bien, mandataire…" : "Bien, adresse…"} aria-label="Chercher un dossier"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </label>
        <h1 className="m-0 text-center text-[30px] font-medium tracking-[-0.01em] text-encre max-md:order-1 max-md:text-left">Conversations</h1>
        <div className="flex flex-wrap items-center gap-2.5 md:justify-end max-md:order-3">
          {klocka && (
            <div className="flex gap-0.5 rounded-full bg-rail-actif p-1">
              {[["miens", "Les miens", miens.length], ["tous", "Tous", toutes.length]].map(([cle, mot, n]) => (
                <button key={cle} type="button" onClick={() => setPortee(cle)} aria-pressed={porteeEffective === cle}
                  className={`rounded-full px-[18px] py-[9px] text-[14px] ${porteeEffective === cle ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
                  style={porteeEffective === cle ? undefined : { background: "transparent" }}>{mot} · {n}</button>
              ))}
            </div>
          )}
          {/* Le double onglet : la conversation, ou le dossier en entier. */}
          <div className="flex gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Affichage">
            {[["conversation", "Conversation"], ["dossier", "Dossier"]].map(([cle, mot]) => (
              <button key={cle} type="button" role="tab" aria-selected={vue === cle && !creation} onClick={() => poser({ vue: cle === "dossier" ? "dossier" : null, nouveau: null })}
                className={`rounded-full px-[18px] py-[9px] text-[14px] ${vue === cle && !creation ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
                style={vue === cle && !creation ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
        </div>
      </header>

      {isLoading && <p className="m-0 text-[13.5px] text-brume">Chargement des dossiers…</p>}
      {isError && <p className="m-0 text-[13.5px] text-alerte">Les dossiers ne se chargent pas. Rechargez la page.</p>}
      {klocka && !isLoading && !toutes.length && <p className="m-0 mt-10 text-center text-[14px] text-brume">Aucune conversation : elles s'ouvrent quand un mandataire signe un mandat ou crée un dossier.</p>}

      {(!!toutes.length || creation) && (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Le classeur : un onglet par dossier, l'actif raccordé au panneau. */}
          <div role="tablist" aria-label="Dossiers" className="relative z-[2] flex items-end gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {liste.map((c) => {
              const actif = c.id === ouvert?.id;
              return (
                <button key={c.id} type="button" role="tab" aria-selected={actif} onClick={() => ouvrir(c.id)} title={c.bien}
                  className={`flex flex-none items-center gap-2.5 rounded-t-[14px] text-[14px] ${actif
                    ? "h-[50px] border border-b-0 border-bord-doux bg-rail px-[22px] font-medium text-encre"
                    : "h-11 bg-surface px-5 text-ardoise hover:text-craie"}`}>
                  <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: teinteStatut(c.statut) }} />
                  <span className="max-w-[220px] truncate">{court(c.bien)}</span>
                  {!actif && c.non_lus > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-menthe px-[5px] text-[11px] font-semibold tabular-nums text-sur-menthe" aria-label={`${c.non_lus} non lu(s)`}>{c.non_lus}</span>}
                </button>
              );
            })}
            {!klocka && (
              <button type="button" role="tab" aria-selected={creation} onClick={() => poser({ nouveau: "1" })}
                className={`flex flex-none items-center gap-2 rounded-t-[14px] text-[14px] ${creation
                  ? "h-[50px] border border-b-0 border-bord-doux bg-rail px-[22px] font-medium text-encre"
                  : "h-11 px-5 text-ardoise hover:bg-surface hover:text-craie"}`}
                style={creation ? undefined : { background: "transparent" }}>
                <Plus className="h-4 w-4" /> Nouveau dossier
              </button>
            )}
            {klocka && !liste.length && <p className="m-0 px-2 pb-3 text-[13px] text-brume">Rien ne correspond.</p>}
          </div>

          <div className="relative z-[1] -mt-px flex min-h-[560px] flex-1 overflow-hidden rounded-[16px] rounded-tl-none border border-bord-doux bg-rail max-lg:flex-col">
            {creation ? (
              <NouveauDossier onCree={(id) => poser({ dossier: id, nouveau: null, vue: "dossier" })} onAnnuler={toutes.length ? () => poser({ nouveau: null }) : null} />
            ) : (
              <>
                {tiroir ? (
                  <aside className="flex w-[290px] flex-none flex-col border-r border-trait max-lg:w-full max-lg:border-b max-lg:border-r-0">
                    <div className="flex items-center justify-between px-[18px] pb-2.5 pt-[18px]">
                      <p className="m-0 text-[12px] tracking-[0.14em] text-ardoise">DOSSIERS</p>
                      <button type="button" onClick={() => setTiroir(false)} aria-label="Fermer la liste" title="Fermer la liste" className="grid h-7 w-7 place-items-center rounded-[8px] text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                      {liste.map((c) => (
                        <button key={c.id} type="button" onClick={() => ouvrir(c.id)}
                          className={`flex w-full flex-col gap-1 border-t border-trait px-[18px] py-3.5 text-left ${c.id === ouvert?.id ? "bg-surface" : "hover:bg-surface"}`}
                          style={c.id === ouvert?.id ? undefined : { background: "transparent" }}>
                          <span className="flex justify-between gap-2 text-[14px] font-medium text-encre"><span className="truncate">{c.bien}</span><span className="flex-none text-[12px] font-normal text-brume">{quand(c.activite)}</span></span>
                          <span className="text-[13px] text-ardoise">{klocka ? `${c.mandataire_nom} · ` : ""}{mots[c.statut] || c.statut}</span>
                          {c.dernier && <span className="truncate text-[13px] text-brume">{c.dernier.texte}</span>}
                        </button>
                      ))}
                    </div>
                  </aside>
                ) : (
                  <div className="flex w-[52px] flex-none flex-col items-center border-r border-trait pt-4 max-lg:hidden">
                    <button type="button" onClick={() => setTiroir(true)} aria-label="Tous les dossiers" title="Tous les dossiers"
                      className="grid h-[34px] w-[34px] place-items-center rounded-[10px] border border-bord-doux text-ardoise hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
                      <List className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {ouvert && vue === "conversation" && (
                  <>
                    <Conversation key={ouvert.id} c={ouvert} cote={cote} />
                    <Resume c={ouvert} cote={cote} onDossier={() => poser({ vue: "dossier" })} />
                  </>
                )}
                {ouvert && vue === "dossier" && <FicheDossier key={ouvert.id} c={ouvert} cote={cote} onSupprime={() => poser({ dossier: null, vue: null })} />}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Les gestes du mandataire sur un dossier : déposer, retirer, envoyer, tracer une relance. */
export function useGestes(c) {
  const queryClient = useQueryClient();
  const api = `/api/mandataire/dossiers/${c.id}`;
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: ["m-dossiers"] }); queryClient.invalidateQueries({ queryKey: ["fil-dossier", c.id, "mandataire"] }); };
  const onError = (e) => toast.error(e?.message || "Impossible");
  const piece = useMutation({ mutationFn: ({ cle, f }) => base44.request("POST", `${api}/pieces/${cle}`, { body: formDe(f), isForm: true }), onSuccess: rafraichir, onError });
  const retirer = useMutation({ mutationFn: ({ cle, url }) => base44.request("DELETE", `${api}/pieces/${cle}?url=${encodeURIComponent(url)}`), onSuccess: rafraichir, onError });
  const soumettre = useMutation({
    mutationFn: async ({ analyste_email = null, mot = "" } = {}) => {
      const r = await base44.request("POST", `${api}/soumettre`, { body: { analyste_email } });
      if (mot.trim()) {
        const f = new FormData();
        f.append("texte", mot.trim());
        await base44.request("POST", `${api}/fil`, { body: f, isForm: true });
      }
      return r;
    },
    onSuccess: (r, v) => {
      rafraichir();
      const nom = v?.nom || c.analyste_nom;
      toast.success(c.statut === "complements" ? `Dossier renvoyé${nom ? ` à ${nom}` : " à Klocka"}` : `Dossier transféré${nom ? ` à ${nom}` : " à Klocka"}`);
    },
    onError,
  });
  const tracerRelance = () => base44.request("POST", `${api}/relance`).then(rafraichir).catch(() => {});
  const photo = useMutation({
    mutationFn: async (fichiers) => { for (const f of fichiers) await base44.request("POST", `${api}/photos`, { body: formDe(f), isForm: true }); },
    onSuccess: rafraichir, onError,
  });
  const retirerPhoto = useMutation({ mutationFn: (url) => base44.request("DELETE", `${api}/photos?url=${encodeURIComponent(url)}`), onSuccess: rafraichir, onError });
  const lierEstimation = useMutation({ mutationFn: (id) => base44.request("PATCH", `${api}/estimation`, { body: { estimation_id: id || null } }), onSuccess: rafraichir, onError });
  return { piece, retirer, soumettre, tracerRelance, photo, retirerPhoto, lierEstimation };
}

/** La conversation d'un dossier. */
export function Conversation({ c, cote, bord = true }) {
  const klocka = cote === "klocka";
  const queryClient = useQueryClient();
  const base = klocka ? `/api/mandataire/admin/dossiers/${c.id}` : `/api/mandataire/dossiers/${c.id}`;
  const cle = ["fil-dossier", c.id, klocka ? "analyste" : "mandataire"];
  const cleListe = klocka ? ["k-conversations"] : ["m-dossiers"];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${base}/fil`), refetchInterval: 15_000 });
  const gestes = useGestes(c);
  const [texte, setTexte] = useState("");
  const [piece, setPiece] = useState(null);
  const [rangement, setRangement] = useState(null);
  const [note, setNote] = useState(false);
  const [survol, setSurvol] = useState(false);
  const [briefVisible, setBriefVisible] = useState(true);
  const fichier = useRef(null);
  const defile = useRef(null);
  const rafraichir = () => { queryClient.invalidateQueries({ queryKey: cle }); queryClient.invalidateQueries({ queryKey: cleListe }); };
  const nb = data?.messages?.length || 0;
  useEffect(() => { const el = defile.current; if (el) el.scrollTop = el.scrollHeight; }, [nb]);
  // Lire la conversation la marque lue : les onglets et la pastille du menu suivent.
  useEffect(() => {
    if (!data) return;
    queryClient.invalidateQueries({ queryKey: cleListe });
    if (klocka) queryClient.invalidateQueries({ queryKey: ["preanalyse-pipeline"] });
  }, [nb, data]);

  // Côté mandataire, un fichier peut devenir une pièce du dossier.
  const lignesPieces = !klocka && ajoutPossible(c) ? c.checklist.lignes : null;
  const choisir = (f) => { if (!f) return; setPiece(f); setRangement(lignesPieces ? devinerPiece(f.name, lignesPieces) : null); };

  const envoyer = useMutation({
    mutationFn: async () => {
      if (piece && rangement) {
        await gestes.piece.mutateAsync({ cle: rangement, f: piece });
        if (!texte.trim()) return null;
      }
      const f = new FormData();
      f.append("texte", texte.trim());
      if (piece && !rangement) f.append("fichier", piece);
      if (klocka && note) f.append("interne", "1");
      return base44.request("POST", `${base}/fil`, { body: f, isForm: true });
    },
    onSuccess: () => { setTexte(""); setPiece(null); setRangement(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Message non envoyé"),
  });
  const briefer = useMutation({
    mutationFn: () => base44.request("POST", `${base}/briefing`),
    onSuccess: () => { setBriefVisible(true); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const transferer = useMutation({
    mutationFn: (email) => base44.request("POST", `${base}/transferer`, { body: { email } }),
    onSuccess: () => { rafraichir(); toast.success("Dossier transféré : le mandataire est prévenu"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const messages = data?.messages || [];
  const brief = klocka ? [...messages].reverse().find((m) => m.genre === "briefing") : null;
  const lignes = messages.filter((m) => m.genre !== "briefing");
  const peutEnvoyer = (texte.trim() || piece) && !envoyer.isPending;
  const soumettre = () => { if (peutEnvoyer) envoyer.mutate(); };
  const meBriefer = () => (brief && !briefVisible ? setBriefVisible(true) : briefer.mutate());
  const interlocuteur = klocka ? c.mandataire_nom : data?.analyste?.nom || c.analyste_nom || "Klocka";

  return (
    <section className={`relative flex min-w-0 flex-1 flex-col ${bord ? "border-r border-trait max-lg:border-r-0" : ""} max-lg:min-h-[620px]`}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer?.files?.[0]); }}>
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-trait px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-relief text-[13px] font-semibold text-craie">{initiales(interlocuteur)}</span>
          <span className="flex flex-col gap-0.5">
            <span className="text-[15px] font-medium text-encre">{interlocuteur}{!klocka && data?.relais ? " (relais)" : ""}</span>
            <span className="text-[12px] text-ardoise">{klocka ? "Mandataire K Partners" : "Votre analyste Klocka"}</span>
          </span>
        </div>
        {klocka && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={meBriefer} disabled={briefer.isPending}
              className="inline-flex h-9 items-center gap-2 rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
              {briefer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Me briefer
            </button>
            <label className="relative inline-flex h-9 items-center rounded-full border border-bord-doux text-[13px] text-craie hover:border-bord-vif">
              <select value="" onChange={(e) => e.target.value && transferer.mutate(e.target.value)} disabled={transferer.isPending} aria-label="Transférer le dossier"
                className="h-full cursor-pointer appearance-none rounded-full bg-transparent pl-3.5 pr-8 text-[13px] text-craie outline-none">
                <option value="">Transférer à…</option>
                {(data?.analystes || []).filter((a) => a.email !== data?.analyste?.email).map((a) => <option key={a.email} value={a.email}>{a.nom}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-3 w-3" />
            </label>
          </div>
        )}
      </div>

      {brief && briefVisible && (
        <div className="mx-6 mt-4 flex flex-col gap-2 rounded-[12px] border border-menthe/20 bg-menthe/[0.06] px-4 py-3.5">
          <div className="flex items-center justify-between gap-3">
            <p className="m-0 text-[11px] tracking-[0.14em] text-menthe">BRIEFING · VISIBLE KLOCKA UNIQUEMENT</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => briefer.mutate()} disabled={briefer.isPending} className="text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Actualiser</button>
              <button type="button" onClick={() => setBriefVisible(false)} className="text-[12px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Masquer</button>
            </div>
          </div>
          <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-craie [text-wrap:pretty]">{brief.texte.replace(/^Briefing pour [^:]+ : /, "")}</p>
        </div>
      )}

      <div ref={defile} className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-6 pb-5 pt-[18px]">
        {isLoading && <div className="flex justify-center py-8"><Loader2 className="h-4 w-4 animate-spin text-ardoise" /></div>}
        {!isLoading && !lignes.length && <p className="m-0 py-8 text-center text-[13.5px] text-brume">{klocka ? "Aucun message encore." : "Aucun message encore. Écrivez à votre analyste, ou glissez une pièce ici."}</p>}
        {lignes.map((m, i) => (
          <React.Fragment key={m.id}>
            {(i === 0 || jour(lignes[i - 1].le) !== jour(m.le)) && (
              <div className="mb-1 mt-2 flex items-center gap-3 text-[12px] text-brume"><span className="h-px flex-1 bg-trait" />{jour(m.le)}<span className="h-px flex-1 bg-trait" /></div>
            )}
            {m.cote === "systeme" ? (
              <div className="flex items-center gap-3 px-2.5 py-0.5 text-[13px] text-ardoise">
                <span className="flex w-8 flex-none justify-center"><span className="h-2 w-2 rounded-full" style={{ background: teinteEvenement(m.texte) }} /></span>
                <span>{m.texte}</span><span className="flex-none text-[12px] text-brume">{heure(m.le)}</span>
              </div>
            ) : (
              <Ligne m={m} c={c} klocka={klocka} />
            )}
          </React.Fragment>
        ))}
      </div>

      <form className="flex flex-col gap-2.5 border-t border-trait px-6 pb-5 pt-3.5" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
        {klocka && (
          <div className="flex gap-0.5 self-start rounded-full bg-surface p-[3px]">
            {[[false, "Au mandataire"], [true, "Note interne"]].map(([v, mot]) => (
              <button key={mot} type="button" onClick={() => setNote(v)} aria-pressed={note === v}
                className={`rounded-full px-3.5 py-[7px] text-[13px] ${note === v ? (v ? "bg-ambre/20 text-encre" : "bg-relief text-encre") : "text-ardoise hover:text-craie"}`}
                style={note === v ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
        )}
        {piece && (
          <div className="rounded-[12px] border border-trait bg-surface px-3 py-2">
            <p className="m-0 flex items-center gap-2 text-[12.5px] text-encre">
              <Paperclip className="h-3.5 w-3.5 flex-none text-ardoise" /><span className="min-w-0 flex-1 truncate">{piece.name}</span>
              <button type="button" onClick={() => { setPiece(null); setRangement(null); }} aria-label="Retirer le fichier" title="Retirer le fichier" className="text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
            </p>
            {lignesPieces && (
              <div className="mt-2">
                <p className="m-0 mb-1.5 text-[12px] text-ardoise">{rangement ? "Rangé dans le dossier comme :" : "C'est une pièce du dossier ? Choisissez laquelle :"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {lignesPieces.map((l) => (
                    <button key={l.cle} type="button" onClick={() => setRangement(rangement === l.cle ? null : l.cle)} aria-pressed={rangement === l.cle}
                      className={`rounded-full border px-2.5 py-1 text-[12px] ${rangement === l.cle ? "border-menthe bg-menthe text-sur-menthe" : "border-trait text-craie hover:border-menthe"}`}
                      style={rangement === l.cle ? undefined : { background: "transparent" }}>{l.mot}</button>
                  ))}
                </div>
                {!rangement && <p className="m-0 mt-1.5 text-[12px] text-brume">Sans choix, le fichier part simplement avec votre message.</p>}
              </div>
            )}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <input ref={fichier} type="file" className="hidden" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fichier.current?.click()} aria-label="Joindre un fichier" title="Joindre un fichier"
            className="grid h-10 w-10 flex-none place-items-center text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <Paperclip className="h-[18px] w-[18px]" />
          </button>
          <input value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); soumettre(); } }}
            placeholder={klocka ? (note ? "Note visible par Klocka uniquement…" : `Écrire à ${c.mandataire_nom}…`) : `Écrire à ${interlocuteur}…`}
            className={`h-[46px] min-w-0 flex-1 rounded-[14px] border px-4 text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px] ${note ? "border-ambre/40 bg-ambre/[0.06]" : "border-bord-doux bg-surface focus:border-bord-vif"}`} />
          <button type="submit" disabled={!peutEnvoyer} aria-label="Envoyer" title="Envoyer"
            className="grid h-[46px] w-[46px] flex-none place-items-center rounded-full bg-menthe text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
            {envoyer.isPending ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Send className="h-[18px] w-[18px]" />}
          </button>
        </div>
      </form>

      {survol && (
        <div className="pointer-events-none absolute inset-3 grid place-items-center rounded-[14px] border border-dashed border-menthe bg-fond/80 text-[14px] text-encre">
          {lignesPieces ? "Déposez le fichier : il se range dans le dossier" : "Déposez le fichier pour l'envoyer"}
        </div>
      )}
    </section>
  );
}

/** Un message : avatar, qui, son rôle, l'heure, le texte et ses fichiers. */
function Ligne({ m, c, klocka }) {
  const mandataire = m.cote === "mandataire";
  const note = !!m.interne;
  const qui = mandataire ? (klocka ? c.mandataire_nom : "Vous") : m.auteur || "Klocka";
  const role = mandataire ? "Mandataire" : note ? "Note interne" : "Klocka";
  return (
    <div className={`flex gap-3 rounded-[10px] px-2.5 py-2 ${note ? "bg-ambre/[0.06]" : ""}`}>
      <span className={`grid h-8 w-8 flex-none place-items-center rounded-full text-[12px] font-semibold ${mandataire ? "bg-relief text-craie" : note ? "bg-ambre/15 text-encre" : "bg-menthe/20 text-encre"}`}>{initiales(qui)}</span>
      <div className="flex min-w-0 flex-col gap-[3px]">
        <p className="m-0 flex flex-wrap items-baseline gap-2 text-[13px]"><span className="font-semibold text-encre">{qui}</span><span className="text-brume">{role}</span><span className="text-[12px] text-brume">{heure(m.le)}</span></p>
        {m.texte && <p className="m-0 whitespace-pre-line text-[14px] leading-[1.55] text-craie">{m.texte}</p>}
        {(m.pieces || []).map((p) => (
          <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-2 self-start rounded-[8px] border border-bord-doux px-2.5 py-1.5 text-[13px] text-menthe hover:border-menthe">{p.nom}</a>
        ))}
      </div>
    </div>
  );
}

/** Les pièces, cochées ou non. `gestes` (mandataire) : déposer, et retirer tant que le dossier n'est pas transféré. */
export function Pieces({ c, gestes = null }) {
  const retirable = gestes && MODIFIABLES.includes(c.statut);
  const recues = c.checklist.lignes.filter((l) => l.recue).length;
  return (
    <div className="flex flex-col">
      <div className="flex justify-between border-b border-trait pb-2.5 text-[12px] text-ardoise"><span className="tracking-[0.14em]">PIÈCES</span><span className="tabular-nums">{recues} sur {c.checklist.lignes.length}</span></div>
      {c.checklist.lignes.map((l) => (
        <div key={l.cle} className="flex items-start gap-3 border-b border-trait py-3">
          {l.recue ? (
            <span className="grid h-5 w-5 flex-none place-items-center rounded-full bg-menthe text-sur-menthe"><Check className="h-[11px] w-[11px]" strokeWidth={3} /></span>
          ) : (
            <span className="h-5 w-5 flex-none rounded-full border-[1.5px] border-bord-vif" />
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="m-0 text-[14px] text-encre">{l.mot}{!l.requise && <span className="text-brume"> · facultatif</span>}{l.demandee && !l.recue && <span className="text-ambre"> · demandé</span>}</p>
            {l.fichiers.map((f) => (
              <span key={f.url} className="inline-flex max-w-full items-center gap-1.5">
                <a href={f.url} target="_blank" rel="noreferrer" className="truncate text-[13px] text-menthe hover:underline">{f.nom}</a>
                {retirable && <button type="button" onClick={() => gestes.retirer.mutate({ cle: l.cle, url: f.url })} aria-label={`Retirer ${f.nom}`} title={`Retirer ${f.nom}`} className="flex-none text-brume hover:text-alerte" style={{ background: "transparent" }}><X className="h-3 w-3" /></button>}
              </span>
            ))}
          </div>
          {gestes && <BoutonFichier mot={l.recue ? "Ajouter" : "Déposer"} onFichier={(f) => gestes.piece.mutate({ cle: l.cle, f })} enCours={gestes.piece.isPending && gestes.piece.variables?.cle === l.cle} capture />}
        </div>
      ))}
    </div>
  );
}

/** Ce qu'il faut savoir avant d'envoyer : une pièce suffit, le reste suit. */
export function AvantEnvoi({ c }) {
  const k = c.checklist;
  const demandees = k.lignes.filter((l) => l.demandee && !l.recue);
  let mot = null;
  if (demandees.length) mot = `Klocka attend : ${demandees.map((m) => m.mot.toLowerCase()).join(", ")}.`;
  else if (!k.envoyable) mot = "Déposez au moins une pièce, le bail par exemple, pour transférer.";
  else if (!k.complet) mot = `Vous pourrez ajouter le reste après le transfert : ${k.manquantes.map((m) => m.mot.toLowerCase()).join(", ")}.`;
  return mot ? <p className="m-0 text-[12.5px] leading-[1.5] text-ardoise">{mot}</p> : null;
}

/** L'envoi à Klocka et la relance du propriétaire (mandataire, dossier modifiable). */
function Envoi({ c, gestes }) {
  const r = c.relance;
  const [choix, setChoix] = useState(false);
  // Le premier transfert passe par le choix de l'analyste ; un renvoi part tout de suite.
  const transferer = () => (c.statut === "complements" ? gestes.soumettre.mutate({}) : setChoix(true));
  return (
    <div className="flex flex-col gap-2">
      {choix && <ChoixAnalyste c={c} gestes={gestes} onFermer={() => setChoix(false)} />}
      <button type="button" onClick={transferer} disabled={gestes.soumettre.isPending || !c.checklist.envoyable}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
        {gestes.soumettre.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {c.statut === "complements" ? "Renvoyer à Klocka" : "Transférer à Klocka"}
      </button>
      <AvantEnvoi c={c} />
      {r && (
        <a href={`mailto:${encodeURIComponent(r.destinataire)}?subject=${encodeURIComponent(r.objet)}&body=${encodeURIComponent(r.corps)}`} onClick={gestes.tracerRelance}
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-bord-doux px-4 text-[13px] text-craie hover:border-bord-vif hover:text-encre">
          <Mail className="h-3.5 w-3.5" /> Relancer le propriétaire
        </a>
      )}
    </div>
  );
}

/** Le transfert : on choisit l'analyste parmi ceux qui sont disponibles cette semaine. */
export function ChoixAnalyste({ c, gestes, onFermer }) {
  const { data, isLoading } = useQuery({ queryKey: ["m-analystes"], queryFn: () => base44.request("GET", "/api/mandataire/analystes"), staleTime: 60_000 });
  const analystes = data?.analystes || [];
  const disponibles = analystes.filter((a) => a.disponible);
  const [choisi, setChoisi] = useState(null);
  const [mot, setMot] = useState("");
  useEffect(() => { if (!choisi && disponibles.length === 1) setChoisi(disponibles[0].email); }, [disponibles.length]);
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  const nom = analystes.find((a) => a.email === choisi)?.nom;
  const envoyer = (analyste_email) => gestes.soumettre.mutate({ analyste_email, mot, nom: analystes.find((a) => a.email === analyste_email)?.nom || null }, { onSuccess: onFermer });
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/60 px-4 backdrop-blur-sm md:left-[var(--k-barre-largeur)]" onClick={onFermer}>
      <div role="dialog" aria-modal="true" aria-label="Transférer à Klocka" className="k-grid w-full max-w-[520px] rounded-[20px] border border-bord-vif p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="m-0 text-[20px] text-encre">Transférer à Klocka</p>
            <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-ardoise">« {c.bien} » part chez l'analyste que vous choisissez. Seuls ceux qui sont disponibles cette semaine peuvent le recevoir.</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 border-y border-trait">
          {isLoading && <p className="m-0 py-4 text-[13.5px] text-brume">Lecture des agendas…</p>}
          {analystes.map((a) => {
            const actif = a.email === choisi;
            return (
              <button key={a.email} type="button" disabled={!a.disponible} onClick={() => setChoisi(a.email)} aria-pressed={actif}
                className={`flex w-full items-center gap-3.5 border-t border-trait px-2 py-3.5 text-left first:border-t-0 ${a.disponible ? "hover:bg-surface" : "cursor-not-allowed opacity-40"}`}
                style={{ background: actif ? undefined : "transparent" }}>
                <span className={`grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full text-[12.5px] font-semibold ${a.disponible ? "bg-menthe/20 text-encre" : "bg-relief text-ardoise"}`}>
                  {a.photo ? <img src={a.photo} alt="" className="h-full w-full object-cover" /> : initiales(a.nom)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] ${a.disponible ? "text-encre" : "text-ardoise"}`}>{a.nom}</span>
                  <span className="block text-[12.5px] text-ardoise">{a.raison}</span>
                </span>
                {a.disponible && (
                  <span className={`grid h-5 w-5 flex-none place-items-center rounded-full border ${actif ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif"}`}>
                    {actif && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!isLoading && !disponibles.length && (
          <p className="m-0 mt-4 text-[13px] leading-[1.55] text-craie">Aucun analyste n'a encore connecté son agenda pour cette semaine. Vous pouvez transférer quand même : Klocka attribuera le dossier.</p>
        )}
        <label className="mt-4 flex flex-col gap-1.5">
          <span className="text-[12.5px] text-ardoise">Un mot pour l'analyste (facultatif)</span>
          <textarea value={mot} onChange={(e) => setMot(e.target.value)} rows={2} placeholder="Le propriétaire attend une réponse avant fin octobre…"
            className="resize-none rounded-[10px] border border-bord-doux bg-surface px-3.5 py-2.5 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
        </label>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onFermer} className="inline-flex h-10 items-center rounded-full border border-bord-doux px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
          {disponibles.length ? (
            <button type="button" onClick={() => envoyer(choisi)} disabled={!choisi || gestes.soumettre.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              {gestes.soumettre.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} {nom ? `Transférer à ${nom}` : "Choisissez un analyste"}
            </button>
          ) : !isLoading && (
            <button type="button" onClick={() => envoyer(null)} disabled={gestes.soumettre.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
              {gestes.soumettre.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Transférer quand même
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function PastilleStatut({ c, cote }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-[5px] text-[12px] text-craie">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: teinteStatut(c.statut) }} />{STATUTS[cote][c.statut] || c.statut}
    </span>
  );
}

/** À droite de la conversation : le bien, où il en est, ses pièces. */
export function Resume({ c, cote, onDossier = null, onAnalyse = null }) {
  const klocka = cote === "klocka";
  const gestes = useGestes(c);
  const modifiable = !klocka && MODIFIABLES.includes(c.statut);
  return (
    <aside className="k-grid flex w-[360px] flex-none flex-col gap-[18px] overflow-y-auto px-6 py-[22px] max-lg:w-full max-lg:border-t max-lg:border-trait">
      <div className="flex flex-col gap-1.5">
        <p className="m-0 text-[22px] font-medium tracking-[-0.01em] text-encre">{c.bien}</p>
        <p className="m-0 text-[13px] text-ardoise">{klocka ? `${c.mandataire_nom} · suivi par ${c.analyste_nom || "personne encore"}` : c.analyste_nom ? `Suivi par ${c.analyste_nom} chez Klocka` : c.adresse || "Pas encore d'analyste attitré"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2.5">
        <PastilleStatut c={c} cote={cote} />
        {klocka && c.deal_id && !onAnalyse && <Link to={`/Analyse?deal_id=${c.deal_id}&vue=analyse`} className="inline-flex h-[34px] items-center rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre">Ouvrir l'analyse</Link>}
        {onDossier && <button type="button" onClick={onDossier} className="inline-flex h-[34px] items-center rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Voir le dossier</button>}
      </div>
      {klocka && !c.deal_id && <p className="m-0 -mt-2 text-[12.5px] text-brume">L'analyse s'ouvre quand le mandataire transfère le dossier.</p>}
      {!!c.photos?.length && (
        <div className="flex flex-col gap-2">
          <p className={etiquette}>Photos · {c.photos.length}</p>
          <div className="grid grid-cols-3 gap-1.5">
            {c.photos.slice(0, 6).map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-[8px] border border-trait"><img src={p.url} alt={p.nom} className="h-full w-full object-cover" /></a>)}
          </div>
        </div>
      )}
      <Pieces c={c} />
      {modifiable && <Envoi c={c} gestes={gestes} />}
      {klocka && c.statut === "en_etude" && <DecisionMandataire dossierId={c.id} />}
    </aside>
  );
}

/** Le dossier en entier : ce qu'on sait du bien, ses photos, son estimation, son mandat, ses pièces. */
export function FicheDossier({ c, cote, etroit = false, estimations = [], onSupprime = null, droite = null }) {
  const klocka = cote === "klocka";
  const gestes = useGestes(c);
  const modifiable = !klocka && MODIFIABLES.includes(c.statut);
  const issue = ISSUES[c.statut] || null;
  const infos = [
    ["Adresse", c.adresse],
    ["Propriétaire", [c.proprietaire, c.proprietaire_email].filter(Boolean).join(" · ") || null],
    ["Prix", euros(c.prix)],
    [klocka ? "Mandataire" : null, klocka ? c.mandataire_nom : null],
    ["Analyste Klocka", c.analyste_nom],
  ].filter(([k, v]) => k && v);
  return (
    <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
      <div className={`grid items-start gap-8 px-8 py-7 max-md:px-5 ${etroit ? "" : "lg:grid-cols-[minmax(0,1fr)_420px]"}`}>
        <div className="flex min-w-0 flex-col gap-6">
          <EnteteDossier c={c} cote={cote}>
            {klocka && c.deal_id && <Link to={`/Analyse?deal_id=${c.deal_id}`} className="inline-flex h-[34px] items-center rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre">Ouvrir l'analyse</Link>}
            {modifiable && <Envoi c={c} gestes={gestes} />}
          </EnteteDossier>
          {(klocka || c.transfere) && <Frise etapes={ETAPES} statut={issue ? "decision" : c.statut} issue={issue} />}
          {c.statut === "complements" && <MotDeKlocka texte={`Compléments demandés : ${c.commentaire || ""}`} />}
          {c.statut === "no_go" && <MotDeKlocka texte={`No-go : ${c.commentaire || ""}`} teinte="alerte" />}
          {c.statut === "go" && <MotDeKlocka texte={`Go : le bien part vers les investisseurs.${c.commentaire ? ` ${c.commentaire}` : ""}`} teinte="menthe" />}
          {!!infos.length && (
            <dl className="m-0 grid gap-x-8 gap-y-4 rounded-[18px] border border-trait bg-rail px-5 py-[18px] sm:grid-cols-2">
              {infos.map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-[12px] text-brume">{k}</dt>
                  <dd className="m-0 mt-0.5 break-words text-[14px] text-encre">{v}</dd>
                </div>
              ))}
            </dl>
          )}
          <Photos c={c} gestes={klocka ? null : gestes} />
          {!klocka && (
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <Estimation c={c} estimations={estimations} gestes={gestes} />
              <Mandat c={c} />
            </div>
          )}
          {klocka && c.statut === "en_etude" && <DecisionMandataire dossierId={c.id} />}
          {(klocka || !c.transfere) && <SupprimerDossier c={c} klocka={klocka} onSupprime={onSupprime} />}
        </div>
        {droite || (
          <div className="k-grid rounded-[20px] border border-trait px-6 py-5">
            <Pieces c={c} gestes={!klocka && ajoutPossible(c) ? gestes : null} />
            {!klocka && ajoutPossible(c) && <p className="m-0 mt-3 text-[12.5px] text-brume">Vous pouvez aussi glisser un fichier dans la conversation : il se range ici.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

const etiquette = "m-0 text-[11px] uppercase tracking-[.14em] text-brume";

/**
 * Le haut du dossier ouvert, au dessin des cartes de « Vos dossiers » :
 * grille de points avec l'état et la dernière activité, puis le
 * bien, ses chiffres, ses pièces obligatoires et le geste qui suit.
 */
function EnteteDossier({ c, cote, children }) {
  const klocka = cote === "klocka";
  const k = c.carte || {};
  const requises = c.checklist.lignes.filter((l) => l.requise);
  const recues = requises.filter((l) => l.recue).length;
  const lieu = [k.ville, k.surface_m2 ? `${k.surface_m2} m²` : null].filter(Boolean).join(" · ") || c.adresse || "Adresse à compléter";
  const chiffre = (v) => (v ? euros(v) : <span className="text-brume">À compléter</span>);
  return (
    <article className="flex flex-col overflow-hidden rounded-[18px] border border-trait bg-rail">
      <div className="k-grid k-grid-toujours relative h-[112px] flex-none border-b border-trait">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: teinteStatut(c.statut) }} />{STATUTS[cote][c.statut] || c.statut}
        </span>
        {c.activite && <span className="absolute right-4 top-[18px] text-[12px] text-brume">{quand(c.activite)}</span>}
      </div>
      <div className="flex flex-col px-5 pb-5 pt-[18px]">
        <p className="m-0 text-[20px] font-medium tracking-[-0.01em] text-encre">{c.bien}</p>
        <p className="m-0 mt-1 text-[13px] text-ardoise">{lieu}</p>
        {!klocka && <p className="m-0 mt-1 text-[13px] text-brume">{c.transfere ? `Transféré à Klocka${c.en_etude_le ? ` le ${jour(c.en_etude_le)}` : ""}` : "Chez vous : Klocka ne le voit pas encore"}</p>}
        <div className="mt-3.5 grid grid-cols-2 gap-2.5">
          <div><p className="m-0 text-[12px] text-brume">Loyer annuel</p><p className="m-0 mt-0.5 text-[15px] tabular-nums text-encre">{chiffre(k.loyer_annuel)}</p></div>
          <div><p className="m-0 text-[12px] text-brume">Prix demandé</p><p className="m-0 mt-0.5 text-[15px] tabular-nums text-encre">{chiffre(k.prix || c.prix)}</p></div>
        </div>
        {!!requises.length && (
          <div className="mt-3.5">
            <div className="flex justify-between text-[12px] text-ardoise"><span>Pièces obligatoires</span><span className="tabular-nums">{recues} / {requises.length}</span></div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-encre/[0.12]">
              <div className="h-full rounded-full bg-menthe" style={{ width: `${(recues / requises.length) * 100}%` }} />
            </div>
          </div>
        )}
        {children && <div className="mt-4 flex flex-wrap items-start gap-3 [&>*]:min-w-[240px] [&>*]:flex-1">{children}</div>}
      </div>
    </article>
  );
}

/** Supprimer le dossier, et avec lui sa conversation. */
function SupprimerDossier({ c, klocka, onSupprime }) {
  const queryClient = useQueryClient();
  const supprimer = useMutation({
    mutationFn: () => base44.request("DELETE", klocka ? `/api/mandataire/admin/dossiers/${c.id}` : `/api/mandataire/dossiers/${c.id}`),
    onSuccess: () => {
      for (const cle of [["m-dossiers"], ["k-conversations"], ["preanalyse-pipeline"]]) queryClient.invalidateQueries({ queryKey: cle });
      toast.success(`« ${c.bien} » est supprimé, avec sa conversation`);
      onSupprime?.();
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });
  const demander = () => {
    const quoi = klocka
      ? `Supprimer « ${c.bien} » ? Son dossier d'analyse, ses pièces, ses photos et la conversation avec ${c.mandataire_nom} partent avec lui. Le mandataire ne le verra plus. C'est définitif.`
      : `Supprimer « ${c.bien} » ? Ses pièces, ses photos et sa conversation partent avec lui. C'est définitif.`;
    if (window.confirm(quoi)) supprimer.mutate();
  };
  return (
    <div className="border-t border-trait pt-4">
      <button type="button" onClick={demander} disabled={supprimer.isPending}
        className="inline-flex items-center gap-1.5 text-[13px] text-brume hover:text-alerte disabled:opacity-50" style={{ background: "transparent" }}>
        {supprimer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Supprimer le dossier et sa conversation
      </button>
    </div>
  );
}

/** Les photos du bien : on les ajoute ici (ou en les glissant), le projet les reprend au Go. */
function Photos({ c, gestes = null }) {
  const ref = useRef(null);
  const [survol, setSurvol] = useState(false);
  const photos = c.photos || [];
  if (!gestes && !photos.length) return null;
  const ajouter = (liste) => { const images = [...(liste || [])].filter((f) => /^image\//.test(f.type)); if (images.length) gestes.photo.mutate(images); };
  return (
    <div className="flex flex-col gap-3"
      onDragOver={(e) => { if (gestes && e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
      onDrop={(e) => { if (!gestes) return; e.preventDefault(); setSurvol(false); ajouter(e.dataTransfer?.files); }}>
      <div className="flex items-center justify-between gap-3">
        <p className={etiquette}>Photos du bien{photos.length ? ` · ${photos.length}` : ""}</p>
        {gestes && (
          <>
            <input ref={ref} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { ajouter(e.target.files); e.target.value = ""; }} />
            <button type="button" onClick={() => ref.current?.click()} disabled={gestes.photo.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-50" style={{ background: "transparent" }}>
              {gestes.photo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter des photos
            </button>
          </>
        )}
      </div>
      {photos.length ? (
        <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4 rounded-[14px] ${survol ? "outline-dashed outline-1 outline-menthe" : ""}`}>
          {photos.map((p) => (
            <div key={p.url} className="group relative aspect-[4/3] overflow-hidden rounded-[12px] border border-trait bg-surface">
              <a href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.nom} className="h-full w-full object-cover" /></a>
              {gestes && (
                <button type="button" onClick={() => gestes.retirerPhoto.mutate(p.url)} aria-label={`Retirer ${p.nom}`} title="Retirer la photo"
                  className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-fond/80 text-craie opacity-0 hover:text-alerte group-hover:opacity-100 max-md:opacity-100">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className={`grid h-28 place-items-center rounded-[14px] border border-dashed text-[13px] text-ardoise hover:border-menthe hover:text-craie ${survol ? "border-menthe" : "border-bord-vif"}`} style={{ background: "transparent" }}>
          Glissez les photos du bien ici, ou cliquez pour les choisir.
        </button>
      )}
    </div>
  );
}

/** L'estimation du bien : celle qu'on a liée (ou retrouvée par le nom du bien). */
function Estimation({ c, estimations, gestes }) {
  const e = c.estimation;
  const mots = { brouillon: "En questions", prete: "Avis prêt", envoye: "Envoyé au propriétaire", validation: "En validation" };
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[18px] border border-trait bg-rail px-5 py-[18px]">
      <p className="m-0 text-[12px] text-brume">Estimation</p>
      {e ? (
        <>
          <p className="m-0 text-[15px] tabular-nums text-encre">{e.prix_bas ? `${euros(e.prix_bas)} – ${euros(e.prix_haut)}` : e.bien}</p>
          <p className="m-0 text-[12.5px] text-ardoise">{[e.prix_bas ? e.bien : null, mots[e.statut] || e.statut].filter(Boolean).join(" · ")}</p>
          <Link to={`/EstimationMandataire?estimation=${e.id}`} className="text-[13px] text-menthe hover:underline">Ouvrir l'estimation</Link>
        </>
      ) : (
        <p className="m-0 text-[13px] text-ardoise">Aucune estimation liée.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {!!estimations.length && (
          <label className="relative inline-flex h-8 min-w-0 max-w-full items-center rounded-full border border-bord-doux text-[12.5px] text-craie hover:border-bord-vif">
            <select value="" onChange={(ev) => ev.target.value && gestes.lierEstimation.mutate(ev.target.value === "aucune" ? null : ev.target.value)} aria-label="Lier une estimation"
              className="h-full w-full min-w-0 max-w-[260px] cursor-pointer appearance-none truncate rounded-full bg-transparent pl-3 pr-7 text-[12.5px] text-craie outline-none">
              <option value="">{e ? "Changer…" : "Lier une estimation…"}</option>
              {estimations.filter((x) => x.id !== e?.id).map((x) => <option key={x.id} value={x.id}>{x.bien}</option>)}
              {e && <option value="aucune">Aucune</option>}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 h-3 w-3" />
          </label>
        )}
        {!e && <Link to="/EstimationMandataire" className="text-[12.5px] text-ardoise hover:text-encre">Estimer ce bien</Link>}
      </div>
    </div>
  );
}

/** Le mandat d'où vient le dossier, s'il y en a un. */
function Mandat({ c }) {
  const m = c.mandat;
  const mots = { demande_envoyee: "Demandé", pret: "Prêt à signer", signe: "Signé", enregistre: "Inscrit au registre" };
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-[18px] border border-trait bg-rail px-5 py-[18px]">
      <p className="m-0 text-[12px] text-brume">Mandat</p>
      {m ? (
        <>
          <p className="m-0 text-[15px] text-encre">{m.numero ? `N° ${m.numero}` : `Mandat ${m.type || "de vente"}`}</p>
          <p className="m-0 text-[12.5px] text-ardoise">{[mots[m.statut] || m.statut, euros(m.prix)].filter(Boolean).join(" · ")}</p>
          <Link to={`/MandatMandataire?mandat=${m.id}`} className="text-[13px] text-menthe hover:underline">Ouvrir le mandat</Link>
        </>
      ) : (
        <>
          <p className="m-0 text-[13px] text-ardoise">Aucun mandat : le dossier a été ouvert à la main.</p>
          <Link to="/MandatMandataire" className="text-[12.5px] text-ardoise hover:text-encre">Préparer le mandat</Link>
        </>
      )}
    </div>
  );
}

/** Créer un dossier (mandataire) : le bien et son propriétaire, le reste viendra. */
export function NouveauDossier({ onCree, onAnnuler }) {
  const queryClient = useQueryClient();
  const [f, setF] = useState({ bien: "", adresse: "", proprietaire: "", proprietaire_email: "", prix: "", loyer_annuel: "", surface_m2: "" });
  const nombre = (v) => Number(String(v).replace(/[^\d]/g, "")) || null;
  const creer = useMutation({
    mutationFn: () => base44.request("POST", "/api/mandataire/dossiers", { body: { ...f, prix: nombre(f.prix), loyer_annuel: nombre(f.loyer_annuel), surface_m2: nombre(f.surface_m2) } }),
    onSuccess: (r) => { queryClient.invalidateQueries({ queryKey: ["m-dossiers"] }); toast.success("Dossier créé : déposez les pièces, posez vos questions"); onCree(r.dossier.id); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const champs = [["bien", "Le bien", "Boulangerie Martin"], ["adresse", "Adresse", "12 rue Carnot, Mâcon"], ["proprietaire", "Propriétaire", "M. Martin"], ["proprietaire_email", "Mail du propriétaire", "pour la relance"], ["prix", "Prix demandé", "310 000 €"], ["loyer_annuel", "Loyer annuel", "21 600 €"], ["surface_m2", "Surface (m²)", "90"]];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <form className="mx-auto flex max-w-[640px] flex-col gap-5 px-6 py-10" onSubmit={(e) => { e.preventDefault(); if (f.bien.trim()) creer.mutate(); }}>
        <div>
          <p className="m-0 text-[24px] font-medium tracking-[-0.01em] text-encre">Nouveau dossier</p>
          <p className="m-0 mt-1.5 text-[14px] leading-[1.6] text-craie">Le bien et son propriétaire suffisent pour commencer. Un dossier s'ouvre aussi tout seul quand un mandat est signé.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {champs.map(([k, mot, ph]) => (
            <label key={k} className={`flex flex-col gap-1.5 ${k === "bien" ? "sm:col-span-2" : ""}`}>
              <span className="text-[12.5px] text-ardoise">{mot}</span>
              <input value={f[k]} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} placeholder={ph} autoFocus={k === "bien"}
                className="h-11 rounded-[10px] border border-bord-doux bg-surface px-3.5 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <button type="submit" disabled={creer.isPending || !f.bien.trim()} className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
            {creer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Créer le dossier
          </button>
          {onAnnuler && <button type="button" onClick={onAnnuler} className="inline-flex h-10 items-center rounded-full border border-bord-doux px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>Annuler</button>}
        </div>
      </form>
    </div>
  );
}
