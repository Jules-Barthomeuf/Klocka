import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, Check, Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { devinerPiece } from "@/lib/pieces-dossier";
import Chargement from "@/components/ui/Chargement";

// La conversation d'un dossier mandataire : le mandataire et son analyste
// Klocka, avec les événements du dossier (pièce reçue, envoi, décision,
// relais) en lignes grises. Côté mandataire, un fichier glissé ici se range
// dans la liste des pièces. Côté Klocka (`cote="analyste"`) : les notes
// internes, le briefing en tête, « Me briefer » et « Transférer à… ».
// Avec `api`, le même fil sert à un autre objet (le mandat, 27 oct. 2026) :
// sans briefing, ni transfert, ni note interne.

const heure = (d) => new Date(d).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function FilDossier({ dossierId, api = null, titre = null, vide = null, cote = "mandataire", hauteur = "max-h-[460px]", plein = false, pieces = null, onPiece = null }) {
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

  return (
    <div className={`relative flex flex-col rounded-[16px] border border-trait bg-rail ${plein ? "h-full min-h-0" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
      onDrop={(e) => { e.preventDefault(); setSurvol(false); choisir(e.dataTransfer?.files?.[0]); }}>
      <div className="flex flex-none flex-wrap items-center justify-between gap-2 border-b border-trait px-4 py-3">
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
      </div>

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

      <div className={`${plein ? "min-h-0 flex-1" : hauteur} space-y-3 overflow-y-auto px-4 py-4`}>
        {isLoading && <Chargement taille="petit" />}
        {!isLoading && !visibles.length && <p className="m-0 text-center text-[13px] text-brume">{vide || (klocka ? "Aucun message encore." : "Aucun message encore. Écrivez à votre analyste, ou glissez une pièce ici.")}</p>}
        {visibles.map((m) => {
          if (m.cote === "systeme") return <p key={m.id} className="m-0 text-center text-[12.5px] leading-[1.5] text-brume">{m.texte} · {heure(m.le)}</p>;
          const moi = (klocka && m.cote === "analyste") || (!klocka && m.cote === "mandataire");
          const note = klocka && m.interne;
          // La couleur suit l'auteur, pas celui qui lit : la même bulle a la même teinte chez Klocka et chez le
          // mandataire (27 oct. 2026, Jules). Le mandataire en `barre`, Klocka en surface bordée ; la place (droite pour
          // soi) suit, elle, celui qui lit.
          return (
            <div key={m.id} className={`flex ${moi ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-[14px] px-3.5 py-2.5 text-[14px] leading-[1.55] ${note ? "bg-ambre/10 text-encre" : m.cote === "mandataire" ? "bg-barre text-encre" : "border border-trait bg-surface-pleine text-encre"}`}>
                {(!moi || note) && <p className="m-0 mb-0.5 text-[12px] text-ardoise">{m.cote === "analyste" ? m.auteur : "Mandataire"}{note ? " · note interne, invisible du mandataire" : ""}</p>}
                {m.texte && <p className="m-0 whitespace-pre-line">{m.texte}</p>}
                {(m.pieces || []).map((p) => <a key={p.url} href={p.url} target="_blank" rel="noreferrer" className="mt-1 block text-[12.5px] text-menthe hover:underline">{p.nom}</a>)}
                <p className="m-0 mt-1 text-right text-[11px] text-brume">{heure(m.le)}</p>
              </div>
            </div>
          );
        })}
        <div ref={bas} />
      </div>

      <form className="flex-none border-t border-trait px-3 py-3" onSubmit={(e) => { e.preventDefault(); soumettre(); }}>
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
        <div className="flex items-end gap-2">
          <input ref={fichier} type="file" className="hidden" onChange={(e) => { choisir(e.target.files?.[0]); e.target.value = ""; }} />
          <button type="button" onClick={() => fichier.current?.click()} aria-label="Joindre un fichier" title="Joindre un fichier" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <Paperclip className="h-4 w-4" />
          </button>
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={1}
            placeholder={klocka ? (interne ? "Note pour l'équipe Klocka…" : "Écrire au mandataire…") : api ? "Votre message…" : "Écrire à votre analyste…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); soumettre(); } }}
            className="max-h-32 min-w-0 flex-1 resize-none rounded-[12px] border border-trait bg-surface-pleine px-3.5 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
          <button type="submit" disabled={!peutEnvoyer} aria-label="Envoyer" title="Envoyer"
            className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-sur-menthe disabled:opacity-40">
            {envoyer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
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
