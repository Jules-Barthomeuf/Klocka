import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";

// Les briques communes des onglets de la page Emailing.

export const API = "/api/emailing";
export const req = (methode, chemin, body) => base44.request(methode, `${API}${chemin}`, body ? { body } : undefined);

export const date = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
export const dateHeure = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "");
export const pourcent = (v) => `${String(Number(v || 0).toFixed(1)).replace(".", ",")} %`;
export const pluriel = (n, mot, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

const ETATS = {
  brouillon: ["Brouillon", "bg-bord-vif"], programmee: ["Programmée", "bg-ambre"], en_cours: ["En cours", "bg-menthe animate-pulse"],
  envoyee: ["Envoyée", "bg-menthe"], erreur: ["Erreur", "bg-alerte"], active: ["Active", "bg-menthe"], pause: ["En pause", "bg-ambre"],
  abonne: ["Abonné", "bg-menthe"], desinscrit: ["Désinscrit", "bg-ambre"], bounce: ["Bounce", "bg-alerte"], plainte: ["Plainte", "bg-alerte"],
};

export function Etat({ statut }) {
  const [mot, point] = ETATS[statut] || [statut, "bg-bord-vif"];
  return <span className="inline-flex flex-none items-center gap-1.5 rounded-full border border-trait px-2 py-px text-[11.5px] text-craie"><span className={`h-1.5 w-1.5 rounded-full ${point}`} />{mot}</span>;
}

/** Enregistre en différé : la saisie reste fluide, la base suit ; ce qui attend part en quittant. */
export function useEnregistrement(enregistrer, delai = 700) {
  const minuteur = useRef(null);
  const dernier = useRef(null);
  const fn = useRef(enregistrer);
  fn.current = enregistrer;
  useEffect(() => () => { if (minuteur.current) { clearTimeout(minuteur.current); if (dernier.current) fn.current(dernier.current); } }, []);
  return (valeur) => {
    dernier.current = valeur;
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { minuteur.current = null; fn.current(valeur); }, delai);
  };
}

/** Les listes, segments, tags et champs : ce que les filtres et l'audience proposent. */
export function useReferentiel() {
  return useQuery({ queryKey: ["emailing-referentiel"], queryFn: () => req("GET", "/contacts/referentiel"), staleTime: 15_000 });
}

export const bouton = "inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[13px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-50";
export const boutonPlein = "inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13.5px] font-medium text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50";
export const champ = "h-10 w-full rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
export const etiquette = "block text-[12.5px] text-ardoise";

/** Vrai sous 768 px : le téléphone, où les panneaux passent en plein écran. */
export function useTelephone() {
  const requete = "(max-width: 767px)";
  const [oui, setOui] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const suivre = () => setOui(m.matches);
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, []);
  return oui;
}

/** Plein écran au téléphone : la page derrière ne défile plus tant qu'il est ouvert. */
export function useSansDefilement(actif) {
  useEffect(() => {
    if (!actif) return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [actif]);
}

/** Une fenêtre par-dessus la page. */
export function Fenetre({ titre, onFermer, children, large = false, pied = null }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-fond/70 px-4 backdrop-blur-sm max-md:px-3" onMouseDown={onFermer}>
      <div onMouseDown={(e) => e.stopPropagation()}
        className={`flex max-h-[90dvh] w-full flex-col rounded-[18px] border border-trait bg-surface-pleine shadow-2xl ${large ? "max-w-[980px]" : "max-w-[560px]"}`}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-6 py-4 max-md:px-4">
          <p className="m-0 min-w-0 text-[16px] text-encre">{titre}</p>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-8 w-8 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre max-md:h-10 max-md:w-10"><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 max-md:px-4">{children}</div>
        {pied && <div className="flex flex-wrap justify-end gap-2 border-t border-trait px-6 py-4 max-md:px-4 max-md:pb-[calc(16px+env(safe-area-inset-bottom))]">{pied}</div>}
      </div>
    </div>,
    document.body,
  );
}

/** Un choix multiple en pastilles. */
export function Pastilles({ options, valeur = [], onChange, vide = "Aucun" }) {
  if (!options.length) return <p className="m-0 text-[13px] text-brume">{vide}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([id, mot, detail]) => {
        const actif = valeur.includes(id);
        return (
          <button key={id} type="button" onClick={() => onChange(actif ? valeur.filter((x) => x !== id) : [...valeur, id])}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/15 text-encre" : "border-trait text-craie hover:text-encre"}`}>
            {mot}{detail != null && <span className="text-[11.5px] text-ardoise">{detail}</span>}
          </button>
        );
      })}
    </div>
  );
}

// --- Les briques de la maquette Emailing (6 oct. 2026) ---------------------------------

/** Le bouton principal de la page : plein, couleur du texte (blanc en sombre). */
export const boutonPrincipal = "inline-flex h-9 items-center gap-1.5 rounded-[8px] bg-encre px-3.5 text-[13.5px] font-medium text-fond transition-opacity hover:opacity-90 disabled:opacity-50";
/** Le bouton secondaire : un contour. */
export const boutonContour = "inline-flex h-9 items-center gap-1.5 rounded-[8px] border border-bord-doux px-3.5 text-[13.5px] text-encre transition-colors hover:border-bord-vif disabled:opacity-50";
/** Le petit bouton d'une ligne (Dupliquer, Ouvrir, Modifier). */
export const boutonLigne = "inline-flex h-8 items-center rounded-[7px] border border-bord-doux px-2.5 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre max-md:h-9";

const PASTILLES = {
  envoyee: ["Envoyée", "bg-relief text-craie"], en_cours: ["En cours", "bg-relief text-craie"], programmee: ["Programmée", "bg-menthe-pale text-sur-menthe-pale"],
  brouillon: ["Brouillon", "border border-bord-doux text-ardoise"], erreur: ["Erreur", "bg-alerte/15 text-alerte"],
  active: ["Active", "bg-menthe-pale text-sur-menthe-pale"], pause: ["En pause", "bg-relief text-ardoise"],
};

/** Le statut en pastille pleine (campagnes, séquences). */
export function Pastille({ statut }) {
  const [mot, style] = PASTILLES[statut] || [statut, "bg-relief text-craie"];
  return <span className={`inline-flex flex-none items-center rounded-full px-2 py-[2px] text-[11.5px] ${style}`}>{mot}</span>;
}

/** Un interrupteur. */
export function Interrupteur({ actif, onChange, libelle }) {
  return (
    <button type="button" role="switch" aria-checked={!!actif} aria-label={libelle} onClick={() => onChange(!actif)}
      className={`relative h-[19px] w-8 flex-none rounded-full transition-colors ${actif ? "bg-menthe" : "bg-bord-vif"}`}>
      <span className={`absolute top-[2px] h-[15px] w-[15px] rounded-full bg-fond transition-[left] ${actif ? "left-[15px]" : "left-[2px]"}`} />
    </button>
  );
}

/** Les initiales d'un contact dans un rond, à la place d'une photo. */
export function Avatar({ c, taille = 30 }) {
  const mots = [c?.prenom, c?.nom].filter(Boolean);
  const init = (mots.length ? mots.map((m) => m[0]).join("") : (c?.entreprise || c?.email || "?")[0]).slice(0, 2).toUpperCase();
  return <span className="grid flex-none place-items-center rounded-full bg-relief text-[11.5px] text-craie" style={{ width: taille, height: taille }}>{init}</span>;
}

/** « 2 oct. · 9:00 », à l'heure de Paris. */
export const jourHeure = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
  const heure = d.toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" }).replace(/^0/, "");
  return `${jour} · ${heure}`;
};
