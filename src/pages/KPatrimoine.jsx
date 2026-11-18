import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, Loader2, MapPin, Plus, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";
import { toast } from "@/components/ui/avis";
import { createPageUrl } from "@/utils";
import { effectif } from "@/components/kzoning/FicheSociete";
import { BoutonMecanique } from "@/components/kdata/Mecanique";
import {
  BoutonOutil, BoutonPrincipal, Cases, CLASSE_CARTE, CLASSE_OUTIL, CLASSE_TABLE, CLASSE_TABLEAU, CLASSE_TD, CLASSE_TH, Statut, TRANSPARENT,
} from "@/components/mandataire/elements";

// K-Patrimoine (17 nov. 2026, Jules) : « le bien en vente, la SCI en haut, et autour tous les autres biens qu'ils ont ;
// je clique sur chacun, je vois l'adresse, ce que c'est, la fiche ; et la SCI, le plus détaillé possible ».
//
// À gauche, les biens en vente suivis (une liste de quinze à vingt pour tester). Au centre, le graphe du bien ouvert :
// la société propriétaire des murs en haut, le bien en vente au milieu, ses autres biens en couronne autour. Sous le
// graphe, les sociétés des mêmes dirigeants : un clic met l'une d'elles en haut, avec ses biens autour. À droite, la
// fiche de ce qu'on a cliqué : la société (identité, dirigeants, contact, BODACC, comptes) ou le bien (ce qui y est
// ouvert, ses lots, sa dernière vente, les autres propriétaires de la parcelle).

const PANNEAU = `${CLASSE_CARTE} flex min-h-0 flex-col gap-3 overflow-hidden p-4`;
const TITRE_GROUPE = "m-0 text-[12px] uppercase tracking-[.04em] text-brume";
/** Les biens dessinés en couronne ; au-delà, la liste. */
const COURONNE_MAX = 24;

// Montants : dès 1 000 k€ en M€ (règle de server/montants.js).
const euros = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n) || !v) return null;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€`;
  return `${Math.round(n).toLocaleString("fr-FR")} €`;
};
const date = (iso) => (iso ? String(iso).slice(0, 10).split("-").reverse().join("/") : "");
const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const nLocaux = (n) => `${n} ${n > 1 ? "locaux" : "local"}`;
const initiales = (nom) => String(nom || "").replace(/^SCI\s+/i, "").split(/\s+/).filter(Boolean).slice(0, 2).map((m) => m[0]).join("").toUpperCase() || "?";
const niveau = (n) => {
  if (n == null || n === "") return "—";
  const k = Number(n);
  if (!Number.isFinite(k)) return n;
  if (k === 0) return "RDC";
  if (k < 0) return `Sous-sol ${-k}`;
  return k === 1 ? "1er étage" : `${k}e étage`;
};
const titreCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const droitCourt = (d) => String(d || "").split(/\s+-\s+/).pop() || "Propriétaire";
// Un bien de la liste se reconnaît à sa parcelle et à son numéro (lireBien, server/kpatrimoine.js).
const cleVente = (b) => `${b.idu}|${b.numero || "NaN"}`;
const web = (q) => `https://www.google.com/search?q=${encodeURIComponent(q)}`;

const ETAPES_MECANIQUE = [
  { source: "Base Adresse Nationale", quoi: "Localise l'adresse du bien en vente." },
  { source: "Fichier des locaux des personnes morales (DGFiP)", quoi: "Les sociétés propriétaires d'un local à cette adresse, au 1er janvier du millésime. Celle qui a un local au rez-de-chaussée passe en tête : c'est elle qui porte le plus souvent le commerce." },
  { source: "Annuaire des entreprises (RNE)", quoi: "La fiche de chaque société, ses dirigeants avec leur mois de naissance, puis les autres sociétés de ces dirigeants (même nom, mêmes prénoms, même mois de naissance ; une société gérante par son SIREN)." },
  { source: "Fichier national des personnes morales", quoi: "Tous les locaux de ces sociétés dans toute la France, regroupés par parcelle et par adresse." },
  { source: "BODACC, comptes déposés", quoi: "Les annonces des dix dernières années et les comptes publiés de la société." },
  { source: "SIRENE, DVF, cadastre", quoi: "Au clic sur un bien : les établissements ouverts à l'adresse, les dernières ventes de la parcelle, sa contenance." },
];

const ETATS = {
  en_file: ["En file", "gris"], en_cours: ["En cours", "bleu"], fait: ["Fait", "menthe"], erreur: ["Erreur", "corail"], adresse_manquante: ["Adresse à trouver", "gris"],
};

/** Une ligne libellé / valeur, au dessin des lignes du CRM. */
function Ligne({ label, children }) {
  return (
    <div className="flex min-h-[34px] items-center justify-between gap-4 border-b border-trait py-1 text-[13.5px]">
      <span className="flex-none text-ardoise">{label}</span>
      <span className="min-w-0 text-right text-encre">{children || children === 0 ? children : "—"}</span>
    </div>
  );
}

const Lien = ({ href, children }) => (
  <a href={href} target="_blank" rel="noreferrer" className={`${CLASSE_OUTIL} no-underline`} style={TRANSPARENT}><ExternalLink className="h-3.5 w-3.5" />{children}</a>
);

// --- Le graphe ---------------------------------------------------------------------------------------------------

/**
 * La couronne des biens (18 nov. 2026 : à trois colonnes sur un écran de 1440 px, les cartes sortaient du cadre et se
 * chevauchaient en bas). Une ellipse qui tient dans le cadre, carte comprise, puis une seconde à l'intérieur si elle ne
 * touche pas la carte du centre ; le haut est laissé à la société (300° autour du bas). Les cartes sont espacées à
 * longueur d'arc égale, pas à angle égal : sur une ellipse haute, l'angle égal les entassait en bas.
 */
