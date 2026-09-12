import React from "react";
import { Link, useLocation } from "react-router-dom";

// Ce que les quatre pages d'ALX partagent : l'en-tête avec ses onglets, les
// teintes des piles, quelques formats.

export const PILES = [
  { cle: "appeler", mot: "À appeler", teinte: "var(--k-alerte)", detail: "un signal fort, cette semaine" },
  { cle: "ecrire", mot: "À écrire", teinte: "var(--k-ambre)", detail: "un signal patient, ce mois" },
  { cle: "surveiller", mot: "À surveiller", teinte: "var(--k-menthe)", detail: "veille BODACC et DVF" },
  { cle: "ecartee", mot: "Écartées", teinte: "var(--k-bord-vif)", detail: "avec leur motif" },
];
export const pileDe = (cle) => PILES.find((p) => p.cle === cle) || PILES[2];

export const euros = (n) => (n == null || !isFinite(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const ONGLETS = [
  { to: "/ALX", mot: "Cibles" },
  { to: "/ALXVilles", mot: "Villes" },
  { to: "/ALXBilan", mot: "Bilan" },
];

/** L'en-tête d'ALX : surtitre, titre, onglets. */
export function EnTeteAlx({ titre, sous, droite = null }) {
  const { pathname } = useLocation();
  return (
    <div className="mb-8">
      <div className="text-[11px] tracking-[.16em] uppercase text-ardoise mb-2.5">ALX · off-market</div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[30px] max-md:text-[24px] font-light tracking-[-.02em] text-encre">{titre}</h1>
          {sous && <p className="mt-2.5 mb-0 max-w-[62ch] text-[13.5px] leading-[1.65] text-ardoise">{sous}</p>}
        </div>
        {droite}
      </div>
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

/** Un bouton sobre, dans le registre des cartes marché. */
export function Bouton({ children, onClick, disabled = false, principal = false, title = null, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title || undefined}
      className={`inline-flex items-center gap-2 px-3.5 py-2 text-[10.5px] tracking-[.16em] uppercase transition-colors disabled:opacity-40 ${
        principal
          ? "bg-menthe text-fond hover:bg-menthe-clair"
          : "border border-bord text-craie hover:border-bord-vif hover:text-encre"
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
      {label && <span className="block text-[10.5px] tracking-[.18em] uppercase text-brume mb-1.5">{label}</span>}
      <input
        type={type}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-bord focus:border-menthe outline-none py-2 text-[14px] text-encre placeholder:text-brume transition-colors"
      />
    </label>
  );
}
