import React from "react";
import { J } from "@/design/jetons";
import { Link, useLocation } from "react-router-dom";

// Ce que les pages d'ALX partagent : l'en-tête avec ses onglets, les teintes
// des piles, les cartes, quelques formats. Les teintes de pile sont celles de
// la maquette — un amber et un bleu propres à ALX, distincts de la palette
// du reste de l'application : ALX est un métier à part, ça se voit.

// Les teintes d'ALX, celles de la maquette : ambre pour ce qu'on appelle,
// menthe pour ce qu'on écrit, gris pour ce qu'on surveille. Le 1 bis des rues
// est un ambre plus vif, le 2 un bleu ; l'urgence 5 est un rouge brique.
export const TEINTES = {
  appeler: J.appel,
  ecrire: J.menthe,
  surveiller: J.ardoise,
  barreSurveiller: J.brume,
  ecartee: J.brume,
  urgence5: J["emplacement-2"],
  emplacement1: J["emplacement-1"],
  emplacement1bis: J["emplacement-1bis"],
  emplacement2: J["emplacement-2"],
  texte: J.encre,
  clair: J.encre,
  doux: J.craie,
  muet: J.ardoise,
  encreSurMenthe: J["sur-menthe"],
};

export const PILES = [
  { cle: "appeler", mot: "À appeler", teinte: TEINTES.appeler, detail: "signal fort" },
  { cle: "ecrire", mot: "À écrire", teinte: TEINTES.ecrire, detail: "signal patient" },
  { cle: "surveiller", mot: "À surveiller", teinte: TEINTES.surveiller, detail: "aucun signal" },
  { cle: "ecartee", mot: "Écartées", teinte: TEINTES.ecartee, detail: "avec leur motif" },
];
export const pileDe = (cle) => PILES.find((p) => p.cle === cle) || PILES[2];

// Les emplacements d'une rue. Le 1 bis se note 1.5 côté serveur pour que les
// tris restent numériques ; ici on lui donne son mot et sa teinte. Vert pour
// Bleu pour le 1, ambre foncé pour le 1 bis, rouge pour le 2 : c'est ce qu'on voit sur la carte.
export const EMPLACEMENTS = [
  { classe: 1, mot: "1", court: "N°1", teinte: TEINTES.emplacement1, fourchette: "700 000 – 1 000 000 €", detail: "la rue qui ne se discute pas" },
  { classe: 1.5, mot: "1 bis", court: "N°1B", teinte: TEINTES.emplacement1bis, fourchette: "500 000 – 800 000 €", detail: "tient le 1 sans en avoir le loyer" },
  { classe: 2, mot: "2", court: "N°2", teinte: TEINTES.emplacement2, fourchette: "300 000 – 500 000 €", detail: "petit budget, bonne rue" },
];
export const ECARTEE = { classe: null, mot: "écartée", court: "Écartée", teinte: TEINTES.muet, fourchette: null, detail: "loyer trop bas ou trop peu de vitrines" };
export const emplacementDe = (classe) => EMPLACEMENTS.find((e) => e.classe === classe) || ECARTEE;

export const euros = (n) => (n == null || !isFinite(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const quand = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "—");

const ONGLETS = [
  { to: "/ALX", mot: "Villes" },
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
          const actif = pathname.toLowerCase() === o.to.toLowerCase() || (o.to === "/ALX" && /^\/alx(cible|villes)/i.test(pathname));
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

/**
 * Un bouton, dans le registre de la maquette : plein menthe en capitales
 * Montserrat pour l'action principale, contour discret sinon, et une forme
 * sans contour (`discret`) pour ce qui ne doit pas peser.
 */
export function Bouton({ children, onClick, disabled = false, principal = false, discret = false, title = null, type = "button", className = "" }) {
  const base = "inline-flex items-center justify-center gap-2 rounded-full transition-colors disabled:opacity-40 whitespace-nowrap";
  const registre = principal
    ? "alx-mont alx-principal px-6 py-[12px] text-[13.5px] font-medium text-sur-menthe"
    : discret
      ? "px-2 py-[13px] text-[13.5px] text-ardoise hover:text-encre"
      : "px-[22px] py-[13px] text-[13.5px] text-craie border border-bord hover:border-bord-vif";
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title || undefined} className={`${base} ${registre} ${className}`} style={{ background: principal ? J["menthe"] : "transparent" }}>
      {children}
    </button>
  );
}

