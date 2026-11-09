import React from "react";
import { CLASSES_STATUT } from "@/lib/couleur-statut";

// Les briques des pages du module Emailing, reprises du CRM : le titre et son action, le tableau à filets,
// les cases de statut colorées en entier.

export const champCrm = "h-8 w-full rounded-[8px] border border-bord-doux bg-transparent px-2.5 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
export const zoneCrm = "w-full rounded-[8px] border border-bord-doux bg-transparent px-2.5 py-2 text-[13.5px] leading-[1.5] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
export const boutonCrm = "inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-menthe px-3 text-[14px] text-sur-menthe disabled:opacity-50";
export const outilCrm = "inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-bord-doux px-2.5 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50";
export const etiquetteCrm = "mb-1 block text-[12.5px] text-ardoise";

export function Statut({ couleur = "gris", children }) {
  return <span className={`inline-block whitespace-nowrap rounded-[6px] px-2 py-px text-[12.5px] ${CLASSES_STATUT[couleur] || CLASSES_STATUT.gris}`}>{children}</span>;
}

/** Le stade d'un contact : une couleur, un sens. */
export const STADES = { lead: ["Lead", "gris"], mql: ["MQL", "bleu"], sql: ["SQL", "menthe"] };
export const Stade = ({ stade }) => { const [mot, c] = STADES[stade] || STADES.lead; return <Statut couleur={c}>{mot}</Statut>; };

export function Page({ titre, compte = null, role = null, actions = null, children }) {
  return (
    <div className="min-w-0 px-10 pb-10 pt-6 max-md:px-4 max-md:pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="m-0 text-[20px] font-medium text-encre">{titre}{compte != null && <span className="ml-2 text-[14px] font-normal text-ardoise">{compte}</span>}</h1>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {role && <p className="m-0 mt-1.5 max-w-[720px] text-[13.5px] text-ardoise">{role}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function Tableau({ colonnes, lignes, cle = (l) => l.id, rendu, onLigne = null, vide = "Rien pour l'instant." }) {
  return (
    <div className="overflow-x-auto rounded-[12px] border border-trait border-l-[3px] border-l-menthe bg-crm-tableau">
      <table className="w-full border-collapse text-[13.5px]">
        <thead><tr>{colonnes.map((c, i) => <th key={i} className="whitespace-nowrap border-b border-trait px-3 py-2 text-left text-[12.5px] font-normal text-ardoise">{c}</th>)}</tr></thead>
        <tbody>
          {!lignes.length && <tr><td colSpan={colonnes.length} className="px-3 py-8 text-center text-ardoise">{vide}</td></tr>}
          {lignes.map((l) => (
            <tr key={cle(l)} onClick={onLigne ? () => onLigne(l) : undefined} className={`border-b border-trait last:border-b-0 ${onLigne ? "cursor-pointer hover:bg-relief" : ""}`}>
              {rendu(l).map((v, i) => <td key={i} className="px-3 py-2 align-middle text-encre">{v}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Chiffres({ items }) {
  return (
    <div className="grid grid-cols-4 gap-2.5 max-md:grid-cols-2">
      {items.map(([valeur, mot]) => (
        <div key={mot} className="min-w-0 rounded-[12px] border border-trait bg-crm-tableau px-3.5 py-2.5">
          <div className="text-[18px] font-medium text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{valeur}</div>
          <div className="text-[12.5px] text-ardoise">{mot}</div>
        </div>
      ))}
    </div>
  );
}

export function Pilules({ options, valeur, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, mot]) => (
        <button key={v} type="button" onClick={() => onChange(v)} className={`h-7 rounded-full px-3 text-[13px] ${valeur === v ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`} style={valeur === v ? undefined : { background: "transparent" }}>{mot}</button>
      ))}
    </div>
  );
}

export const heure = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "");
export const pct = (v) => `${String(Number(v || 0).toFixed(2)).replace(".", ",")} %`;
