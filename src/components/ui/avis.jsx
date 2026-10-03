import React from "react";
import { toast as sonner, Toaster as SonnerToaster } from "sonner";
import { Check, CircleAlert, TriangleAlert, Info, LoaderCircle } from "lucide-react";
import { J } from "@/design/jetons";

// Les avis de l'application : la pilule qui apparaît en haut de l'écran quand
// quelque chose s'est passé (un dossier transféré, un message reçu, une
// notification). Une seule forme pour les cinq tons : un point coloré, la
// phrase, et « Voir » quand il y a quelque chose à ouvrir.
//
// Tout passe par sonner pour l'empilement et les minuteurs ; le dessin est à
// nous. Les pages importent `toast` depuis ce fichier, pas depuis sonner :
// l'API est la même (`toast.success(titre, { description })`), le dessin est
// celui de Klocka.

const TONS = {
  succes: { teinte: J["vert"], Icone: Check, mot: "Succès" },
  erreur: { teinte: J["alerte"], Icone: CircleAlert, mot: "Erreur" },
  avertissement: { teinte: J["ambre"], Icone: TriangleAlert, mot: "Avertissement" },
  information: { teinte: J["menthe"], Icone: Info, mot: "Information" },
  en_cours: { teinte: J["ardoise"], Icone: LoaderCircle, mot: "En cours" },
};

const DUREES = { erreur: 7000, avertissement: 6000, en_cours: Infinity };
const dureeDe = (ton, d) => (d != null ? d : DUREES[ton] != null ? DUREES[ton] : 4500);

/**
 * Un avis (maquette du 3 octobre 2026) : une pilule sombre, un point coloré
 * pour le ton, la phrase, et à droite « Voir » quand il y a quelque chose à
 * ouvrir. Une précision éventuelle tient sur une ligne, sous la phrase. Un
 * clic sur la pilule (hors du bouton) la referme.
 *
 * @param {{ton?:string, titre:React.ReactNode, description?:React.ReactNode,
 *   action?:{mot:string, faire:Function}, duree?:number, progression?:number,
 *   onFermer?:Function}} p
 * `poser` accepte aussi `surFermeture` : appelé quand la personne ferme
 * l'avis, pour qu'un suivi en cours ne le repose pas aussitôt.
 */
export function Avis({ ton = "information", titre, description = null, action = null, progression = null, onFermer = null }) {
  const { teinte, mot } = TONS[ton] || TONS.information;
  return (
    <div
      role="status"
      aria-label={typeof titre === "string" ? `${mot} : ${titre}` : mot}
      onClick={() => onFermer?.()}
      className={`relative flex w-fit max-w-[min(520px,calc(100vw-32px))] cursor-default items-center gap-3.5 overflow-hidden border border-trait bg-surface-pleine py-2.5 pl-5 shadow-[0_18px_48px_-16px_rgba(0,0,0,0.8)] ${action ? "pr-2.5" : "pr-6"} ${description ? "rounded-[28px]" : "rounded-full"}`}
    >
      {ton === "en_cours"
        ? <LoaderCircle className="h-3.5 w-3.5 flex-none animate-spin text-ardoise" />
        : <span className="h-2.5 w-2.5 flex-none rounded-full" style={{ background: teinte, boxShadow: `0 0 10px ${teinte}` }} />}
      <div className={`min-w-0 flex-1 ${action ? "" : "py-1.5"}`}>
        <div className="truncate text-[16px] leading-snug text-encre">{titre}</div>
        {description && <div className="truncate text-[13px] leading-[1.45] text-ardoise">{description}</div>}
      </div>
      {action && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); action.faire?.(); onFermer?.(); }}
          className="h-11 flex-none rounded-full bg-relief px-5 text-[15px] text-encre transition-colors hover:bg-barre-relief"
        >
          {action.mot}
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
