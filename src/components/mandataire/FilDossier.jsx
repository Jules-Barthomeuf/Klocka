import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ArrowUp, Check, Loader2, Paperclip, Sparkles, Square, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { devinerPiece } from "@/lib/pieces-dossier";
import Chargement from "@/components/ui/Chargement";
import { entreeEnvoie } from "@/lib/entree-envoie";

// La conversation d'un dossier mandataire : le mandataire et son analyste
// Klocka, avec les événements du dossier (pièce reçue, envoi, décision,
// relais) en lignes grises. Côté mandataire, un fichier glissé ici se range
// dans la liste des pièces. Côté Klocka (`cote="analyste"`) : les notes
// internes, le briefing en tête, « Me briefer » et « Transférer à… ».
// Avec `api`, le même fil sert à un autre objet (le mandat, 27 oct. 2026) :
// sans briefing, ni transfert, ni note interne.

// Au dessin du chat de la plateforme (2 nov. 2026, Jules : « plus en accord avec le reste ») : une colonne de 760 px
// centrée, les bulles arrondies à 22 px (coin d'attache à 6 px), les pièces en cartes de 120 px avec leur type, les
// étapes en séparateurs, la saisie en pilule `barre` avec le trombone et l'envoi menthe. En pleine page, plus de cadre.
const typeDe = (nom) => (String(nom || "").match(/\.([a-z0-9]{2,4})$/i)?.[1] || "doc").toUpperCase();

function CartePiece({ p }) {
  return (
    <a href={p.url} target="_blank" rel="noreferrer" title={p.nom}
      className="relative block h-[120px] w-[120px] flex-none overflow-hidden rounded-[14px] border border-bord-doux bg-barre hover:border-bord-vif">
      <span className="grid h-full w-full place-items-center px-3 pb-6 text-center text-[12px] leading-[1.35] text-craie"><span className="line-clamp-3 break-all">{p.nom}</span></span>
      <span className="absolute bottom-2 left-2 rounded-[6px] bg-black/60 px-1.5 py-0.5 text-[11px] font-medium tracking-[.04em] text-white">{typeDe(p.nom)}</span>
    </a>
  );
}