function anneaux(l, h, carteL, centreL) {
  const cx = l / 2;
  const cy = h * 0.56;
  const ext = { rx: Math.max(0, l / 2 - carteL / 2 - 6), ry: Math.max(60, Math.min(h - 30 - cy, cy - 108)) };
  const int = { rx: ext.rx * 0.55, ry: ext.ry * 0.5 };
  const liste = [ext];
  if (int.rx >= centreL / 2 + carteL / 2 + 8) liste.push(int);
  const pas = carteL + 12;
  return {
    cx, cy,
    anneaux: liste.map((a) => {
      // L'arc échantillonné : 600 pas de -60° à 240°.
      const pts = [];
      for (let i = 0; i <= 600; i += 1) {
        const t = ((-60 + (300 * i) / 600) * Math.PI) / 180;
        pts.push({ x: cx + a.rx * Math.cos(t), y: cy + a.ry * Math.sin(t) });
      }
      // Une carte posée là toucherait-elle celle du centre ? Ces bouts d'arc ne comptent pas : sur un graphe étroit, les
      // côtés de l'ellipse passent sous la carte du bien en vente.
      const libre = (q) => Math.abs(q.x - cx) >= (centreL + carteL) / 2 + 8 || Math.abs(q.y - cy) >= 72;
      const cumul = [0];
      for (let i = 1; i < pts.length; i += 1) cumul.push(cumul[i - 1] + (libre(pts[i]) && libre(pts[i - 1]) ? Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y) : 0));
      const longueur = cumul[cumul.length - 1];
      return { pts, cumul, longueur, places: Math.max(0, Math.floor(longueur / pas)) };
    }),
  };
}

/** `m` points espacés à longueur d'arc égale sur un anneau. */
function surAnneau(a, m, decale = 0) {
  const out = [];
  let j = 0;
  for (let i = 0; i < m; i += 1) {
    const s = (a.longueur * (i + 0.5 + decale)) / m;
    while (j < a.cumul.length - 1 && (a.cumul[j + 1] < s || a.cumul[j + 1] === a.cumul[j])) j += 1;
    out.push(a.pts[Math.min(j, a.pts.length - 1)]);
  }
  return out;
}

/**
 * La fiche flottante (18 nov. 2026, Jules : « enlève la colonne de droite ») : une carte posée sur le graphe, à côté de ce
 * qu'on survole ou qu'on a cliqué, sans prendre de place à la page. Opaque, comme un menu posé (rayon 14, ombre douce).
 */
function Flottante({ style, onEnter, onLeave, onFermer, children }) {
  return (
    // Fond plein en style direct : une classe bg-* posée en absolu dans les Outils prend le verre à 86 % (index.css), et
    // on lisait le graphe à travers la fiche.
    <section aria-label="La fiche" style={{ ...style, backgroundColor: "rgb(var(--k-surface-pleine-rgb))" }} onMouseEnter={onEnter} onMouseLeave={onLeave}
      className="absolute z-[6] flex flex-col overflow-hidden rounded-[14px] border border-bord-doux shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
      <button type="button" onClick={onFermer} aria-label="Fermer la fiche" title="Fermer" className="absolute right-2 top-2 z-[1] grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={TRANSPARENT}><X className="h-4 w-4" /></button>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 pr-10">{children}</div>
    </section>
  );
}

