import React, { useRef } from "react";
import { Check, Loader2, Paperclip } from "lucide-react";
import { J, alpha } from "@/design/jetons";

// Les pièces communes aux pages de travail du mandataire (Estimation,
// Mandat, Dossier, Mise en marché) : l'en-tête, la frise des statuts, le
// dépôt de fichier, la carte. Mobile d'abord : cibles de doigt, une colonne.

export function EnTete({ titre, sous, action = null }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="m-0 text-[22px] font-medium tracking-[-0.01em] text-encre">{titre}</h1>
        {sous && <p className="m-0 mt-1 max-w-[64ch] text-[13.5px] leading-[1.55] text-ardoise">{sous}</p>}
      </div>
      {action}
    </header>
  );
}

/** La frise des statuts : ce qui est fait, où on en est, ce qui vient. */
export function Frise({ etapes, statut, issue = null }) {
  const i = etapes.findIndex(([k]) => k === statut);
  return (
    <ol className="m-0 flex list-none flex-wrap items-center gap-y-2 p-0">
      {etapes.map(([k, mot], n) => {
        const fait = i > n || (i === n && n === etapes.length - 1);
        const ici = i === n;
        return (
          <li key={k} className="flex items-center">
            <span className="inline-flex items-center gap-1.5 text-[12px]" style={{ color: ici ? J["encre"] : fait ? J["craie"] : J["brume"] }}>
              <span className="grid h-[18px] w-[18px] place-items-center rounded-full border text-[10px]"
                style={{ borderColor: fait || ici ? (issue?.teinte || J["menthe"]) : J["bord-vif"], background: fait ? (issue?.teinte || J["menthe"]) : ici ? alpha("menthe", 0.15) : "transparent", color: J["sur-menthe"] }}>
                {fait ? <Check className="h-3 w-3" /> : null}
              </span>
              {ici && issue ? issue.mot : mot}
            </span>
            {n < etapes.length - 1 && <span className="mx-2 h-px w-4 max-md:w-2" style={{ background: i > n ? J["menthe"] : J["trait"] }} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Déposer un fichier d'un toucher : sur téléphone, l'appareil photo s'ouvre pour une image. */
export function BoutonFichier({ onFichier, enCours = false, accept = ".pdf,image/*,.doc,.docx", mot = "Déposer", principal = false, capture = false }) {
  const ref = useRef(null);
  return (
    <>
      <input ref={ref} type="file" accept={accept} className="hidden" {...(capture ? { capture: "environment" } : {})}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFichier(f); e.target.value = ""; }} />
      <button type="button" onClick={() => ref.current?.click()} disabled={enCours}
        className={principal
          ? "inline-flex items-center gap-1.5 rounded-full bg-menthe px-4 py-2 text-[13px] font-medium text-fond hover:bg-menthe-survol disabled:opacity-50"
          : "inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-50"}
        style={principal ? undefined : { background: "transparent" }}>
        {enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />} {mot}
      </button>
    </>
  );
}

export const Carte = ({ children, className = "", actif = false, onClick = null }) => (
  <div onClick={onClick} role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === "Enter") onClick(); } : undefined}
    className={`rounded-[16px] border bg-surface px-5 py-4 transition-colors max-md:px-4 ${actif ? "border-menthe/60" : "border-trait"} ${onClick ? "cursor-pointer hover:border-bord" : ""} ${className}`}>
    {children}
  </div>
);

export const Bouton = ({ children, onClick, disabled = false, principal = false, danger = false, type = "button" }) => (
  <button type={type} onClick={onClick} disabled={disabled}
    className={principal
      ? "inline-flex items-center gap-1.5 rounded-full bg-menthe px-4 py-2 text-[13px] font-medium text-fond hover:bg-menthe-survol disabled:opacity-50"
      : `inline-flex items-center gap-1.5 rounded-full border border-trait px-3.5 py-1.5 text-[12.5px] disabled:opacity-50 ${danger ? "text-alerte hover:border-alerte" : "text-craie hover:border-menthe hover:text-menthe"}`}
    style={principal ? undefined : { background: "transparent" }}>
    {children}
  </button>
);

export const Champ = ({ mot, ...props }) => (
  <label className="block text-[11.5px] uppercase tracking-[.1em] text-brume">
    {mot}
    <input {...props} className="mt-1 w-full rounded-champ border border-trait bg-surface px-3 py-2.5 text-[14.5px] normal-case tracking-normal text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
  </label>
);

export const Zone = ({ mot, ...props }) => (
  <label className="block text-[11.5px] uppercase tracking-[.1em] text-brume">
    {mot}
    <textarea {...props} className="mt-1 w-full resize-y rounded-champ border border-trait bg-surface px-3 py-2.5 text-[14.5px] normal-case leading-[1.55] tracking-normal text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
  </label>
);

/** Le mot de Klocka au mandataire : un renvoi, une demande de compléments. */
export const MotDeKlocka = ({ texte, teinte = "ambre" }) =>
  texte ? (
    <div className="mt-3 rounded-[12px] border px-4 py-3" style={{ borderColor: alpha(teinte, 0.4), background: alpha(teinte, 0.06) }}>
      <p className="m-0 text-[11px] uppercase tracking-[.14em]" style={{ color: J[teinte] }}>Klocka</p>
      <p className="m-0 mt-1 text-[13.5px] leading-[1.55] text-craie">{texte}</p>
    </div>
  ) : null;

export const euros = (n) => (n == null || !isFinite(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Un fichier en FormData, pour les routes qui reçoivent un dépôt. */
export const formDe = (fichier, extra = {}) => {
  const f = new FormData();
  f.append("fichier", fichier);
  for (const [k, v] of Object.entries(extra)) if (v != null) f.append(k, v);
  return f;
};

/** Un lien de fichier déposé, qui s'ouvre dans un onglet. */
export const LienFichier = ({ f }) =>
  f?.url ? (
    <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1.5 text-[12.5px] text-menthe hover:underline">
      <Paperclip className="h-3 w-3 flex-none" /> <span className="truncate">{f.nom || "Fichier"}</span>
    </a>
  ) : null;
