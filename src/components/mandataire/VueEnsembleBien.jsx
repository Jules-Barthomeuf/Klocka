import React, { useRef, useState } from "react";
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
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { useReglagesChatMandataire } from "@/components/mandataire/ReglagesChatMandataire";
import MiniaturePiece from "@/components/preanalyse/MiniaturePiece";
import DossierVente, { ZonePiece } from "@/components/mandataire/DossierVente";
import { ETAPES_BIEN } from "@/lib/biens-mandataire";

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
  if (loyer) out.push({ texte: `loyer ${montant(loyer)}/an` });
  if (ca) out.push({ texte: `CA ${montant(ca)}` });
  if (ebe) out.push({ texte: `EBE ${montant(ebe)}` });
  if (surface) out.push({ texte: `${Number(surface).toLocaleString("fr-FR")} m²` });
  const bail = String(q.bail_type || "").match(/3-6-9|dérogatoire|précaire|professionnel/i)?.[0];
  if (bail) out.push({ texte: `bail ${bail.toLowerCase()}` });
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

// Les pièces attendues dans la Data room, par type de bien, avec leur repère. `nature` : celle que le serveur donne à un
// document déposé (server/documents-du-bien.js) ; `nom` : un mot du nom de fichier quand la nature ne suffit pas.
const PIECES = {
  fonds_commerce: [
    { mot: "Bail commercial", aide: "bail 3-6-9", nature: "bail", requise: true },
    { mot: "3 derniers bilans", aide: "confirme CA et EBE", nature: "bilans", sauf: /liasse/i, requise: true },
    { mot: "Liasses fiscales", aide: "3 derniers exercices", nature: "bilans", nom: /liasse/i },
    { mot: "Extrait Kbis", aide: "moins de 3 mois", nature: "kbis" },
    { mot: "Taxe foncière", aide: "dernier avis", nature: "taxe_fonciere" },
    { mot: "Registre du personnel", aide: "si salariés", nom: /registre|personnel|salari/i },
  ],
  murs_commerce: [
    { mot: "Bail commercial", aide: "et ses avenants", nature: "bail", requise: true },
    { mot: "Quittances de loyer", aide: "les trois dernières", nature: "quittances", requise: true },
    { mot: "Taxe foncière", aide: "dernier avis", nature: "taxe_fonciere" },
    { mot: "Titre de propriété", aide: "acte de vente", nature: "titre" },
    { mot: "Diagnostics", aide: "DPE, amiante, ERP", nature: "diagnostics", requise: true },
    { mot: "Copropriété", aide: "PV d'AG, règlement", nature: "copropriete" },
  ],
};

