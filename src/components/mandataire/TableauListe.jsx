import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, ChevronDown, ExternalLink, Loader2, LocateFixed, Pencil, PhoneCall, Search, Trash2, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import PanneauAppelFiche from "@/components/mandataire/PanneauAppelFiche";
import CarteGoogleSecteurs from "@/components/mandataire/CarteGoogleSecteurs";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { JL } from "@/design/jetons";

// Une liste ouverte : la grille, comme la Prospection de l'admin — une ligne
// par commerce, les colonnes de la Sheet (propriétaire des murs, société,
// gérant, effectif…), le statut en pastille, « Appeler » et « Sans réponse »
// à même la ligne. Ici on appelle des particuliers, propriétaires de murs :
// pas d'attribution d'équipe ni de verrou, chaque mandataire a ses fiches.

const API = "/api/mandataire";

// D'où vient chaque donnée : la source écrite par le serveur devient le favicon
// du site interrogé, comme les pastilles de sources d'une réponse citée. Le
// libellé complet reste au survol.
// Chaque pastille se consulte : le lien mène à la fiche exacte quand on la
// connaît (le SIREN à l'Annuaire, l'adresse sur Maps, le nom aux Pages
// Blanches), à l'accueil du site sinon.
const SITES_SOURCES = [
  [/dgfip|personnes morales/i, [
    ["impots.gouv.fr", "DGFiP · locaux des personnes morales", () => "https://www.impots.gouv.fr/particulier/questions/comment-obtenir-un-releve-de-propriete"],
    ["cadastre.data.gouv.fr", "Cadastre (Etalab)", (p) => `https://cadastre.data.gouv.fr/map?adresse=${encodeURIComponent([p.adresse || p.cible?.adresse, p.ville].filter(Boolean).join(" "))}`],
  ]],
  [/data-b/i, [["data-b.com", "Data-B · Foncier", () => "https://data-b.com"]]],
  [/annuaire des entreprises/i, [["annuaire-entreprises.data.gouv.fr", "Annuaire des entreprises", (p) => {
    const siren = p.cible?.societe?.siren || p.cible?.proprietaire_siren;
    return siren ? `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}` : `https://annuaire-entreprises.data.gouv.fr/rechercher?terme=${encodeURIComponent(p.cible?.societe?.nom || p.cible?.proprietaire || p.nom || "")}`;
  }]]],
  [/pages blanches|118000|annuaire universel/i, [["118000.fr", "Pages Blanches (118000)", (p) => `https://www.118000.fr/search?who=${encodeURIComponent(p.nom || p.cible?.proprietaire || "")}`]]],
  [/apollo/i, [["apollo.io", "Apollo", () => "https://app.apollo.io"]]],
  [/google maps|commerce/i, [["maps.google.com", "Google Maps", (p) => `https://www.google.com/maps/search/${encodeURIComponent([p.commerce || p.cible?.enseigne, p.adresse || p.cible?.adresse, p.ville].filter(Boolean).join(" "))}`]]],
  [/bodacc/i, [["bodacc.fr", "BODACC", () => "https://www.bodacc.fr"]]],
];

/**
 * Les sources, en gélules : le favicon et le nom du site dans une pastille
 * grise arrondie, cliquable, comme une citation de source.
 */