function Graphe({ societe, bienEnVente, biens, total, enVenteAilleurs, choisi, montre, onSociete, onBien, onSurvol, onListe, lienDirigeant, fiche = null, ficheProps = {} }) {
  const ref = useRef(null);
  const [taille, setTaille] = useState({ l: 800, h: 560 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const o = new ResizeObserver(([e]) => setTaille({ l: e.contentRect.width, h: e.contentRect.height }));
    o.observe(el);
    return () => o.disconnect();
  }, []);
  const carteL = Math.round(Math.max(124, Math.min(168, taille.l * 0.19)));
  const centreL = Math.round(Math.min(220, taille.l * 0.42));
  const { cx, cy, anneaux: an } = anneaux(taille.l, taille.h, carteL, centreL);
  const places = Math.min(COURONNE_MAX, an.reduce((t, a) => t + a.places, 0));
  // Ce qui ne tient pas passe dans « + N autres », qui prend une place.
  const n = biens.length <= places ? biens.length : Math.max(0, places - 1);
  const dessines = biens.slice(0, n);
  const reste = total - n - (bienEnVente?.bien ? 1 : 0);
  const aPlacer = n + (reste > 0 ? 1 : 0);
  const m1 = Math.min(aPlacer, an[0].places);
  const points = [...surAnneau(an[0], m1), ...(an[1] ? surAnneau(an[1], aPlacer - m1) : [])];
  const haut = { x: taille.l / 2, y: 54 };

  // Où poser la fiche : à côté de ce qu'elle décrit, du côté où il y a de la place, dans le cadre du graphe.
  const ancre = !fiche ? null
    : montre === "societe" ? { x: haut.x, y: haut.y, l: Math.min(320, taille.l - 16) }
      : montre === bienEnVente?.cle ? { x: cx, y: cy, l: centreL }
        : (() => { const i = dessines.findIndex((b) => b.cle === montre); return i >= 0 ? { x: points[i].x, y: points[i].y, l: carteL } : null; })();
  const ficheL = Math.min(380, taille.l - 16);
  let placeFiche = null;
  if (ancre) {
    const gauche = ancre.x >= taille.l / 2 && montre !== "societe" ? ancre.x - ancre.l / 2 - 12 - ficheL : ancre.x + ancre.l / 2 + 12;
    const haute = Math.max(8, Math.min(ancre.y - 80, taille.h * 0.35));
    placeFiche = { left: Math.max(8, Math.min(gauche, taille.l - ficheL - 8)), top: haute, width: ficheL, maxHeight: taille.h - haute - 8 };
  }

  return (
    <div ref={ref} className="relative min-h-[520px] w-full flex-1 overflow-hidden">
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {points.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="currentColor" strokeWidth="1" className="text-bord-doux" />)}
        <line x1={haut.x} y1={haut.y} x2={cx} y2={cy} stroke="currentColor" strokeWidth="1.5" strokeDasharray={lienDirigeant ? "5 5" : undefined} className="text-menthe" />
      </svg>

      {/* La société, en haut. */}
      <button type="button" onClick={onSociete} aria-pressed={choisi === "societe"}
        className={`absolute z-[3] flex max-w-[min(320px,calc(100%-16px))] -translate-x-1/2 -translate-y-1/2 items-center gap-2.5 rounded-[14px] border px-3.5 py-2.5 text-left transition-colors bg-rail ${choisi === "societe" ? "border-menthe" : "border-bord-doux hover:border-bord-vif"}`}
        style={{ left: haut.x, top: haut.y }}>
        <span aria-hidden="true" className="grid h-9 w-9 flex-none place-items-center rounded-full bg-menthe text-[13px] text-sur-menthe">{initiales(societe.nom)}</span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] text-encre">{societe.nom}</span>
          <span className="block truncate text-[12.5px] text-ardoise">{[societe.forme, `SIREN ${societe.siren}`, pluriel(total, "bien")].filter(Boolean).join(" · ")}</span>
        </span>
      </button>
      {lienDirigeant && (
        <span className="absolute z-[2] -translate-x-1/2 rounded-full bg-rail px-2.5 py-0.5 text-[12px] text-ardoise" style={{ left: haut.x, top: (haut.y + cy) / 2 }}>{lienDirigeant}</span>
      )}

      {/* Le bien en vente, au centre. */}
      <button type="button" onClick={() => bienEnVente && onBien(bienEnVente, true)} aria-pressed={choisi === bienEnVente?.cle}
        onMouseEnter={() => bienEnVente?.bien && onSurvol(bienEnVente.cle)} onMouseLeave={() => onSurvol(null)}
        style={{ left: cx, top: cy, width: centreL }}
        className={`absolute z-[3] -translate-x-1/2 -translate-y-1/2 rounded-[14px] border-2 px-3.5 py-2.5 text-left transition-colors bg-rail ${choisi === bienEnVente?.cle ? "border-menthe-clair" : "border-menthe"}`}>
        <span className="block text-[11px] uppercase tracking-[.14em] text-menthe">En vente</span>
        <span className="mt-0.5 block truncate text-[14px] text-encre">{bienEnVente?.titre}</span>
        <span className="block truncate text-[12.5px] text-ardoise">{bienEnVente?.sous || "Pas un bien de cette société"}</span>
      </button>

      {dessines.map((b, i) => {
        const p = points[i];
        const aussi = enVenteAilleurs[cleVente(b)];
        return (
          <button key={b.cle} type="button" onClick={() => onBien(b)} aria-pressed={choisi === b.cle} onMouseEnter={() => onSurvol(b.cle)} onMouseLeave={() => onSurvol(null)} title={`${b.adresse || "Adresse inconnue"}, ${titreCase(b.commune)}`}
            className={`absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-[12px] border px-2.5 py-1.5 text-left transition-colors bg-rail ${choisi === b.cle ? "border-menthe-clair bg-rail-actif" : aussi ? "border-menthe" : "border-trait hover:border-bord-vif"}`}
            style={{ left: p.x, top: p.y, width: carteL }}>
            <span className="block truncate text-[13px] text-encre">{titreCase(b.adresse) || `Parcelle ${b.section} ${b.plan}`}</span>
            <span className="flex items-center justify-between gap-1.5 text-[12px] text-ardoise">
              <span className="truncate">{titreCase(b.commune)}</span>
              <span className="flex-none tabular-nums">{aussi ? "en vente" : `${b.locaux.length}${b.rdc ? " · RDC" : ""}`}</span>
            </span>
          </button>
        );
      })}
      {reste > 0 && points[dessines.length] && (
        <button type="button" onClick={onListe} className="absolute z-[2] -translate-x-1/2 -translate-y-1/2 rounded-full border border-trait px-3 py-1.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre bg-rail"
          style={{ left: points[dessines.length].x, top: points[dessines.length].y }}>
          + {reste} autres
        </button>
      )}
      {!biens.length && (
        <p className="absolute left-1/2 top-[78%] m-0 -translate-x-1/2 text-center text-[13.5px] text-ardoise">Aucun autre bien au fichier pour cette société.</p>
      )}
      {placeFiche && <Flottante style={placeFiche} {...ficheProps}>{fiche}</Flottante>}
    </div>
  );
}

// --- Les fiches --------------------------------------------------------------------------------------------------