/** Pure : les pièces attendues pour vendre ce bien, chacune avec le document déposé qui la remplit (ou null). */
export function piecesAttendues(typeBien, documents = []) {
  const liste = PIECES[typeBien] || PIECES.murs_commerce;
  const pris = new Set();
  return liste.map((x) => {
    const d = documents.find((doc) => !pris.has(doc.id)
      && (x.nature ? doc.nature === x.nature : true)
      && (x.nom ? x.nom.test(doc.nom || "") : true)
      && (x.sauf ? !x.sauf.test(doc.nom || "") : true));
    if (d) pris.add(d.id);
    return { ...x, document: d || null };
  });
}

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
  jalon(p?.biens?.visite?.faite_le, "Visite faite", "previsite", "Vous");
  // Les événements racontés à l'import du bien (server/bien-repris.js), datés par le mandataire.
  for (const j of p?.biens?.jalons || []) jalon(j.le, j.detail && j.detail !== j.texte ? `${j.texte} (${j.detail})` : j.texte, j.etape || "", "Vous");
  jalon(e?.envoye_le, "Avis de valeur envoyé au propriétaire", "estimation", "Vous");
  jalon(m?.signe_le, "Mandat signé", "mandat", "Le vendeur");
  jalon(d?.en_vente_le, "Bien mis en vente", "marche", "Vous");
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
    offre: ["Voir les offres", "offre"], vente: ["Finaliser la vente", "vente"],
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
  const classe = "m-0 w-full text-center text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre";
  if (!onChanger) return <h1 className={classe}>{titre}</h1>;
  const finir = () => { const t = (edite ?? "").trim(); setEdite(null); if (t !== titre) onChanger(t); };
  return edite != null ? (
    <input autoFocus value={edite} onChange={(e) => setEdite(e.target.value)} onBlur={finir} aria-label="Nom du bien" maxLength={200}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdite(null); }}
      className={`${classe} rounded-champ border-0 bg-transparent outline-none ring-1 ring-bord-vif`} />
  ) : (
    <h1 className={classe}>
      <button type="button" onClick={() => setEdite(titre)} title="Renommer le bien" className="cursor-text rounded-[8px] px-2 decoration-bord-vif decoration-dotted underline-offset-[6px] hover:underline" style={{ background: "transparent" }}>{titre}</button>
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
    onSuccess: relireTout,
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  // Les biens aussi : un mandat déposé fait avancer l'étape d'un bien importé (4 nov. 2026).
  const relire = () => { ["m-documents-bien", "m-proprietaires"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); if (dossierId) queryClient.invalidateQueries({ queryKey: ["m-dossier-vente", dossierId] }); };
  const deposer = useMutation({
    mutationFn: ({ fichiers, nature = null }) => {
      const fd = new FormData();
      for (const f of fichiers) fd.append("fichier", f);
      if (nature) fd.append("nature", nature);
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
  const ajoutDoc = useAjoutFichier({ onOrdinateur: () => choixDoc.current?.click(), onFichiers: (f) => deposerDans("documents", null)(f) });
  const [fiche, setFiche] = useState(false);
  const [toutHistorique, setToutHistorique] = useState(false);
  const deposable = !!pid && data?.deposable !== false;
  // Une case de la Data room reçoit ses fichiers rangés dans sa nature ; la case « + », d'après leur nom.
  const deposerDans = (cle, nature) => (fichiers) => {
    if (!deposable || !fichiers.length) return;
    setEnCours(cle);
    deposer.mutate({ fichiers, nature }, { onSettled: () => setEnCours(null) });
  };
  const retirerDoc = (d) => (d?.modifiable ? retirer.mutate(d) : toast.error("Ce document se retire depuis son étape."));

  const etape = ETAPES_BIEN[(bien?.etape || 1) - 1];
  const faites = new Set(bien?.faites || []);
  const chiffres = chiffresDuBien(bien);
  const geste = gesteDe(etape.id, bien);
  const groupes = data?.groupes || [];
  const faitsAvecAssistant = groupes.find((g) => g.nature === "assistant")?.documents || [];
  const deposes = groupes.filter((g) => g.nature !== "assistant").flatMap((g) => g.documents);
  const historique = jalonsDuBien(bien, deposes);
  const attendues = piecesAttendues(bien?.type?.cle, deposes);
  const recues = attendues.filter((x) => x.document).length;
  const photos = deposes.filter((d) => d.nature === "photos");
  // L'avis et le mandat importés (faits ailleurs) vont avec les documents du bien, en haut ; pas dans la Data room.
  const importes = deposes.filter((d) => d.nature === "avis" || d.nature === "mandat");
  const autres = deposes.filter((d) => d.nature !== "photos" && d.nature !== "avis" && d.nature !== "mandat" && !attendues.some((x) => x.document?.id === d.id));

  const e = bien?.estimation || null;
  const q = e?.questionnaire || {};
  const c = e?.avis?.chiffres || {};
  const cr = p?.biens?.compte_rendu || null;
  const titre = bien?.adresse && p?.ville && !String(bien.adresse).toLowerCase().includes(String(p.ville).toLowerCase()) ? `${bien.adresse}, ${p.ville}` : bien?.adresse || bien?.titre || "Bien";
  // Les autres documents faits avec l'assistant (mandat, teaser, offres) : l'avis et le compte rendu ont leur vignette.
  const autresFaits = faitsAvecAssistant.filter((d) => !["estimation", "previsite"].includes(d.etape));

  return (
    <div>
      {/* L'adresse, et ses chiffres en une ligne. */}
      <header className="border-b border-bord-vif pb-8 pt-2 text-center">
        <TitreModifiable titre={p?.nom_bien || titre} onChanger={pid ? (t) => renommer.mutate(t) : null} />
        {chiffres.length > 0 && (
          <p className="m-0 mt-2 text-[15px] text-craie">
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
            <button type="button" onClick={() => finir.mutate()} disabled={finir.isPending} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>C'est fait</button>
          </div>
          <p className="m-0 pb-4 text-[14px] leading-[1.55] text-craie">Dites l'adresse et ce que c'est (murs, fonds de commerce, bureaux), puis racontez où vous en êtes, en vocal si vous voulez : la visite, l'avis de valeur, le mandat, avec les dates. Ensuite, ajoutez ce que vous avez avec « + ».</p>
          {/* Le même chat que les autres pages du bien (4 nov. 2026, Jules : « comme dans les autres pages avec Assistant
              KPartners ») : le fil du bien, ses sources, l'avatar, et plus le chat compact de la fiche. */}
          <div className="h-[560px] max-md:h-[70dvh]">
            <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={pid} reglages={outilsChat.reglages} onReponse={relireTout} onConversation={() => {}}
              sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="L'adresse, le type, puis où vous en êtes…" sansBarreHaut reprendre />
          </div>
        </section>
      )}

      {/* Des filets fins entre les sections, comme les pages éditeur (3 nov. 2026, Jules). */}
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)]">
        {/* Les étapes reliées : faites, en cours (dépliée), à venir. */}
        <ol className="relative m-0 list-none self-start p-0 py-8 max-md:border-b max-md:border-bord-vif md:pr-10">
          <span aria-hidden className="absolute bottom-[54px] left-[9px] top-[44px] w-px bg-bord-vif" />
          {ETAPES_BIEN.map((x) => {
            const faite = faites.has(x.id);
            const courante = x.id === etape.id && !faite;
            const sesLignes = courante ? historique.filter((h) => h.etape === x.id).slice(0, 4).reverse() : [];
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
                    <span className={`min-w-0 flex-1 truncate text-[15px] hover:text-menthe ${faite || courante ? "text-encre" : "text-craie"} ${courante ? "font-medium" : ""}`}>{x.label}</span>
                    {faite && <span className="flex-none text-[12.5px] text-ardoise">Faite</span>}
                    {courante && <span className="flex-none text-[12.5px] text-menthe">en cours</span>}
                  </button>
                </div>
                {courante && (
                  <div className="ml-8 mt-3 flex flex-col gap-2">
                    {sesLignes.map((h, i) => (
                      <div key={`${h.le}-${i}`} className="flex items-center justify-between gap-3 rounded-[10px] border border-trait bg-surface px-3 py-2.5">
                        <span className="min-w-0 truncate text-[13.5px] text-encre">{h.texte}</span>
                        <span className="flex-none text-[12.5px] text-ardoise">{jourCourt(h.le)}</span>
                      </div>
                    ))}
                    {geste && (
                      <button type="button" onClick={() => onAller(geste[1])}
                        className="mt-1 inline-flex h-10 w-fit items-center rounded-full bg-menthe px-4 text-[14px] font-medium text-sur-menthe hover:bg-menthe-survol">{geste[0]}</button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        <div className="min-w-0 md:border-l md:border-bord-vif">
          {/* Les documents du bien, en vignettes. */}
          <section className="py-8 md:pl-10">
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
                    : /\.pdf($|\?)/i.test(d.url || "") || String(d.id).startsWith("mandat:") && d.url ? <MiniaturePiece url={d.url} largeur={165} className="!rounded-none !border-0 !shadow-none" />
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
                  {/\.pdf($|\?)/i.test(d.nom || d.url || "") ? <MiniaturePiece url={d.url} largeur={165} className="!rounded-none !border-0 !shadow-none" /> : <span className="block p-4 text-[9px] text-black">{d.nom}</span>}
                </Vignette>
              ))}
              {/* Le « + » des documents (4 nov. 2026, Jules) : l'avis de valeur, le mandat, ce qu'on a ; rangés d'après leur nom. */}
              {deposable && (
                <>
                  {ajoutDoc.rendu}
                  <input ref={choixDoc} type="file" multiple className="hidden" onChange={(ev) => { const f = [...(ev.target.files || [])]; ev.target.value = ""; if (f.length) deposerDans("documents", null)(f); }} />
                  <button type="button" onClick={ajoutDoc.ouvrir} aria-label="Ajouter des documents" title="Ajouter des documents : avis de valeur, mandat…"
                    onDragOver={(ev) => ev.preventDefault()} onDrop={(ev) => { ev.preventDefault(); deposerDans("documents", null)([...(ev.dataTransfer?.files || [])]); }}
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
          </section>
        </div>
      </div>

      {/* L'historique, en tableau, sur toute la largeur (4 nov. 2026, Jules). */}
      <section className="border-t border-bord-vif py-8">
        <p className={intertitre}>Historique</p>
        {!historique.length ? <p className="m-0 text-[13.5px] text-brume">Rien encore.</p> : (
          <table className="w-full border-collapse text-left">
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
                  <td className="py-3 align-top text-[13.5px] text-ardoise max-md:hidden">{ETAPES_BIEN.find((x) => x.id === h.etape)?.label || ""}</td>
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

      {/* La Data room, comme dans son onglet (4 nov. 2026, Jules) : une case par pièce, le fichier glissé ou « + », un check
          quand elle est là ; les photos ; la case « + » du bas pour le reste. Ouverte au mandat, c'est l'onglet lui-même. */}
      <section className="border-t border-bord-vif pt-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="m-0 text-[15px] text-encre">Data room</p>
          <span className="flex items-baseline gap-4">
            {dossierId && <button type="button" onClick={() => onAller("dataroom")} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Ouvrir</button>}
            {!dossierId && <span className="text-[13px] tabular-nums text-ardoise"><span className={recues === attendues.length ? "text-menthe" : ""}>{recues}</span> pièce{recues > 1 ? "s" : ""} sur {attendues.length}</span>}
          </span>
        </div>
        {dossierId ? <DossierVente dossierId={dossierId} lecture /> : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {attendues.map((x) => {
              const docs = x.document ? [x.document] : [];
              return (
                <ZonePiece key={x.mot} occupe={enCours === x.mot}
                  p={{ cle: x.mot, mot: x.mot, requise: !!x.requise, etat: docs.length ? "recue" : "manquante", fichiers: docs.map((d) => ({ nom: d.nom, url: d.url, id: d.id, note: d.note, nom_origine: d.nom_origine })) }}
                  onDeposer={deposerDans(x.mot, x.nature || "autres")} onAnnote={relire} onRetirer={(f) => retirerDoc(docs.find((d) => d.url === f.url))} />
              );
            })}
            <ZonePiece occupe={enCours === "photos"}
              p={{ cle: "photos", mot: "Photos du bien", requise: false, etat: photos.length ? "recue" : "manquante", fichiers: photos.map((d) => ({ nom: d.nom, url: d.url, note: d.note, nom_origine: d.nom_origine })) }}
              onDeposer={deposerDans("photos", "photos")} onAnnote={relire} onRetirer={(f) => retirerDoc(photos.find((d) => d.url === f.url))} />
            <ZonePiece libre occupe={enCours === "autres"}
              p={{ cle: "autres", mot: "Autres documents", etat: autres.length ? "recue" : "manquante", fichiers: autres.map((d) => ({ nom: d.nom, url: d.url, note: d.note, nom_origine: d.nom_origine })) }}
              onDeposer={deposerDans("autres", null)} onAnnote={relire} onRetirer={(f) => retirerDoc(autres.find((d) => d.url === f.url))} />
          </div>
        )}
      </section>
      <AnimatePresence>{fiche && pid && <FichePoint key={pid} fiche={{ id: pid, commerce: p.commerce, nom: p.nom, adresse: p.adresse }} onFermer={() => setFiche(false)} />}</AnimatePresence>
    </div>
  );
}