export function Sources({ textes, p }) {
  const sites = new Map();
  for (const t of (textes || []).filter(Boolean)) {
    for (const [motif, liste] of SITES_SOURCES) {
      if (motif.test(t)) for (const [domaine, nom, lien] of liste) sites.set(domaine, { nom, lien });
    }
  }
  if (!sites.size) return null;
  return (
    <span className="ml-1.5 inline-flex flex-none items-center gap-1">
      {[...sites.entries()].map(([domaine, { nom, lien }]) => (
        <a key={domaine} href={lien?.(p) || `https://${domaine}`} target="_blank" rel="noreferrer" title={`Consulter · ${nom}`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1.5 rounded-full bg-encre/[0.08] py-[2.5px] pl-[3px] pr-2 transition-colors hover:bg-encre/[0.14]">
          <img src={`https://www.google.com/s2/favicons?domain=${domaine}&sz=32`} alt="" width={13} height={13} loading="lazy"
            className="h-[13px] w-[13px] flex-none rounded-full"
            onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
          <span className="whitespace-nowrap text-[11px] leading-none text-craie">{domaine.replace(/\.data\.gouv\.fr$|\.gouv\.fr$/, "")}</span>
        </a>
      ))}
    </span>
  );
}
const dateCourte = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const ROND = { 1: "N°1", 1.5: "N°1 bis", 2: "N°2" };

// Les teintes d'une pastille de statut, comme la grille admin.
const TEINTES_STATUT = {
  neutre: "bg-relief text-encre [--point:rgb(var(--k-encre-rgb))]",
  menthe: "bg-menthe/[0.14] text-menthe [--point:rgb(var(--k-menthe-rgb))]",
  ambre: "bg-ambre/[0.14] text-ambre [--point:currentColor]",
  alerte: "bg-alerte/[0.14] text-alerte [--point:currentColor]",
};
const TON_STATUT = { a_appeler: "neutre", contacte: "ambre", en_discussion: "menthe", rdv_pris: "menthe", mandat_signe: "menthe", pas_vendeur: "alerte", a_recontacter: "ambre" };

// Les colonnes. D'abord ce qui sert à l'appel, puis ce que la plateforme sait
// du propriétaire et de sa société, en défilant à droite. `cle` éditable :
// la cellule s'écrit, comme dans une Sheet.
const COLONNES = [
  { cle: "activite", titre: "Type d'activité", largeur: 160, lire: (p) => p.cible?.activite || p.activite || "" },
  { cle: "appel", titre: "Appel", largeur: 200 },
  // Les clients Klocka (anonymisés) que ce commerce pourrait intéresser.
  { cle: "investisseurs", titre: "Investisseurs possibles", largeur: 200 },
  { cle: "statut", titre: "Statut", largeur: 170 },
  // Deux numéros, jamais mélangés : celui du PROPRIÉTAIRE (Apollo, ou saisi),
  // c'est lui qu'on appelle ; celui du commerce, à part, en dernier recours.
  { cle: "telephone", titre: "Numéro du propriétaire", largeur: 170, editable: true, lire: (p) => p.telephone || "", source: (p) => p.telephone_source || null, sources: (p) => [p.telephone_source] },
  // Les autres dirigeants de la société propriétaire des murs, chacun son numéro.
  { cle: "autres_tels", titre: "Autres numéros des murs", largeur: 230, lire: (p) => {
    const tous = p.telephones_proprietaire?.length ? p.telephones_proprietaire : p.cible?.murs_telephones || [];
    const principal = String(p.telephone || "").replace(/\D/g, "");
    return tous.filter((t) => String(t.telephone).replace(/\D/g, "") !== principal).map((t) => `${t.telephone}${t.nom ? ` (${t.nom})` : ""}`).join(" · ");
  }, sources: (p) => ((p.telephones_proprietaire || p.cible?.murs_telephones || []).length > 1 ? ["Pages Blanches (118000)"] : []) },
  // Le dirigeant du commerce (l'exploitant) : il connaît son bailleur. Jamais mêlé au propriétaire.
  { cle: "dirigeant", titre: "Dirigeant du commerce", largeur: 240, lire: (p) => {
    const tels = p.telephones_dirigeant?.length ? p.telephones_dirigeant : p.cible?.dirigeant?.telephones || [];
    if (tels.length) return tels.map((t) => `${t.nom ? `${t.nom} · ` : ""}${t.telephone}`).join(" · ");
    return (p.cible?.dirigeant?.personnes || []).join(", ");
  }, sources: (p) => ((p.telephones_dirigeant || p.cible?.dirigeant?.telephones || []).length ? ["Pages Blanches (118000)"] : p.cible?.dirigeant ? ["Annuaire des entreprises"] : []) },
  // Le serveur a déjà dédupliqué : le propriétaire porte son âge quand il est
  // son propre gérant, la société n'apparaît que différente de lui, le gérant
  // que différent du propriétaire.
  { cle: "nom", titre: "Propriétaire des murs", largeur: 200, editable: true, lire: (p) => { const n = p.nom || p.cible?.proprietaire || ""; return n && p.cible?.proprietaire_age ? `${n} · ${p.cible.proprietaire_age} ans` : n; }, sources: (p) => (p.cible?.proprietaire ? [p.cible?.proprietaire_source] : []) },
  { cle: "societe", titre: "Société", largeur: 170, lire: (p) => { const so = p.cible?.societe; if (!so) return ""; if (so.nom) return [so.nom, so.forme && so.nom !== so.forme ? `(${so.forme})` : null].filter(Boolean).join(" "); if (so.en_nom_propre) return "En nom propre"; return so.forme || ""; }, sources: (p) => [p.cible?.societe?.source] },
  { cle: "gerant", titre: "Gérant", largeur: 180, lire: (p) => (p.cible?.gerant ? `${p.cible.gerant.nom}${p.cible.gerant.tranche_age ? ` · ${p.cible.gerant.tranche_age} ans` : ""}` : ""), sources: (p) => [p.cible?.gerant && p.cible?.societe?.source] },
  { cle: "effectif", titre: "Effectif du commerce", largeur: 150, lire: (p) => p.cible?.effectif_commerce || "", sources: (p) => [p.cible?.effectif_commerce && "Data-B"] },
  { cle: "creation", titre: "Société créée", largeur: 120, lire: (p) => (p.cible?.societe?.creation || "").slice(0, 4), sources: (p) => [p.cible?.societe?.creation && p.cible?.societe?.source] },
  // L'adresse du propriétaire : celle de l'annuaire quand on l'a, sinon le
  // siège de sa société (presque toujours son domicile) — pour le courrier.
  { cle: "siege", titre: "Adresse du propriétaire", largeur: 240, lire: (p) => p.adresse_proprietaire || p.cible?.societe?.siege_adresse || p.cible?.societe?.siege_ville || "", sources: (p) => [p.adresse_proprietaire ? "Pages Blanches (118000)" : (p.cible?.societe?.siege_adresse || p.cible?.societe?.siege_ville) && p.cible?.societe?.source] },
  { cle: "adresse", titre: "Adresse", largeur: 240, lire: (p) => [p.adresse || p.cible?.adresse, p.cible?.arrondissement || p.cible?.ville || p.ville].filter(Boolean).join(", "), sources: (p) => [!p.adresse && p.cible?.adresse && p.cible?.source] },
  { cle: "emplacement", titre: "Emplacement", largeur: 110, lire: (p) => ROND[p.cible?.emplacement] || "" },
  { cle: "email", titre: "Email", largeur: 190, editable: true, lire: (p) => p.email || "" },
  { cle: "tentatives", titre: "Tentatives", largeur: 95, lire: (p) => String(p.tentatives || 0) },
  { cle: "prochaine", titre: "Prochaine action", largeur: 220, lire: (p) => [p.prochaine_action_le ? dateCourte(p.prochaine_action_le) : null, p.prochaine_action].filter(Boolean).join(" · ") },
  { cle: "remarque", titre: "Remarque", largeur: 260, editable: true, lire: (p) => p.remarque || "" },
  { cle: "tel_commerce", titre: "Numéro du commerce", largeur: 160, lire: (p) => p.telephone_commerce || p.cible?.telephone || "", sources: (p) => [p.cible?.telephone ? p.cible?.source : p.telephone_commerce ? "Data-B" : null] },
  { cle: "dernier", titre: "Dernier échange", largeur: 260, lire: (p) => { const h = [...(p.historique || [])].reverse().find((x) => x.type !== "creation"); return h ? `${dateCourte(h.le)} · ${h.texte}` : ""; } },
];

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";

/**
 * Qualifier un commerce en dix secondes : clic sur son nom, la vitrine
 * s'ouvre dans Street View (panorama interactif), avec les faits à côté —
 * emplacement, propriétaire, numéros — et le bouton d'appel.
 */
function PanneauCommerce({ p, libelles, onFermer, onSansReponse, onAppeler }) {
  const c = p.cible || {};
  const position = c.lat != null && c.lon != null ? `${c.lat},${c.lon}` : p.position ? `${p.position.lat},${p.position.lon}` : null;
  const adresse = [p.adresse || c.adresse, p.ville].filter(Boolean).join(", ");
  const tel = p.telephone || (c.proprietaire_occupant ? c.telephone : null) || null;
  return (
    // Une entrée et une sortie douces (25 oct. 2026, Jules : la croix referme comme elle ouvre).
    <motion.div className="fixed inset-0 z-[70] flex justify-end bg-fond/60 backdrop-blur-sm" onClick={onFermer}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }}>
      <motion.div className="flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-trait bg-surface-pleine" onClick={(e) => e.stopPropagation()}
        initial={{ x: 28 }} animate={{ x: 0 }} exit={{ x: 28 }} transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }}>
        {/* La fiche commune, celle de la carte (25 oct. 2026, Jules), avec la vitrine et les gestes sous l'adresse. */}
        <FicheMandataire id={p.id} onFermer={onFermer} repli={{ commerce: p.commerce || c.enseigne, adresse }} media={(
          <>
            <div className="relative mx-6 mt-4 h-[260px] flex-none overflow-hidden rounded-[12px] bg-fond max-md:mx-5 max-md:h-[200px]">
              {position && MAPS_KEY ? (
                <iframe
                  src={`https://www.google.com/maps/embed/v1/streetview?key=${MAPS_KEY}&location=${position}&fov=85`}
                  title={`Street View · ${p.commerce || c.enseigne || adresse}`}
                  className="absolute inset-0 h-full w-full border-0"
                  allowFullScreen
                  referrerPolicy="no-referrer-when-downgrade"
                />
              ) : (
                <p className="m-0 grid h-full place-items-center text-[13.5px] text-brume">{MAPS_KEY ? "Pas de position pour ce commerce." : "Clé Google Maps absente."}</p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 px-6 pt-4 max-md:px-5">
              {tel && (
                <button type="button" onClick={() => onAppeler(p.id)} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[12.5px] text-sur-menthe">
                  <PhoneCall className="h-3.5 w-3.5" /> Appeler le propriétaire
                </button>
              )}
              <button type="button" onClick={() => onSansReponse(p.id)}
                className="inline-flex h-9 items-center rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}>
                Sans réponse
              </button>
              <a href={`https://www.google.com/maps/search/${encodeURIComponent([p.commerce || c.enseigne, adresse].filter(Boolean).join(" "))}`} target="_blank" rel="noreferrer"
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe">
                <ExternalLink className="h-3.5 w-3.5" /> Google Maps
              </a>
            </div>
          </>
        )} />
      </motion.div>
    </motion.div>
  );
}

