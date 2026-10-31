import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Off-market : les petites briques partagées par les parties et les fiches.
// Un score se lit en pastille, un fait porte sa source et sa date, une
// section a son étiquette en capitales. Rien d'autre.

export const API = "/api/off-market";
export const req = (methode, chemin, body) => base44.request(methode, `${API}${chemin}`, body ? { body } : undefined);
export const useOffMarket = (cle, chemin, opts = {}) => useQuery({ queryKey: ["off-market", ...cle], queryFn: () => req("GET", chemin), ...opts });

export const dateCourte = (d) => (d ? new Date(String(d).length === 10 ? `${d}T12:00:00Z` : d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
export const euros = (n) => (n == null ? "" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;
/** Un compte de murs commerciaux : « 391 murs », « 1 bien » (« 1 murs » ne se dit pas). */
export const nMurs = (n, suite = "") => `${n} ${n > 1 ? "murs" : "bien"}${suite ? ` ${n > 1 ? suite.replace(/^(\S+)/, "$1s") : suite}` : ""}`;

export const LIBELLES_SIGNAUX = {
  deces_dirigeant: "Décès d'un dirigeant", dissolution: "Société en dissolution", locataire_procedure: "Locataire en procédure", proprietaire_procedure: "Propriétaire en procédure",
  changement_gerant: "Changement de gérant", cession_fonds: "Fonds cédé", marchand_recent: "Marchand de biens, achat récent", gerant_age: "Gérant âgé",
  detention_15: "Détenu depuis 15 ans", detention_22: "Détenu depuis 22 ans", detention_30: "Détenu depuis 30 ans", siege_loin: "Siège à plus de 100 km",
  demembrement: "Propriété démembrée", occupant_ferme: "Murs sans occupant", echeance_bail: "Échéance du bail", institutionnel: "Institutionnel", occupant_proprietaire: "Propriétaire-occupant",
};
export const LIBELLES_PROFILS = { sci_familiale: "SCI familiale", sci_pro: "SCI professionnelle", sci: "SCI", societe: "Société", marchand: "Marchand de biens", fonciere: "Foncière", institutionnel: "Institutionnel", holding: "Holding", occupant: "Propriétaire-occupant", particulier: "Particulier", public: "Public", inconnu: "Inconnu" };
export const LIBELLES_CONFIANCE = { exacte: "Exact", probable: "Probable", a_confirmer: "À confirmer", inconnu: "Inconnu" };

/** La couleur d'un score de motivation : l'accent pour ce qui compte, le gris pour le reste. */
export const tonMotivation = (m) => (m >= 50 ? "bg-menthe text-sur-menthe" : m >= 25 ? "bg-menthe/35 text-encre" : m > 0 ? "bg-relief text-craie" : "bg-relief text-brume");

// Les trois notes, sur 100, dites en mots (10 oct. 2026 : « M 50 · F 84 · 42 »
// ne disait rien à qui ne connaissait pas le calcul).
export const SENS_SCORES = {
  motivation: "Motivation : le propriétaire a-t-il des raisons de vendre ? Signaux publics (BODACC, registre, DVF, cadastre) : détention longue, gérant âgé, succession, procédure, local vide…",
  fit: "Fit : ces murs correspondent-ils à ce que cherchent nos investisseurs ? Locataire, emplacement, rendement, lot, commune, vacance de la rue, demande cliente.",
  priorite: "Priorité : Motivation × Fit ÷ 100. Elle classe la liste : un propriétaire motivé pour des murs que personne ne veut reste bas, et l'inverse aussi.",
};

export function Score({ motivation, fit, rang, petit = false }) {
  const t = petit ? "h-6 px-2 text-[11.5px]" : "h-7 px-2.5 text-[12.5px]";
  return (
    <span className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap tabular-nums">
      <span className={`inline-flex items-center rounded-full ${t} ${tonMotivation(motivation)}`} title={SENS_SCORES.motivation}>Motivation {motivation}</span>
      <span className={`inline-flex items-center rounded-full border border-bord-vif ${t} text-craie`} title={SENS_SCORES.fit}>Fit {fit}</span>
      {rang != null && <span className={`inline-flex items-center rounded-full ${t} text-ardoise`} title={SENS_SCORES.priorite}>Priorité {rang}</span>}
    </span>
  );
}

export function Etiquette({ children, className = "" }) {
  return <p className={`m-0 text-[11px] uppercase tracking-[.14em] text-brume ${className}`}>{children}</p>;
}

export function Section({ titre, children, aide = null }) {
  return (
    <section className="flex flex-col gap-2.5">
      <Etiquette>{titre}</Etiquette>
      {aide && <p className="m-0 text-[12.5px] text-brume">{aide}</p>}
      {children}
    </section>
  );
}

/**
 * Un tableau à deux colonnes (10 oct. 2026) : le libellé à gauche, la valeur
 * à droite, la source et la date sous la valeur. Les `Fait` en sont les lignes.
 */
export function Tableau({ children }) {
  return <div className="overflow-hidden rounded-[12px] border border-trait bg-surface/40">{children}</div>;
}

/** Une ligne libellé / valeur d'un `Tableau`, avec la source et la date en note. */
export function Fait({ libelle, valeur, source = null, date = null, ton = "text-encre" }) {
  if (valeur == null || valeur === "") return null;
  return (
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 border-t border-trait px-3.5 py-2.5 first:border-t-0">
      <span className="text-[13px] text-ardoise">{libelle}</span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={`text-[13.5px] ${ton}`}>{valeur}</span>
        {(source || date) && <span className="text-[11.5px] text-brume">{[source, date ? dateCourte(date) : null].filter(Boolean).join(" · ")}</span>}
      </span>
    </div>
  );
}

export function Pastille({ children, ton = "bg-relief text-craie", className = "" }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] ${ton} ${className}`}>{children}</span>;
}

export const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-vif px-3.5 text-[13px] text-craie transition-colors hover:border-menthe hover:text-encre disabled:opacity-50";
export const boutonPlein = "inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50";
export const champ = "h-9 rounded-full border border-bord-vif bg-fond px-3.5 text-[13.5px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";

/**
 * La case à cocher des listes de prospection (10 oct. 2026) : un carré de
 * 18 px au trait, plein d'accent une fois cochée. Remplace la case du
 * navigateur, dont le fond détonnait.
 */
// `bord` : le trait de la case vide ; dans un tableau à lignes, celui des lignes (31 oct. 2026, Jules : « trop blanc »).
export function Case({ oui, onBasculer, label, disabled = false, className = "", bord = "border-bord-vif" }) {
  return (
    <button type="button" role="checkbox" aria-checked={!!oui} aria-label={label} title={label} disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onBasculer?.(); }}
      className={`grid flex-none place-items-center p-0 disabled:cursor-not-allowed disabled:opacity-35 ${className}`} style={{ background: "transparent" }}>
      <span className={`grid h-[18px] w-[18px] place-items-center rounded-[5px] border transition-colors ${oui ? "border-menthe bg-menthe text-sur-menthe" : `${bord} hover:border-menthe`}`}>
        {oui && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** L'état vide, une phrase qui dit quoi faire. */
export function Vide({ children }) {
  return <p className="m-0 py-12 text-center text-[14px] text-brume">{children}</p>;
}
