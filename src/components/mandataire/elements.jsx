import React, { useLayoutEffect, useRef } from "react";
import { Search } from "lucide-react";
import { CLASSES_STATUT, couleurStatut } from "@/lib/couleur-statut";

// Les éléments de l'espace mandataire, au dessin du CRM et du mail (8 nov. 2026, Jules : planche de validation). Le
// layout ne change pas, seuls ces éléments : 32 px sur ordinateur, 40 au doigt. Sans bande de couleur sur les tableaux.

const BOUTON = "inline-flex h-8 flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] transition-colors disabled:opacity-50 max-md:h-10";
export const CLASSE_PRINCIPAL = `${BOUTON} bg-menthe text-sur-menthe hover:bg-menthe-survol`;
export const CLASSE_OUTIL = `${BOUTON} border border-bord-doux text-craie hover:border-bord-vif hover:text-encre`;
export const TRANSPARENT = { background: "transparent" };

export const BoutonPrincipal = ({ className = "", type = "button", children, ...props }) => <button type={type} {...props} className={`${CLASSE_PRINCIPAL} ${className}`}>{children}</button>;
export const BoutonOutil = ({ className = "", type = "button", style, children, ...props }) => <button type={type} {...props} style={{ ...TRANSPARENT, ...style }} className={`${CLASSE_OUTIL} ${className}`}>{children}</button>;

/** Le titre d'une page : 24 px à gauche, son compteur, ses actions. La droite garde la place de la cloche. */
// Le centre du logo de la barre, depuis le haut de l'écran : la marque fait 56 px de haut, le logo y est centré.
const CENTRE_LOGO = 28;
// Puis 28 px sous le logo, sur toutes les pages (14 nov. 2026, Jules : « mets tout plus bas », Dossiers puis le reste).
const SOUS_LE_LOGO = 28;
/**
 * La ligne de titre d'une page, à la hauteur du logo de la barre (14 nov. 2026, Jules : « Projets, la recherche et Nouveau
 * projet sur la même ligne que le logo en haut à gauche ; pareil pour Dossiers et tout ») : sur ordinateur, la ligne se
 * cale d'elle-même pour que son milieu tombe sur celui du logo, quelles que soient les marges de la page. Seulement en tête
 * de page (à moins de 160 px du haut) : une ligne plus bas, ou au téléphone, ne bouge pas.
 */
export function useLigneSurLogo(ref) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return undefined;
    const caler = () => {
      el.style.marginTop = "";
      if (window.innerWidth < 768) return;
      // La position de mise en page (offsetTop), pas celle de l'écran : les entrées animées (glissement de quelques
      // pixels à l'arrivée) fausseraient la mesure.
      let haut = 0;
      for (let n = el; n; n = n.offsetParent) haut += n.offsetTop;
      if (haut > 160) return;
      const base = parseFloat(getComputedStyle(el).marginTop) || 0;
      el.style.marginTop = `${base + (CENTRE_LOGO + SOUS_LE_LOGO - el.offsetHeight / 2) - haut}px`;
    };
    caler();
    window.addEventListener("resize", caler);
    return () => window.removeEventListener("resize", caler);
  }, [ref]);
}

/** Une ligne d'en-tête faite de plusieurs morceaux (titre, recherche, boutons) : la même place sur toutes les pages. */
export function LigneTitre({ className = "", children }) {
  const ref = useRef(null);
  useLigneSurLogo(ref);
  return <div ref={ref} className={className}>{children}</div>;
}