/** Une étiquette en capitales Montserrat, le surtitre de la maquette. */
export function Etiquette({ children, teinte = J["ardoise"], className = "" }) {
  return <div className={`alx-mont text-[10px] font-medium uppercase tracking-[.14em] ${className}`} style={{ color: teinte }}>{children}</div>;
}

/** Cinq étoiles, remplies jusqu'à la note (les demies aussi), en or. */
export function Etoiles({ note, sur = 5, taille = 14, teinte = J["ambre"], title = null }) {
  return (
    <span className="inline-flex items-center gap-[2px]" title={title || (note != null ? `${String(note).replace(".", ",")} sur ${sur}` : undefined)} style={{ fontSize: taille, lineHeight: 1 }}>
      {Array.from({ length: sur }, (_, i) => {
        const pleine = note != null && note >= i + 1;
        const demie = !pleine && note != null && note >= i + 0.5;
        return (
          <span key={i} className="relative inline-block" style={{ color: "rgba(255,255,255,0.14)" }}>
            ★
            {(pleine || demie) && <span className="absolute inset-0 overflow-hidden" style={{ color: teinte, width: pleine ? "100%" : "50%" }}>★</span>}
          </span>
        );
      })}
    </span>
  );
}

/** Un nombre en Montserrat, chiffres tabulaires. */
export function Nombre({ children, teinte = null, taille = 16, className = "", title = null }) {
  return <span className={`alx-mont tabular-nums ${className}`} title={title || undefined} style={{ fontSize: taille, color: teinte || undefined, fontWeight: 400 }}>{children}</span>;
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
export function Carte({ children, className = "", id = undefined }) {
  return <section id={id} className={`bg-surface border border-trait rounded-[18px] p-[26px] ${className}`}>{children}</section>;
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
      className="grid gap-px bg-white/[0.07] border border-trait rounded-[14px] overflow-hidden"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}
    >
      {children}
    </div>
  );
}

// --- Le registre de la maquette : halos, grands chiffres, pastilles, bascules ---------------

