import React, { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Plus, X } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useAjoutFichier } from "@/components/ui/ajout-fichier";
import { montant, fourchette as fourchetteDe } from "../../../server/montants.js";
import { FichePoint } from "@/components/mandataire/TableauListe";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { CompteRendu } from "@/components/mandataire/PreVisite";
import { DocumentMandat } from "@/components/mandataire/ApercuMandat";
import { BoutonPrincipal, Statut } from "@/components/mandataire/elements";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { useReglagesChatMandataire } from "@/components/mandataire/ReglagesChatMandataire";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import { DataRoom, Ranger, useDataRoom } from "@/components/mandataire/DossierVente";
import { etapeFaite, etapesDuBien, etapesVisibles, rangVisible, versVisible } from "@/lib/biens-mandataire";
import { estLocation } from "@/lib/location";

// La vue d'ensemble d'un bien (3 nov. 2026, Jules : « un tableau de bord du bien, où on n'est pas dans une étape précise,
// on voit tout ; ça rajoute du liant »). On arrive toujours ici. Sans chat, sur la maquette de Jules du même jour :
// en tête l'adresse et ses chiffres en une ligne ; à gauche les étapes reliées, l'étape en cours dépliée avec ce qui
// s'y est passé et son geste ; à droite les documents du bien en vignettes, puis l'historique en tableau ; en bas la
// Data room, la zone de dépôt à gauche et les pièces attendues à droite. La Data room ne stocke rien de plus : c'est la
// même liste de documents, vue par ce qu'il faut pour vendre.

const jour = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "");
const jourCourt = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const intertitre = "m-0 pb-3 text-[15px] text-encre";

/** Pure : les ids que le serveur sait relier au bien. */
export const idsDuBien = (bien) => ({
  proprietaire: bien?.proprietaire?.id || "", estimation: bien?.estimation?.id || "", mandat: bien?.mandat?.id || "",
  dossier: bien?.dossier?.id || "", marche: bien?.marche?.id || "",
});

/**
 * Pure : les chiffres du bien en une ligne, sous l'adresse : le prix (mandat, avis, accord ou souhaité), le rendement,
 * le loyer, les comptes d'un fonds, la surface, le bail. Chaque morceau { texte, accent }.
 */
export function chiffresDuBien(bien) {
  const e = bien?.estimation || null;
  const q = e?.questionnaire || {};
  const c = e?.avis?.chiffres || {};
  const b = bien?.proprietaire?.biens || {};
  // Ce que le mandataire a raconté à l'import d'un bien (4 nov. 2026), tant qu'aucun avis ne le porte.
  const r = b.repris || {};
  const out = [];
  const prix = bien?.mandat?.prix ? montant(bien.mandat.prix)
    : c.valeur ? montant(c.valeur)
      : c.bas && c.haut ? fourchetteDe(c.bas, c.haut)
        : b.prix_accord ? montant(b.prix_accord)
          : b.compte_rendu?.proprietaire?.prix ? `${montant(b.compte_rendu.proprietaire.prix)} souhaités`
            : r.prix ? montant(r.prix) : null;
  if (prix) out.push({ texte: prix });
  if (c.rendement) out.push({ texte: "rendement", accent: `${String(c.rendement).replace(".", ",")} %` });
  const loyer = q.loyer_annuel_hc || r.loyer_annuel;
  const ca = q.ca_n || r.ca;
  const ebe = q.ebe_n || r.ebe;
  const surface = q.surface_utile || r.surface;
  const location = b.transaction === "location";
  if (location) out.push({ texte: "à louer" });
  // Le loyer actuel et celui du bail quand ils diffèrent (6 nov. 2026, banc d'import : les deux se gardent, avec leur source).
  const auBail = (r.loyers || []).find((l) => /bail/i.test(l.source || "") && !/avenant/i.test(l.source || ""));
  if (loyer) out.push({ texte: `${location ? "loyer demandé" : "loyer"} ${montant(loyer)}/an${auBail && auBail.montant !== loyer ? ` (${montant(auBail.montant)} au bail)` : ""}` });
  if ((r.lots || []).length > 1) out.push({ texte: `${r.lots.length} lots` });
  if (ca) out.push({ texte: `CA ${montant(ca)}` });
  if (ebe) out.push({ texte: `EBE ${montant(ebe)}` });
  if (surface) out.push({ texte: `${Number(surface).toLocaleString("fr-FR")} m²` });
  const bail = String(q.bail_type || "").match(/3-6-9|dérogatoire|précaire|professionnel/i)?.[0];
  if (bail) out.push({ texte: `bail ${bail.toLowerCase()}` });
  if (bien?.proprietaire?.hors_secteur) out.push({ texte: "hors secteur" });
  return out;
}

// Une date machine dans un texte d'historique (« RDV pris (2026-11-04T08:00:00) ») se lit en français : « 4 nov. à 8 h ».
const MOIS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
export const datesLisibles = (t) => String(t).replace(/(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z?)?/g,
  (_, a, m, j, h, mn) => `${Number(j)} ${MOIS[Number(m) - 1]}${h && !(h === "00" && mn === "00") ? ` à ${Number(h)} h${mn !== "00" ? ` ${mn}` : ""}` : ""}`);