const Case = ({ oui }) => (
  <span className="grid h-[18px] w-[18px] flex-none place-items-center rounded-[5px] border"
    style={{ borderColor: oui ? "rgb(var(--k-menthe-rgb))" : "rgb(var(--k-bord-vif-rgb))", background: oui ? "rgb(var(--k-menthe-rgb))" : "transparent" }}>
    {oui && <Check className="h-3 w-3" style={{ color: "rgb(var(--k-sur-menthe-rgb))" }} />}
  </span>
);

function Cellule({ p, col, onEnregistrer }) {
  const valeur = col.lire ? col.lire(p) : p[col.cle] || "";
  const [edition, setEdition] = useState(false);
  const [texte, setTexte] = useState(valeur);
  useEffect(() => { if (!edition) setTexte(valeur); }, [valeur, edition]);
  const source = col.source?.(p) || null;
  const pastilles = valeur ? <Sources textes={col.sources?.(p)} p={p} /> : null;
  // Le texte et sa gélule se suivent et passent à la ligne ensemble : jamais
  // l'un par-dessus l'autre. Un numéro ne se coupe pas au milieu.
  const texteClasse = `${col.cle === "telephone" || col.cle === "tel_commerce" ? "whitespace-nowrap" : "line-clamp-2"} min-w-0 text-[13.5px] leading-[1.5]`;
  if (!col.editable) {
    return (
      <span className="flex flex-wrap items-center gap-y-1 text-craie" title={source ? `${valeur} · ${source}` : valeur || undefined}>
        <span className={texteClasse}>{valeur || <span className="text-bord-vif">—</span>}</span>
        {pastilles}
      </span>
    );
  }
  if (edition) {
    const valider = () => { setEdition(false); if (texte !== valeur) onEnregistrer({ [col.cle]: texte }); };
    return <textarea autoFocus aria-label={col.titre} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={valider}
      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); valider(); } if (e.key === "Escape") { setTexte(valeur); setEdition(false); } }}
      rows={2} className="w-full resize-none rounded-md border border-menthe/60 bg-fond px-2 py-1 text-[13.5px] text-encre outline-none max-md:text-[16px]" />;
  }
  // Les pastilles suivent le texte, hors du bouton : leur clic consulte la
  // source sans ouvrir l'édition, et l'ensemble passe à la ligne proprement.
  return (
    <span className="flex w-full flex-wrap items-center gap-y-1">
      <button type="button" onClick={() => setEdition(true)} className={`border-0 p-0 text-left text-craie hover:text-encre ${texteClasse}`}
        style={{ background: "transparent", ...(col.cle === "telephone" ? { fontVariantNumeric: "tabular-nums" } : {}) }}
        title={valeur ? `${valeur}${source ? ` · ${source}` : ""} (clic pour modifier)` : "Clic pour remplir"}>
        {valeur || <span className="text-bord-vif">—</span>}
      </button>
      {pastilles}
    </span>
  );
}