export function TitrePage({ titre, nombre = null, actions = null, className = "", dansLigne = false }) {
  const ref = useRef(null);
  // Dans une LigneTitre, c'est la ligne qui se cale, pas le titre.
  useLigneSurLogo(dansLigne ? { current: null } : ref);
  return (
    <div ref={ref} className={`flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2 md:pr-[52px] ${className}`}>
      <h1 className="m-0 min-w-0 truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre max-md:pr-12">
        {titre}{nombre != null && <span className="ml-2 text-[14px] tabular-nums tracking-normal text-ardoise">{nombre}</span>}
      </h1>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Recherche({ value, onChange, placeholder, className = "w-full max-w-[320px]" }) {
  return (
    <label className={`flex h-8 items-center gap-2 rounded-full bg-relief px-3.5 text-ardoise focus-within:ring-1 focus-within:ring-bord-doux max-md:h-10 ${className}`}>
      <Search className="h-3.5 w-3.5 flex-none" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
    </label>
  );
}

/** Des filtres ou deux vues : [valeur, libellé, compteur]. */
export function Filtres({ options, valeur, onChange, label = "Filtres", className = "" }) {
  return (
    <div role="group" aria-label={label} className={`flex flex-wrap gap-0.5 ${className}`}>
      {options.map(([v, mot, n]) => (
        <button key={v} type="button" onClick={() => onChange(v)} aria-pressed={valeur === v}
          className={`inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors max-md:h-10 max-md:px-3.5 ${valeur === v ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}
          style={valeur === v ? undefined : TRANSPARENT}>
          {mot}{n != null && <span className="tabular-nums text-ardoise">{n}</span>}
        </button>
      ))}
    </div>
  );
}

/** Une case de statut : une couleur, un sens, lue dans le libellé comme au CRM (ou imposée par `couleur`). */
export function Statut({ children, couleur = null, className = "" }) {
  const c = couleur || couleurStatut(typeof children === "string" ? children : "");
  return <span className={`inline-block whitespace-nowrap rounded-[6px] px-2 py-px text-[12.5px] ${CLASSES_STATUT[c] || CLASSES_STATUT.gris} ${className}`}>{children}</span>;
}

/** Les chiffres en cases : 18 px, le libellé dessous. */
export function Cases({ items, className = "", colonnes = null }) {
  return (
    <div className={`grid grid-cols-2 gap-2.5 md:[grid-template-columns:repeat(var(--cases),minmax(0,1fr))] ${className}`} style={{ "--cases": colonnes || items.length }}>
      {items.map(([valeur, mot]) => (
        <div key={mot} className="min-w-0 k-verre px-3.5 py-2.5">
          <div className="truncate text-[18px] font-medium tabular-nums text-encre">{valeur}</div>
          <div className="truncate text-[12.5px] text-ardoise">{mot}</div>
        </div>
      ))}
    </div>
  );
}

/** Une ligne simple : à gauche ce qu'elle est, à droite son état. */
export function Ligne({ titre, detail = null, droite = null, onClick = null }) {
  return (
    <div onClick={onClick} className={`flex min-h-[42px] items-center justify-between gap-3.5 border-b border-trait py-1 text-[14px] ${onClick ? "cursor-pointer hover:bg-relief" : ""}`}>
      <div className="min-w-0"><div className="truncate text-encre">{titre}</div>{detail && <div className="truncate text-[13.5px] text-ardoise">{detail}</div>}</div>
      {droite && <div className="flex flex-none items-center gap-2">{droite}</div>}
    </div>
  );
}

export const CLASSE_CARTE = "k-verre";
export const CLASSE_TABLEAU = "overflow-x-auto k-verre";
// Le dessin des Acquéreurs d'un bien (8 nov. 2026, Jules) : une ligne de 36 px, des traits verticaux, le statut sur toute la case.
export const CLASSE_TABLE = "w-full table-fixed border-collapse text-[13.5px] [&_tbody_tr:last-child_td]:border-b-0 [&_tr>*:last-child]:border-r-0";
export const CLASSE_TH = "h-[35px] overflow-hidden whitespace-nowrap border-b border-r border-trait px-2.5 text-center text-[12.5px] font-normal text-ardoise first:text-left";
export const CLASSE_TD = "h-[36px] overflow-hidden text-ellipsis whitespace-nowrap border-b border-r border-trait px-2.5 text-center align-middle text-craie first:text-left first:text-encre";
export const classeCase = (couleur) => CLASSES_STATUT[couleur] || CLASSES_STATUT.gris;
