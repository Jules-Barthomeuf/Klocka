import React, { useEffect, useRef, useState } from "react";
import { FlaskConical, PhoneIncoming } from "lucide-react";

// Le bouton « Rappel » et les gestes qui ouvrent l'écran « Il me rappelle » (27 nov. 2026) : à part de l'écran
// lui-même (RappelEntrant.jsx), qui emmène le mode appel, l'écran d'après l'appel et le chat. Le Layout montre ce
// bouton sur chaque page ; l'écran, lui, se charge après le premier affichage au lieu de peser sur l'entrée du site.

export const EVT = "klocka:il-me-rappelle";
// Le geste part vers l'écran « Il me rappelle » (RappelEntrant), chargé après le premier affichage : s'il n'est pas
// encore là, le geste attend et l'écran le reprend en arrivant.
let enAttente = null;
const envoyer = (detail) => {
  if (typeof window === "undefined") return;
  if (!window.__klockaRappelPret) enAttente = detail;
  window.dispatchEvent(new CustomEvent(EVT, { detail }));
};
/** Le geste resté en attente, rendu une seule fois. */
export const rappelEnAttente = () => { const d = enAttente; enAttente = null; return d; };

/** Le bouton « Rappel », en haut de chaque page : il démarre l'enregistrement dans le même geste (le micro l'exige). */
/** Ouvre l'écran « Il me rappelle » (le même que l'icône du coin). */
export const enregistrerUnRappel = () => envoyer({ sens: "entrant" });
/** L'appel rapide (19 oct. 2026, Jules) : on appelle un agent pour un dossier, un point ; le même écran, le même chemin. */
export const appelRapide = () => envoyer({ sens: "sortant" });
/** Raconter un échange sans l'avoir eu au téléphone : les notes tiennent lieu d'appel, puis le même chemin. */
export const raconterUnEchange = (notes = "") => envoyer({ sens: "raconte", notes });
/** L'essai (19 oct. 2026, Jules) : un rappel ou un appel rapide joué, sans appel réel, dans la liste fictive. */
export const essayerUnAppel = () => envoyer({ essai: true });

export function BoutonRappel({ compact = false }) {
  // Une icône seule au téléphone, dans la barre du haut : un tap enregistre l'appel entrant.
  if (compact) return (
    <button type="button" onClick={enregistrerUnRappel} aria-label="Il me rappelle : enregistrer l'appel entrant" title="Rappel : un agent vous rappelle, enregistrer l'appel"
      className="grid h-10 w-10 place-items-center rounded-full text-menthe hover:bg-menthe/10" style={{ background: "transparent" }}>
      <PhoneIncoming className="h-5 w-5" strokeWidth={1.8} />
    </button>
  );
  return <PiluleAppel />;
}

// Sur ordinateur, la pilule « Appel » en haut à droite (19 oct. 2026, Jules) : au survol, elle grossit et se
// soulève, et le panneau des deux modes se déplie dessous, depuis son coin droit. Une bande invisible de 12 px
// relie la pilule au panneau, et il attend 120 ms avant de se refermer : un écart de souris ne le ferme pas.
function PiluleAppel() {
  const [ouvert, setOuvert] = useState(false);
  const minuterie = useRef(null);
  const entrer = () => { clearTimeout(minuterie.current); setOuvert(true); };
  const sortir = () => { clearTimeout(minuterie.current); minuterie.current = setTimeout(() => setOuvert(false), 120); };
  useEffect(() => () => clearTimeout(minuterie.current), []);
  const choisir = (faire) => { clearTimeout(minuterie.current); setOuvert(false); faire(); };
  const modes = [
    { cle: "entrant", icone: PhoneIncoming, titre: "Il me rappelle", detail: "Enregistrer l'appel entrant", faire: enregistrerUnRappel },
    // « Appel rapide » retiré du panneau (22 oct. 2026, Jules) ; appelRapide() reste pour Haka et les liens.
    { cle: "essai", icone: FlaskConical, titre: "Essai, sans appel", detail: "Jouer un rappel", faire: essayerUnAppel },
  ];
  return (
    <div className="relative" onMouseEnter={entrer} onMouseLeave={sortir}>
      <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} aria-haspopup="menu" aria-label="Appel : un agent me rappelle, ou j'appelle un agent"
        className="k-pilule-appel grid h-11 w-11 place-items-center rounded-full border text-menthe">
        <PhoneIncoming className="h-5 w-5" strokeWidth={1.8} />
      </button>
      <div className={`k-panneau-appel absolute right-0 top-full z-50 pt-3 ${ouvert ? "k-ouvert" : ""}`} role="menu" aria-hidden={!ouvert}>
        <div className="flex w-[270px] flex-col gap-1.5 rounded-[16px] border border-trait bg-rail p-1.5 shadow-[0_18px_40px_rgb(0_0_0/0.4)]">
          {modes.map((m) => (
            <button key={m.cle} type="button" role="menuitem" tabIndex={ouvert ? 0 : -1} onClick={() => choisir(m.faire)}
              className="k-mode-appel flex items-center gap-3 rounded-[12px] border px-3.5 py-3 text-left">
              <m.icone className="h-[18px] w-[18px] flex-none text-menthe" strokeWidth={1.8} />
              <span className="min-w-0">
                <span className="block text-[14px] text-encre">{m.titre}</span>
                <span className="block text-[12.5px] text-ardoise">{m.detail}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