function FicheSociete({ s, patrimoine, millesime }) {
  const resume = patrimoine?.resume;
  const parDep = useMemo(() => {
    const m = {};
    for (const b of patrimoine?.biens || []) m[b.departement] = (m[b.departement] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [patrimoine]);
  const personnes = (s.dirigeants || []).filter((d) => !d.morale);
  const gerants = (s.dirigeants || []).filter((d) => /g[ée]rant|pr[ée]sident/i.test(d.qualite || ""));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-menthe text-[14px] text-sur-menthe">{initiales(s.nom)}</span>
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[18px] font-normal text-encre">{s.nom}</h2>
          <p className="m-0 truncate text-[12.5px] text-ardoise">{[s.forme, `SIREN ${s.siren}`, s.creation ? `créée le ${s.creation}` : null].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {s.active === false ? <Statut couleur="corail">Fermée au registre{s.fermeture ? ` le ${s.fermeture}` : ""}</Statut> : s.active ? <Statut couleur="menthe">Active</Statut> : null}
        {s.opposition_prospection && <Statut couleur="corail">Opposée à la prospection commerciale</Statut>}
        {s.diffusion_restreinte && <Statut couleur="gris">Diffusion restreinte</Statut>}
      </div>

      {resume && <Cases colonnes={2} items={[[resume.biens, "Biens au fichier"], [resume.locaux, "Locaux"], [resume.rdc, "Biens avec un RDC"], [resume.communes, pluriel(resume.departements.length, "département")]]} />}

      <div>
        <p className={`${TITRE_GROUPE} mb-0.5`}>La contacter</p>
        <Ligne label="Siège (courrier)">{s.siege?.adresse}</Ligne>
        <Ligne label="À l'attention de">{gerants.map((d) => d.nom).join(", ") || personnes[0]?.nom}</Ligne>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Lien href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${s.siren}`}>Annuaire</Lien>
          <Lien href={`https://www.pappers.fr/entreprise/${s.siren}`}>Pappers</Lien>
          <Lien href={`https://www.societe.com/cgi-bin/search?champs=${s.siren}`}>Societe.com</Lien>
          <Lien href={web(`${s.nom} ${s.siege?.commune || ""} téléphone`)}>Téléphone</Lien>
        </div>
      </div>

      <div>
        <p className={`${TITRE_GROUPE} mb-0.5`}>{pluriel((s.dirigeants || []).length, "dirigeant")}</p>
        {(s.dirigeants || []).map((d, i) => (
          <div key={i} className="border-b border-trait py-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[14px] text-encre">{titreCase(d.nom)}</span>
                <span className="block truncate text-[12.5px] text-ardoise">{[d.qualite, d.morale ? (d.siren ? `SIREN ${d.siren}` : "Personne morale") : d.naissance ? `né(e) en ${d.naissance}` : null].filter(Boolean).join(" · ")}</span>
              </span>
              <span className="flex flex-none gap-1">
                {d.morale && d.siren
                  ? <a href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${d.siren}`} target="_blank" rel="noreferrer" className="text-[12.5px] text-ardoise hover:text-encre">Annuaire</a>
                  : <a href={web(`"${d.prenom || ""} ${d.nom_famille || ""}" linkedin`)} target="_blank" rel="noreferrer" className="text-[12.5px] text-ardoise hover:text-encre">LinkedIn</a>}
              </span>
            </div>
          </div>
        ))}
        {!s.dirigeants?.length && <p className="m-0 text-[13.5px] text-ardoise">Aucun dirigeant à l&apos;annuaire.</p>}
      </div>

      <div>
        <p className={`${TITRE_GROUPE} mb-0.5`}>Identité</p>
        <Ligne label="SIREN"><span className="tabular-nums">{s.siren}</span></Ligne>
        <Ligne label="Raison sociale">{s.raison_sociale}</Ligne>
        <Ligne label="Forme">{s.forme || (s.forme_code ? `Code ${s.forme_code}` : null)}</Ligne>
        <Ligne label="Activité">{s.activite ? `NAF ${s.activite}` : null}</Ligne>
        <Ligne label="Création">{s.creation}</Ligne>
        <Ligne label="Siège depuis">{s.siege?.depuis}</Ligne>
        <Ligne label="Catégorie">{s.categorie}</Ligne>
        <Ligne label="Effectif">{s.effectif ? effectif(s.effectif) : null}</Ligne>
        <Ligne label="TVA">{typeof s.tva === "string" ? s.tva : null}</Ligne>
        <Ligne label="Registre mis à jour">{s.mise_a_jour_rne}</Ligne>
      </div>

      {parDep.length > 0 && (
        <div>
          <p className={`${TITRE_GROUPE} mb-0.5`}>Patrimoine par département{millesime ? ` · 1er janvier ${millesime}` : ""}</p>
          {parDep.map(([d, n]) => <Ligne key={d} label={d}>{pluriel(n, "bien")}</Ligne>)}
          {patrimoine?.tronque && <p className="m-0 mt-1 text-[12.5px] text-ardoise">Les {patrimoine.biens.length} premiers biens sont gardés.</p>}
        </div>
      )}

      <div>
        <p className={`${TITRE_GROUPE} mb-0.5`}>BODACC, dix ans</p>
        {(s.bodacc || []).slice(0, 15).map((e, i) => (
          <div key={i} className="flex gap-3 border-b border-trait py-1.5 text-[13.5px]">
            <span className="w-[78px] flex-none tabular-nums text-ardoise">{date(e.date)}</span>
            <span className="min-w-0 text-encre">{e.type}{e.detail ? <span className="text-ardoise"> · {e.detail}</span> : null}</span>
          </div>
        ))}
        {s.bodacc_lu && !s.bodacc?.length && <p className="m-0 text-[13.5px] text-ardoise">Aucune annonce.</p>}
        {!s.bodacc_lu && <p className="m-0 text-[13.5px] text-ardoise">Le BODACC n&apos;a pas répondu.</p>}
      </div>

      {(s.comptes?.length > 0 || s.finances?.length > 0) && (
        <div>
          <p className={`${TITRE_GROUPE} mb-1`}>Comptes déposés</p>
          <div className={CLASSE_TABLEAU}>
            <table className={CLASSE_TABLE}>
              <thead><tr><th className={CLASSE_TH}>Exercice</th><th className={CLASSE_TH}>Chiffre d&apos;affaires</th><th className={CLASSE_TH}>Résultat net</th></tr></thead>
              <tbody>
                {(s.comptes?.length ? s.comptes.map((c) => [c.exercice, c.chiffre_affaires, c.resultat_net]) : s.finances.map((f) => [f.annee, f.ca, f.resultat_net])).slice(0, 8).map(([a, ca, rn]) => (
                  <tr key={a}><td className={CLASSE_TD}>{a}</td><td className={`${CLASSE_TD} tabular-nums`}>{euros(ca) || "—"}</td><td className={`${CLASSE_TD} tabular-nums`}>{rn != null ? euros(rn) || "0 €" : "—"}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {s.etablissements?.length > 0 && (
        <div>
          <p className={`${TITRE_GROUPE} mb-0.5`}>{pluriel(s.etablissements.length, "établissement")}</p>
          {s.etablissements.slice(0, 10).map((e) => <Ligne key={e.siret} label={e.siege ? "Siège" : e.actif ? "Ouvert" : "Fermé"}>{e.adresse}</Ligne>)}
        </div>
      )}
      <p className="m-0 text-[12.5px] leading-[1.5] text-brume">Annuaire des entreprises (RNE et SIRENE), BODACC, comptes déposés (INPI). Les biens : fichier des locaux des personnes morales (DGFiP), au 1er janvier.</p>
    </div>
  );
}

function FicheBien({ b, proprietaire, enVente }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["kpatrimoine", "bien", b.idu, b.adresse],
    queryFn: () => base44.request("GET", `/api/kfoncier/patrimoine/bien?${new URLSearchParams({ idu: b.idu, adresse: b.adresse || "", commune: b.commune || "" })}`),
    staleTime: 600000,
  });
  const p = data?.point;
  const commerces = data?.commerces || [];
  return (
    <div className="flex flex-col gap-3.5">
      <div>
        {enVente && <span className="block text-[11px] uppercase tracking-[.14em] text-menthe">En vente · {enVente}</span>}
        <h2 className="m-0 text-[18px] font-normal text-encre">{titreCase(b.adresse) || `Parcelle ${b.section} ${b.plan}`}</h2>
        <p className="m-0 text-[12.5px] text-ardoise">{[titreCase(b.commune), p?.code_postal, `parcelle ${b.section} ${b.plan}`].filter(Boolean).join(" · ")}</p>
      </div>
      <Cases colonnes={3} items={[[b.locaux.length, b.locaux.length > 1 ? "Locaux" : "Local"], [b.rdc ? "Oui" : "Non", "Au rez-de-chaussée"], [data?.contenance != null ? `${data.contenance.toLocaleString("fr-FR")} m²` : "—", "Parcelle"]]} />

      <div className="flex flex-wrap gap-1.5">
        {p?.lat && <Lien href={`https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lon}`}>Carte</Lien>}
        {p?.lat && <Lien href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lon}`}>Street View</Lien>}
        <Link to={`${createPageUrl("KFoncier")}?${new URLSearchParams({ adresse: p?.label || `${b.adresse} ${b.commune}` })}`} className={`${CLASSE_OUTIL} no-underline`}><MapPin className="h-3.5 w-3.5" />K-Foncier</Link>
      </div>

      {isLoading && <p className="m-0 flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />Lecture du registre, de DVF et du cadastre…</p>}
      {error && <p className="m-0 text-[13.5px] text-alerte">{error.message}</p>}

      {data && (
        <div>
          <p className={`${TITRE_GROUPE} mb-0.5`}>Ce qui est ouvert à l&apos;adresse</p>
          {commerces.map((e) => (
            <div key={e.siret} className="border-b border-trait py-1.5">
              <span className="block truncate text-[14px] text-encre">{titreCase(e.enseigne || e.nom)}</span>
              <span className="block truncate text-[12.5px] text-ardoise">{[e.activite_libelle || e.activite, e.enseigne && e.nom ? titreCase(e.nom) : null, e.ouverture ? `depuis ${date(e.ouverture)}` : null].filter(Boolean).join(" · ")}</span>
            </div>
          ))}
          {data.commerces == null && <p className="m-0 text-[13.5px] text-ardoise">Le registre SIRENE n&apos;a pas été lu pour cette adresse.</p>}
          {data.commerces && !commerces.length && <p className="m-0 text-[13.5px] text-ardoise">Aucun établissement ouvert au registre à ce numéro.</p>}
        </div>
      )}

      <div>
        <p className={`${TITRE_GROUPE} mb-1`}>Les lots de {titreCase(proprietaire?.nom) || "la société"}</p>
        <div className={CLASSE_TABLEAU}>
          <table className={CLASSE_TABLE}>
            <thead><tr><th className={CLASSE_TH}>Niveau</th><th className={CLASSE_TH}>Bâtiment</th><th className={CLASSE_TH}>Entrée</th><th className={CLASSE_TH}>Porte</th></tr></thead>
            <tbody>
              {b.locaux.map((l, i) => <tr key={i}><td className={CLASSE_TD}>{niveau(l.niveau)}</td><td className={CLASSE_TD}>{l.batiment || "—"}</td><td className={CLASSE_TD}>{l.entree || "—"}</td><td className={`${CLASSE_TD} tabular-nums`}>{l.porte || "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
        <p className="m-0 mt-1 text-[12.5px] text-ardoise">Droit : {b.droits.map(droitCourt).join(", ") || "Propriétaire"}</p>
      </div>

      {data?.mutations && (
        <div>
          <p className={`${TITRE_GROUPE} mb-0.5`}>Dernières ventes de la parcelle (DVF)</p>
          {data.mutations.map((m) => <Ligne key={m.id} label={date(m.date)}>{[m.types.join(", ") || m.nature, euros(m.prix)].filter(Boolean).join(" · ")}</Ligne>)}
          {!data.mutations.length && <p className="m-0 text-[13.5px] text-ardoise">Aucune vente publiée sur les derniers millésimes.</p>}
        </div>
      )}

      {data?.coproprietaires?.length > 0 && (
        <div>
          <p className={`${TITRE_GROUPE} mb-0.5`}>Les sociétés propriétaires de la parcelle</p>
          {data.coproprietaires.map((c) => <Ligne key={c.siren} label={titreCase(c.nom)}>{[c.forme, nLocaux(c.locaux), c.rdc ? "RDC" : null].filter(Boolean).join(" · ")}</Ligne>)}
        </div>
      )}
    </div>
  );
}

// --- La page -----------------------------------------------------------------------------------------------------

function Ajouter({ onFini }) {
  const [f, setF] = useState({ titre: "", adresse: "", prix: "", loyer: "" });
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => base44.request("POST", "/api/kfoncier/patrimoine", { body: f }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["kpatrimoine"] }); setF({ titre: "", adresse: "", prix: "", loyer: "" }); onFini(r.id); },
    onError: (e) => toast.error(e?.message || "Ajout impossible"),
  });
  const champ = "h-8 w-full rounded-champ border border-trait bg-transparent px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:h-10 max-md:text-[16px]";
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (f.titre.trim() || f.adresse.trim()) m.mutate(); }} className="flex flex-col gap-2">
      <input className={champ} placeholder="Le bien (Murs occupés, restaurant…)" value={f.titre} onChange={(e) => setF({ ...f, titre: e.target.value })} aria-label="Le bien" />
      <input className={champ} placeholder="Son adresse" value={f.adresse} onChange={(e) => setF({ ...f, adresse: e.target.value })} aria-label="Son adresse" />
      <div className="flex gap-2">
        <input className={champ} inputMode="numeric" placeholder="Prix (€)" value={f.prix} onChange={(e) => setF({ ...f, prix: e.target.value.replace(/[^\d]/g, "") })} aria-label="Prix" />
        <input className={champ} inputMode="numeric" placeholder="Loyer annuel (€)" value={f.loyer} onChange={(e) => setF({ ...f, loyer: e.target.value.replace(/[^\d]/g, "") })} aria-label="Loyer annuel" />
      </div>
      <BoutonPrincipal type="submit" disabled={m.isPending}>{m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Remonter au propriétaire</BoutonPrincipal>
    </form>
  );
}

export default function KPatrimoine() {
  const user = useUser();
  const qc = useQueryClient();
  const [id, setId] = useState(null);
  const [ajout, setAjout] = useState(false);
  const [focus, setFocus] = useState(null); // SIREN de la société mise en haut (une société liée), sinon le propriétaire
  const [vue, setVue] = useState("graphe");
  const [choisi, setChoisi] = useState(null); // "societe" ou la clé d'un bien
  // Le survol d'un bien ouvre sa fiche (18 nov. 2026, Jules : « quand on passe la souris sur la card, ça affiche la fiche
  // du bien ») ; le clic la garde ouverte. Un court délai à l'entrée évite de lire chaque bien que la souris traverse, un
  // autre à la sortie laisse le temps d'aller jusqu'à la fiche pour la lire.
  const [survol, setSurvol] = useState(null);
  const minuteur = useRef(null);
  const survoler = (cle) => {
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => setSurvol(cle), cle ? 120 : 300);
  };
  useEffect(() => () => clearTimeout(minuteur.current), []);

  const { data: liste } = useQuery({
    queryKey: ["kpatrimoine"],
    queryFn: () => base44.request("GET", "/api/kfoncier/patrimoine"),
    enabled: user?.role === "admin",
    refetchInterval: (q) => ((q.state.data?.biens || []).some((b) => ["en_file", "en_cours"].includes(b.etat)) ? 3000 : false),
  });
  const biensEnVente = liste?.biens || [];
  useEffect(() => { if (!id && biensEnVente[0]) setId(biensEnVente[0].id); }, [id, biensEnVente]);
  const enCours = biensEnVente.find((b) => b.id === id);

  const { data: r } = useQuery({
    queryKey: ["kpatrimoine", id, enCours?.etat],
    queryFn: () => base44.request("GET", `/api/kfoncier/patrimoine/${id}`),
    enabled: !!id && user?.role === "admin",
  });
  useEffect(() => { setFocus(null); setChoisi(null); setSurvol(null); setVue("graphe"); }, [id]);

  const modifier = useMutation({
    mutationFn: (patch) => base44.request("PATCH", `/api/kfoncier/patrimoine/${id}`, { body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kpatrimoine"] }),
  });
  const supprimer = useMutation({
    mutationFn: (cible) => base44.request("DELETE", `/api/kfoncier/patrimoine/${cible}`),
    onSuccess: (_, cible) => { if (cible === id) setId(null); qc.invalidateQueries({ queryKey: ["kpatrimoine"] }); },
  });

  if (!user || user.role !== "admin") return null;

  const principal = r?.principal || null;
  const societeHaut = focus || principal;
  const fiche = r?.societes?.[societeHaut] || (focus ? (r?.societes?.[principal]?.liees || []).find((l) => l.siren === focus) : null);
  const patrimoine = r?.patrimoine?.[societeHaut] || null;
  const proprietaire = (r?.proprietaires || []).find((p) => p.siren === principal);
  // Le bien en vente, dans le patrimoine de la société du haut : la parcelle de l'adresse.
  const iduAdresse = new Set((r?.proprietaires || []).flatMap((p) => (p.locaux || []).map((l) => l.idu)));
  const tousBiens = patrimoine?.biens || [];
  const auCentre = tousBiens.find((b) => iduAdresse.has(b.idu));
  const autour = tousBiens.filter((b) => b !== auCentre);
  const bienCentre = { cle: auCentre?.cle || "centre", titre: r?.titre, sous: r?.point?.label, bien: auCentre || null };
  const lieeFocus = focus ? (r?.societes?.[principal]?.liees || []).find((l) => l.siren === focus) : null;
  const montre = survol || choisi;
  const ouvert = montre === "societe" ? null : [...autour, auCentre].find((b) => b && b.cle === montre) || null;
  const contenuFiche = r && fiche && (montre === "societe" || ouvert) ? (
    montre === "societe"
      ? (r.societes?.[societeHaut] ? <FicheSociete s={r.societes[societeHaut]} patrimoine={patrimoine} millesime={r.millesime} /> : <FicheLiee l={fiche} patrimoine={patrimoine} />)
      : <FicheBien b={ouvert} proprietaire={fiche || proprietaire} enVente={ouvert === auCentre ? r.titre : r.en_vente_ailleurs?.[cleVente(ouvert)]?.titre} />
  ) : null;
  const ficheProps = {
    onEnter: () => { if (survol) clearTimeout(minuteur.current); },
    onLeave: () => { if (survol) survoler(null); },
    onFermer: () => { clearTimeout(minuteur.current); setSurvol(null); setChoisi(null); },
  };

  return (
    <div className="flex min-h-0 w-full flex-1 gap-4 overflow-hidden p-4 max-lg:flex-col max-lg:overflow-y-auto">
      {/* La liste des biens en vente. */}
      <section aria-label="Les biens en vente" className={`${PANNEAU} w-[300px] flex-none max-lg:w-auto`}>
        <div className="flex flex-none items-end justify-between gap-2">
          <div className="min-w-0">
            <Link to={createPageUrl("KData")} className="text-[13px] text-ardoise no-underline hover:text-encre">← Outils</Link>
            <h1 className="m-0 mt-1 truncate text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre">K-Patrimoine</h1>
          </div>
          <BoutonOutil onClick={() => setAjout((a) => !a)} aria-expanded={ajout}><Plus className="h-3.5 w-3.5" />Bien</BoutonOutil>
        </div>
        <p className="m-0 flex-none text-[13.5px] text-ardoise">Du bien en vente à la société qui en possède les murs, puis à tout ce qu&apos;elle possède.</p>
        {ajout && <div className="flex-none"><Ajouter onFini={(nid) => { setAjout(false); setId(nid); }} /></div>}
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          {biensEnVente.map((b) => {
            const [mot, couleur] = ETATS[b.etat] || ETATS.en_file;
            return (
              <div key={b.id} className={`group relative border-b border-trait transition-colors ${b.id === id ? "bg-rail-actif" : "hover:bg-relief"}`}>
              <button type="button" onClick={() => setId(b.id)} aria-pressed={b.id === id}
                className="block w-full px-2 py-2 pr-9 text-left" style={TRANSPARENT}>
                <span className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[14px] text-encre">{b.titre}</span>
                  {b.etat !== "fait" && <Statut couleur={couleur}>{mot}</Statut>}
                </span>
                <span className="block truncate text-[12.5px] text-ardoise">
                  {b.etat === "fait" ? (b.principal ? `${titreCase(b.principal.nom)} · ${pluriel(b.principal.biens, "bien")}` : "Aucune société propriétaire") : b.etape || b.erreur || b.label || b.adresse || "Adresse à trouver"}
                </span>
              </button>
              <button type="button" onClick={() => { if (window.confirm("Retirer ce bien de la liste ?")) supprimer.mutate(b.id); }} aria-label="Retirer ce bien" title="Retirer ce bien"
                className="absolute right-1 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ardoise opacity-0 hover:text-alerte focus:opacity-100 group-hover:opacity-100" style={TRANSPARENT}><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {!biensEnVente.length && <p className="m-0 py-3 text-[13.5px] text-ardoise">Aucun bien suivi. Ajoutez-en un avec son adresse.</p>}
        </div>
      </section>

      {/* Le graphe. */}
      <section aria-label="Le patrimoine" className={`${PANNEAU} relative min-w-0 flex-1`}>
        {!r ? (
          <p className="m-0 text-[13.5px] text-ardoise">{biensEnVente.length ? "Lecture…" : "Ajoutez un bien en vente à gauche."}</p>
        ) : (
          <>
            <div className="flex flex-none flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="m-0 truncate text-[20px] font-normal text-encre">{r.titre}</h2>
                <p className="m-0 truncate text-[13.5px] text-ardoise">{[r.point?.label || r.adresse, euros(r.prix), r.loyer ? `loyer ${euros(r.loyer)}` : null].filter(Boolean).join(" · ") || "Adresse à trouver"}</p>
              </div>
            </div>

            {r.etat === "adresse_manquante" && (
              <form onSubmit={(e) => { e.preventDefault(); const a = new FormData(e.currentTarget).get("adresse"); if (a) modifier.mutate({ adresse: a }); }} className="flex flex-none gap-2">
                <input name="adresse" placeholder="L'adresse du bien" aria-label="L'adresse du bien" className="h-8 min-w-0 flex-1 rounded-champ border border-trait bg-transparent px-3 text-[14px] text-encre outline-none placeholder:text-brume focus:border-bord-vif max-md:text-[16px]" />
                <BoutonPrincipal type="submit">Remonter</BoutonPrincipal>
              </form>
            )}
            {["en_file", "en_cours"].includes(r.etat) && <p className="m-0 flex items-center gap-2 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin text-menthe" />{r.etape || "En file"}…</p>}
            {r.etat === "erreur" && <p className="m-0 text-[13.5px] text-alerte">{r.erreur}</p>}
            {r.constat && <p className="m-0 text-[13.5px] text-ardoise">{r.constat}</p>}

            {fiche && vue === "graphe" && (
              <Graphe societe={{ ...fiche, siren: societeHaut }} bienEnVente={bienCentre} biens={autour} total={patrimoine?.resume.biens || 0}
                enVenteAilleurs={r.en_vente_ailleurs || {}} choisi={choisi} montre={montre} fiche={contenuFiche} ficheProps={ficheProps}
                onSociete={() => setChoisi("societe")} onBien={(b, centre) => setChoisi(centre ? (b.bien ? b.cle : null) : b.cle)} onSurvol={survoler} onListe={() => setVue("liste")}
                lienDirigeant={lieeFocus ? `même dirigeant : ${lieeFocus.via.map((v) => titreCase(v.nom)).join(", ")}` : null} />
            )}
            {fiche && vue === "liste" && (
              <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
                <button type="button" onClick={() => { setVue("graphe"); setChoisi(null); }} className="mb-1 text-[13px] text-ardoise hover:text-encre" style={TRANSPARENT}>← Graphe</button>
                {tousBiens.map((b) => (
                  <button key={b.cle} type="button" onClick={() => setChoisi(b.cle)} aria-pressed={choisi === b.cle} onMouseEnter={() => survoler(b.cle)} onMouseLeave={() => survoler(null)}
                    className={`flex w-full items-center justify-between gap-3 border-b border-trait px-2 py-2 text-left ${choisi === b.cle ? "bg-rail-actif" : "hover:bg-relief"}`} style={choisi === b.cle ? undefined : TRANSPARENT}>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] text-encre">{titreCase(b.adresse) || `Parcelle ${b.section} ${b.plan}`}</span>
                      <span className="block truncate text-[12.5px] text-ardoise">{[titreCase(b.commune), b.departement, pluriel(b.locaux.length, "lot")].join(" · ")}</span>
                    </span>
                    <span className="flex flex-none gap-1.5">
                      {b === auCentre && <Statut couleur="menthe">Ce bien</Statut>}
                      {r.en_vente_ailleurs?.[cleVente(b)] && <Statut couleur="menthe">Dans la liste</Statut>}
                      {b.rdc && <Statut couleur="gris">RDC</Statut>}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {fiche && vue === "liste" && contenuFiche && (
              <Flottante style={{ right: 16, top: 16, width: "min(380px, calc(100% - 32px))", maxHeight: "calc(100% - 32px)" }} {...ficheProps}>{contenuFiche}</Flottante>
            )}

            {r.societes?.[principal]?.liees?.length > 0 && (
              <div className="flex-none border-t border-trait pt-2.5">
                <p className={`${TITRE_GROUPE} mb-1.5`}>Les sociétés des mêmes dirigeants · {r.societes[principal].liees.length}</p>
                <div className="flex max-h-[132px] flex-wrap gap-1.5 overflow-y-auto">
                  {focus && <button type="button" onClick={() => { setFocus(null); setChoisi(null); }} className="rounded-full border border-menthe px-3 py-1 text-[13px] text-encre" style={TRANSPARENT}>← {titreCase(r.societes[principal].nom)}</button>}
                  {r.societes[principal].liees.map((l) => (
                    <button key={l.siren} type="button" onClick={() => { setFocus(l.siren); setChoisi("societe"); setVue("graphe"); }} aria-pressed={focus === l.siren} title={`via ${l.via.map((v) => v.nom).join(", ")}`}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] transition-colors ${focus === l.siren ? "border-menthe text-encre" : "border-trait text-craie hover:border-bord-vif hover:text-encre"} ${l.active ? "" : "opacity-60"}`} style={TRANSPARENT}>
                      {titreCase(l.nom)}<span className="tabular-nums text-ardoise">{l.biens}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <BoutonMecanique etapes={ETAPES_MECANIQUE} note={`Situation au 1er janvier ${r?.millesime || ""}. Les particuliers ne sont jamais au fichier ; la nature d'un local (commerce, logement) n'y est pas, le rez-de-chaussée en est le seul indice.`} />
    </div>
  );
}

/** Une société des mêmes dirigeants : sa ligne courte, et son patrimoine. Sa fiche complète est à l'annuaire. */
function FicheLiee({ l, patrimoine }) {
  const resume = patrimoine?.resume;
  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="grid h-10 w-10 flex-none place-items-center rounded-full bg-relief text-[14px] text-encre">{initiales(l.nom)}</span>
        <div className="min-w-0">
          <h2 className="m-0 truncate text-[18px] font-normal text-encre">{l.nom}</h2>
          <p className="m-0 truncate text-[12.5px] text-ardoise">{[l.forme, `SIREN ${l.siren}`, l.creation ? `créée le ${l.creation}` : null].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {!l.active && <p className="m-0"><Statut couleur="corail">Fermée au registre</Statut></p>}
      {resume && <Cases colonnes={2} items={[[resume.biens, "Biens au fichier"], [resume.locaux, "Locaux"], [resume.rdc, "Biens avec un RDC"], [resume.communes, pluriel(resume.departements.length, "département")]]} />}
      <div>
        <p className={`${TITRE_GROUPE} mb-0.5`}>Liée par</p>
        {l.via.map((v) => <Ligne key={v.nom} label={titreCase(v.nom)}>{v.qualite}</Ligne>)}
      </div>
      <Ligne label="Siège">{l.siege}</Ligne>
      <Ligne label="Activité">{l.activite ? `NAF ${l.activite}` : null}</Ligne>
      <div className="flex flex-wrap gap-1.5">
        <Lien href={`https://annuaire-entreprises.data.gouv.fr/entreprise/${l.siren}`}>Annuaire</Lien>
        <Lien href={`https://www.pappers.fr/entreprise/${l.siren}`}>Pappers</Lien>
      </div>
    </div>
  );
}
