import React from "react";
import { Link, useLocation } from "react-router-dom";

// Ce que les pages d'ALX partagent : l'en-tête avec ses onglets, les teintes
// des piles, les cartes, quelques formats. Les teintes de pile sont celles de
// la maquette — un amber et un bleu propres à ALX, distincts de la palette
// du reste de l'application : ALX est un métier à part, ça se voit.

export const PILES = [
  { cle: "appeler", mot: "À appeler", teinte: "#E8B278", detail: "signal fort" },
  { cle: "ecrire", mot: "À écrire", teinte: "#7896EB", detail: "signal patient" },
  { cle: "surveiller", mot: "À surveiller", teinte: "#9298a6", detail: "aucun signal" },
  { cle: "ecartee", mot: "Écartées", teinte: "#5f6160", detail: "avec leur motif" },
];
export const pileDe = (cle) => PILES.find((p) => p.cle === cle) || PILES[2];

export const euros = (n) => (n == null || !isFinite(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const ONGLETS = [
  { to: "/ALXVilles", mot: "Villes" },
  { to: "/ALX", mot: "Cibles" },
  { to: "/ALXBilan", mot: "Bilan" },
];

/** L'en-tête d'ALX : surtitre, titre, onglets. */
export function EnTeteAlx({ titre = "ALX", sous, droite = null }) {
  const { pathname } = useLocation();
  return (
    <div className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="w-10 h-0.5 bg-menthe" />
          <div className="text-[10px] tracking-[.18em] uppercase text-ardoise">Prospection off-market</div>
          <h1 className="m-0 text-[34px] max-md:text-[26px] font-semibold tracking-[-.025em] leading-[1.05] text-encre">{titre}</h1>
        </div>
        {droite}
      </div>
      {sous && <p className="mt-3 mb-0 max-w-[62ch] text-[13.5px] leading-[1.65] text-ardoise">{sous}</p>}
      <nav className="mt-6 flex gap-1 border-b border-trait">
        {ONGLETS.map((o) => {
          const actif = pathname.toLowerCase() === o.to.toLowerCase() || (o.to === "/ALX" && pathname.toLowerCase().startsWith("/alxcible"));
          return (
            <Link
              key={o.to}
              to={o.to}
              className={`px-3.5 py-2.5 -mb-px text-[13px] border-b transition-colors ${
                actif ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"
              }`}
            >
              {o.mot}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

/** La pastille d'une pile. */
export function Pastille({ pile }) {
  const p = pileDe(pile);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] tracking-[.12em] uppercase" style={{ color: p.teinte }}>
      <span className="w-[6px] h-[6px] rounded-full" style={{ background: p.teinte }} />
      {p.mot}
    </span>
  );
}

/** Un bouton, dans le registre de la maquette : plein menthe ou contour. */
export function Bouton({ children, onClick, disabled = false, principal = false, title = null, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title || undefined}
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-medium transition-colors disabled:opacity-40 whitespace-nowrap ${
        principal ? "bg-menthe text-[#0b1211] hover:bg-menthe-clair" : "border border-bord-doux text-craie hover:border-bord-vif hover:text-encre"
      }`}
    >
      {children}
    </button>
  );
}

/** Un champ de saisie, même registre. */
export function Champ({ label, value, onChange, placeholder = "", type = "text", className = "" }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="block text-[10px] tracking-[.16em] uppercase text-ardoise mb-1.5">{label}</span>}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-fond border border-bord rounded-[10px] px-4 py-3 text-[15px] text-encre placeholder:text-brume outline-none focus:border-menthe transition-colors"
      />
    </label>
  );
}

/** Une carte sombre, le conteneur de base de toutes les sections ALX. */
export function Carte({ children, className = "" }) {
  return <section className={`bg-surface border border-white/[0.08] rounded-[14px] p-[26px] ${className}`}>{children}</section>;
}

/** Un chiffre-clé, dans une grille de statistiques. */
export function Stat({ label, valeur, detail = null, teinte = null }) {
  return (
    <div className="bg-surface px-[22px] py-[22px] flex flex-col gap-1.5">
      <div className="text-[9px] tracking-[.14em] uppercase text-brume">{label}</div>
      <div className="text-[28px] font-semibold tabular-nums" style={teinte ? { color: teinte } : undefined}>{valeur}</div>
      {detail && <div className="text-[12px] text-brume">{detail}</div>}
    </div>
  );
}

/** Une grille de Stat, avec le filet à 1 px entre les cases de la maquette. */
export function GrilleStats({ children }) {
  return (
    <div
      className="grid gap-px bg-white/[0.07] border border-white/[0.07] rounded-[14px] overflow-hidden"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
    >
      {children}
    </div>
  );
}