/** Pure : l'historique du bien, de la fiche à la vente, le plus récent en tête ; chaque ligne { le, texte, etape, par }. */
export function historiqueDuBien(bien) {
  const lignes = [];
  const de = (objet, etape) => {
    for (const h of objet?.historique || []) {
      const texte = h.texte || h.action || null;
      if (h.le && texte) { const t = datesLisibles(texte); lignes.push({ le: h.le, texte: t.charAt(0).toUpperCase() + t.slice(1), etape, par: h.par || null }); }
    }
  };
  de(bien?.proprietaire, "previsite");
  de(bien?.estimation, "estimation");
  de(bien?.mandat, "mandat");
  de(bien?.dossier, "dataroom");
  de(bien?.marche, "marche");
  return lignes.sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

// Un document renommé (« Mandat simple n° 24 ») perd son extension : on regarde le fichier lui-même (son adresse, son nom
// d'origine), pas son nom affiché, pour montrer sa vraie page (6 nov. 2026, Jules).
const extension = (d) => [d?.url, d?.nom_origine, d?.nom].map((x) => String(x || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i)?.[1]?.toLowerCase()).find(Boolean) || "";
const estPdf = (d) => extension(d) === "pdf";
const estImage = (d) => ["jpg", "jpeg", "png", "webp", "gif", "heic"].includes(extension(d));

// Qui a apporté un document, d'après sa provenance (server/documents-du-bien.js).
const AUTEUR_SOURCE = { "déposé par le vendeur": "Le vendeur", "déposé par vous": "Vous", "joint dans le fil du bien": "Vous", "joint à l'avis de valeur": "Vous", "déposé dans la Data room": "Vous", "photo de la visite": "Vous", "déposée dans la Data room": "Vous" };

/**
 * Pure : l'historique du tableau, réduit à ce qui compte (4 nov. 2026, Jules : « mets pas tout, Mandat signé ; l'important,
 * c'est que les documents reçus y soient bien ») : la visite faite, l'avis envoyé, le mandat signé, la mise en vente, les
 * offres, et chaque arrivée de documents, regroupée par jour et par provenance. Le plus récent en tête ; chaque ligne
 * { le, texte, etape, auteur }.
 */
export function jalonsDuBien(bien, documents = []) {
  const lignes = [];
  const jalon = (le, texte, etape, auteur = "") => { if (le) lignes.push({ le, texte, etape, auteur }); };
  const p = bien?.proprietaire || null;
  const e = bien?.estimation || null;
  const m = bien?.mandat || null;
  const d = bien?.dossier || null;
  const loc = estLocation(bien);
  jalon(p?.biens?.visite?.faite_le, "Visite faite", "previsite", "Vous");
  // Les événements racontés à l'import du bien (server/bien-repris.js), datés par le mandataire.
  for (const j of p?.biens?.jalons || []) jalon(j.le, j.detail && j.detail !== j.texte ? `${j.texte} (${j.detail})` : j.texte, j.etape || "", "Vous");
  jalon(e?.envoye_le, loc ? "Estimation du loyer envoyée au propriétaire" : "Avis de valeur envoyé au propriétaire", "estimation", "Vous");
  jalon(m?.signe_le, loc ? "Mandat de location signé" : "Mandat signé", "mandat", loc ? "Le propriétaire" : "Le vendeur");
  jalon(d?.en_vente_le, loc ? "Local mis en location" : "Bien mis en vente", "marche", "Vous");
  jalon(p?.biens?.loue?.le, "Bail signé", "vente", "Vous");
  for (const o of bien?.marche?.offres || []) jalon(o.validee_le || o.le, `Offre reçue${o.montant ? ` : ${montant(o.montant)}` : ""}`, "offre", "L'équipe Klocka");
  // Les documents reçus, un lot par jour et par provenance.
  const lots = new Map();
  for (const x of documents.filter((y) => y.le)) {
    const cle = `${String(x.le).slice(0, 10)}|${x.source || ""}`;
    if (!lots.has(cle)) lots.set(cle, []);
    lots.get(cle).push(x);
  }
  const ouverte = d?.cree_le || m?.signe_le || null;
  for (const lot of lots.values()) {
    const le = lot.map((x) => x.le).sort().at(-1);
    const noms = lot.map((x) => x.nom);
    const texte = lot.length === 1 ? `Document reçu : ${noms[0]}` : `${lot.length} documents reçus : ${noms.slice(0, 3).join(", ")}${lot.length > 3 ? ` et ${lot.length - 3} autre${lot.length > 4 ? "s" : ""}` : ""}`;
    lignes.push({ le, texte, etape: ouverte && le >= ouverte ? "dataroom" : "", auteur: AUTEUR_SOURCE[lot[0].source] || "" });
  }
  return lignes.sort((a, b) => String(b.le).localeCompare(String(a.le)));
}

/** Le geste de l'étape en cours, dans la frise de gauche. */
function gesteDe(etape, bien) {
  const e = bien?.estimation;
  if (etape === "previsite") return bien?.proprietaire?.biens?.compte_rendu ? ["Faire l'avis de valeur", "estimation"] : ["Préparer la visite", "previsite"];
  if (etape === "estimation") return e?.avis && e.statut !== "envoye" ? ["Envoyer l'avis de valeur", "estimation"] : e?.statut === "envoye" ? ["Suivre la réponse", "estimation"] : ["Faire l'avis de valeur", "estimation"];
  return {
    mandat: ["Préparer le mandat", "mandat"], dataroom: ["Compléter la Data room", "dataroom"], marche: ["Suivre la commercialisation", "marche"],
    // Plus de « Voir les offres » (8 nov. 2026, Jules) : les offres se suivent dans la Mise en vente, onglet Offres.
    vente: ["Finaliser la vente", "vente"],
  }[etape] || null;
}

// Une vignette de document : la vraie première page du document (3 nov. 2026, Jules), son nom et son état dessous.
function Vignette({ titre, etat, etatAccent = false, onClick, href, fond = "bg-white", onRetirer = null, children }) {
  const feuille = (
    <span className={`block h-[233px] overflow-hidden rounded-[6px] text-left shadow-[0_6px_18px_rgb(0_0_0/0.25)] transition-transform group-hover:-translate-y-0.5 ${fond}`}>{children}</span>
  );
  const pied = (
    <span className="mt-3 block">
      <span className="block truncate text-[13.5px] text-encre group-hover:text-menthe">{titre}</span>
      {etat && <span className={`block truncate text-[12.5px] ${etatAccent ? "text-ambre" : "text-ardoise"}`}>{etat}</span>}
    </span>
  );
  const carte = href
    ? <a href={href} target="_blank" rel="noreferrer" className="group block w-[165px] flex-none">{feuille}{pied}</a>
    : <button type="button" onClick={onClick} className="group block w-[165px] flex-none text-left" style={{ background: "transparent" }}>{feuille}{pied}</button>;
  if (!onRetirer) return carte;
  // Un document déposé se retire (4 nov. 2026, Jules : « pouvoir supprimer les documents, pour les réimporter ») : la
  // croix au survol, toujours visible au téléphone.
  return (
    <div className="group/doc relative w-[165px] flex-none">
      {carte}
      <button type="button" onClick={onRetirer} aria-label={`Retirer ${titre}`} title="Retirer ce document"
        className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full border border-bord-doux bg-fond/85 text-craie opacity-0 backdrop-blur transition-opacity hover:text-encre group-hover/doc:opacity-100 focus-visible:opacity-100 max-md:opacity-100">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Le titre du bien, modifiable d'un clic (4 nov. 2026, Jules : « modifier directement le nom quand on clique dessus ») :
 * Entrée ou quitter le champ enregistre, Échap annule ; vidé, le bien reprend son adresse.
 */
function TitreModifiable({ titre, onChanger }) {
  const [edite, setEdite] = useState(null);
  const classe = "m-0 min-w-0 text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre";
  if (!onChanger) return <h1 className={classe}>{titre}</h1>;
  const finir = () => { const t = (edite ?? "").trim(); setEdite(null); if (t !== titre) onChanger(t); };
  // Sans cadre (8 nov. 2026, Jules) : le champ a la largeur du texte, ce qui suit le titre se pousse à mesure qu'on écrit.
  return edite != null ? (
    <span className={`${classe} inline-grid max-w-full`}>
      <span aria-hidden className="invisible col-start-1 row-start-1 overflow-hidden whitespace-pre">{edite}&nbsp;</span>
      <input autoFocus size={1} value={edite} onChange={(e) => setEdite(e.target.value)} onBlur={finir} aria-label="Nom du bien" maxLength={200}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdite(null); }}
        className="col-start-1 row-start-1 w-full min-w-0 border-0 bg-transparent p-0 text-encre outline-none [font:inherit] [letter-spacing:inherit]" />
    </span>
  ) : (
    <h1 className={classe}>
      <button type="button" onClick={() => setEdite(titre)} title="Renommer le bien" className="cursor-text rounded-[8px] p-0 text-left decoration-bord-vif decoration-dotted underline-offset-[6px] hover:underline" style={{ background: "transparent" }}>{titre}</button>
    </h1>
  );
}

// Un écran de l'application en page réduite : le vrai composant, dessiné à sa largeur puis réduit à celle de la
// vignette, sans clic ni focus.
function Reduit({ largeur, children }) {
  return (
    <span inert="" aria-hidden className="pointer-events-none block h-full overflow-hidden">
      <span className="block origin-top-left" style={{ width: largeur, transform: `scale(${165 / largeur})` }}>{children}</span>
    </span>
  );
}

// La première page photographiée par le serveur (avis, teaser), comme dans la Bibliothèque ; une page blanche sinon.
function PageImage({ src }) {
  const [vue, setVue] = useState(true);
  return src && vue ? <img src={src} alt="" loading="lazy" onError={() => setVue(false)} className="block h-full w-full object-cover object-top" draggable={false} /> : null;
}

const vignetteServeur = (id, version) => `/api/mandataire/documents/vignette?id=${encodeURIComponent(id)}&v=${encodeURIComponent(version || "")}`;

export default function VueEnsembleBien({ bien, onAller, sansImport = false }) {
  const queryClient = useQueryClient();
  const ids = idsDuBien(bien);
  const { data, isLoading } = useQuery({
    queryKey: ["m-documents-bien", ids],
    queryFn: () => base44.request("GET", `/api/mandataire/biens/documents?${new URLSearchParams(ids)}`),
    enabled: !!(ids.proprietaire || ids.estimation || ids.mandat || ids.dossier || ids.marche),
  });
  const dossierId = bien?.dossier?.id || null;
  const p = bien?.proprietaire || null;
  const pid = p?.id || null;
  // `sansImport` : l'écran scindé de l'import porte déjà le chat, à gauche (4 nov. 2026).
  const enImport = !sansImport && !!p?.biens?.import && !p.biens.import.fini;
  const outilsChat = useReglagesChatMandataire(["estimation", "mandat", "dossier"]);
  const renommer = useMutation({
    mutationFn: (nom) => base44.request("PATCH", `/api/mandataire/proprietaires/${pid}`, { body: { nom_bien: nom } }),
    onSuccess: () => relireTout(),
    onError: (e) => toast.error(e?.message || "Nom non enregistré"),
  });
  const importEnCours = !!p?.biens?.import && !p.biens.import.fini;
  const placer = useMutation({
    mutationFn: (etapeId) => base44.request("POST", `/api/mandataire/proprietaires/${pid}/etape-actuelle`, { body: { etape: etapeId } }),
    onSuccess: () => relireTout(),
    onError: (e) => toast.error(e?.message || "Étape non enregistrée"),
  });
  const relireTout = () => { ["m-proprietaires", "m-documents-bien", "m-fiche"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); };
  const finir = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/proprietaires/${pid}/import/fini`),
    // « Import terminé » met aussi le bien et ses contacts au CRM (6 nov. 2026) : l'écran dit ce qui est parti.
    onSuccess: (r) => { relireTout(); if (r?.crm?.ok) toast.success("Import terminé, le bien est au CRM."); else if (r?.crm) toast.error(`Import terminé, mais le CRM a refusé : ${r.crm.error || "réessayez depuis le chat"}`); else toast.success("Import terminé."); },
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  // Les biens aussi : un mandat déposé fait avancer l'étape d'un bien importé (4 nov. 2026).
  const relire = () => { ["m-documents-bien", "m-proprietaires"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); if (dossierId) queryClient.invalidateQueries({ queryKey: ["m-dossier-vente", dossierId] }); };
  const dataroom = useDataRoom(pid, dossierId);
  // Un fichier rangé dans une case de la Data room (celle du dossier, ou celle du bien avant le mandat).
  const dansLaDataRoom = async (cle, fichiers) => {
    if (!dataroom.url || !fichiers.length) return;
    setEnCours("documents");
    try {
      for (const f of fichiers) {
        const fd = new FormData();
        fd.append("fichier", f);
        await base44.request("POST", cle === "photos" ? `${dataroom.url}/photos` : `${dataroom.url}/pieces/${encodeURIComponent(cle)}`, { body: fd });
      }
      toast.success(fichiers.length > 1 ? `${fichiers.length} documents rangés` : "Document rangé");
    } catch (err) { toast.error(err?.message || "Dépôt impossible"); }
    setEnCours(null);
    dataroom.relire();
  };
  const deposer = useMutation({
    mutationFn: ({ fichiers, nature = null, cas = null }) => {
      const fd = new FormData();
      for (const f of fichiers) fd.append("fichier", f);
      if (nature) fd.append("nature", nature);
      if (cas) fd.append("case", cas);
      return base44.request("POST", `/api/mandataire/proprietaires/${pid}/documents`, { body: fd });
    },
    onSuccess: (r) => { relire(); toast.success(r?.deposes?.length > 1 ? `${r.deposes.length} documents rangés` : "Document rangé"); },
    onError: (e) => toast.error(e?.message || "Dépôt impossible"),
  });
  const retirer = useMutation({
    mutationFn: (d) => base44.request("DELETE", `/api/mandataire/proprietaires/${pid}/documents/${encodeURIComponent(String(d.id).replace(/^piece:/, ""))}`),
    onSuccess: relire,
    onError: (e) => toast.error(e?.message || "Non retiré"),
  });
  const [enCours, setEnCours] = useState(null);
  const choixDoc = useRef(null);
  // Le « + » des documents : l'ordinateur ou Google Drive (4 nov. 2026, Jules).
  const ajoutDoc = useAjoutFichier({ onOrdinateur: () => choixDoc.current?.click(), onFichiers: (f) => demander(f, true) });
  // Un document importé par le « + » : on choisit sa case de la Data room, ou on en nomme une nouvelle (4 nov. 2026,
  // Jules). `haut` : le « + » des documents du bien, qui propose aussi l'avis de valeur et le mandat.
  const [aRanger, setARanger] = useState(null);
  const demander = (fichiers, haut = false) => { if (deposable && fichiers.length) setARanger({ fichiers, haut }); };
  const nouvelleCase = useMutation({
    mutationFn: async ({ mot, fichiers }) => {
      const r = await base44.request("POST", `${dataroom.url}/cases`, { body: { mot } });
      await dansLaDataRoom(r.cle, fichiers);
    },
    onSuccess: () => setARanger(null),
    onError: (e) => toast.error(e?.message || "Case non créée"),
  });
  const [fiche, setFiche] = useState(false);
  const [toutHistorique, setToutHistorique] = useState(false);
  const [ordi, setOrdi] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 768px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 768px)");
    const suivre = () => setOrdi(m.matches);
    m.addEventListener("change", suivre);
    return () => m.removeEventListener("change", suivre);
  }, []);
  const deposable = !!pid && data?.deposable !== false;
  // Une case de la Data room reçoit ses fichiers rangés dans sa nature ; la case « + », d'après leur nom.
  const deposerDans = (cle, nature, cas = null) => (fichiers) => {
    if (!deposable || !fichiers.length) return;
    setEnCours(cle);
    deposer.mutate({ fichiers, nature, cas }, { onSettled: () => setEnCours(null) });
  };

  // Six étapes à l'écran (7 nov. 2026) : la Data room et la Commercialisation font la Mise en vente ; le geste suit
  // l'étape interne (compléter la Data room, puis suivre la commercialisation).
  const lesEtapes = etapesVisibles(bien);
  const etape = lesEtapes[rangVisible(bien?.etape || 1) - 1];
  const interne = etapesDuBien(bien)[(bien?.etape || 1) - 1];
  const faites = new Set(bien?.faites || []);
  const chiffres = chiffresDuBien(bien);
  const geste = gesteDe(interne.id, bien);
  const groupes = data?.groupes || [];
  const faitsAvecAssistant = groupes.find((g) => g.nature === "assistant")?.documents || [];
  const deposes = groupes.filter((g) => g.nature !== "assistant").flatMap((g) => g.documents);
  const historique = jalonsDuBien(bien, deposes);
  // Ce que compte l'en-tête de la Data room : ses cases nommées par le type, reçues ou non.
  const comptees = (dataroom.v?.pieces || []).filter((x) => x.cle !== "autres" && !x.perso);
  const recues = comptees.filter((x) => x.etat !== "manquante").length;
  // L'avis et le mandat importés (faits ailleurs) vont avec les documents du bien, en haut ; pas dans la Data room.
  const importes = deposes.filter((d) => d.nature === "avis" || d.nature === "mandat");
  // Les cases proposées pour ranger : celles qu'on voit, dans le même ordre ; la clé dit où va le fichier.
  const casesARanger = (haut) => [
    ...(haut ? [{ cle: "n:avis", mot: "Avis de valeur" }, { cle: "n:mandat", mot: "Mandat" }] : []),
    ...(dataroom.v?.pieces || []).filter((x) => x.cle !== "autres").map((x) => ({ cle: `c:${x.cle}`, mot: x.mot })),
    { cle: "c:photos", mot: "Photos du bien" },
    { cle: "c:autres", mot: "Autres documents" },
  ];
  const ranger = (k) => {
    const { fichiers } = aRanger;
    setARanger(null);
    // L'avis et le mandat restent des documents du bien ; le reste va dans une case de la Data room, la même partout.
    if (k.startsWith("n:")) deposerDans("documents", k.slice(2))(fichiers);
    else dansLaDataRoom(k.slice(2), fichiers);
  };
  const blocRanger = (haut) => aRanger && aRanger.haut === haut && (
    <Ranger fichiers={aRanger.fichiers} cases={casesARanger(haut)} occupe={nouvelleCase.isPending || deposer.isPending}
      onChoisir={ranger} onNouvelle={(mot) => nouvelleCase.mutate({ mot, fichiers: aRanger.fichiers })} onAnnuler={() => setARanger(null)} />
  );

  const e = bien?.estimation || null;
  const q = e?.questionnaire || {};
  const c = e?.avis?.chiffres || {};
  const cr = p?.biens?.compte_rendu || null;
  const titre = bien?.adresse && p?.ville && !String(bien.adresse).toLowerCase().includes(String(p.ville).toLowerCase()) ? `${bien.adresse}, ${p.ville}` : bien?.adresse || bien?.titre || "Bien";
  // Les autres documents faits avec l'assistant (mandat, teaser, offres) : l'avis et le compte rendu ont leur vignette.
  const autresFaits = faitsAvecAssistant.filter((d) => !["estimation", "previsite"].includes(d.etape));

  // Le chat de l'assistant et l'historique changent de place avec l'écran (7 nov. 2026, Jules) : au téléphone, le chat
  // sous les étapes et l'historique en bas ; à l'ordinateur, l'historique sous les étapes et le chat sous les documents.
  const chat = pid && !enImport ? (
    <section aria-label="L'assistant" className="py-8">
      <div className="h-[460px] max-md:h-[60dvh]">
        <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={pid} reglages={outilsChat.reglages} onReponse={relireTout} onConversation={() => {}}
          sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Demandez à l'assistant…" sansBarreHaut reprendre compact />
      </div>
    </section>
  ) : null;
  const historiqueBloc = () => (
    <section className="border-t border-bord-vif py-8">
      <p className={intertitre}>Historique</p>
      {!historique.length ? <p className="m-0 text-[13.5px] text-brume">Rien encore.</p> : (
        <ul className="m-0 list-none p-0">
          {(toutHistorique ? historique : historique.slice(0, 8)).map((h, i) => (
            <li key={`${h.le}-${i}`} className="flex gap-3 border-b border-trait py-2.5 last:border-b-0">
              <span className="w-[52px] flex-none text-[12.5px] tabular-nums text-ardoise">{jourCourt(h.le)}</span>
              <span className="min-w-0 flex-1 text-[13.5px] leading-[1.5] text-encre">{h.texte}</span>
            </li>
          ))}
        </ul>
      )}
      {historique.length > 8 && (
        <button type="button" onClick={() => setToutHistorique((x) => !x)} className="mt-2 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          {toutHistorique ? "Moins" : `Tout voir (${historique.length})`}
        </button>
      )}
    </section>
  );

  return (
    <div>
      {/* L'adresse, et ses chiffres en une ligne. */}
      <header className="border-b border-trait pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <TitreModifiable titre={p?.nom_bien || titre} onChanger={pid ? (t) => renommer.mutate(t) : null} />
          {bien?.statut && <Statut>{bien.statut}</Statut>}
          {pid && estLocation(p) && <Statut couleur="lavande">À louer</Statut>}
        </div>
        {/* Plus de bascule Vente · Location (6 nov. 2026, Jules : « que ça détecte, pas qu'on ait à cocher ») : l'import, l'avis,
            le mandat et le chat posent la location d'eux-mêmes ; l'en-tête la dit seulement. */}
        {chiffres.length > 0 && (
          <p className="m-0 mt-1 text-[13.5px] text-ardoise">
            {chiffres.map((x, i) => (
              <React.Fragment key={x.texte}>{i > 0 && " · "}<span className="whitespace-nowrap">{x.texte}{x.accent && <> <span className="text-ambre">{x.accent}</span></>}</span></React.Fragment>
            ))}
          </p>
        )}
      </header>

      {/* Un bien qu'on importe (4 nov. 2026, Jules : « juste un chat, il te pose des questions ») : le chat au milieu, sous
          l'en-tête, tant que l'import n'est pas fini. Chaque réponse relit la page : l'en-tête, l'historique et l'étape se
          remplissent à mesure. */}
      {enImport && (
        <section className="mx-auto w-full max-w-[760px] border-b border-bord-vif py-8">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <p className="m-0 text-[15px] text-encre">Faire entrer ce bien</p>
            <button type="button" onClick={() => finir.mutate()} disabled={finir.isPending} className="inline-flex h-8 flex-none items-center rounded-full bg-pervenche px-3.5 text-[13px] text-sur-pervenche hover:brightness-110 disabled:opacity-50">{finir.isPending ? "Import…" : "Import terminé"}</button>
          </div>
          <p className="m-0 pb-4 text-[14px] leading-[1.55] text-craie">Racontez-moi ce bien : où il est, ce que c'est, où vous en êtes avec le propriétaire, qui s'est placé dessus. En vocal si vous voulez, et joignez ce que vous avez (mandat, avis de valeur, bail).</p>
          {/* Le même chat que les autres pages du bien (4 nov. 2026, Jules : « comme dans les autres pages avec Assistant
              KPartners ») : le fil du bien, ses sources, l'avatar, et plus le chat compact de la fiche. */}
          <div className="h-[560px] max-md:h-[70dvh]">
            <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={pid} reglages={outilsChat.reglages} onReponse={relireTout} onConversation={() => {}}
              sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Racontez ce bien…" sansBarreHaut reprendre />
          </div>
        </section>
      )}

      {/* Des filets fins entre les sections, comme les pages éditeur (3 nov. 2026, Jules). */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)]">
        {/* Les étapes reliées, puis le chat de l'assistant juste dessous (7 nov. 2026, Jules : « mettre le chat de l'assistant
            sous la timeline ») : au téléphone, entre les étapes et les documents ; à l'ordinateur, dans la colonne de gauche. */}
        <div className="self-start max-md:border-b max-md:border-trait md:pr-8">
        <ol className="relative m-0 list-none p-0 py-4">
          <span aria-hidden className="absolute bottom-[54px] left-[9px] top-[44px] w-px bg-bord-vif" />
          {lesEtapes.map((x) => {
            const faite = etapeFaite(faites, x);
            const courante = x.id === etape.id && !faite;
            const sesLignes = courante ? historique.filter((h) => versVisible(h.etape) === x.id).slice(0, 4).reverse() : [];
            return (
              <li key={x.id} className="relative pb-3">
                {/* Le numéro met le bien à cette étape, en avant comme en arrière (4 nov. 2026, Jules : « on clique sur 5 et
                    ça le met à l'étape 5 ») ; le nom ouvre l'étape, sauf pendant l'import, où lui aussi la pose. */}
                <div className="group flex w-full items-center gap-3">
                  <button type="button" onClick={() => pid && !courante && placer.mutate(x.id)} disabled={!pid || placer.isPending} aria-label={`Mettre le bien à l'étape ${x.n} : ${x.label}`} title={courante ? "Étape en cours" : `Mettre le bien à cette étape`}
                    className={`relative grid h-[19px] w-[19px] flex-none place-items-center rounded-full text-[10.5px] tabular-nums transition-shadow hover:ring-2 hover:ring-menthe/50 ${faite ? "bg-menthe text-sur-menthe" : courante ? "border border-encre bg-fond text-encre" : "border border-bord bg-fond text-brume"}`}>
                    {placer.isPending && placer.variables === x.id ? <Loader2 className="h-3 w-3 animate-spin" /> : faite ? <Check className="h-3 w-3" strokeWidth={2.6} /> : x.n}
                  </button>
                  <button type="button" onClick={() => (importEnCours ? !courante && placer.mutate(x.id) : onAller(x.id))} className="flex min-w-0 flex-1 items-center gap-3 text-left" style={{ background: "transparent" }}>
                    <span className={`min-w-0 flex-1 truncate text-[14px] hover:text-menthe ${faite || courante ? "text-encre" : "text-craie"} ${courante ? "font-medium" : ""}`}>{x.label}</span>
                    {faite && <Statut couleur="menthe" className="flex-none">Faite</Statut>}
                    {courante && <Statut couleur="bleu" className="flex-none">En cours</Statut>}
                  </button>
                </div>
                {courante && (
                  <div className="ml-8 mt-3 flex flex-col gap-2">
                    {sesLignes.map((h, i) => (
                      <div key={`${h.le}-${i}`} className="flex items-center justify-between gap-3 border-b border-trait py-1.5">
                        <span className="min-w-0 truncate text-[13.5px] text-encre">{h.texte}</span>
                        <span className="flex-none text-[12.5px] text-ardoise">{jourCourt(h.le)}</span>
                      </div>
                    ))}
                    {geste && (
                      <BoutonPrincipal onClick={() => onAller(geste[1])} className="mt-1 w-fit">{geste[0]}</BoutonPrincipal>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {ordi ? historiqueBloc(true) : chat}
        </div>

        <div className="min-w-0 md:border-l md:border-trait">
          {/* Les documents du bien, en vignettes. */}
          <section className="py-4 md:pl-8">
            <p className={intertitre}>Documents</p>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {e && (
                <Vignette titre="Avis de valeur" etat={!e.avis ? "En cours" : e.statut === "envoye" ? `Envoyé le ${jourCourt(e.envoye_le)}` : "Pas encore envoyé"} etatAccent={!!e.avis && e.statut !== "envoye"} onClick={() => onAller("estimation")}>
                  {e.avis && <PageImage src={vignetteServeur(`estimation:${e.id}`, e.updated_date || e.prete_le || e.cree_le)} />}
                </Vignette>
              )}
              {cr && (
                <Vignette titre="Compte rendu" etat={jourCourt(cr.le || p?.biens?.visite?.faite_le)} onClick={() => onAller("previsite")} fond="bg-surface-pleine">
                  <Reduit largeur={420}><div className="-mt-3 [&>section]:rounded-none [&>section]:border-0"><CompteRendu cr={cr} /></div></Reduit>
                </Vignette>
              )}
              {pid && (
                <Vignette titre="Fiche du bien" etat={p.commerce || p.nom || null} onClick={() => setFiche(true)} fond="bg-surface-pleine">
                  <Reduit largeur={420}><FicheMandataire id={pid} repli={{ commerce: p.commerce || p.nom, adresse: p.adresse }} sansChat sansPreparation sansHistorique /></Reduit>
                </Vignette>
              )}
              {autresFaits.map((d) => (
                <Vignette key={d.id} titre={d.nom} etat={jourCourt(d.le)} onClick={() => d.etape && onAller(d.etape)} href={!d.etape && d.url ? d.url : null}>
                  {d.vignette ? <PageImage src={d.vignette} />
                    : estPdf(d) || String(d.id).startsWith("mandat:") && d.url ? <MiniaturePiece url={d.url} largeur={165} className="!rounded-none !border-0 !shadow-none" />
                    // Le mandat fait avec l'assistant, sans PDF : sa vraie première page, comme le teaser (7 nov. 2026, Jules).
                    : String(d.id).startsWith("mandat:") && bien?.mandat?.questionnaire ? <span className="block h-full bg-white"><Reduit largeur={794}><span className="block [&_.mn-doc]:p-0"><DocumentMandat q={bien.mandat.questionnaire} numero={bien.mandat.numero_registre || null} /></span></Reduit></span>
                    : (
                      // Une offre n'a pas de page : son texte, sur une page.
                      <span className="block p-4 text-black">
                        <span className="block text-[9px] font-semibold">{d.nom}</span>
                        {d.detail && <span className="mt-1 block text-[8px] leading-[1.4] text-black/60">{d.detail}</span>}
                      </span>
                    )}
                </Vignette>
              ))}
              {importes.map((d) => (
                <Vignette key={d.id} titre={d.nature === "mandat" ? "Mandat" : "Avis de valeur"} etat={[d.source, jourCourt(d.le)].filter(Boolean).join(" · ")} href={d.url}
                  onRetirer={d.modifiable ? () => { if (window.confirm(`Retirer « ${d.nom} » des documents du bien ?`)) retirer.mutate(d); } : null}>
                  {estPdf(d) ? <MiniaturePiece url={d.url} largeur={165} className="!rounded-none !border-0 !shadow-none" />
                    : estImage(d) ? <img src={d.url} alt="" className="h-full w-full object-cover" />
                    : <span className="block p-4 text-[9px] text-black">{d.nom}</span>}
                </Vignette>
              ))}
              {/* Le « + » des documents (4 nov. 2026, Jules) : l'avis de valeur, le mandat, ce qu'on a ; rangés d'après leur nom. */}
              {deposable && (
                <>
                  {ajoutDoc.rendu}
                  <input ref={choixDoc} type="file" multiple className="hidden" onChange={(ev) => { const f = [...(ev.target.files || [])]; ev.target.value = ""; demander(f, true); }} />
                  <button type="button" onClick={ajoutDoc.ouvrir} aria-label="Ajouter des documents" title="Ajouter des documents : avis de valeur, mandat…"
                    onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); demander([...(ev.dataTransfer?.files || [])], true); }}
                    className="group block w-[165px] flex-none text-left" style={{ background: "transparent" }}>
                    <span className="grid h-[233px] place-items-center rounded-[6px] border border-dashed border-bord text-brume transition-colors group-hover:border-bord-vif group-hover:text-craie">
                      {enCours === "documents" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
                    </span>
                    <span className="mt-3 block text-[13.5px] text-ardoise group-hover:text-encre">Ajouter</span>
                  </button>
                </>
              )}
              {!e && !cr && !pid && !autresFaits.length && !importes.length && <p className="m-0 text-[13.5px] text-brume">{isLoading ? "Lecture des documents…" : "Aucun document encore."}</p>}
            </div>
            {blocRanger(true)}
          </section>
          {ordi && chat && <div className="border-t border-bord-vif md:pl-10">{chat}</div>}
        </div>
      </div>

      {/* L'historique, en tableau, sur toute la largeur au téléphone (4 nov. 2026, Jules) ; à l'ordinateur, il est sous les
          étapes, à gauche (7 nov. 2026). */}
      {!ordi && (
      <section className="border-t border-bord-vif py-8">
        <p className={intertitre}>Historique</p>
        {!historique.length ? <p className="m-0 text-[13.5px] text-brume">Rien encore.</p> : (
          <table className="w-full border-collapse text-left [&_td:not(:last-child)]:border-r [&_td:not(:first-child)]:pl-3 [&_td]:border-trait [&_td]:pr-3 [&_th:not(:last-child)]:border-r [&_th:not(:first-child)]:pl-3 [&_th]:border-trait [&_th]:pr-3">
            <thead>
              <tr className="border-b border-trait text-[12.5px] text-ardoise">
                <th className="w-[128px] py-2 font-normal">Date</th>
                <th className="py-2 font-normal">Événement</th>
                <th className="w-[200px] py-2 font-normal max-md:hidden">Étape</th>
                <th className="w-[180px] py-2 text-right font-normal max-md:hidden">Par</th>
              </tr>
            </thead>
            <tbody>
              {(toutHistorique ? historique : historique.slice(0, 8)).map((h, i) => (
                <tr key={`${h.le}-${i}`} className="border-b border-trait">
                  <td className="py-3 align-top text-[13.5px] tabular-nums text-ardoise">{jour(h.le)}</td>
                  <td className="py-3 pr-6 text-[14px] text-encre">{h.texte}</td>
                  <td className="py-3 align-top text-[13.5px] text-ardoise max-md:hidden">{lesEtapes.find((x) => x.id === h.etape)?.label || ""}</td>
                  <td className="py-3 text-right align-top text-[13.5px] text-ardoise max-md:hidden">{h.auteur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {historique.length > 8 && (
          <button type="button" onClick={() => setToutHistorique((x) => !x)} className="mt-2 text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            {toutHistorique ? "Moins" : `Tout voir (${historique.length})`}
          </button>
        )}
      </section>
      )}

      {/* La Data room : la même que l'étape 4, avant comme après le mandat (6 nov. 2026, Jules : « c'est la même : dès
          qu'on renomme un truc, ça le renomme dans l'autre »). Ses cases suivent le type du bien (src/lib/data-room.js). */}
      <section className="border-t border-bord-vif pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 text-[15px] text-encre">Data room</p>
          <span className="flex items-baseline gap-4">
            {comptees.length > 0 && <span className="text-[13px] tabular-nums text-ardoise"><span className={recues === comptees.length ? "text-menthe" : ""}>{recues}</span> pièce{recues > 1 ? "s" : ""} sur {comptees.length}</span>}
            {pid && <button type="button" onClick={() => onAller("dataroom")} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Ouvrir</button>}
          </span>
        </div>
        {(pid || dossierId) && <DataRoom proprietaireId={pid} dossierId={dossierId} />}
      </section>
      <AnimatePresence>{fiche && pid && <FichePoint key={pid} fiche={{ id: pid, commerce: p.commerce, nom: p.nom, adresse: p.adresse }} onFermer={() => setFiche(false)} />}</AnimatePresence>
    </div>
  );
}