// Les filtres de la liste, en pilule, comme ceux d'une ville de la Prospection de l'admin.
// Les fiches dans Biens (rendez-vous fixé) et celles sans intérêt sortent des listes à prospecter (24 oct. 2026) ;
// « Sorties » les retrouve.
const SORTIES = ["rdv_pris", "mandat_signe", "pas_vendeur"];
const FILTRES = [
  ["toutes", "À prospecter", (p) => !SORTIES.includes(p.statut)],
  ["a_appeler", "À contacter", (p) => ["a_appeler", "a_recontacter"].includes(p.statut)],
  ["en_cours", "Contacté", (p) => ["contacte", "en_discussion"].includes(p.statut)],
  ["rdv", "Sorties (Biens, pas d'intérêt)", (p) => SORTIES.includes(p.statut)],
  ["numero", "Avec un numéro", (p) => !!(p.telephone || p.telephone_commerce || p.cible?.telephone)],
  ["inconnu", "Propriétaire inconnu", (p) => !(p.nom || "").trim() && !p.cible?.proprietaire],
];

/**
 * La fiche d'un point de la carte (maquette de Jules, 24 oct. 2026) : la fiche commune (FicheMandataire). À l'ordinateur,
 * à droite de la carte sur toute la hauteur ; au téléphone, au milieu de l'écran.
 */
function FichePoint({ fiche: p, onFermer }) {
  const large = typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
  return (
    <>
      {/* Au téléphone, un voile derrière la fiche posée au milieu. */}
      <motion.div className="absolute inset-0 z-10 bg-fond/40 md:hidden" onClick={onFermer} aria-hidden
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: "easeInOut" }} />
      {/* Elle glisse en entrant et en sortant, doucement (24 oct. 2026) : de la droite à l'ordinateur, du centre au téléphone. */}
      {/* Centrée au téléphone par un conteneur flex, pas par un décalage CSS : l'animation (transform) l'écraserait. */}
      <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center p-3 md:inset-y-0 md:left-auto md:right-0 md:block md:p-0">
      <motion.aside initial={{ opacity: 0, x: large ? 28 : 0, scale: large ? 1 : 0.96 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: large ? 28 : 0, scale: large ? 1 : 0.96 }}
        transition={{ duration: 0.32, ease: [0.4, 0, 0.2, 1] }} className="pointer-events-auto flex flex-col overflow-hidden bg-surface-pleine shadow-[0_12px_40px_rgb(0_0_0/0.3)] md:h-full md:w-[420px] md:border-l md:border-trait max-md:max-h-[82dvh] max-md:w-full max-md:max-w-[440px] max-md:rounded-[18px]">
        {/* Le défilement dans un bloc intérieur (25 oct. 2026, Jules : « à droite la card a les coins carrés ») : la barre de
            défilement d'un bloc arrondi n'est pas coupée par ses coins ; ici le cadre arrondi la coupe. */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <FicheMandataire id={p.id} onFermer={onFermer} repli={{ commerce: p.commerce || p.nom, adresse: p.adresse }} />
        </div>
      </motion.aside>
      </div>
    </>
  );
}

