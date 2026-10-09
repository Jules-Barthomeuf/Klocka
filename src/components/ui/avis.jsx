import React from "react";
import { toast as sonner, Toaster as SonnerToaster } from "sonner";
import { Check, CircleAlert, TriangleAlert, Info, LoaderCircle, X } from "lucide-react";
import { J } from "@/design/jetons";

// Les avis de l'application : la pilule qui apparaît en haut de l'écran, au
// centre, quand quelque chose s'est passé (un dossier transféré, un message
// reçu, une notification). Depuis le 9 oct. 2026, exactement la pilule des
// « boîtes connectées » du Dashboard : même hauteur, même texte, le petit
// point à gauche (vert, ambre ou rouge selon le ton), la phrase à droite,
// et une petite croix en haut à gauche pour la fermer.
//
// Tout passe par sonner pour l'empilement et les minuteurs ; le dessin est à
// nous. Les pages importent `toast` depuis ce fichier, pas depuis sonner :
// l'API est la même (`toast.success(titre, { description })`), le dessin est
// celui de Klocka.

const TONS = {
  succes: { teinte: J["vert"], Icone: Check, mot: "Succès" },
  erreur: { teinte: J["alerte"], Icone: CircleAlert, mot: "Erreur" },
  avertissement: { teinte: J["ambre"], Icone: TriangleAlert, mot: "Avertissement" },
  information: { teinte: J["vert"], Icone: Info, mot: "Information" },
  en_cours: { teinte: J["ardoise"], Icone: LoaderCircle, mot: "En cours" },
};

const DUREES = { erreur: 7000, avertissement: 6000, en_cours: Infinity };
const dureeDe = (ton, d) => (d != null ? d : DUREES[ton] != null ? DUREES[ton] : 4500);

/**
 * Un avis : la pilule des « boîtes connectées » (BoiteMail), à l'identique :
 * le point de 7 px, la phrase en 13,5 px, une précision éventuelle à la
 * suite, plus pâle, sur la même ligne, et « Voir » en lien quand il y a
 * quelque chose à ouvrir. La croix en haut à gauche, ou un clic sur la
 * pilule (hors du lien), la referme.
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
    <div className="relative flex w-full justify-center">
      <div
        role="status"
        aria-label={typeof titre === "string" ? `${mot} : ${titre}` : mot}
        onClick={() => onFermer?.()}
        className="relative inline-flex max-w-full cursor-default items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre"
      >
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onFermer?.(); }}
          aria-label="Fermer la notification"
          className="absolute -left-1.5 -top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full border border-trait bg-surface-pleine text-ardoise transition-colors hover:border-bord-doux hover:text-encre"
        >
          <X className="h-2.5 w-2.5" strokeWidth={2.4} />
        </button>
        {ton === "en_cours"
          ? <LoaderCircle className="h-[11px] w-[11px] flex-none animate-spin text-ardoise" />
          : <span className="h-[7px] w-[7px] flex-none rounded-full" style={{ background: teinte }} />}
        <span className="min-w-0 truncate">
          {titre}
          {description && <span className="text-ardoise"> · {description}</span>}
        </span>
        {action && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); action.faire?.(); onFermer?.(); }}
            className="ml-1 flex-none text-[13.5px] text-menthe transition-colors hover:text-menthe-clair"
            style={{ background: "transparent" }}
          >
            {action.mot}
          </button>
        )}
        {progression != null && (
          <span className="absolute inset-x-3 bottom-0 h-px origin-left" style={{ background: J["menthe"], transform: `scaleX(${Math.max(0, Math.min(1, progression))})` }} />
        )}
      </div>
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

/**
 * Le calque qui empile les avis, en haut au centre (9 oct. 2026). Au
 * téléphone, sous la barre du haut (et l'encoche) : posé dessus, l'avis
 * cachait le menu.
 */
export function Toaster(props) {
  return <SonnerToaster position="top-center" gap={10} offset={16} style={{ "--width": "min(560px, calc(100vw - 32px))" }} mobileOffset={{ top: "calc(3.5rem + env(safe-area-inset-top) + 8px)", left: 12, right: 12 }} toastOptions={{ unstyled: true }} {...props} />;
}
