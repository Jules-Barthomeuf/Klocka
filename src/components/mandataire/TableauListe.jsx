import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ExternalLink, Loader2, PhoneCall, Search, Trash2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import PanneauAppelFiche from "@/components/mandataire/PanneauAppelFiche";

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
  const position = c.lat != null && c.lon != null ? `${c.lat},${c.lon}` : null;
  const adresse = [p.adresse || c.adresse, p.ville].filter(Boolean).join(", ");
  const tel = p.telephone || (c.proprietaire_occupant ? c.telephone : null) || null;
  const faits = [
    ["Type d'activité", c.activite || p.activite || null],
    ["Emplacement", ROND[c.emplacement] || null],
    ["Adresse", adresse],
    ["Propriétaire des murs", p.nom || c.proprietaire || null],
    ["Société", c.societe?.nom || c.societe?.forme || (c.societe?.en_nom_propre ? "En nom propre" : null)],
    ["Numéro du propriétaire", p.telephone || null],
    ["Numéro du commerce", c.telephone || null],
    ["Statut", libelles[p.statut] || p.statut],
  ].filter(([, v]) => v);
  return (
    <div className="animate-in fade-in duration-200 fixed inset-0 z-[70] flex justify-end bg-fond/60 backdrop-blur-sm" onClick={onFermer}>
      <div className="animate-in slide-in-from-right-6 flex h-full w-full max-w-[560px] flex-col overflow-y-auto border-l border-trait bg-surface-pleine duration-300" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0">
            <p className="m-0 truncate text-[16px] font-medium text-encre">{p.commerce || c.enseigne || "Commerce"}</p>
            <p className="m-0 mt-0.5 truncate text-[12.5px] text-ardoise">{adresse}</p>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="relative h-[320px] flex-none bg-fond">
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
        <div className="flex flex-wrap items-center gap-2 px-5 pt-4">
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
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 px-5 py-5">
          {faits.map(([mot, v]) => (
            <div key={mot}><dt className="text-[11px] uppercase tracking-[.1em] text-brume">{mot}</dt><dd className="m-0 mt-0.5 text-[13.5px] leading-[1.5] text-encre">{v}</dd></div>
          ))}
        </dl>
      </div>
    </div>
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
      rows={2} className="w-full resize-none rounded-md border border-menthe/60 bg-fond px-2 py-1 text-[13.5px] text-encre outline-none" />;
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

export default function TableauListe({ fiches, libelles, listeId = null }) {
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  // Les lignes cochées, pour agir en lot.
  const [coches, setCoches] = useState(() => new Set());
  const [ouvert, setOuvert] = useState(null); // la fiche ouverte en panneau Street View
  const [appelFiche, setAppelFiche] = useState(null); // la fiche dont on passe l'appel
  const basculer = (id) => setCoches((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // À l'ouverture, les propriétaires manquants se cherchent en fond (sources
  // ouvertes, gratuit) ; tant qu'il en manque, la liste se relit.
  const sansProprio = (fiches || []).filter((p) => (p.cible && !p.cible.proprietaire && !(p.nom || "").trim()) || (!p.cible && p.adresse && !p.rattachement_tente_le)).length;
  const sansNumero = (fiches || []).filter((p) => p.cible?.proprietaire && !p.telephone).length;
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
  const statut = useMutation({ mutationFn: ({ id, statut: s }) => base44.request("POST", `${API}/proprietaires/${id}/statut`, { body: { statut: s } }), onSuccess: rafraichir, onError: onErr });
  const sansReponse = useMutation({
    mutationFn: (id) => base44.request("POST", `${API}/proprietaires/${id}/sans-reponse`),
    onSuccess: (r) => { rafraichir(); toast.success(`${r.titre} · ${r.pour}`); },
    onError: onErr,
  });
  const supprimer = useMutation({ mutationFn: (id) => base44.request("DELETE", `${API}/proprietaires/${id}`), onSuccess: rafraichir, onError: onErr });

  const lignes = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (fiches || []).filter((p) => !t || `${p.commerce || ""} ${p.nom || ""} ${p.cible?.proprietaire || ""} ${p.cible?.societe?.nom || ""} ${p.adresse || p.cible?.adresse || ""} ${p.telephone || ""}`.toLowerCase().includes(t));
  }, [fiches, q]);
  // Les cases suivent la liste : une fiche partie n'est plus cochée.
  useEffect(() => { setCoches((c) => new Set([...c].filter((id) => (fiches || []).some((p) => p.id === id)))); }, [fiches]);
  const tout = lignes.length > 0 && lignes.every((p) => coches.has(p.id));

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
      <label className="flex h-10 min-w-[260px] max-w-[360px] flex-1 items-center gap-2.5 rounded-full border border-trait bg-rail px-4 focus-within:border-bord-vif">
        <Search className="h-4 w-4 flex-none text-brume" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher un commerce, un nom, un numéro" className="w-full border-none bg-transparent text-[13.5px] text-encre outline-none placeholder:text-brume" />
      </label>
      {coches.size > 0 && (
        <span className="inline-flex items-center gap-2.5 text-[12.5px] text-craie">
          <span className="tabular-nums">{coches.size} cochée{coches.size > 1 ? "s" : ""}</span>
          <button type="button"
            onClick={() => { if (window.confirm(`Retirer ${coches.size} fiche${coches.size > 1 ? "s" : ""} de la liste ?`)) { for (const id of coches) supprimer.mutate(id); setCoches(new Set()); } }}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-alerte hover:text-alerte" style={{ background: "transparent" }}>
            <Trash2 className="h-3.5 w-3.5" /> Retirer de la liste
          </button>
        </span>
      )}
      {recherche && (sansProprio > 0 || sansNumero > 0) && (
        <span className="inline-flex items-center gap-2 text-[12.5px] text-ardoise">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" />
          {sansProprio > 0 ? `Recherche des propriétaires au cadastre : ${sansProprio} restant${sansProprio > 1 ? "s" : ""}` : `Recherche des numéros des propriétaires (Apollo) : ${sansNumero} restant${sansNumero > 1 ? "s" : ""}`}
        </span>
      )}
      </div>

      {/* Pas de hauteur fixe : le tableau s'allonge avec ses lignes, la page défile.
          Seul le débord horizontal (colonnes sur un écran étroit) défile dans le cadre. */}
      <div className="overflow-x-auto rounded-[16px] border border-trait bg-rail">
        <table className="min-w-full border-collapse text-[13.5px]">
          <thead>
            <tr>
              <th className="sticky left-0 z-30 border-b border-trait bg-rail py-3.5 pl-4 pr-1" style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                <button type="button" onClick={() => setCoches(tout ? new Set() : new Set(lignes.map((p) => p.id)))} disabled={!lignes.length}
                  aria-label={tout ? "Tout décocher" : "Tout cocher"} title={tout ? "Tout décocher" : "Tout cocher"}
                  className="grid place-items-center disabled:opacity-40" style={{ background: "transparent" }}>
                  <Case oui={tout} />
                </button>
              </th>
              <th className="sticky left-[44px] z-30 min-w-[220px] border-b border-r border-trait bg-rail py-3.5 pl-2 pr-4 text-left text-[12.5px] font-normal text-encre">Commerce</th>
              {COLONNES.map((c) => (
                <th key={c.cle} className="border-b border-r border-trait bg-rail px-4 py-3.5 text-left text-[12.5px] font-normal text-encre" style={{ minWidth: c.largeur }}>{c.titre}</th>
              ))}
              <th className="border-b border-trait bg-rail px-3 py-3.5" aria-label="Supprimer" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((p) => {
              // On appelle le propriétaire des murs, pas la boulangerie. Un
              // propriétaire-occupant se joint par le commerce : même numéro.
              const tel = p.telephone || (p.cible?.proprietaire_occupant ? p.cible?.telephone : null) || null;
              const enregistrer = (champs) => modifier.mutate({ id: p.id, champs });
              return (
                <tr key={p.id} className="group">
                  <td className="sticky left-0 z-10 border-b border-trait bg-rail py-4 pl-4 pr-1 align-middle" style={{ width: 44, minWidth: 44, maxWidth: 44 }}>
                    <button type="button" onClick={() => basculer(p.id)} aria-label={`Cocher ${p.commerce || p.cible?.enseigne || "la ligne"}`}
                      className="grid place-items-center" style={{ background: "transparent" }}>
                      <Case oui={coches.has(p.id)} />
                    </button>
                  </td>
                  <td className="sticky left-[44px] z-10 border-b border-r border-trait bg-rail py-4 pl-2 pr-4 align-middle">
                    <button type="button" onClick={() => setOuvert(p.id)} title="Voir la vitrine (Street View)"
                      className="block max-w-[220px] truncate border-0 p-0 text-left text-[13.5px] font-medium text-encre hover:text-menthe" style={{ background: "transparent" }}>
                      {p.commerce || p.cible?.enseigne || "Commerce"}
                    </button>
                  </td>
                  {COLONNES.map((c) => (
                    <td key={c.cle} className="border-b border-r border-trait px-4 py-4 align-middle last:border-r-0 group-hover:bg-encre/[0.02]" style={{ minWidth: c.largeur, maxWidth: c.largeur + 80 }}>
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
                            className="absolute inset-0 cursor-pointer opacity-0">
                            {Object.entries(libelles).map(([k, mot]) => <option key={k} value={k}>{mot}</option>)}
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
                  <td className="border-b border-trait px-3 py-4 align-middle">
                    <button type="button" onClick={() => { if (window.confirm("Retirer cette fiche de la liste ?")) supprimer.mutate(p.id); }}
                      aria-label="Supprimer la fiche" title="Supprimer la fiche"
                      className="grid h-8 w-8 place-items-center rounded-full text-brume opacity-0 transition-opacity hover:text-alerte group-hover:opacity-100 max-md:opacity-100" style={{ background: "transparent" }}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {!lignes.length && <tr><td colSpan={COLONNES.length + 3} className="px-6 py-10 text-center text-[13.5px] text-brume">{q ? "Rien ne correspond à la recherche." : "Cette liste est vide."}</td></tr>}
          </tbody>
        </table>
      </div>
      {appelFiche && (fiches || []).some((p) => p.id === appelFiche) && (
        <PanneauAppelFiche p={(fiches || []).find((p) => p.id === appelFiche)} onFermer={() => setAppelFiche(null)} onFait={rafraichir} />
      )}
      {ouvert && (fiches || []).some((p) => p.id === ouvert) && (
        <PanneauCommerce p={(fiches || []).find((p) => p.id === ouvert)} libelles={libelles} onFermer={() => setOuvert(null)}
          onSansReponse={(id) => sansReponse.mutate(id)} onAppeler={(id) => { setOuvert(null); setAppelFiche(id); }} />
      )}
      <p className="m-0 text-[12.5px] text-brume">{lignes.length} ligne{lignes.length > 1 ? "s" : ""} · clic sur une cellule claire pour la modifier · « Sans rép. » pose la relance suivante (J+2 appel, J+5 mail, J+10 dernier appel).</p>
    </div>
  );
}
