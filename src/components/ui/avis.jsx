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
 * La carte d'un avis. Exportée pour les endroits qui veulent le même dessin
 * posé dans la page plutôt qu'en surimpression.
 *
 * @param {{ton?:string, titre:React.ReactNode, description?:React.ReactNode,
 *   action?:{mot:string, faire:Function}, duree?:number, progression?:number,
 *   onFermer?:Function}} p
 */
export function Avis({ ton = "information", titre, description = null, action = null, duree = null, progression = null, onFermer = null }) {
  const { teinte, Icone } = TONS[ton] || TONS.information;
  const anime = progression == null && duree != null && isFinite(duree);
  return (
    <div
      role="status"
      className="relative w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-[14px] border border-trait bg-surface px-[18px] py-4 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.9)]"
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-px grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] border"
          style={{ background: `${teinte}1f`, borderColor: `${teinte}3d`, color: teinte }}
        >
          <Icone className={`h-[15px] w-[15px] ${ton === "en_cours" ? "animate-spin" : ""}`} strokeWidth={2.5} />
        </span>

        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold leading-tight text-encre">{titre}</div>
          {description && <div className="mt-1 text-[12.5px] leading-[1.5] text-ardoise">{description}</div>}
        </div>

        {action && (
          <button
            type="button"
            onClick={() => { action.faire?.(); onFermer?.(); }}
            className="k-avis-action mt-px shrink-0 rounded-[9px] border border-bord-doux px-3.5 py-2 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre"
          >
            {action.mot}
          </button>
        )}

        {/* La croix ne se montre qu'au survol, et seulement s'il n'y a pas de
            bouton : sinon elle viendrait se poser dessus. */}
        {onFermer && !action && (
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => onFermer()}
            className="k-avis-fermer absolute right-2 top-2 rounded-md p-1 text-brume opacity-0 transition-opacity hover:text-encre"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <span
        className={`absolute bottom-0 left-0 h-[2px] w-full origin-left ${anime ? "k-avis-barre" : progression == null ? "k-avis-va-et-vient" : ""}`}
        style={{
          background: `linear-gradient(90deg, ${teinte} 0%, ${teinte}00 100%)`,
          animationDuration: anime ? `${duree}ms` : undefined,
          transform: progression != null ? `scaleX(${Math.max(0, Math.min(1, progression))})` : undefined,
        }}
      />
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
        onFermer={() => sonner.dismiss(id)}
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

/** Le calque qui empile les avis, en haut au centre. */
export function Toaster(props) {
  return <SonnerToaster position="top-center" gap={10} offset={18} toastOptions={{ unstyled: true }} {...props} />;
}
