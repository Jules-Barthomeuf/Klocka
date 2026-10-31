import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/avis";
import { Loader2, Maximize2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import DeckAvis from "@/components/mandataire/DeckAvis";
import { deckDeLAvis } from "@/lib/deck-avis";

// La présentation de l'avis de valeur (26 oct. 2026, Jules) : le deck que le mandataire montre au vendeur, construit sur
// l'avis de l'estimation (la même requête que l'aperçu de l'avis : un chiffre changé dans l'avis l'est dans le deck).
// Dans la page, à la place de l'avis (bascule « Avis · Présentation ») ; en plein écran pour le rendez-vous.

function useDeckDeLEstimation(id) {
  const { data, isLoading } = useQuery({
    queryKey: ["m-apercu", id],
    queryFn: () => base44.request("GET", `/api/mandataire/estimations/${id}/apercu`),
    enabled: !!id,
  });
  const deck = useMemo(() => (data?.avis ? deckDeLAvis({ avis: data.avis, estimation: data.estimation }) : null), [data]);
  return { deck, isLoading, provisoire: !!data?.provisoire, data };
}

/** Le deck plein écran, par-dessus tout : Échap ou la croix le referment. */
/** Pure : un téléphone tenu debout (le deck s'y pose couché, à lire téléphone tourné). */
const debout = () => typeof window !== "undefined" && window.innerHeight > window.innerWidth && window.innerWidth < 900;

export function PresentationPleinEcran({ id, onFermer }) {
  const { deck, isLoading } = useDeckDeLEstimation(id);
  const [vertical, setVertical] = useState(debout);
  useEffect(() => {
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const k = (e) => { if (e.key === "Escape") onFermer(); };
    const tourner = () => setVertical(debout());
    window.addEventListener("keydown", k);
    window.addEventListener("resize", tourner);
    window.addEventListener("orientationchange", tourner);
    // Au téléphone (27 oct. 2026, Jules : « en horizontal, ça prend tout l'écran ») : plein écran et paysage quand le
    // navigateur le permet (Android) ; sinon le deck se pose couché, et on tourne le téléphone pour le lire.
    if (window.innerWidth < 900) {
      document.documentElement.requestFullscreen?.().then(() => screen.orientation?.lock?.("landscape")).then(tourner).catch(() => {});
    }
    return () => {
      document.body.style.overflow = avant;
      window.removeEventListener("keydown", k);
      window.removeEventListener("resize", tourner);
      window.removeEventListener("orientationchange", tourner);
      try { screen.orientation?.unlock?.(); } catch { /* rien à rendre */ }
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onFermer]);
  // Debout : la scène prend la hauteur pour largeur et tourne d'un quart de tour ; le deck se mesure sur elle.
  const scene = vertical
    ? { position: "absolute", top: "50%", left: "50%", width: "100dvh", height: "100vw", transform: "translate(-50%, -50%) rotate(90deg)" }
    : { position: "absolute", inset: 0 };
  return createPortal(
    <div className="fixed inset-0 z-[95] overflow-hidden bg-black" role="dialog" aria-label="Présentation de l'avis de valeur">
      <div style={scene}>
        {deck ? <DeckAvis deck={deck} adresse tourne={vertical} /> : <div className="grid h-full place-items-center text-[14px] text-white/60">{isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Pas encore d'avis rédigé."}</div>}
        <button type="button" onClick={onFermer} aria-label="Fermer la présentation" title="Fermer (Échap)"
          className="absolute right-4 top-4 z-10 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white backdrop-blur hover:bg-white/20" style={vertical ? undefined : { marginTop: "env(safe-area-inset-top)" }}>
          <X className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  );
}

/** Le deck dans la page, à la place de l'avis, avec « Plein écran ». */
export default function PresentationAvis({ id, onPleinEcran, mode = "lecture", onPage = null }) {
  const { deck, isLoading, provisoire, data } = useDeckDeLEstimation(id);
  const queryClient = useQueryClient();
  // Une retouche du deck s'enregistre dans l'avis (`avis.deck`), comme une retouche de l'avis lui-même.
  const retoucher = async (cle, texte) => {
    if (!data?.avis || provisoire) { toast.error("L'avis n'est pas encore rédigé : le deck se retouche ensuite."); return; }
    const avis = { ...data.avis, deck: { ...(data.avis.deck || {}), [cle]: texte } };
    await enregistrer(avis);
  };
  // Retirer une page, ou les remettre toutes (26 oct. 2026) : les pages suivantes prennent sa place et son numéro.
  const masquer = async (cle) => {
    if (!data?.avis || provisoire) { toast.error("L'avis n'est pas encore rédigé : le deck se retouche ensuite."); return; }
    const avant = data.avis.deck?.masquees || [];
    const masquees = cle ? [...new Set([...avant, cle])] : [];
    await enregistrer({ ...data.avis, deck: { ...(data.avis.deck || {}), masquees } });
    if (cle) toast.success("Page retirée du deck", { action: { mot: "Annuler", faire: () => enregistrer({ ...data.avis, deck: { ...(data.avis.deck || {}), masquees: avant } }) } });
  };
  const enregistrer = async (avis) => {
    queryClient.setQueryData(["m-apercu", id], (d) => (d ? { ...d, avis } : d));
    try { await base44.request("PUT", `/api/mandataire/estimations/${id}/avis`, { body: { avis } }); }
    catch (e) { toast.error(e?.message || "Retouche non enregistrée"); queryClient.invalidateQueries({ queryKey: ["m-apercu", id] }); }
  };
  if (!id) return <p className="m-0 grid h-full place-items-center px-8 text-center text-[14px] text-ardoise">La présentation se construit sur l'avis de valeur : racontez la visite, l'Assistant KPartners rédige l'avis.</p>;
  if (isLoading) return <div className="grid h-full place-items-center"><Loader2 className="h-5 w-5 animate-spin text-menthe" /></div>;
  return (
    <div className="relative h-full min-h-0">
      {/* Les touches pilotent le deck en plein écran seulement : dans la page, elles restent au chat. */}
      {deck && <DeckAvis deck={deck} clavier={false} transparent edition={mode === "edition"} onRetouche={retoucher} onPage={onPage} onMasquer={masquer} />}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-2">
        {provisoire && <span className="rounded-full bg-white/10 px-3 py-1.5 text-[12.5px] text-white/80 backdrop-blur">Avis pas encore rédigé : chiffres provisoires</span>}
        <button type="button" onClick={onPleinEcran} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-[13px] text-white backdrop-blur hover:bg-white/20">
          <Maximize2 className="h-3.5 w-3.5" /> Plein écran
        </button>
      </div>
    </div>
  );
}
