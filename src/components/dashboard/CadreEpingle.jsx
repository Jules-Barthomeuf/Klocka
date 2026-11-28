import React, { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";

// Les trois listes du coin en haut à droite, épinglées (28 nov. 2026, Jules, planche C « Liste épinglée », puis
// « Brouillon, Fiches et À faire marchent pareil, mis comme dans la carte du profil ») : un sélecteur à trois places au
// dessin d'Apparence (Sombre, Clair, Auto) ; un clic épingle un panneau qui reste à droite du chat, même en
// conversation ; un second clic le retire. Un seul à la fois ; le choix se garde dans le navigateur.
// Le soir même (Jules, sur sa capture) : plus une carte posée, une colonne sur toute la hauteur, séparée du chat par un
// filet de 1 px (border-bord-vif : marqué, sans être blanc), de 360 px ; le sélecteur plus carré, le choisi en petite
// carte pervenche.

export const LARGEUR_PANNEAU = 360;
export const LARGEUR_MIN = 280;
export const LARGEUR_MAX = 720;
const CLE_LARGEUR = "klocka:liste-epinglee-largeur";
const EVENEMENT_LARGEUR = "klocka:liste-epinglee-largeur";
const borner = (n) => Math.round(Math.min(LARGEUR_MAX, Math.max(LARGEUR_MIN, Number(n) || LARGEUR_PANNEAU)));
const lireLargeur = () => { try { const v = localStorage.getItem(CLE_LARGEUR); return v ? borner(v) : LARGEUR_PANNEAU; } catch { return LARGEUR_PANNEAU; } };

/** La largeur de la colonne (28 nov. 2026, Jules : « la prochaine fois qu'on la rouvre, même après un déploiement, elle
 * reprend la taille qu'on avait laissée ») : gardée dans le navigateur, que les déploiements ne touchent pas. */
export function useLargeurEpingle() {
  const [largeur, setLargeur] = useState(lireLargeur);
  useEffect(() => {
    const suivre = (e) => setLargeur(e?.detail ?? lireLargeur());
    window.addEventListener(EVENEMENT_LARGEUR, suivre);
    return () => window.removeEventListener(EVENEMENT_LARGEUR, suivre);
  }, []);
  const changer = useCallback((n, { garder = true } = {}) => {
    const x = borner(n);
    if (garder) { try { if (x === LARGEUR_PANNEAU) localStorage.removeItem(CLE_LARGEUR); else localStorage.setItem(CLE_LARGEUR, String(x)); } catch { /* rien */ } }
    window.dispatchEvent(new CustomEvent(EVENEMENT_LARGEUR, { detail: x }));
  }, []);
  return [largeur, changer];
}
export const PANNEAUX = ["brouillon", "fiches", "afaire"];
const CLE = "klocka:liste-epinglee";
const EVENEMENT = "klocka:liste-epinglee";
const lire = () => {
  try {
    const v = localStorage.getItem(CLE);
    return v === "1" ? "afaire" : PANNEAUX.includes(v) ? v : null;
  } catch { return null; }
};

/** Le panneau épinglé (« brouillon », « fiches », « afaire » ou null), partagé entre le sélecteur, le panneau et la page. */
export function usePanneauEpingle() {
  const [choisi, setChoisi] = useState(lire);
  useEffect(() => {
    const suivre = () => setChoisi(lire());
    window.addEventListener(EVENEMENT, suivre);
    window.addEventListener("storage", suivre);
    return () => { window.removeEventListener(EVENEMENT, suivre); window.removeEventListener("storage", suivre); };
  }, []);
  const choisir = useCallback((v) => {
    const x = PANNEAUX.includes(v) ? v : null;
    try { if (x) localStorage.setItem(CLE, x); else localStorage.removeItem(CLE); } catch { /* rien */ }
    setChoisi(x);
    window.dispatchEvent(new Event(EVENEMENT));
  }, []);
  return [choisi, choisir];
}

const ENTREE = [0.22, 1, 0.36, 1];

/** La colonne : posée une fois, elle reste quand on passe d'un onglet à l'autre (seul le contenu change, en fondu) ;
 * elle glisse de la droite à l'ouverture et y repart à la fermeture (28 nov. 2026, Jules : « beaucoup plus smooth »).
 * Toute la hauteur, un filet à gauche qu'on tire pour l'élargir (double-clic : la largeur d'origine), le fond de la page ;
 * le haut laisse la place au sélecteur. Au téléphone, tout l'écran sous la barre. */
export function Colonne({ children }) {
  const [largeur, changerLargeur] = useLargeurEpingle();
  const [tire, setTire] = useState(false);
  // Un clic hors de la colonne la referme (28 nov. 2026, Jules : « on clique n'importe où dans le chat, ça ferme la
  // colonne de droite ; à droite de "À relire", dans la colonne, ça ne ferme pas »). Pas un clic sur le sélecteur (il
  // change de panneau), ni dans une fiche ouverte depuis la colonne, une fenêtre ou un menu.
  const [, choisir] = usePanneauEpingle();
  const cadre = useRef(null);
  useEffect(() => {
    const dehors = (e) => {
      const t = e.target;
      if (!(t instanceof Element) || cadre.current?.contains(t)) return;
      if (t.closest('[aria-label="Panneau à droite"], [data-crm-dehors], [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [data-radix-popper-content-wrapper], [data-sonner-toaster]')) return;
      choisir(null);
    };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [choisir]);
  const tirer = (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const l0 = largeur;
    let derniere = l0;
    setTire(true);
    document.documentElement.dataset.kTire = "1";
    const bouger = (ev) => { derniere = l0 + (x0 - ev.clientX); changerLargeur(derniere, { garder: false }); };
    const lacher = () => {
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
      delete document.documentElement.dataset.kTire;
      setTire(false);
      changerLargeur(derniere);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  return (
    <motion.aside ref={cadre} aria-label="Colonne de droite" style={{ "--k-largeur-colonne": `${largeur}px` }}
      initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.32, ease: ENTREE }}
      className={`fixed bottom-0 right-0 top-0 z-30 flex flex-col border-l border-bord-vif bg-fond pt-[60px] md:w-[var(--k-largeur-colonne)] md:bg-transparent max-md:left-0 max-md:top-[56px] max-md:z-50 max-md:border-l-0 max-md:pt-0 ${tire ? "select-none" : ""}`}>
      {/* La poignée : le filet lui-même, plus large à attraper, à l'accent au survol et pendant qu'on tire. */}
      <div role="separator" aria-orientation="vertical" aria-label="Élargir la colonne" title="Tirer pour élargir ; double-clic pour revenir"
        onPointerDown={tirer} onDoubleClick={() => changerLargeur(LARGEUR_PANNEAU)}
        className="group absolute -left-[5px] bottom-0 top-0 z-10 w-[9px] cursor-col-resize max-md:hidden">
        <span className={`absolute bottom-0 left-[4px] top-0 w-px transition-colors ${tire ? "bg-pervenche" : "bg-transparent group-hover:bg-pervenche/70"}`} />
      </div>
      {children}
    </motion.aside>
  );
}

/** Ce que chaque onglet pose dans la colonne : son titre et la croix (fixes, le contenu défile dessous), son contenu,
 * son pied. Le titre a la police du salut de l'Assistant (« Bonjour Jules… »), en plus petit et sans son balayage. */
export function CadreEpingle({ titre, children, pied = null }) {
  const [, choisir] = usePanneauEpingle();
  return (
    <motion.div className="flex min-h-0 flex-1 flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      <div className="flex items-center justify-between gap-2 pb-1 pl-6 pr-3 pt-2 max-md:pt-3">
        <h2 className="m-0 min-w-0 truncate text-[19px] font-normal leading-[1.15] tracking-[-0.02em] text-encre">{titre}</h2>
        <button type="button" onClick={() => choisir(null)} aria-label="Fermer la colonne" title="Fermer"
          className="grid h-8 w-8 flex-none place-items-center rounded-[8px] text-ardoise transition-colors hover:bg-relief hover:text-encre" style={{ background: "transparent" }}>
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto [scrollbar-width:thin]">{children}</div>
      {pied}
    </motion.div>
  );
}
