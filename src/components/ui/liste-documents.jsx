import React from "react";
import { FileText } from "lucide-react";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";

// La liste des documents d'une page d'éditeur (Présentations, Offres,
// Estimation, Mandat), au dessin de la liste des projets de Claude Design
// (12 oct. 2026, Jules) : à gauche l'aperçu du document, puis son titre et
// son détail, la date de la dernière modification, l'auteur, et à droite ce
// que la page y met (avancement, menu). Des lignes, pas des cartes : filets
// `border-t border-trait`, comme « Vos mandats ».

/** Pure : « il y a 4 jours » en dessous de huit jours, « 4 oct. » au-delà. */
export function depuis(iso, maintenant = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (maintenant - t) / 1000);
  const f = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (s < 60) return "à l'instant";
  if (s < 3600) return f.format(-Math.round(s / 60), "minute");
  if (s < 86400) return f.format(-Math.round(s / 3600), "hour");
  if (s < 8 * 86400) return f.format(-Math.round(s / 86400), "day");
  const d = new Date(t);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date(maintenant).getFullYear() ? { year: "numeric" } : {}) });
}

/** Pure : la date d'une ligne, en tête de phrase (« Il y a 48 min », « Hier », « Il y a 9 jours », puis « 4 oct. » au-delà d'un mois). */
export function depuisCourt(iso, maintenant = Date.now()) {
  const t = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, (maintenant - t) / 1000);
  if (s < 60) return "À l'instant";
  if (s < 3600) return `Il y a ${Math.round(s / 60)} min`;
  const jour = (d) => new Date(d).toDateString();
  if (s < 86400 && jour(t) === jour(maintenant)) return `Il y a ${Math.round(s / 3600)} h`;
  if (jour(t) === jour(maintenant - 86400000)) return "Hier";
  // En jours jusqu'à un mois (« Il y a 9 jours », maquette de Jules), puis la date.
  if (s < 31 * 86400) return `Il y a ${Math.max(2, Math.round(s / 86400))} jours`;
  const d = new Date(t);
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date(maintenant).getFullYear() ? { year: "numeric" } : {}) });
}

/** Pure : les initiales d'un email ou d'un nom (« jules.b@klocka.immo » → « J »). */
export const initiale = (qui) => String(qui || "?").replace(/@.*/, "").trim().charAt(0).toUpperCase() || "?";

/** Pure : « Jules B » depuis « jules.b@klocka.immo ». */
export const nomCourt = (email) => String(email || "").replace(/@.*/, "").split(/[._-]/).filter(Boolean).map((m) => m.charAt(0).toUpperCase() + m.slice(1)).join(" ");

/**
 * L'aperçu d'un document, en 16:10 : une photo sur un fond (une couverture),
 * ou une page blanche avec ses lignes (une lettre, un avis, un mandat).
 * @param {{ photo?: string|null, page?: boolean, bandeau?: string }  bandeau : une classe de fond Tailwind (« bg-menthe »)} p
 */
export function Vignette({ photo = null, page = false, bandeau = null, titre = "", icone: Icone = null }) {
  return (
    <span aria-hidden className={`relative block h-[54px] w-[86px] flex-none overflow-hidden rounded-[8px] border border-trait ${page ? "bg-white" : Icone ? "bg-surface" : "bg-menthe/60"}`}>
      {photo ? <img src={photo} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" /> : page ? (
        <span className="absolute inset-x-2.5 top-2 flex flex-col gap-[3px]">
          {bandeau && <span className={`mb-[2px] h-[6px] w-full rounded-[1px] ${bandeau}`} />}
          <span className="h-[2px] w-1/2 rounded-full bg-neutral-400" />
          {[100, 92, 96, 70, 88, 60].map((l, i) => <span key={i} className="h-[2px] rounded-full bg-neutral-200" style={{ width: `${l}%` }} />)}
        </span>
      ) : Icone ? <Icone className="absolute inset-0 m-auto h-4 w-4 text-ardoise" /> : <FileText className="absolute inset-0 m-auto h-4 w-4 text-encre/50" />}
      {titre ? <span className="sr-only">{titre}</span> : null}
    </span>
  );
}