/**
 * La liste en grand écran (24 oct. 2026, Jules) : la carte Google en plein écran avec les commerces de la liste ; un
 * point touché dit seulement le nom du commerce ; une petite croix en haut à gauche ferme ; le bouton de localisation
 * pose « vous êtes ici » en temps réel, pour les trouver sur le terrain.
 */
function CarteListeGrandEcran({ fiches, onFermer }) {
  const [choisi, setChoisi] = useState(null);
  const [moi, setMoi] = useState(null);
  const [suivi, setSuivi] = useState(null); // l'identifiant de watchPosition
  const [centrer, setCentrer] = useState(false);
  const places = fiches.filter((p) => p.position);
  const marqueurs = useMemo(() => places.map((p) => ({ id: p.id, lat: p.position.lat, lon: p.position.lon, titre: p.commerce || p.nom || "", couleur: JL.menthe })), [places]);
  const fiche = places.find((p) => p.id === choisi) || null;
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", echap); document.body.style.overflow = avant; };
  }, [onFermer]);
  // La position suivie s'arrête en fermant.
  useEffect(() => () => { if (suivi != null) navigator.geolocation?.clearWatch(suivi); }, [suivi]);
  // La carte se cale sur la position une fois, à l'activation (ou à un nouvel appui), puis laisse la main.
  useEffect(() => { if (centrer && moi) { const t = setTimeout(() => setCentrer(false), 0); return () => clearTimeout(t); } return undefined; }, [centrer, moi]);
  const localiser = () => {
    if (!navigator.geolocation) { toast.error("La localisation n'est pas disponible sur cet appareil."); return; }
    setCentrer(true);
    if (suivi != null) return;
    const id = navigator.geolocation.watchPosition(
      (p) => setMoi({ lat: p.coords.latitude, lon: p.coords.longitude, precision: p.coords.accuracy }),
      (e) => { toast.error(e?.code === 1 ? "Autorisez la localisation dans le navigateur pour vous voir sur la carte." : "Position introuvable pour l'instant."); navigator.geolocation.clearWatch(id); setSuivi(null); },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    setSuivi(id);
  };
  return createPortal(
    <motion.div className="fixed inset-0 z-[90] bg-fond" role="dialog" aria-label="Carte de la liste"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
      <CarteGoogleSecteurs secteurs={[]} marqueurs={marqueurs} marqueurActif={choisi} onMarqueur={setChoisi} moi={moi} suivreMoi={centrer} />
      <button type="button" onClick={onFermer} aria-label="Fermer la carte" title="Fermer"
        className="absolute left-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-full border border-trait bg-surface-pleine text-ardoise shadow-[0_4px_14px_rgb(0_0_0/0.18)] hover:text-encre"
        style={{ marginTop: "env(safe-area-inset-top)" }}>
        <X className="h-4 w-4" />
      </button>
      <button type="button" onClick={localiser} aria-label="Me localiser" title="Me localiser"
        className={`absolute bottom-6 right-4 z-10 grid h-12 w-12 place-items-center rounded-full border shadow-[0_6px_18px_rgb(0_0_0/0.22)] ${fiche ? "md:right-[436px]" : ""} ${moi ? "border-pervenche bg-surface-pleine text-pervenche" : "border-trait bg-surface-pleine text-craie hover:text-encre"}`}
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
        <LocateFixed className="h-5 w-5" />
      </button>
      <AnimatePresence>{fiche && <FichePoint key={fiche.id} fiche={fiche} onFermer={() => setChoisi(null)} />}</AnimatePresence>
      {places.length < fiches.length && (
        <span className="absolute left-14 top-4 z-10 rounded-full bg-surface-pleine/90 px-3 py-1 text-[12px] text-ardoise backdrop-blur" style={{ marginTop: "env(safe-area-inset-top)" }}>
          {places.length} sur la carte · {fiches.length - places.length} sans position
        </span>
      )}
    </motion.div>,
    document.body,
  );
}

