import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { CircleHelp, Eye, Maximize2, PencilLine, Search, X } from "lucide-react";

// La première visite d'un client sur sa présentation (13 oct. 2026, Jules) :
// ce que font les trois modes, comment présenter en plein écran, que tout
// s'enregistre seul, et où poser une question. Une fois lue, elle ne revient
// pas (ce navigateur s'en souvient) ; le « ? » de la barre la rouvre.

export const CLE_VISITE = "klocka.presentation-client.visite";
export const visiteVue = () => { try { return localStorage.getItem(CLE_VISITE) === "1"; } catch { return false; } };
const noterVue = () => { try { localStorage.setItem(CLE_VISITE, "1"); } catch { /* navigation privée : elle reviendra */ } };

const ETAPES = [
  [PencilLine, "Éditeur", "Cliquez un texte, un chiffre ou une photo pour le modifier, directement sur la diapositive."],
  [Eye, "Lecture", "Feuilletez la présentation comme à l'écran : flèches, sommaire, et ← → au clavier."],
  [Search, "Sources", "Vérifiez chaque chiffre en un coup d'œil : passez la souris dessus, sa source s'affiche."],
  [Maximize2, "Plein écran", "Présentez directement depuis l'application, sans rien télécharger."],
];

export default function VisitePresentation({ onFermer }) {
  const fermer = () => { noterVue(); onFermer(); };
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") fermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  });
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/70 p-4 backdrop-blur-sm" onMouseDown={fermer}>
      <div className="w-full max-w-[560px] rounded-[18px] border border-bord-vif bg-surface-pleine p-7 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:p-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] uppercase tracking-[0.16em] text-menthe">Votre présentation</p>
            <h2 className="m-0 mt-2 text-[22px] font-normal tracking-[-0.01em] text-encre">Tout se fait ici</h2>
          </div>
          <button type="button" onClick={fermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="mt-5 border-y border-trait">
          {ETAPES.map(([Icone, titre, texte]) => (
            <div key={titre} className="flex gap-4 border-t border-trait py-3.5 first:border-t-0">
              <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-relief text-menthe"><Icone className="h-4 w-4" /></span>
              <span className="min-w-0">
                <span className="block text-[15px] text-encre">{titre}</span>
                <span className="mt-0.5 block text-[13.5px] leading-[1.5] text-ardoise">{texte}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="m-0 mt-4 text-[13.5px] leading-[1.6] text-ardoise">Vos modifications sont enregistrées automatiquement, sans rien à faire. Une question ? Le bouton <span className="inline-flex items-center gap-1 text-encre"><CircleHelp className="h-3.5 w-3.5" />Une question</span> l'envoie à l'équipe Klocka.</p>
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={fermer} className="inline-flex h-10 items-center rounded-full bg-menthe px-5 text-[13.5px] text-sur-menthe hover:bg-menthe-survol">C'est parti</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
