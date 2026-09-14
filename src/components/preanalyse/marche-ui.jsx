import React from "react";
import { ExternalLink } from "lucide-react";
import { Etiquette, Etoiles } from "@/components/alx/alx-commun";

// Le registre du marché, partagé par le bilan et par chaque onglet source.
//
// Deux polices : celle de l'application pour tout ce qui se lit, Montserrat
// pour les seules capitales espacées. Des sections séparées par un filet, des
// chiffres en colonnes séparées par des filets, des listes en lignes fines.
// Ce qui se voit dans le bilan se retrouve tel quel chez Data-B, Equimmox,
// Le Figaro, DVF et le BODACC : un seul vocabulaire.

export { Etiquette, Etoiles };

export const fmt = (n, d = 0) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d }));
export const euros = (n) => (n == null ? "—" : `${fmt(n)} €`);
export const pct = (n, d = 1) => (n == null ? "—" : `${n > 0 ? "+" : ""}${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: d })} %`);
export const jour = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

export const TEINTE = { clair: "#F3F7F5", texte: "#E8EFEB", doux: "#C3CBC7", muet: "#8B938F", menthe: "#96c0b8", ambre: "#e0a45e", rouge: "#e0655f" };

/**
 * La barre d'onglets du marché, reprise partout dans le dossier.
 *
 * Deux tailles : « page » pour les onglets d'un écran (Bien, Simulateur,
 * Bail…), « section » pour ceux d'un bloc (Bilan, Data-B, Equimmox…). Dans
 * les deux cas, le même trait menthe sous l'onglet ouvert.
 */
export function Onglets({ items, valeur, onChange, taille = "section", className = "" }) {
  const page = taille === "page";
  return (
    <div className={`flex overflow-x-auto border-b border-white/[0.08] ${page ? "gap-7" : "gap-7"} ${className}`}>
      {items.map((o) => {
        const actif = valeur === o.cle;
        return (
          <button
            key={o.cle}
            type="button"
            onClick={() => onChange(o.cle)}
            aria-pressed={actif}
            className={`whitespace-nowrap transition-colors ${page ? "pb-3 text-[14px]" : "alx-mont pb-3 text-[11px] font-medium uppercase tracking-[.14em]"}`}
            style={{
              background: "transparent",
              color: actif ? "#F3F7F5" : "#8B938F",
              fontWeight: page && actif ? 600 : undefined,
              borderBottom: actif ? "1.5px solid #96c0b8" : "1.5px solid transparent",
              marginBottom: -1,
            }}
          >
            {o.titre}
          </button>
        );
      })}
    </div>
  );
}

/** Une section du marché : un filet au-dessus, une étiquette, et à droite ce qu'on veut (un lien, une heure). */
export function Section({ titre, aside = null, premiere = false, children, className = "" }) {
  return (
    <section className={`${premiere ? "" : "mt-[34px] border-t border-white/[0.07] pt-7"} ${className}`}>
      {(titre || aside) && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          {titre ? <Etiquette>{titre}</Etiquette> : <span />}
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

/** Un grand titre de section, comme « Avenue Marceau, Courbevoie ». */
export function Titre({ children, sous = null, className = "" }) {
  return (
    <div className={`text-[32px] font-normal tracking-[-.025em] text-[#F3F7F5] max-md:text-[24px] ${className}`}>
      {children}
      {sous ? <span className="text-[#8B938F]">{sous}</span> : null}
    </div>
  );
}

/**
 * Des chiffres en colonnes, séparées par des filets : le même dessin que
 * « Loyer de marché · Loyer moyen · … » du bilan.
 * @param {{items: Array<{libelle: string, valeur: React.ReactNode, note?: React.ReactNode, teinte?: string, extra?: React.ReactNode, onClick?: Function, title?: string}>}} props
 */
export function Chiffres({ items, className = "" }) {
  const n = items.length;
  const colonnes = { 1: "md:grid-cols-1", 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5", 6: "md:grid-cols-6" }[Math.min(6, n)] || "md:grid-cols-6";
  return (
    <div className={`grid grid-cols-2 border-t border-white/[0.16] ${colonnes} ${className}`}>
      {items.map((c, i) => {
        const Balise = c.onClick ? "button" : "div";
        return (
          <Balise
            key={c.libelle}
            {...(c.onClick ? { type: "button", onClick: c.onClick, title: c.title } : {})}
            className={`min-w-0 px-[18px] pt-[18px] pb-1.5 text-left ${c.onClick ? "transition-colors hover:bg-white/[0.02]" : ""} ${i === 0 ? "pl-0" : ""} ${i === n - 1 ? "pr-0 md:border-r-0" : "border-r border-white/[0.16]"}`}
            style={c.onClick ? { background: "transparent" } : undefined}
          >
            <span className="alx-mont flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[.14em] text-[#8B938F]">{c.libelle}</span>
            <span className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span className="whitespace-nowrap text-[18px] font-medium tabular-nums" style={{ color: c.teinte || TEINTE.clair }}>{c.valeur}</span>
              {c.extra}
            </span>
            {c.note && <span className="mt-1 block text-[11.5px] leading-[1.5] text-[#8B938F]">{c.note}</span>}
          </Balise>
        );
      })}
    </div>
  );
}

/** Une liste en lignes fines. `colonnes` reçoit la ligne et rend ses cellules. */
export function Lignes({ items, cle, rendu, className = "" }) {
  return (
    <div className={`flex flex-col ${className}`}>
      {items.map((x, i) => (
        <div key={cle ? cle(x, i) : i} className={`flex flex-wrap items-baseline gap-x-3.5 gap-y-0.5 py-3 ${i < items.length - 1 ? "border-b border-white/[0.05]" : ""}`}>
          {rendu(x, i)}
        </div>
      ))}
    </div>
  );
}

/** Une note sous un bloc : ce qui a été lu, d'où, avec quelle réserve. */
export function Note({ children, className = "" }) {
  return <p className={`m-0 text-[12.5px] leading-[1.6] text-[#8B938F] ${className}`}>{children}</p>;
}

/** Une phrase qui compte, en clair. */
export function Phrase({ children, className = "" }) {
  return <p className={`m-0 max-w-[92ch] text-[14.5px] leading-[1.65] text-[#C3CBC7] ${className}`} style={{ textWrap: "pretty" }}>{children}</p>;
}

/** Un encart : bord fin, teinte menthe ou ambre. */
export function Encart({ teinte = "menthe", children, className = "" }) {
  const c = teinte === "ambre" ? "rgba(224,164,94,0.35)" : "rgba(150,192,184,0.25)";
  const f = teinte === "ambre" ? "rgba(224,164,94,0.04)" : "rgba(150,192,184,0.05)";
  return <div className={`rounded-[12px] border px-[18px] py-[15px] text-[13.5px] leading-[1.6] text-[#C3CBC7] ${className}`} style={{ borderColor: c, background: f }}>{children}</div>;
}

/** Rien à montrer : la source n'a pas encore été lue. */
export function Vide({ children }) {
  return <p className="m-0 mt-2 text-[13.5px] leading-[1.6] text-[#8B938F]">{children}</p>;
}

/** Un lien vers la source, à droite d'un titre. */
export function LienSource({ href, children }) {
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12.5px] text-[#96c0b8] hover:text-[#B8F0D6]">
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  );
}