const heure = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function FilDossier({ dossierId, api = null, titre = null, vide = null, cote = "mandataire", hauteur = "max-h-[460px]", plein = false, pieces = null, onPiece = null, enTete = null, sansCadre: sansCadreDemande = null }) {
  const queryClient = useQueryClient();
  const klocka = cote === "analyste";
  const gestesDossier = klocka && !api;
  const base = api || (klocka ? `/api/mandataire/admin/dossiers/${dossierId}` : `/api/mandataire/dossiers/${dossierId}`);
  const cle = ["fil-dossier", api || dossierId, cote];
  const { data, isLoading } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", `${base}/fil`), enabled: !!(api || dossierId), refetchInterval: 15_000 });
  const [texte, setTexte] = useState("");
  const [piece, setPiece] = useState(null);
  const [rangement, setRangement] = useState(null);
  const [interne, setInterne] = useState(false);
  const [survol, setSurvol] = useState(false);
  const fichier = useRef(null);
  const bas = useRef(null);
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: cle });
    queryClient.invalidateQueries({ queryKey: klocka ? ["k-conversations"] : ["m-dossiers"] });
    if (api) queryClient.invalidateQueries({ queryKey: klocka ? ["k-mandats"] : ["m-mandats"] });
  };
  useEffect(() => { bas.current?.scrollIntoView({ block: "nearest" }); }, [data?.messages?.length]);
  // Lire la conversation la marque lue : la liste et la pastille du menu suivent.
  useEffect(() => {
    if (data) queryClient.invalidateQueries({ queryKey: api ? (klocka ? ["k-mandats"] : ["m-mandats"]) : klocka ? ["k-conversations"] : ["m-dossiers"] });
  }, [data?.messages?.length, dossierId, api]);
  useEffect(() => { setTexte(""); setPiece(null); setRangement(null); setInterne(false); }, [dossierId, api]);

  const rangeable = !klocka && Array.isArray(pieces) && pieces.length > 0 && !!onPiece;
  const choisir = (f) => {
    if (!f) return;
    setPiece(f);
    setRangement(rangeable ? devinerPiece(f.name, pieces) : null);
  };

  const envoyer = useMutation({
    mutationFn: async () => {
      // Un fichier rangé devient une pièce du dossier (l'événement s'écrit
      // dans la conversation) ; le texte, s'il y en a, part comme message.
      if (piece && rangement) {
        await onPiece(rangement, piece);
        if (texte.trim()) {
          const f = new FormData();
          f.append("texte", texte.trim());
          await base44.request("POST", `${base}/fil`, { body: f, isForm: true });
        }
        return;
      }
      const f = new FormData();
      f.append("texte", texte.trim());
      if (piece) f.append("fichier", piece);
      if (gestesDossier && interne) f.append("interne", "1");
      return base44.request("POST", `${base}/fil`, { body: f, isForm: true });
    },
    onSuccess: () => { setTexte(""); setPiece(null); setRangement(null); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Message non envoyé"),
  });
  const transferer = useMutation({
    mutationFn: (email) => base44.request("POST", `${base}/transferer`, { body: { email } }),
    onSuccess: () => { rafraichir(); toast.success("Dossier transféré : le mandataire est prévenu"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const avancer = useMutation({
    mutationFn: (corps) => base44.request("POST", `${base}/avancement`, { body: corps }),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const briefer = useMutation({
    mutationFn: () => base44.request("POST", `${base}/briefing`),
    onSuccess: rafraichir,
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  // Le cadre s'affiche tout de suite ; seuls les messages attendent (27 oct. 2026, Jules : « ça prend trop de temps »).
  const messages = data?.messages || [];
  const dernierBriefing = klocka ? [...messages].reverse().find((m) => m.genre === "briefing") : null;
  const visibles = messages.filter((m) => m.genre !== "briefing");
  const peutEnvoyer = (texte.trim() || piece) && !envoyer.isPending;
  const soumettre = () => { if (peutEnvoyer) envoyer.mutate(); };
  // Le mandat du mandataire en pleine page : ni cadre ni titre, l'onglet de la page dit « Conversation ». L'équipe le
  // demande aussi pour le mandat et l'estimation (2 nov. 2026, Jules : « comme du côté mandataire, le même style »).
  const sansCadre = sansCadreDemande ?? (plein && !!api && !klocka);

  return (
    <div className={`relative flex flex-col ${plein ? "h-full min-h-0" : ""} ${sansCadre ? "" : "rounded-[16px] border border-trait bg-rail"}`}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer?.files?.[0]); }}>
      {!sansCadre && <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-trait px-4 py-3">
        <p className="m-0 text-[13.5px] text-encre">
          {titre || (klocka ? "Conversation avec le mandataire" : "Votre analyste Klocka")}
          {data?.analyste && <span className="text-ardoise"> · {data.analyste.nom}{data.relais ? " (relais)" : ""}</span>}
          {data?.equipe && <span className="text-ardoise"> · {klocka ? "toute l'équipe peut répondre" : "l'équipe Klocka"}</span>}
        </p>
        {gestesDossier && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => briefer.mutate()} disabled={briefer.isPending}
              className="inline-flex items-center gap-1.5 rounded-full border border-bord-doux px-3 py-1 text-[12px] text-craie hover:text-encre" style={{ background: "transparent" }}>
              {briefer.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} Me briefer
            </button>
            <label className="inline-flex items-center gap-1.5 text-[12px] text-ardoise">
              <ArrowRightLeft className="h-3 w-3" />
              <select value="" onChange={(e) => e.target.value && transferer.mutate(e.target.value)} disabled={transferer.isPending}
                className="rounded-full border border-bord-doux bg-transparent px-2 py-1 text-[12px] text-craie outline-none max-md:text-[16px]">
                <option value="">Transférer à…</option>
                {(data?.analystes || []).filter((a) => a.email !== data.analyste?.email).map((a) => <option key={a.email} value={a.email}>{a.nom}</option>)}
              </select>
            </label>
          </div>
        )}
      </div>}

      {/* L'avancement chez Klocka (28 oct. 2026, Jules) : l'analyste le coche ici, le mandataire le lit. */}
      {!api && data?.dossier?.envoye_klocka_le && (
        <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-trait px-4 py-2.5">
          {(data.etapes || []).map(([k, mot]) => {
            const fait = !!data.dossier.avancement?.[k];
            const classe = `inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[12.5px] ${fait ? "bg-menthe text-sur-menthe" : "border border-trait text-ardoise"}`;
            return klocka ? (
              <button key={k} type="button" aria-pressed={fait} disabled={avancer.isPending} onClick={() => avancer.mutate({ etape: k, fait: !fait })}
                className={`${classe} ${fait ? "hover:bg-menthe-survol" : "hover:text-encre"}`} style={fait ? undefined : { background: "transparent" }}>
                {fait && <Check className="h-3 w-3" />}{mot}
              </button>
            ) : (
              <span key={k} className={classe}>{fait && <Check className="h-3 w-3" />}{mot}</span>
            );
          })}
        </div>
      )}

      {dernierBriefing && (
        <div className="flex-none border-b border-trait bg-menthe/[0.08] px-4 py-3">
          <p className="m-0 flex items-center gap-1.5 text-[11.5px] uppercase tracking-[.1em] text-menthe"><Sparkles className="h-3 w-3" /> Briefing · {heure(dernierBriefing.le)}</p>
          <p className="m-0 mt-1.5 whitespace-pre-line text-[13px] leading-[1.6] text-craie">{dernierBriefing.texte.replace(/^Briefing pour [^:]+ : /, "")}</p>
        </div>
      )}

      {/* Ce que la page pose en tête du fil, centré sur sa colonne (les quatre temps du mandat, 2 nov. 2026). */}
      {enTete && <div className="flex-none px-4 pt-4"><div className="mx-auto w-full max-w-[760px]">{enTete}</div></div>}
      <div className={`${plein ? "min-h-0 flex-1" : hauteur} overflow-y-auto px-4 py-5`}>
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-5">
        {isLoading && <Chargement taille="petit" />}
        {!isLoading && !visibles.length && <p className="m-0 py-8 text-center text-[14px] text-brume">{vide || (klocka ? "Aucun message encore." : "Aucun message encore. Écrivez à votre analyste, ou glissez une pièce ici.")}</p>}
        {visibles.map((m) => {
          // Une étape du dossier ou du mandat : un séparateur, comme les étapes du chat.
          if (m.cote === "systeme") return (
            <div key={m.id} className="flex items-center gap-3">
              <span className="h-px flex-1 bg-bord-doux" />
              <span className="max-w-[80%] text-center text-[12.5px] leading-[1.5] text-brume">{m.texte} · {heure(m.le)}</span>
              <span className="h-px flex-1 bg-bord-doux" />
            </div>
          );
          const moi = (klocka && m.cote === "analyste") || (!klocka && m.cote === "mandataire");
          const note = klocka && m.interne;
          // La couleur suit l'auteur, pas celui qui lit : la même bulle a la même teinte chez Klocka et chez le
          // mandataire (27 oct. 2026, Jules). Le mandataire en `barre`, Klocka en surface bordée ; la place (droite pour
          // soi) suit, elle, celui qui lit.
          const teinte = note ? "bg-ambre/10" : m.cote === "mandataire" ? "bg-barre" : "border border-trait bg-surface-pleine";
          return (
            <div key={m.id} className={`flex flex-col gap-1.5 ${moi ? "items-end" : "items-start"}`}>
              {(!moi || note) && <p className="m-0 px-1 text-[12.5px] text-ardoise">{m.cote === "analyste" ? m.auteur : "Mandataire"}{note ? " · note interne, invisible du mandataire" : ""}</p>}
              {(m.pieces || []).length > 0 && <div className={`flex max-w-[80%] flex-wrap gap-2 ${moi ? "justify-end" : ""}`}>{m.pieces.map((p) => <CartePiece key={p.url} p={p} />)}</div>}
              {m.texte && <div className={`max-w-[80%] whitespace-pre-line rounded-[22px] px-5 py-3.5 text-[15px] leading-[1.6] text-encre ${moi ? "rounded-br-[6px]" : "rounded-bl-[6px]"} ${teinte}`}>{m.texte}</div>}
              <p className="m-0 px-1 text-[11.5px] text-brume">{heure(m.le)}</p>
            </div>
          );
        })}
        <div ref={bas} />
        </div>
      </div>

      <form className={`flex-none px-3 pb-3 ${sansCadre ? "pt-1" : "border-t border-trait pt-3"}`} onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
        <div className="mx-auto w-full max-w-[760px]">
        {gestesDossier && (
          <div className="mb-2 flex gap-1 rounded-full bg-rail-actif p-1 text-[12px]" style={{ width: "fit-content" }}>
            {[[false, "Au mandataire"], [true, "Note interne"]].map(([v, mot]) => (
              <button key={mot} type="button" onClick={() => setInterne(v)} aria-pressed={interne === v}
                className={`rounded-full px-3 py-1 ${interne === v ? "bg-surface-pleine text-encre" : "text-ardoise"}`} style={interne === v ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
        )}
        {piece && (
          <div className="mb-2 rounded-[12px] border border-trait bg-surface-pleine px-3 py-2">
            <div className="flex items-center gap-2">
              <Paperclip className="h-3.5 w-3.5 flex-none text-ardoise" />
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-encre">{piece.name}</span>
              <button type="button" onClick={() => { setPiece(null); setRangement(null); }} aria-label="Retirer le fichier" title="Retirer le fichier" className="grid h-6 w-6 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
            </div>
            {rangeable && (
              <div className="mt-2">
                <p className="m-0 mb-1.5 text-[12px] text-ardoise">{rangement ? "Rangé dans le dossier comme :" : "C'est une pièce du dossier ? Choisissez laquelle :"}</p>
                <div className="flex flex-wrap gap-1.5">
                  {pieces.map((l) => (
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
        {/* La saisie du chat : une pilule `barre`, le trombone, le texte, l'envoi menthe. */}
        <div className="flex items-end gap-2 rounded-[20px] border border-trait bg-barre px-3 py-2.5 shadow-[0_12px_32px_rgb(0_0_0/0.07)] focus-within:border-bord-vif">
          <input ref={fichier} type="file" className="hidden" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fichier.current?.click()} aria-label="Joindre un fichier" title="Joindre un fichier" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise transition-colors hover:bg-barre-relief hover:text-encre" style={{ background: "transparent" }}>
            <Paperclip className="h-4 w-4" strokeWidth={1.7} />
          </button>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={1}
            placeholder={klocka ? (interne ? "Note pour l'équipe Klocka…" : "Écrire au mandataire…") : api ? "Votre message…" : "Écrire à votre analyste…"}
            onKeyDown={(e) => { if (entreeEnvoie(e)) { e.preventDefault(); soumettre(); } }}
            className="max-h-32 min-w-0 flex-1 resize-none border-none bg-transparent px-1 py-1.5 text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" style={{ background: "transparent" }} />
          <button type="submit" disabled={!peutEnvoyer} aria-label="Envoyer" title="Envoyer"
            className="grid h-9 w-9 flex-none place-items-center rounded-full text-encre transition-colors hover:text-menthe disabled:opacity-30" style={{ background: "transparent" }}>
            {envoyer.isPending ? <Square className="h-3 w-3" fill="currentColor" /> : <ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} />}
          </button>
        </div>
        </div>
      </form>

      {survol && (
        <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-[14px] border border-dashed border-menthe bg-fond/80 text-[14px] text-encre">
          {rangeable ? "Déposez le fichier : il se range dans le dossier" : "Déposez le fichier pour l'envoyer"}
        </div>
      )}
    </div>
  );
}