/** Un halo doux derrière un bloc, comme un fond de page qui respire. */
export function Halo({ className = "", teinte = "150,192,184" }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${className}`}
      style={{ background: `radial-gradient(60% 55% at 20% 0%, rgba(${teinte},0.14) 0%, rgba(${teinte},0.04) 40%, transparent 70%)` }}
    />
  );
}

/** Un grand chiffre dans une carte, à la manière d'un solde. */
export function Chiffre({ label, valeur, detail = null, teinte = null, onClick = null, actif = false }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick || undefined}
      className={`relative overflow-hidden text-left bg-surface border rounded-[18px] px-6 py-5 flex flex-col gap-1.5 transition-colors ${
        actif ? "border-menthe/50" : "border-trait"
      } ${onClick ? "hover:border-bord" : ""}`}
    >
      {actif && <Halo />}
      <div className="relative text-[10px] tracking-[.16em] uppercase text-ardoise">{label}</div>
      <div className="relative text-[34px] leading-none font-semibold tabular-nums tracking-[-.02em]" style={teinte ? { color: teinte } : undefined}>{valeur}</div>
      {detail && <div className="relative text-[12.5px] text-brume mt-1">{detail}</div>}
    </Tag>
  );
}

/** Une pastille d'état : en cours, terminé, à lancer. */
export function Statut({ etat }) {
  const m = {
    en_cours: ["En cours", "var(--k-menthe)", true],
    rues_proposees: ["Rues proposées", "var(--k-menthe)", false],
    fini: ["Terminé", "var(--k-craie)", false],
    arrete: ["Arrêté", "#E8B278", false],
    interrompu: ["Interrompu", "#E8B278", false],
    erreur: ["En erreur", "var(--k-alerte)", false],
  }[etat] || ["À lancer", "var(--k-brume)", false];
  return (
    <span className="inline-flex items-center gap-2 text-[11px] tracking-[.12em] uppercase rounded-full border border-bord px-3 py-1.5" style={{ color: m[1] }}>
      <span className={`w-[6px] h-[6px] rounded-full ${m[2] ? "animate-pulse" : ""}`} style={{ background: m[1] }} />
      {m[0]}
    </span>
  );
}

/** Une bascule à pilules, comme « Brut / Net / Financier ». */
export function Bascule({ options, valeur, onChange }) {
  return (
    <div className="inline-flex gap-1 border border-bord rounded-full p-1">
      {options.map(([cle, mot, n]) => (
        <button
          key={cle}
          onClick={() => onChange(cle)}
          className={`px-3.5 py-1.5 rounded-full text-[12.5px] transition-colors ${valeur === cle ? "bg-menthe text-sur-menthe font-medium" : "text-ardoise hover:text-encre"}`}
        >
          {mot}{n != null ? <span className={`ml-1.5 tabular-nums ${valeur === cle ? "opacity-70" : "text-brume"}`}>{n}</span> : null}
        </button>
      ))}
    </div>
  );
}

// --- Les noms, l'urgence ------------------------------------------------------------------

const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "et", "en", "au", "aux", "d", "l", "sur", "sous", "à", "a"]);
/** « CHRISTIAN DIOR COUTURE » → « Christian Dior Couture » ; les sigles courts (SCI, SG, CCF) restent en capitales. */
export function joliNom(nom) {
  const brut = String(nom || "").trim().replace(/\s+/g, " ");
  if (!brut) return "";
  // Un nom déjà en casse mixte est laissé tel quel.
  if (/[a-z]/.test(brut) && /[A-Z]/.test(brut)) return brut;
  return brut
    .toLowerCase()
    .split(" ")
    .map((m, i) => {
      if (i > 0 && PETITS_MOTS.has(m)) return m;
      if (m.length <= 3 && /^[a-z]+$/.test(m) && i === 0) return m.toUpperCase();
      return m
        .split(/(['’(-])/)
        .map((part) => (part === "'" || part === "’" || part === "-" || part === "(" ? part : part.charAt(0).toUpperCase() + part.slice(1)))
        .join("");
    })
    .join(" ");
}

/**
 * L'urgence d'une cible, de 1 à 5, et sa teinte. Ce n'est pas un score :
 * c'est l'ordre dans lequel démarcher. 5, on appelle aujourd'hui ; 3, on
 * écrit ; 1, on surveille.
 */
export function urgenceDe(c) {
  const forts = c.signaux?.forts?.length || 0;
  const patients = c.signaux?.patients?.length || 0;
  if (c.pile === "ecartee") return { niveau: 0, mot: "Écartée", teinte: "#3a3f47" };
  if (c.pile === "appeler") return forts >= 2 || c.signaux?.forts?.some((s) => /marchand|bail/.test(s.cle || ""))
    ? { niveau: 5, mot: "À appeler aujourd'hui", teinte: TEINTES.urgence5 }
    : { niveau: 4, mot: "À appeler", teinte: TEINTES.appeler };
  if (c.pile === "ecrire") return patients >= 2
    ? { niveau: 3, mot: "À écrire, bonne opportunité", teinte: TEINTES.ecrire }
    : { niveau: 3, mot: "À écrire", teinte: TEINTES.ecrire };
  if (c.proprietaire?.nom) return { niveau: 2, mot: "À surveiller", teinte: TEINTES.barreSurveiller };
  return { niveau: 1, mot: "Propriétaire à établir", teinte: TEINTES.barreSurveiller };
}

/** Cinq barres, remplies jusqu'au niveau, de la teinte de l'urgence. */
export function Urgence({ c, compact = false }) {
  const u = urgenceDe(c);
  return (
    <div className="flex items-center gap-2.5" title={u.mot}>
      <div className="flex items-end gap-[3px] h-4">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className="w-[5px] rounded-[2px]" style={{ height: `${6 + n * 2}px`, background: n <= u.niveau ? u.teinte : "rgba(255,255,255,0.08)" }} />
        ))}
      </div>
      {!compact && <span className="text-[12px]" style={{ color: u.niveau ? u.teinte : "var(--k-brume)" }}>{u.mot}</span>}
    </div>
  );
}
