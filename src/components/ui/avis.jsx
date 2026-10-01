/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import React from "react";
import { toast as sonner, Toaster as SonnerToaster } from "sonner";
import { Check, CircleAlert, TriangleAlert, Info, LoaderCircle, X } from "lucide-react";
import { J } from "@/design/jetons";

// Les avis de l'application : la carte qui apparaît en haut de l'écran quand
// quelque chose s'est passé. Une seule forme pour les cinq tons, reprise de la
// maquette : une pastille d'icône teintée, un titre, une phrase d'explication,
// parfois un bouton pour aller voir, et un filet coloré qui s'écoule au bas de
// la carte pendant le temps qu'elle reste affichée.
//
// Tout passe par sonner pour l'empilement et les minuteurs ; le dessin est à
// nous. Les pages importent `toast` depuis ce fichier, pas depuis sonner :
// l'API est la même (`toast.success(titre, { description })`), le dessin est
// celui de Klocka.

const TONS = {
  succes: { teinte: J["menthe"], Icone: Check, mot: "Succès" },
  erreur: { teinte: J["alerte"], Icone: CircleAlert, mot: "Erreur" },
  avertissement: { teinte: J["ambre"], Icone: TriangleAlert, mot: "Avertissement" },
  information: { teinte: "#7896eb", Icone: Info, mot: "Information" },
  en_cours: { teinte: J["ardoise"], Icone: LoaderCircle, mot: "En cours" },
};

const DUREES = { erreur: 7000, avertissement: 6000, en_cours: Infinity };
const dureeDe = (ton, d) => (d != null ? d : DUREES[ton] != null ? DUREES[ton] : 4500);

/**
 * La carte d'un avis (maquette du 1er octobre 2026) : la pastille K de
 * l'assistante à gauche, un titre, la phrase qui explique, un bouton plein
 * pour aller voir, la croix en haut à droite. Le ton se lit à un point
 * coloré sur la pastille (alerte, avertissement) ou à un sablier (en cours) :
 * la carte, elle, reste la même pour tout.
 *
 * @param {{ton?:string, titre:React.ReactNode, description?:React.ReactNode,
 *   action?:{mot:string, faire:Function}, duree?:number, progression?:number,
 *   onFermer?:Function}} p
 * `poser` accepte aussi `surFermeture` : appelé quand la personne ferme la
 * carte à la croix, pour qu'un suivi en cours ne la repose pas aussitôt.
 */
export function Avis({ ton = "information", titre, description = null, action = null, progression = null, onFermer = null }) {
  const { teinte } = TONS[ton] || TONS.information;
  const signal = ton === "erreur" || ton === "avertissement";
  return (
    <div
      role="status"
      className="relative w-[min(440px,calc(100vw-32px))] overflow-hidden rounded-[20px] border border-trait bg-surface-pleine py-5 pl-5 pr-12 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.75)]"
    >
      <div className="flex items-start gap-4">
        <span className="relative mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-[11px] border border-trait text-[15px] text-craie" style={{ background: J["fond"] }}>
          {ton === "en_cours" ? <LoaderCircle className="h-4 w-4 animate-spin" /> : "K"}
          {signal && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2" style={{ background: teinte, borderColor: J["surface-pleine"] }} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[16px] font-medium leading-snug text-encre" style={signal ? { color: teinte } : undefined}>{titre}</div>
          {description && <div className="mt-1 text-[14px] leading-[1.55] text-craie">{description}</div>}
          {action && (
            <button
              type="button"
              onClick={() => { action.faire?.(); onFermer?.(); }}
              className="mt-3.5 inline-flex h-10 items-center rounded-full px-5 text-[14px] font-medium transition-opacity hover:opacity-90"
              style={{ background: J["menthe-pale"], color: J["sur-menthe-pale"] }}
            >
              {action.mot}
            </button>
          )}
        </div>
      </div>
      {onFermer && (
        <button
          type="button"
          aria-label="Fermer"
          onClick={() => onFermer()}
          className="k-avis-fermer absolute right-4 top-4 grid h-7 w-7 place-items-center rounded-full text-ardoise transition-colors hover:text-encre"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {progression != null && (
        <span className="absolute bottom-0 left-0 h-[2px] w-full origin-left" style={{ background: J["menthe"], transform: `scaleX(${Math.max(0, Math.min(1, progression))})` }} />
      )}
    </div>
  );
}

// Le bouton s'écrit `{ mot, faire }` chez nous, `{ label, onClick }` chez
// sonner : les pages déjà écrites utilisent la seconde forme, on accepte les
// deux.
const boutonDe = (a) => (a ? { mot: a.mot || a.label, faire: a.faire || a.onClick } : null);

/** Pose un avis. Rend l'identifiant sonner, pour le remplacer ou le fermer. */
export function poser(ton, titre, o = {}) {
  const duree = dureeDe(ton, o.duration);
  return sonner.custom(
    (id) => (
      <Avis
        ton={ton}
        titre={titre}
        description={o.description}
        action={boutonDe(o.action)}
        duree={duree}
        progression={o.progression}
        onFermer={() => { o.surFermeture?.(); sonner.dismiss(id); }}
      />
    ),
    { id: o.id, duration: duree, className: o.className, position: o.position },
  );
}

/** Les cinq tons, nommés en français. */
export const avis = {
  succes: (titre, o) => poser("succes", titre, o),
  erreur: (titre, o) => poser("erreur", titre, o),
  avertissement: (titre, o) => poser("avertissement", titre, o),
  information: (titre, o) => poser("information", titre, o),
  enCours: (titre, o) => poser("en_cours", titre, o),
  fermer: (id) => sonner.dismiss(id),
};

/** La même chose sous les noms de sonner, pour les pages déjà écrites. */
export const toast = Object.assign((titre, o) => poser("information", titre, o), {
  success: avis.succes,
  error: avis.erreur,
  warning: avis.avertissement,
  info: avis.information,
  message: avis.information,
  loading: avis.enCours,
  custom: sonner.custom,
  dismiss: sonner.dismiss,
});

/** Le calque qui empile les avis, en haut à droite. */
export function Toaster(props) {
  return <SonnerToaster position="top-right" gap={12} offset={20} toastOptions={{ unstyled: true }} {...props} />;
}