export default function TableauListe({ fiches, libelles, listeId = null, carteDemandee = false, onCarteVue = null, reste = null, onRenommer = null, onSupprimer = null, agent = false }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState("toutes");
  const [retirer, setRetirer] = useState(false);
  // Les lignes cochées, pour agir en lot.
  const [coches, setCoches] = useState(() => new Set());
  const [ouvert, setOuvert] = useState(null); // la fiche ouverte en panneau Street View
  const [appelFiche, setAppelFiche] = useState(null); // la fiche dont on passe l'appel
  const [grandEcran, setGrandEcran] = useState(false); // la carte des commerces de la liste, en plein écran
  // L'onglet « Carte » de la page (à droite de Listes) l'ouvre ; la demande est consommée aussitôt (24 oct. 2026).
  useEffect(() => {
    if (!carteDemandee) return;
    if ((fiches || []).some((p) => p.position)) setGrandEcran(true);
    else toast.error("Aucun commerce de cette liste n'a de position à montrer sur la carte.");
    onCarteVue?.();
  }, [carteDemandee, fiches, onCarteVue]);
  const basculer = (id) => setCoches((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // À l'ouverture, les propriétaires manquants se cherchent en fond (sources
  // ouvertes, gratuit) ; tant qu'il en manque, la liste se relit.
  // Ce que le serveur lui-même a encore à chercher (une fiche déjà cherchée ne compte plus) ; sans lui, rien n'est annoncé.
  const sansProprio = reste?.proprietaires || 0;
  const sansNumero = reste?.numeros || 0;
  const [recherche, setRecherche] = useState(false);
  useEffect(() => {
    if (!listeId) return;
    base44.request("POST", `${API}/listes/${listeId}/proprietaires`)
      .then((r) => setRecherche((r?.lancees || 0) > 0))
      .catch(() => {});
  }, [listeId]);
  useEffect(() => {
    if (!recherche) return undefined;
    if (!sansProprio && !sansNumero) { setRecherche(false); return undefined; }
    const t = setInterval(() => queryClient.invalidateQueries({ queryKey: ["m-listes"] }), 5000);
    return () => clearInterval(t);
  }, [recherche, sansProprio, sansNumero, queryClient]);
  const rafraichir = () => {
    for (const k of [["m-listes"], ["mandataire-proprietaires"], ["mandataire-jour"]]) queryClient.invalidateQueries({ queryKey: k });
  };
  const onErr = (e) => toast.error(e?.message || "Impossible");
  const modifier = useMutation({ mutationFn: ({ id, champs }) => base44.request("PATCH", `${API}/proprietaires/${id}`, { body: champs }), onSuccess: rafraichir, onError: onErr });
  // Pas d'intérêt : la fiche sort des listes, une relance dans six mois (24 oct. 2026).
  const statut = useMutation({ mutationFn: ({ id, statut: s }) => base44.request("POST", `${API}/proprietaires/${id}/statut`, { body: { statut: s, ...(s === "pas_vendeur" ? { rappel_dans_jours: 180, note: "Pas d'intérêt" } : {}) } }), onSuccess: rafraichir, onError: onErr });
  const sansReponse = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/proprietaires/${id}/sans-reponse`),
    onSuccess: (r) => { rafraichir(); toast.success(`${r.titre} · ${r.pour}`); },
    onError: onErr,
  });
  const supprimer = useMutation({ mutationFn: (id) => base44.request("DELETE", `${API}/proprietaires/${id}`), onSuccess: rafraichir, onError: onErr });

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    const garde = (FILTRES.find(([k]) => k === filtre) || FILTRES[0])[2];
    return (fiches || []).filter(garde).filter((p) => !t || `${p.commerce || ""} ${p.nom || ""} ${p.cible?.proprietaire || ""} ${p.cible?.societe?.nom || ""} ${p.adresse || p.cible?.adresse || ""} ${p.telephone || ""}`.toLowerCase().includes(t));
  }, [fiches, q, filtre]);
  // Les cases suivent la liste : une fiche partie n'est plus cochée.
  useEffect(() => { setCoches((c) => new Set([...c].filter((id) => (fiches || []).some((p) => p.id === id)))); }, [fiches]);
  const tout = lignes.length > 0 && lignes.every((p) => coches.has(p.id));

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[240px] max-w-[420px] flex-1 items-center gap-3 rounded-full border border-trait bg-surface px-4 py-2.5 focus-within:border-bord-doux max-md:min-w-0 max-md:max-w-none max-md:basis-full">
          <Search className="h-3.5 w-3.5 flex-none text-ardoise" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Commerce, propriétaire, numéro"
            className="w-full border-none bg-transparent text-[14px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </div>
        {/* Au téléphone, la pilule défile sur une ligne. */}
        <div className="flex gap-1 rounded-full bg-rail-actif p-1 max-md:max-w-full max-md:overflow-x-auto max-md:[scrollbar-width:none] max-md:[&::-webkit-scrollbar]:hidden">
          {FILTRES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setFiltre(k)}
              className={`rounded-full px-3 py-1 text-[12.5px] max-md:flex-none max-md:whitespace-nowrap max-md:py-1.5 ${filtre === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`}
              style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <span className="ml-auto text-[13px] text-ardoise max-md:ml-0">
          {recherche && (sansProprio > 0 || sansNumero > 0) ? (
            <span className="inline-flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />{sansProprio > 0 ? `Propriétaires au cadastre : ${sansProprio} restant${sansProprio > 1 ? "s" : ""}` : `Numéros des propriétaires : ${sansNumero} restant${sansNumero > 1 ? "s" : ""}`}</span>
          ) : `${lignes.length} commerce${lignes.length > 1 ? "s" : ""}${agent ? " · remplie par votre agent IA" : ""}`}
        </span>
        {onRenommer && (
          <button type="button" onClick={onRenommer}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:text-encre" style={{ background: "transparent" }}>
            <Pencil className="h-3.5 w-3.5" />Renommer
          </button>
        )}
        {onSupprimer && (
          <button type="button" onClick={onSupprimer}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-alerte hover:border-alerte" style={{ background: "transparent" }}>
            <Trash2 className="h-3.5 w-3.5" />Supprimer la liste
          </button>
        )}
      </div>

      {coches.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-trait bg-surface-pleine px-4 py-2.5">
          <span className="text-[13.5px] text-encre">{coches.size} commerce{coches.size > 1 ? "s" : ""} coché{coches.size > 1 ? "s" : ""}</span>
          <button type="button" onClick={() => setRetirer(true)} disabled={supprimer.isPending}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-alerte hover:border-alerte disabled:opacity-50" style={{ background: "transparent" }}>
            {supprimer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}Retirer de la liste
          </button>
          <button type="button" onClick={() => setCoches(new Set())} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Tout décocher</button>
        </div>
      )}

      <AnimatePresence>{grandEcran && <CarteListeGrandEcran key="carte" fiches={lignes} onFermer={() => setGrandEcran(false)} />}</AnimatePresence>

      {/* Pas de hauteur fixe : le tableau s'allonge avec ses lignes, la page défile.
          Seul le débord horizontal (colonnes sur un écran étroit) défile dans le cadre. */}
      <div className="mt-4 overflow-x-auto rounded-[16px] border border-[color-mix(in_srgb,var(--k-bord-doux)_60%,transparent)] bg-rail">
        {/* Bordures séparées, pas fusionnées (25 oct. 2026, Jules : « on voit du texte passer derrière ») : fusionnées, les traits
            appartiennent au tableau et ne suivent pas les colonnes figées, le texte qui défile se voyait au travers ; séparées,
            chaque cellule porte les siens, peints sur son fond opaque. */}
        <table className="min-w-full border-separate border-spacing-0 text-[13.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-30 border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] bg-rail px-0 py-3.5" style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                <button type="button" onClick={() => setCoches(tout ? new Set() : new Set(lignes.map((p) => p.id)))} disabled={!lignes.length}
                  aria-label={tout ? "Tout décocher" : "Tout cocher"} title={tout ? "Tout décocher" : "Tout cocher"}
                  className="grid w-full place-items-center disabled:opacity-40" style={{ background: "transparent" }}>
                  <Case oui={tout} />
                </button>
              </th>
              <th className="sticky left-[44px] z-30 min-w-[220px] max-md:min-w-[140px] border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] bg-rail py-3.5 pl-2 pr-4 text-left text-[12.5px] font-normal text-encre">Commerce</th>
              {COLONNES.map((c) => (
                <th key={c.cle} className="border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] bg-rail px-4 py-3.5 text-left text-[12.5px] font-normal text-encre" style={{ minWidth: c.largeur }}>{c.titre}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((p) => {
              // On appelle le propriétaire des murs, pas la boulangerie. Un
              // propriétaire-occupant se joint par le commerce : même numéro.
              const tel = p.telephone || (p.cible?.proprietaire_occupant ? p.cible?.telephone : null) || null;
              const enregistrer = (champs) => modifier.mutate({ id: p.id, champs });
              return (
                <tr key={p.id} className={`group transition-colors ${coches.has(p.id) ? "bg-menthe/[0.05]" : "hover:bg-relief/30"}`}>
                  <td className="sticky left-0 z-10 border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] bg-rail px-0 py-4 align-middle" style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                    <button type="button" onClick={() => basculer(p.id)} aria-label={`Cocher ${p.commerce || p.cible?.enseigne || "la ligne"}`}
                      className="grid w-full place-items-center" style={{ background: "transparent" }}>
                      <Case oui={coches.has(p.id)} />
                    </button>
                  </td>
                  <td className="sticky left-[44px] z-10 border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] bg-rail py-4 pl-2 pr-4 align-middle">
                    <button type="button" onClick={() => setOuvert(p.id)} title="Voir la vitrine (Street View)"
                      className="block max-w-[220px] truncate border-0 p-0 text-left text-[13.5px] font-medium max-md:max-w-[124px] text-encre hover:text-menthe" style={{ background: "transparent" }}>
                      {p.commerce || p.cible?.enseigne || "Commerce"}
                    </button>
                  </td>
                  {COLONNES.map((c) => (
                    <td key={c.cle} className="border-b border-r border-[color-mix(in_srgb,var(--k-bord-doux)_45%,transparent)] px-4 py-4 align-middle" style={{ minWidth: c.largeur, maxWidth: c.largeur + 80 }}>
                      {c.cle === "appel" ? (
                        <span className="inline-flex flex-nowrap items-center gap-1.5 whitespace-nowrap">
                          {tel ? (
                            <button type="button" onClick={() => setAppelFiche(p.id)} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3 text-[12.5px] text-sur-menthe"><PhoneCall className="h-3.5 w-3.5" />Appeler</button>
                          ) : (p.telephone_commerce || p.cible?.telephone) ? (
                            // Pas encore le numéro du propriétaire : le commerce est une porte
                            // d'entrée (le locataire connaît souvent son bailleur).
                            <button type="button" onClick={() => setAppelFiche(p.id)} title="Le numéro du propriétaire n'est pas encore trouvé : appeler le commerce pour remonter jusqu'à lui"
                              className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-menthe hover:text-menthe" style={{ background: "transparent" }}><PhoneCall className="h-3.5 w-3.5" />Via le commerce</button>
                          ) : <span className="flex-none text-[12.5px] text-bord-vif">{p.cible?.proprietaire ? "pas de n° du proprio" : "proprio inconnu"}</span>}
                          <button type="button" onClick={() => sansReponse.mutate(p.id)} disabled={sansReponse.isPending} title="Pas de réponse : poser la relance suivante"
                            className="inline-flex h-8 flex-none items-center rounded-full border border-trait px-2.5 text-[12.5px] text-craie hover:border-menthe hover:text-menthe disabled:opacity-40" style={{ background: "transparent" }}>
                            Sans rép.
                          </button>
                        </span>
                      ) : c.cle === "investisseurs" ? (
                        (p.investisseurs || []).length ? (
                          <span className="flex flex-wrap gap-1">
                            {p.investisseurs.map((x) => (
                              <span key={x.reference} title={[x.pourquoi, x.budget].filter(Boolean).join(" · ")}
                                className="inline-flex items-center rounded-full bg-menthe/[0.12] px-2.5 py-0.5 text-[12.5px] text-encre">
                                {x.reference}{x.budget ? <span className="ml-1.5 text-ardoise">{x.budget}</span> : null}
                              </span>
                            ))}
                          </span>
                        ) : <span className="text-[12.5px] text-bord-vif">aucun pour l'instant</span>
                      ) : c.cle === "statut" ? (
                        <span className={`relative inline-flex h-8 items-center gap-2 rounded-full pl-3 pr-2 text-[13.5px] ${TEINTES_STATUT[TON_STATUT[p.statut] || "neutre"]}`}>
                          <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--point)" }} />
                          <span className="whitespace-nowrap">{libelles[p.statut] || p.statut}</span>
                          <ChevronDown className="h-3.5 w-3.5 flex-none opacity-70" />
                          <select aria-label={`Statut de ${p.commerce || p.nom}`} value={p.statut} onChange={(e) => statut.mutate({ id: p.id, statut: e.target.value })}
                            className="absolute inset-0 cursor-pointer opacity-0 max-md:text-[16px]">
                            {/* Deux statuts en Prospection, Pas d'intérêt pour sortir, et le rendez-vous qui fait passer dans Biens. */}
                            {[["a_appeler", "À contacter"], ["contacte", "Contacté"], ["rdv_pris", "Rendez-vous fixé (passe dans Biens)"], ["pas_vendeur", "Pas d'intérêt"]]
                              .concat(["a_appeler", "contacte", "rdv_pris", "pas_vendeur"].includes(p.statut) ? [] : [[p.statut, libelles[p.statut] || p.statut]])
                              .map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
                          </select>
                        </span>
                      ) : c.cle === "tel_commerce" && p.cible?.telephone && !p.telephone_commerce ? (
                        <span className="whitespace-nowrap">
                          <a href={`tel:${String(p.cible.telephone).replace(/[^\d+]/g, "")}`} className="text-[13.5px] text-craie hover:text-encre" style={{ fontVariantNumeric: "tabular-nums" }} title="Le commerce, pas le propriétaire">{p.cible.telephone}</a>
                          <Sources textes={[p.cible?.source]} p={p} />
                        </span>
                      ) : (
                        <Cellule p={p} col={c} onEnregistrer={enregistrer} />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
            {!lignes.length && <tr><td colSpan={COLONNES.length + 2} className="px-6 py-10 text-center text-[13.5px] text-brume">{q ? "Rien ne correspond à la recherche." : "Cette liste est vide."}</td></tr>}
          </tbody>
        </table>
      </div>
      {appelFiche && (fiches || []).some((p) => p.id === appelFiche) && (
        <PanneauAppelFiche p={(fiches || []).find((p) => p.id === appelFiche)} onFermer={() => setAppelFiche(null)} onFait={rafraichir} />
      )}
      <AnimatePresence>
        {ouvert && (fiches || []).some((p) => p.id === ouvert) && (
          <PanneauCommerce key={ouvert} p={(fiches || []).find((p) => p.id === ouvert)} libelles={libelles} onFermer={() => setOuvert(null)}
            onSansReponse={(id) => sansReponse.mutate(id)} onAppeler={(id) => { setOuvert(null); setAppelFiche(id); }} />
        )}
      </AnimatePresence>
      <p className="m-0 mt-3 flex items-center gap-1.5 text-[12.5px] text-brume">
        <ArrowRight className="h-3 w-3" />Le nom du commerce ouvre sa vitrine ; une cellule claire se modifie au clic ; « Sans rép. » pose la relance suivante (J+2 appel, J+5 mail, J+10 dernier appel).
      </p>
      <AlertDialog open={retirer} onOpenChange={(o) => { if (!o) setRetirer(false); }}>
        <AlertDialogContent className="border-bord-vif bg-surface-pleine sm:rounded-bloc">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-encre">Retirer {coches.size} commerce{coches.size > 1 ? "s" : ""} de la liste ?</AlertDialogTitle>
            <AlertDialogDescription className="text-ardoise">Leurs fiches et leurs relances sont supprimées avec eux.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => { for (const id of coches) supprimer.mutate(id); setCoches(new Set()); setRetirer(false); }} className="bg-alerte text-fond hover:bg-alerte/90">Retirer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