/** L'auteur : une pastille d'initiale et « Vous » ou son nom. */
export function Auteur({ email = null, moi = false }) {
  const { data: user } = useCurrentUser();
  const vous = moi || (email && user?.email && String(email).toLowerCase() === String(user.email).toLowerCase());
  const nom = vous ? "Vous" : nomCourt(email) || "—";
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <span aria-hidden className="grid h-7 w-7 flex-none place-items-center rounded-full bg-relief text-[12px] text-craie">{vous ? initiale(user?.full_name || user?.email) : initiale(email)}</span>
      <span className="truncate text-[14px] text-craie">{nom}</span>
    </span>
  );
}

/** Les titres des colonnes, au-dessus des lignes. */
export function EnTeteListe({ droite = "", auteur = true, largeurDroite = 260 }) {
  return (
    <div className="flex items-center gap-4 border-b border-trait px-2 pb-2 text-[12.5px] text-brume max-md:hidden">
      <span className="w-[86px] flex-none" />
      <span className="min-w-0 flex-1">Nom</span>
      <span className="w-[120px] flex-none">Modifié</span>
      {auteur ? <span className="w-[130px] flex-none">Auteur</span> : null}
      {droite ? <span className="w-[var(--k-col-droite)] flex-none" style={{ "--k-col-droite": `${largeurDroite}px` }}>{droite}</span> : null}
      {/* 24 px plus l'écart de 16 : les 40 px que la ligne laisse au menu ⋯ (le reste de sa réserve est le pl-2). */}
      <span className="w-6 flex-none" />
    </div>
  );
}

/**
 * Une ligne de la liste.
 * @param {object} p
 * @param {React.ReactNode} p.vignette la <Vignette />
 * @param {React.ReactNode} p.titre
 * @param {React.ReactNode} [p.detail] sous le titre (13,5 px)
 * @param {string} [p.modifie] la date ISO de la dernière modification
 * @param {React.ReactNode} [p.auteur] la <Auteur />
 * @param {React.ReactNode} [p.droite] l'avancement, 260 px
 * @param {React.ReactNode} [p.menu] le menu ⋯, posé par la page (position absolue à droite)
 * @param {number} [p.reserve] la place laissée à droite aux boutons de la page, en px (48 : le menu ⋯ seul)
 * @param {boolean} [p.colonneAuteur] false : pas de colonne Auteur
 * @param {number} [p.largeurDroite] la largeur de la colonne de droite, en px (260 : l'avancement)
 * @param {string} [p.modifieLibelle] la date déjà écrite, à la place de « il y a… »
 * @param {boolean} [p.active] le document ouvert
 * @param {() => void} p.onOuvrir
 */
export function LigneDocument({ vignette, titre, detail = null, modifie = null, auteur = null, droite = null, menu = null, active = false, reserve = 48, colonneAuteur = true, largeurDroite = 260, modifieLibelle = null, onOuvrir }) {
  return (
    <div className={`group relative border-t border-trait py-3 pl-2 first:border-t-0 hover:bg-encre/[0.02] ${active ? "bg-surface" : ""}`} style={{ paddingRight: reserve }}>
      <button type="button" onClick={onOuvrir} className="flex w-full items-center gap-4 text-left max-md:flex-wrap" style={{ background: "transparent" }}>
        {vignette}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] text-encre">{titre}</span>
          {detail ? <span className="mt-0.5 block truncate text-[13.5px] text-ardoise">{detail}</span> : null}
        </span>
        <span className="w-[120px] flex-none text-[14px] text-ardoise max-md:hidden">{modifieLibelle ?? depuis(modifie)}</span>
        {colonneAuteur ? <span className="w-[130px] flex-none max-md:hidden">{auteur}</span> : null}
        {droite ? <span className="block w-[var(--k-col-droite)] flex-none max-md:w-full" style={{ "--k-col-droite": `${largeurDroite}px` }}>{droite}</span> : null}
      </button>
      {menu}
    </div>
  );
}
