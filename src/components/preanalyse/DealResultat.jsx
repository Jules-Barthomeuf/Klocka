/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import { FOND, MOT, Th, teinteDe, useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { Depliant } from "@/components/haka/ReglagesDemande";

// Les colonnes et les traits du tableau de l'Analyse (AnalysePieces.jsx), sans la colonne Source : Critère, Valeur, Notes.
// Critère et Notes se règlent à la souris, gardés sur le poste (10 nov. 2026, Jules) ; Notes plus large par défaut.
const COLONNES_FICHE = "grid-cols-[var(--k-col-critere,170px)_minmax(0,1fr)_var(--k-col-notes,340px)]";
const CLE_COLONNES = "klocka:colonnes-preanalyse";
const COLONNES_DEFAUT = { critere: 170, notes: 340 };
function lireColonnes() {
  try { return { ...COLONNES_DEFAUT, ...JSON.parse(localStorage.getItem(CLE_COLONNES) || "{}") }; } catch { return COLONNES_DEFAUT; }
}
/** Les largeurs des colonnes, et la poignée qui les tire. */
function useColonnes() {
  const [l, setL] = useState(lireColonnes);
  const tirer = (cle, sens) => (e) => {
    e.preventDefault();
    const x0 = e.clientX;
    const depart = l[cle];
    let fin = depart;
    const bouger = (ev) => { fin = Math.min(700, Math.max(110, depart + sens * (ev.clientX - x0))); setL((v) => ({ ...v, [cle]: fin })); };
    const lacher = () => {
      window.removeEventListener("pointermove", bouger); window.removeEventListener("pointerup", lacher);
      try { localStorage.setItem(CLE_COLONNES, JSON.stringify({ ...lireColonnes(), [cle]: fin })); } catch { /* sans mémoire */ }
    };
    window.addEventListener("pointermove", bouger); window.addEventListener("pointerup", lacher);
  };
  return { style: { "--k-col-critere": `${l.critere}px`, "--k-col-notes": `${l.notes}px` }, tirer };
}
const Poignee = ({ onPointerDown, cote }) => (
  <span role="separator" aria-orientation="vertical" title="Tirer pour ajuster la colonne" onPointerDown={onPointerDown}
    className={`absolute inset-y-0 ${cote}-0 z-10 w-2 cursor-col-resize ${cote === "right" ? "translate-x-1/2" : "-translate-x-1/2"} hover:bg-menthe/30`} />
);
const CELLULES_FICHE = "px-2 max-lg:gap-y-1.5 lg:px-0 lg:py-0 lg:divide-x lg:divide-trait lg:[&>*]:px-2.5";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import TexteEnPlace from "@/components/ui/texte-en-place";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Archive, Check, ChevronDown, ChevronUp, Loader2, MapPin, Pencil, Quote, Send, Trash2, X,
} from "lucide-react";
import { toast } from "@/components/ui/avis";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import CarteGoogle from "@/components/CarteGoogle";
import StreetViewRue from "@/components/projet/StreetViewRue";
import FicheSource, { boutonFicheSource } from "@/components/preanalyse/FicheSource";
import PenseeIA from "@/components/PenseeIA";

// Sans clé Maps, ni la rue ni le plan ne s'affichent : on le dit plutôt que de
// laisser deux cadres noirs.
const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";
import { J } from "@/design/jetons";
import { VERRE, VERRE_LG } from "@/lib/verre";

// Bibliothèque partagée du workflow d'analyse : verdicts, statuts, carte d'un
// lot, dialogue de mail d'intention, journal de suivi. Consommée par
// WorkflowDeal (la page Analyse) et PipelineDeals (la liste des deals).

// Les clés sont les valeurs du moteur de règles (invariant serveur) ; seuls
// les libellés affichés changent — un langage de comité, pas de jargon GO/NO-GO.
export const VERDICTS = {
  // Aux jetons (10 nov. 2026, Jules : « les couleurs ne vont pas en mode clair ») : les -300 de Tailwind se lisaient mal sur fond clair.
  "GO": { libelle: "Conforme", classe: "bg-menthe/15 text-menthe border-menthe/40", bord: "border-menthe/40", statut: "menthe" },
  "GO SOUS RÉSERVE": { libelle: "Conforme sous réserve", classe: "bg-ambre/15 text-ambre border-ambre/40", bord: "border-ambre/40", statut: "ambre" },
  "INSUFFISANT": { libelle: "Dossier incomplet", classe: "bg-ardoise/15 text-craie border-ardoise/40", bord: "border-ardoise/40", statut: "gris" },
  "NO-GO": { libelle: "Non conforme", classe: "bg-alerte/15 text-alerte border-alerte/40", bord: "border-alerte/40", statut: "corail" },
};

export const libelleVerdict = (v) => VERDICTS[v]?.libelle || v;

export const STATUTS_DEAL = {
  analyse: { libelle: "Analysé", classe: "bg-encre/10 text-craie border-encre/20" },
  documents_demandes: { libelle: "Docs demandés", classe: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  documents_recus: { libelle: "Docs reçus", classe: "bg-menthe/15 text-menthe border-menthe/30" },
  depouille: { libelle: "Extrait", classe: "bg-menthe/15 text-menthe-clair border-menthe/30" },
  abandonne: { libelle: "Abandonné", classe: "bg-red-500/15 text-red-300 border-red-500/30" },
  projet_cree: { libelle: "Projet créé", classe: "bg-menthe/20 text-menthe-clair border-menthe/40" },
};

// La grille des critères : nos critères à gauche, le bien à droite, et le
// verdict ligne à ligne — une coche menthe ou une croix corail. C'est ce
// qu'on voit en premier : le verdict global n'est que la somme de ces lignes.
// Vérifié à la main : vert ; pas sûr : jaune. Un clic sur la ligne fait le tour.
const VERIF = { verifie: { fond: "#2f7a5a", mot: "Vérifié" }, incertain: { fond: "#a8752a", mot: "Pas sûr" } };
const cleLigne = (l) => `${l.groupe}|${l.champ}`;

// Les sept lignes du tableau du bien, et les critères qui jugent chacune.
// Une ligne prend le critère le plus sévère parmi les siens : c'est lui qui
// décide, et c'est lui que l'analyste doit lire.
// Dans l'ordre du travail (11 nov. 2026, Jules, après avis) : le bien d'abord, puis ses chiffres face au marché, puis le
// verdict, sans intercalaires (même jour : « enlève les lignes Le bien »). Prix marché et Loyer marché vivent dans la
// ligne de leur chiffre ; l'adresse est dans la carte Emplacement.
const LIGNES_BIEN = [
  { id: "emplacement", element: "Adresse et emplacement", champs: ["emplacement"] },
  // Ce que « Corriger la fiche » portait seul, désormais modifiable dans le tableau (18 oct. 2026, Jules) : sans critère, la ligne est une information.
  { id: "surface", element: "Surface", info: true },
  // Plus de ligne Occupé (11 nov. 2026, Jules) : le verdict calculé la juge toujours, d'après la fiche.
  // Le nom du locataire a sa ligne, au-dessus de l'activité (10 nov. 2026, Jules) : le projet le reprend.
  { id: "nom_locataire", element: "Nom du locataire", info: true },
  { id: "activite", element: "Activité", champs: ["categorie_activite", "activite_exclue"] },
  { id: "enseigne", element: "Qualité de l'enseigne", champs: ["signature", "locataire_nom"] },
  { id: "bail", element: "Bail", info: true },
  { id: "prix", element: "Prix FAI", champs: ["prix_fourchette"], avecMarche: "prix" },
  { id: "loyer", element: "Loyer annuel HT HC", champs: ["loyer_annuel_ht_hc"], avecMarche: "loyer" },
  // Plus de ligne Rendement (11 nov. 2026, Jules) : le simulateur, juste dessous, le donne ; le verdict le juge toujours.
];

const SIGNATURES = {
  nationale_premium: "Nationale premium",
  nationale: "Nationale",
  regionale: "Régionale",
  independant: "Indépendant",
  inconnue: "Inconnue",
};

const pourcent = (v) => (v == null || Number.isNaN(Number(v)) ? null : `${String(Math.round(Number(v) * 100) / 100).replace(".", ",")} %`);

/** Pure : le critère qui décide d'une ligne — un raté d'abord, puis un inconnu, puis un tenu. */
function critereDe(grille, champs) {
  const miens = (grille || []).filter((l) => champs.includes(l.champ));
  const rang = (l) => (l.ok === false ? 0 : l.ok == null ? 1 : 2);
  // À égalité, le critère du profil parle mieux du bien qu'une exclusion.
  const profil = (l) => (/^Profil/i.test(l.groupe || "") ? 0 : 1);
  return miens.sort((a, b) => rang(a) - rang(b) || profil(a) - profil(b))[0] || null;
}

const eurosM2 = (n, suffixe = "") => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €/m²${suffixe}`);

/**
 * Sous le prix ou le loyer : l'écart au marché seul, en blanc — la couleur
 * du jugement est déjà dans la colonne Statut, pas besoin de la répéter ici.
 * Toute la ligne se clique pour ouvrir le chiffre du bien face au marché et
 * d'où vient la zone comparée, la flèche se retourne ; « Voir la source »
 * n'apparaît qu'à ce niveau-là, et ouvre la liste des ventes en dessous.
 */
/**
 * Le marché saisi à la main (18 oct. 2026, Jules : « mettre ce que je veux ») : un chiffre au m², qui l'emporte
 * sur la lecture ; « Revenir à la lecture » le retire.
 */
function MarcheSaisi({ dealId, index = 0, cle, marche, suffixe = "", apercu = false }) {
  const queryClient = useQueryClient();
  const [edition, setEdition] = useState(null);
  const poser = useMutation({
    mutationFn: (v) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${index}/marche-manuel`, { body: { [cle]: v } }),
    onSuccess: () => { setEdition(null); queryClient.invalidateQueries({ queryKey: ["marche-comparaison", dealId] }); },
    onError: (e) => toast.error(e?.message || "Enregistrement impossible"),
  });
  if (!dealId || apercu) return null;
  const valider = () => { const n = Number(String(edition).replace(/\s/g, "").replace(",", ".")); poser.mutate(n > 0 ? n : null); };
  if (edition !== null) {
    return (
      <span className="mt-1.5 inline-flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <input autoFocus inputMode="decimal" value={edition} onChange={(e) => setEdition(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") valider(); if (e.key === "Escape") setEdition(null); }}
          placeholder="€/m²" className="w-[110px] border-b border-bord-vif bg-transparent text-[13.5px] text-encre outline-none focus:border-encre max-md:text-[16px]" />
        <span className="text-[12px] text-brume">€/m²{suffixe}</span>
        <button type="button" onClick={valider} disabled={poser.isPending} className="inline-flex items-center gap-1 rounded-full bg-menthe px-2.5 py-1 text-[12.5px] text-sur-menthe disabled:opacity-60">
          {poser.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} OK
        </button>
        <button type="button" onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler</button>
      </span>
    );
  }
  return (
    <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px]" onClick={(e) => e.stopPropagation()}>
      {/* Plus de « Mettre mon chiffre » écrit (11 nov. 2026, Jules) : le crayon seul, le mot au survol. */}
      <button type="button" onClick={() => setEdition(marche?.median != null ? String(Math.round(marche.median)) : "")} title="Mettre mon chiffre" aria-label="Mettre mon chiffre" className="group inline-flex items-baseline gap-1.5 text-brume hover:text-encre" style={{ background: "transparent" }}>
        {marche?.manuel ? <>marché saisi <span className="text-encre">{eurosM2(marche.median, suffixe)}</span></> : <span className="opacity-0 transition-opacity group-hover/val:opacity-100 max-md:opacity-100">Mettre mon chiffre</span>}
      </button>
      {marche?.manuel && <button type="button" onClick={() => poser.mutate(null)} disabled={poser.isPending} className="text-menthe-clair hover:text-encre" style={{ background: "transparent" }}>Revenir à la lecture</button>}
    </span>
  );
}

function FaceAuMarche({ bien, marche, suffixe = "", libelleBien, libelleMarche, chargement, sourceOuverte = false, onSource, manque = null, adresseComparaison = null }) {
  const [detail, setDetail] = useState(false);
  // Plus de « Lecture du marché autour… » (18 oct. 2026, Jules : « on arrive, on voit direct le contenu ») : la dernière comparaison gardée s'affiche, la nouvelle la remplace sans bruit.
  if (chargement && !marche) return null;
  if (!marche) return <p className="m-0 text-[12px] text-brume">{manque || "Pas de marché lisible autour."}</p>;
  const j = marche.jugement;
  const repere = marche.median ?? null;
  const ecart = j?.ecart != null ? `${j.ecart > 0 ? "+" : ""}${j.ecart} %` : j?.mot || "—";
  // La zone comparée : le repère de la fiche quand l'adresse manque, sinon
  // l'adresse elle-même — pour que l'analyste sache toujours sur quoi porte
  // le chiffre, pas seulement quand c'est approché.
  const zone = marche.approche ? marche.reserve : adresseComparaison ? `Comparé autour de ${adresseComparaison}.` : null;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setDetail((v) => !v)}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetail((v) => !v); } }}
      aria-expanded={detail}
      className="text-[13.5px] leading-[1.55] cursor-pointer"
    >
      {marche.kdata_en_cours && (
        <p className="m-0 mb-1 inline-flex items-center gap-1.5 text-[11.5px] text-ardoise"><Loader2 className="w-3 h-3 animate-spin" /> Valeur locative (Outils) interroge Equimmox : quelques minutes.</p>
      )}
      <span className="flex items-center gap-1.5 font-medium text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>
        {ecart}
        <ChevronDown className={`h-3.5 w-3.5 text-ardoise transition-transform duration-200 ${detail ? "rotate-180" : ""}`} />
      </span>
      {detail && (
        <div className="mt-1.5">
          <p className="m-0 text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
            {libelleBien} <span className="text-encre">{eurosM2(bien, suffixe)}</span>
            <span className="text-brume"> vs </span>
            {libelleMarche} <span className="text-encre">{eurosM2(repere, suffixe)}</span>
            {marche.bas != null && marche.haut != null && <span className="text-brume"> ({Math.round(marche.bas).toLocaleString("fr-FR")} à {Math.round(marche.haut).toLocaleString("fr-FR")})</span>}
          </p>
          {zone && <p className="m-0 mt-1 text-[11.5px] text-brume">{zone}</p>}
          <button type="button" onClick={(e) => { e.stopPropagation(); onSource(); }} className="mt-1.5 text-[11.5px] text-menthe-clair hover:text-encre" style={{ background: "transparent" }}>
            {sourceOuverte ? "Masquer la source" : "Voir la source"}
          </button>
        </div>
      )}
    </div>
  );
}

/** La source d'un chiffre de marché, dépliée sur toute la largeur du tableau. */
function SourceMarche({ marche }) {
  if (!marche) return null;
  return (
    <div className="px-4 py-3">
      <p className="m-0 text-[12px] text-craie">{marche.source}{marche.periode ? `, du ${new Date(marche.periode.du).toLocaleDateString("fr-FR")} au ${new Date(marche.periode.au).toLocaleDateString("fr-FR")}` : ""}.</p>
      {marche.lien && <a href={marche.lien} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[12px] text-menthe-clair hover:text-encre">Ouvrir la carte des ventes (DVF) ↗</a>}
      {marche.kdata?.id && <a href={`/ValeurLocative?id=${encodeURIComponent(marche.kdata.id)}`} target="_blank" rel="noopener noreferrer" className="mt-1 mr-4 inline-block text-[12px] text-menthe-clair hover:text-encre">Ouvrir l'analyse Valeur locative ↗</a>}
      {marche.second_regard?.median != null && (
        <p className="m-0 mt-1 text-[11.5px] text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
          Second regard, {marche.second_regard.source} : {Math.round(marche.second_regard.median).toLocaleString("fr-FR")} €/m²/an
          {marche.second_regard.bas != null ? ` (${Math.round(marche.second_regard.bas).toLocaleString("fr-FR")} à ${Math.round(marche.second_regard.haut).toLocaleString("fr-FR")})` : ""}.
        </p>
      )}
      {marche.ventes?.length > 0 && (
        <table className="mt-2 w-full border-collapse text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead><tr className="text-brume"><th className="text-left font-normal py-1">Date</th><th className="text-left font-normal py-1">Adresse</th><th className="text-right font-normal py-1">Distance</th><th className="text-right font-normal py-1">Surface</th><th className="text-right font-normal py-1">Prix</th><th className="text-right font-normal py-1">€/m²</th></tr></thead>
          <tbody>
            {marche.ventes.map((v, i) => (
              <tr key={i} className="border-t border-trait text-craie">
                <td className="py-1.5 pr-3 whitespace-nowrap">{v.date ? new Date(v.date).toLocaleDateString("fr-FR", { month: "short", year: "numeric" }) : "—"}</td>
                <td className="py-1.5 pr-3">{v.adresse || "—"}</td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap">{v.distance_m} m</td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap">{v.surface} m²</td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap">{euros(v.prix)}</td>
                <td className="py-1.5 pl-3 text-right whitespace-nowrap">{Math.round(v.prix_m2).toLocaleString("fr-FR")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {marche.constate === false && !marche.kdata_en_cours && <p className="m-0 mt-1 text-[11.5px] text-brume">Pas de loyers constatés : Equimmox n'a pas répondu à cette adresse.</p>}
    </div>
  );
}

/** Pure : le statut d'une ligne, dans le vocabulaire des grilles du bail. */
function statutDe(c) {
  if (!c) return "vide";
  if (c.ok === true) return "ok";
  if (c.ok == null) return "vide";
  // Une réserve ratée se lève ; un critère d'exclusion ou de profil raté tranche.
  return /r[ée]serve/i.test(c.groupe || "") ? "a_verifier" : "no_go";
}

/**
 * Le bien en un tableau, au dessin exact des grilles du bail : un cadre, son
 * en-tête et son résumé, puis Critère, Valeur lue, Statut, Attendu. La valeur
 * se corrige d'un clic, le statut se confirme d'un clic ; le critère, cliqué,
 * dit d'où vient la règle.
 */
/**
 * Les notes d'une ligne : ce qu'il faut savoir avant de s'y fier. Un clic
 * pour la réécrire ; la version à la main remplace la note calculée, et se
 * vide pour y revenir.
 */
function NotesLigne({ textes, manuelle = null, onNoter = null, enCours = false }) {
  // On modifie le texte directement, sans cadre ni « OK / Annuler » qui le faisaient sauter (9 nov. 2026, Jules) : TexteEnPlace.
  const affiches = manuelle ? [manuelle.texte] : textes;
  if (!onNoter) {
    return affiches.length
      ? <ul className="m-0 flex list-none flex-col gap-1.5 p-0">{affiches.map((t) => <li key={t} className="whitespace-pre-line text-[12.5px] leading-[1.5] text-craie">{t}</li>)}</ul>
      : <span className="text-[12.5px] text-brume">—</span>;
  }

  return (
    <div className="group">
      <TexteEnPlace valeur={affiches.join("\n")} disabled={enCours} placeholder="—"
        onEnregistrer={(t) => onNoter(t)}
        className="whitespace-pre-line text-[12.5px] leading-[1.5] text-craie placeholder:text-brume max-md:text-[16px]" />
      {manuelle && (
        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-ambre">
          écrite à la main{manuelle.par ? ` · ${manuelle.par.split("@")[0]}` : ""}
          {onNoter && <button type="button" onClick={() => onNoter("")} disabled={enCours} className="text-ardoise underline-offset-2 hover:text-encre hover:underline" style={{ background: "transparent" }}>revenir à la note calculée</button>}
        </span>
      )}
    </div>
  );
}

/** Pure : ce que la lecture du marché réserve sur les lignes Prix marché et Loyer marché. */
function notesMarche(m, marche) {
  if (!m) return marche?.manque ? [marche.manque] : [];
  const notes = [];
  if (m.kdata_en_cours) notes.push("Le loyer de marché est encore en lecture chez Equimmox.");
  if (m.reserve) notes.push(m.reserve);
  return notes;
}

function TableauBien({ lot, emplacement = null, dealId = null, verdictChoisi = "", verdictTexte = "", onSaisieDirecte = null, onSaisie, enCours, apercu, onVerifier = null, enVerification = null, onNoter = null, enNote = null, titre, sousTitre = null, actions = null }) {
  // Le marché autour : lu une fois par état du bien (prix, loyer, surface).
  const { data: marche, isLoading: marcheEnLecture } = useQuery({
    queryKey: ["marche-comparaison", dealId, lot.index ?? 0, valChamp(lot.lot?.prix_fai), valChamp(lot.lot?.loyer_annuel_ht_hc), valChamp(lot.lot?.surface_m2), texteBrut("adresse", lot.lot?.adresse)],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/lots/${lot.index ?? 0}/marche-comparaison`),
    enabled: !!dealId && !apercu,
    // La comparaison gardée sur le lot s'affiche tout de suite ; la relecture se fait derrière, sans message.
    // Un marché saisi à la main ne vit pas dans la comparaison gardée : on relit alors le serveur, qui l'applique.
    initialData: lot.comparaison_marche && !lot.marche_manuel ? { ok: true, ...lot.comparaison_marche } : undefined,
    initialDataUpdatedAt: lot.comparaison_marche?.le ? Date.parse(lot.comparaison_marche.le) : undefined,
    placeholderData: (precedent) => precedent,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.loyer?.kdata_en_cours ? 20000 : false),
  });
  const grille = lot.evaluation?.grille || [];
  const ctx = lot.evaluation?.contexte || {};
  const enr = lot.enrichissement || {};
  const [source, setSource] = useState(null); // "prix" | "loyer"
  const loyerFiche = valChamp(lot.lot?.loyer_annuel_ht_hc);
  const { hors, fai } = prixDuLot(lot);
  // La fiche ne l'écrit pas toujours : le loyer sur le prix FAI en tient lieu.
  const annonce = valChamp(lot.lot?.rendement_annonce) ?? (fai && loyerFiche ? (loyerFiche / fai) * 100 : null);
  const reel = ctx.rendement_net_moyen ?? lot.evaluation?.aem?.rendement_aem ?? null;
  const signature = SIGNATURES[ctx.signature] || (ctx.signature ? String(ctx.signature).replace(/_/g, " ") : null);

  const champ = (c) => <ChampFiche champ={c} lot={lot} onSaisie={direct} enCours={enCours} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />;
  // Toute case du tableau s'enregistre tout de suite (11 nov. 2026, Jules) : plus de brouillon ni de barre « OK ».
  const enDirect = false;
  const direct = onSaisieDirecte || onSaisie;
  const colonnes = useColonnes();
  const valeur = (id) => {
    switch (id) {
      case "prix":
        // Toujours le prix FAI : quand la fiche donne un net vendeur, les
        // honoraires s'y ajoutent, et c'est le net qui se corrige.
        return (
          <div>
            {hors ? (
              <>
                <span className="text-[13.5px] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{euros(fai)}</span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-brume">net vendeur {champ("prix_fai")} + {champ("montant_honoraires")} d'honoraires</span>
              </>
            ) : champ("prix_fai")}
            <div className="mt-1.5">
              <FaceAuMarche bien={marche?.bien?.prix_m2} marche={marche?.prix} libelleBien="le bien" libelleMarche={marche?.prix?.manuel ? "le marché saisi" : "ventes autour"} chargement={marcheEnLecture} sourceOuverte={source === "prix"} onSource={() => setSource(source === "prix" ? null : "prix")} manque={marche?.manque} adresseComparaison={marche?.adresse} />
              <MarcheSaisi dealId={dealId} index={lot.index ?? 0} cle="prix_m2" marche={marche?.prix} apercu={apercu} />
            </div>
          </div>
        );
      case "rendement":
        return (
          <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="inline-flex items-baseline gap-1.5 text-craie">{champ("rendement_annonce")}{valChamp(lot.lot?.rendement_annonce) == null && annonce ? <span className="text-[11px] text-brume">({pourcent(annonce)} calculé)</span> : null} <span className="text-[11px] text-brume">annoncé</span></span>
            <span className="text-encre" title="Rendement net moyen du simulateur, sur toute la durée du projet">{pourcent(reel) || "—"} <span className="text-[11px] text-brume">réel</span></span>
          </span>
        );
      case "loyer":
        return (
          <div>
            {champ("loyer_annuel_ht_hc")}
            <div className="mt-1.5">
            <FaceAuMarche bien={marche?.bien?.loyer_m2} marche={marche?.loyer} suffixe="/an" libelleBien="le bien" libelleMarche={marche?.loyer?.manuel ? "le marché saisi" : "le marché"} chargement={marcheEnLecture} sourceOuverte={source === "loyer"} onSource={() => setSource(source === "loyer" ? null : "loyer")} manque={marche?.manque} adresseComparaison={marche?.adresse} />
            <MarcheSaisi dealId={dealId} index={lot.index ?? 0} cle="loyer_m2" marche={marche?.loyer} suffixe="/an" apercu={apercu} />
            </div>
          </div>
        );
      case "occupe": return champ("occupe");
      // Le nom et l'activité s'enregistrent tout de suite (10 nov. 2026, Jules : « ne s'enregistrent pas » dans le brouillon).
      case "nom_locataire": return <ChampFiche champ="locataire_nom" lot={lot} onSaisie={direct} enCours={enCours || enDirect} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />;
      case "activite": return <ChampFiche champ="locataire_activite" lot={lot} onSaisie={direct} enCours={enCours || enDirect} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />;
      // Qualité de l'enseigne écrite à la main (10 nov. 2026, Jules) ; sans saisie, la signature calculée s'y lit.
      case "enseigne": {
        const saisie = lot.lot?.qualite_enseigne;
        const vu = saisie && !saisie.absent ? lot : { ...lot, lot: { ...lot.lot, qualite_enseigne: signature ? { valeur: signature, absent: false } : { absent: true } } };
        return <ChampFiche champ="qualite_enseigne" lot={vu} onSaisie={direct} enCours={enCours || enDirect} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />;
      }
      // L'adresse sous l'emplacement (17 oct. 2026, Jules) : la changer déplace Street View et le plan, et l'emplacement repasse à vérifier.
      // Enregistrée tout de suite, comme le nom et l'activité (11 nov. 2026).
      case "emplacement":
        return (
          <div>
            <ChampFiche champ="adresse" lot={lot} onSaisie={direct} enCours={enCours || enDirect} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />
            {/* Plus de « Emplacement à qualifier » (11 nov. 2026, Jules) : la ligne seulement quand il est qualifié. */}
            {EMPLACEMENTS.find((e) => e.code === enr.emplacement) && <span className="mt-1 block text-[12.5px] text-craie">Emplacement {EMPLACEMENTS.find((e) => e.code === enr.emplacement).libelle}</span>}
          </div>
        );
      case "surface": return champ("surface_m2");
      // Le bail en texte libre (11 nov. 2026, Jules : « 12 ans ferme ») : l'IA le lit et le projet prend ce qu'elle en tire.
      // Tant que rien n'est écrit, la case montre ce que la fiche disait (type, échéance).
      case "bail": {
        const ecrit = lot.lot?.bail_texte;
        const fiche = [valChamp(lot.lot?.bail_type), valChamp(lot.lot?.bail_echeance) ? `échéance ${valChamp(lot.lot?.bail_echeance)}` : null].filter(Boolean).join(", ");
        const vu = ecrit && !ecrit.absent ? lot : { ...lot, lot: { ...lot.lot, bail_texte: fiche ? { valeur: fiche, absent: false } : { absent: true } } };
        const lu = ecrit && !ecrit.absent ? lot.lot?.bail_lu : null;
        const jour = (iso) => (iso ? iso.split("-").reverse().join("/") : null);
        const compris = lu ? [lu.duree_ferme_ans ? `${String(lu.duree_ferme_ans).replace(".", ",")} ans ferme` : null, lu.date_debut ? `début ${jour(lu.date_debut)}` : null, lu.date_echeance ? `échéance ${jour(lu.date_echeance)}` : null].filter(Boolean) : [];
        return (
          <div>
            <ChampFiche champ="bail_texte" lot={vu} onSaisie={direct} enCours={enCours || enDirect} apercu={apercu} sansNote aGauche crayonADroite taille="text-[13.5px]" />
            {lu && <span className="mt-1 block text-[12.5px] text-brume">Pour le projet : {lu.type_bail}{compris.length ? ` · ${compris.join(" · ")}` : " · sans date"}</span>}
          </div>
        );
      }
      default: return null;
    }
  };

  // Un statut posé à la main l'emporte sur le calcul, comme dans le Bail.
  // « verifie » et « incertain », d'avant, se lisent OK et à vérifier.
  const DEPUIS_ANCIEN = { verifie: "ok", incertain: "a_verifier" };
  const decisionDe = (c) => {
    const v = c ? lot?.verifications?.[cleLigne(c)] : null;
    return v ? { ...v, statut: DEPUIS_ANCIEN[v.statut] || v.statut } : null;
  };
  // Les lignes de marché se jugent sur l'écart : dans le marché ou en
  // dessous, OK ; au-dessus, ou estimé faute d'adresse, à vérifier.
  const statutMarche = (m) => {
    if (!m?.jugement) return "vide";
    if (m.approche || m.kdata_en_cours) return "a_verifier";
    return m.jugement.sens === "haut" ? "a_verifier" : "ok";
  };
  // Une ligne et son marché ne font qu'un (11 nov. 2026) : elle prend l'état le plus réservé des deux, un clic les règle ensemble.
  const RANG = { no_go: 0, warning: 1, a_verifier: 1, ok: 2 };
  const plusReserve = (a, b) => ([a, b].filter((x) => x in RANG).sort((x, y) => RANG[x] - RANG[y])[0] || a);
  const lignes = LIGNES_BIEN.map((l) => {
    if (l.info) return { ...l, c: null, decision: null, st: "info" };
    const c = critereDe(grille, l.champs);
    const decision = decisionDe(c);
    // Un marché lu sur le quartier, faute d'adresse, met une réserve sur le
    // prix et le loyer : ils tiennent peut-être, mais ce n'est pas établi.
    const approche = (l.id === "prix" && marche?.prix?.approche) || (l.id === "loyer" && marche?.loyer?.approche);
    // Une note qui réserve la ligne (un prix net vendeur sans honoraires, une
    // valeur lue sans assurance) la fait passer à vérifier, même si la grille passe.
    const reserve = approche || lot.notes?.[l.id]?.a_verifier;
    const calcule = statutDe(c);
    const st = decision?.statut || (reserve && calcule === "ok" ? "a_verifier" : calcule);
    if (!l.avecMarche) return { ...l, c, decision, st };
    // Une clé stable pour le marché (pas de vrai critère de grille derrière), comme avant la fusion.
    const cMarche = { groupe: "Marché", champ: `${l.avecMarche}_marche` };
    const decisionMarche = decisionDe(cMarche);
    const stMarche = decisionMarche?.statut || (marcheEnLecture ? "vide" : statutMarche(marche?.[l.avecMarche]));
    return { ...l, c, cMarche, decision, st: plusReserve(st, stMarche) };
  });
  // Le tableau de l'Analyse (5 nov. 2026, Jules : « adapte le tableau pour le mettre comme le module d'Analyse ») : le
  // cadre fermé, des traits entre les colonnes, le nom du tableau dans la case du haut à gauche, et l'état porté par la
  // case du critère, toute colorée. Deux états seulement, comme l'Analyse (5 nov. 2026, Jules : « la couleur du design et
  // l'autre, comme dans l'analyse ») : vérifié en menthe (l'accent), le reste en sable « lu par l'IA » ; un clic passe
  // de l'un à l'autre. Une ligne sans valeur reste neutre et ne se clique pas. Plus de légende des couleurs.
  const FOND_ETAT = { ok: "bg-menthe/15 hover:bg-menthe/25", a_verifier: "bg-lu-ia/25 hover:bg-lu-ia/35", warning: "bg-lu-ia/25 hover:bg-lu-ia/35", no_go: "bg-lu-ia/25 hover:bg-lu-ia/35" };
  return (
    <section>
      {(sousTitre || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4">
          {sousTitre ? <span className="text-[12.5px] text-ardoise">{sousTitre}</span> : <span />}
          {actions}
        </div>
      )}
      <div className="flex flex-col items-center gap-1 px-2 pb-4 text-center lg:hidden">
        <p className="m-0 text-[14px] text-encre">{titre}</p>
      </div>
      {/* L'emplacement à part, au-dessus du tableau (11 nov. 2026, Jules : « pas dans le tableau, séparé ») : sa propre carte. */}
      {emplacement && <div className={`mb-4 overflow-hidden ${VERRE}`}>{emplacement}</div>}
      <div className={`relative overflow-hidden ${VERRE_LG}`} style={colonnes.style}>
        <div className={`grid ${COLONNES_FICHE} ${CELLULES_FICHE} border-t border-trait py-3 text-[12.5px] text-ardoise max-lg:hidden lg:border-t-0 lg:[&>*]:py-2`}>
          <span className="relative text-[13.5px] text-encre">{titre}<Poignee cote="right" onPointerDown={colonnes.tirer("critere", 1)} /></span><span>Valeur</span><span className="relative">Notes<Poignee cote="left" onPointerDown={colonnes.tirer("notes", -1)} /></span>
        </div>
        <div className="k-cascade">
          {lignes.map(({ id, element, c, cMarche, st, decision, avecMarche: cleMarche }) => {
            const modifiable = !!(c && onVerifier) && st !== "vide" && st !== "info";
            const enChangement = c && enVerification === cleLigne(c);
            const etat = !modifiable ? null : st === "ok" ? `Vérifié${decision?.par ? ` par ${decision.par.split("@")[0]}` : ""} · cliquer pour revenir à « lu par l'IA »` : "Lu par l'IA · cliquer quand c'est vérifié";
            const aide = [c?.critere ? `${c.critere}${c.groupe ? ` · ${c.groupe}` : ""}` : null, etat].filter(Boolean).join("\n");
            return (
              <React.Fragment key={id}>
                <div className={`grid ${COLONNES_FICHE} ${CELLULES_FICHE} border-t border-trait py-2.5 transition-colors hover:bg-encre/[0.02] max-lg:grid-cols-1 max-lg:gap-y-1.5 lg:[&>*]:py-[7px]`}>
                  {/* Un clic sur la case fait tourner le statut : OK, À vérifier, Bloquant (18 oct. 2026, Jules). */}
                  <button type="button" disabled={!modifiable || enChangement} title={aide || undefined}
                    onClick={() => { if (!modifiable) return; const suivant = st === "ok" ? "a_verifier" : "ok"; onVerifier(cleLigne(c), suivant); if (cMarche) onVerifier(cleLigne(cMarche), suivant); }}
                    className={`m-0 flex select-none items-start justify-between gap-2 text-left text-[13.5px] leading-[1.4] text-encre transition-colors max-lg:rounded-[10px] max-lg:px-3 max-lg:py-2 disabled:cursor-default ${FOND_ETAT[st] || ""}`}
                    style={FOND_ETAT[st] ? undefined : { background: "transparent" }}>
                    <span>{element}</span>
                    {enChangement && <Loader2 className="mt-1 h-3.5 w-3.5 flex-none animate-spin" aria-label="Changement en cours" />}
                  </button>
                  {/* Pas de crayon : le texte se clique pour le modifier (11 nov. 2026, Jules). Le repère group/val sert au mot du marché. */}
                  <div className="group/val relative min-w-0 break-words text-[13.5px] leading-[1.4] [&_*]:whitespace-normal">{valeur(id)}</div>
                  <div className="min-w-0">
                    {/* Vérifiée (couleur du design), la ligne perd ses notes calculées, comme l'Analyse (5 nov. 2026, Jules) ; une
                        note écrite à la main reste. */}
                    <NotesLigne
                      textes={st === "ok" ? [] : [...(lot.notes?.[id]?.textes || []), ...(cleMarche ? lot.notes?.[`${id}_marche`]?.textes || [] : []), ...(cleMarche && marche?.[cleMarche]?.jugement ? notesMarche(marche?.[cleMarche], marche) : [])]}
                      manuelle={lot.notes_manuelles?.[id] || null}
                      onNoter={onNoter ? (texte) => onNoter(id, texte) : null}
                      enCours={enNote === id}
                    />
                  </div>
                </div>
                {cleMarche && marche?.[cleMarche] && (
                  <Depliant ouvert={source === cleMarche}>
                    <div className="border-t border-trait bg-fond/40"><SourceMarche marche={marche[cleMarche]} /></div>
                  </Depliant>
                )}
              </React.Fragment>
            );
          })}
          {dealId && <LigneVerdict dealId={dealId} initial={verdictChoisi} texteInitial={verdictTexte} apercu={apercu} />}
        </div>
      </div>
    </section>
  );
}

/**
 * Le verdict de l'équipe, en dernière ligne du tableau (10 nov. 2026, Jules : « une ligne avec les choix, en couleur ») :
 * les quatre choix côte à côte, le retenu dans sa couleur ; un second clic le retire.
 */
function LigneVerdict({ dealId, initial = "", texteInitial = "", apercu = false }) {
  const queryClient = useQueryClient();
  const [choisi, setChoisi] = useState(initial || "");
  useEffect(() => { setChoisi(initial || ""); }, [initial]);
  const envoyer = (corps) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/verdict`, { body: corps });
  const choisir = (v) => {
    const avant = choisi;
    const suivant = v === choisi ? "" : v;
    setChoisi(suivant);
    envoyer({ verdict: suivant || null })
      // La carte du dossier dans la liste porte le verdict choisi : elle se relit.
      .then(() => queryClient.invalidateQueries({ queryKey: ["preanalyse-pipeline"] }))
      .catch((e) => { setChoisi(avant); toast.error(e?.message || "Verdict non enregistré"); });
  };
  return (
    <div className={`grid ${COLONNES_FICHE} ${CELLULES_FICHE} border-t border-trait py-2.5 max-lg:grid-cols-1 max-lg:gap-y-1.5 lg:[&>*]:py-[7px]`}>
      <span className="text-[13.5px] leading-[1.4] text-encre">Verdict</span>
      <div className="col-span-2 min-w-0 max-lg:col-span-1">
        <div role="group" aria-label="Verdict du dossier" className="flex flex-wrap gap-1.5">
          {Object.entries(VERDICTS).map(([cle, v]) => (
            <button key={cle} type="button" disabled={apercu} aria-pressed={choisi === cle} onClick={() => choisir(cle)}
              className={`rounded-full border px-3 py-0.5 text-[12.5px] transition-colors disabled:cursor-default ${choisi === cle ? v.classe : "border-trait text-ardoise hover:text-encre"}`}
              style={choisi === cle ? undefined : { background: "transparent" }}>
              {v.libelle}
            </button>
          ))}
        </div>
        {/* Un texte libre sous le verdict (10 nov. 2026, Jules : « mettre du texte à notre convenance dessous »). */}
        <TexteEnPlace valeur={texteInitial || ""} disabled={apercu} placeholder="+ Ajouter un commentaire sur le verdict"
          onEnregistrer={(t) => envoyer({ texte: t }).catch((e) => toast.error(e?.message || "Texte non enregistré"))}
          classeCase="mt-2" className="whitespace-pre-line text-[13.5px] leading-[1.5] text-craie placeholder:text-brume max-md:text-[16px]" />
      </div>
    </div>
  );
}

// Le verdict a son badge : il ne se répète pas dans le titre.
export const sansVerdict = (t) => String(t || "").replace(/\s*[—:-]\s*(GO SOUS R[ÉE]SERVE|NO-?GO|GO|INSUFFISANT|Non retenu|Non conforme|Conforme( sous réserve)?)\s*$/i, "").trim();

const EMPLACEMENTS = [
  { code: "n1", libelle: "N°1" },
  { code: "n1_bis", libelle: "N°1 bis" },
  { code: "intermediaire", libelle: "N°2 · intermédiaire" },
  { code: "secondaire", libelle: "Secondaire" },
];

export const CHAMPS_AFFICHES = [
  ["adresse", "Adresse"],
  ["surface_m2", "Surface"],
  ["prix_fai", "Prix FAI"],
  ["honoraires_inclus", "Honoraires inclus"],
  ["montant_honoraires", "Montant honoraires"],
  ["loyer_annuel_ht_hc", "Loyer annuel HT HC"],
  ["rendement_annonce", "Rendement annoncé"],
  ["locataire_nom", "Locataire"],
  ["locataire_activite", "Activité"],
  ["bail_type", "Type de bail"],
  ["bail_echeance", "Échéance du bail"],
  ["occupe", "Occupé"],
];

const valChamp = (c) => (c && c.absent === false ? c.valeur : null);

/**
 * Le prix FAI du lot, et le net vendeur quand la fiche annonce un prix hors
 * honoraires. Même règle que server/deal/prix.js : le chiffre de la fiche est
 * alors le net vendeur, et le FAI vaut ce prix plus les honoraires.
 */
export function prixDuLot(entree) {
  // Les champs de la fiche vivent sous `lot.lot` quand on reçoit l'entrée du
  // dossier, et à la racine quand on reçoit le lot seul : on accepte les deux,
  // comme ChampFiche.
  const lot = entree?.lot ?? entree;
  const prix = valChamp(lot?.prix_fai);
  const honoraires = valChamp(lot?.montant_honoraires);
  const hors = valChamp(lot?.honoraires_inclus) === false && honoraires > 0;
  return { prix, honoraires, hors, fai: prix == null ? null : hors ? prix + honoraires : prix };
}

const euros = (n) => (n == null ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);

export function afficherValeur(champ, valeur) {
  if (valeur == null) return "—";
  if (champ === "adresse") {
    return [valeur.rue, [valeur.code_postal, valeur.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  }
  if (typeof valeur === "boolean") return valeur ? "Oui" : "Non";
  // La virgule, pas le point : on écrit en français.
  if (champ === "surface_m2") return `${String(valeur).replace(".", ",")} m²`;
  if (champ === "rendement_annonce") return `${String(valeur).replace(".", ",")} %`;
  if (["prix_fai", "loyer_annuel_ht_hc", "montant_honoraires"].includes(champ)) return euros(valeur);
  return String(valeur);
}

export function Bandeau({ type, items }) {
  const styles =
    type === "alerte"
      ? "border-ambre/30 bg-ambre/10 text-ambre"
      : "border-encre/10 bg-encre/[0.03] text-ardoise";
  return (
    <div className={`rounded-md border px-4 py-3 text-sm ${styles}`}>
      {items.map((t, i) => (
        <p key={i} className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          {t}
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dialogue de mail d'intention : brouillon généré, éditable, avec expéditeur.
// ---------------------------------------------------------------------------

const TITRES_INTENTION = {
  refus: "Mail de refus à l'agent",
  demande_documents: "Demande de documents à l'agent",
  relance: "Relance de l'agent",
  abandon: "Mail d'abandon à l'agent",
  presentation_client: "Mail de présentation client",
  complement: "Mail de relance à l'agent",
};

// Raisons d'abandon proposées en un clic ; le texte libre reste possible.
const RAISONS_ABANDON = [
  "Rendement insuffisant",
  "Prix au-dessus du marché",
  "Travaux trop lourds",
  "Vacance locative",
  "Copropriété fragile",
  "Zone peu tendue",
];

// Ce que l'envoi déclenche côté pipeline, affiché sous le brouillon pour que
// la conséquence soit lisible avant de cliquer.
const EFFETS_INTENTION = {
  refus: "Statut → Abandonné. Le deal alimente la base de données marché puis part aux archives.",
  demande_documents: "Statut → Documents en attente. Relance automatique programmée à J+7.",
  relance: "La prochaine relance est reprogrammée à J+7.",
  abandon: "Statut → Abandonné. Le deal alimente la base de données marché puis part aux archives.",
  presentation_client: "Décision actée. L'étape Plateforme s'ouvre pour créer le projet.",
};

export function DialogMailIntention({ dossier, intention, mailInitial = undefined, onClose, onDone, onArchiverSansMail = undefined, onSupprimer = undefined, parametres = null }) {
  const [objet, setObjet] = useState(mailInitial?.objet || "");
  const [corps, setCorps] = useState(mailInitial?.corps || "");
  const [destinataire, setDestinataire] = useState(dossier.contact_agent_email || "");
  const [expediteur, setExpediteur] = useState(
    () => localStorage.getItem("klocka:dernier-expediteur") || ""
  );
  const [raisons, setRaisons] = useState("");
  const [raisonsChoisies, setRaisonsChoisies] = useState([]);
  // Le mail d'abandon attend d'abord les raisons ; les autres se génèrent seuls.
  const [etape, setEtape] = useState(intention === "abandon" && !mailInitial ? "raisons" : "brouillon");

  const { data: statutMail } = useQuery({
    queryKey: ["mail-status"],
    queryFn: () => base44.functions.invoke("getMailStatus", {}),
  });
  const comptes = statutMail?.accounts || [];

  const generer = useMutation({
    mutationFn: (params) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/mail`, {
        body: { intention, lot_index: 0, ...params },
      }),
    onSuccess: (r) => {
      setObjet(r.objet || "");
      setCorps(r.corps || "");
      if (r.destinataire && !destinataire) setDestinataire(r.destinataire);
      setEtape("brouillon");
    },
    onError: (e) => toast.error(e?.message || "Génération impossible"),
  });

  // Génération automatique à l'ouverture (sauf abandon qui attend les raisons,
  // et sauf brouillon déjà fourni).
  useEffect(() => {
    if (!mailInitial && etape === "brouillon" && !corps && !generer.isPending) {
      generer.mutate(parametres || {});
    }
  }, []);

  const envoyer = useMutation({
    mutationFn: (depuis) =>
      base44.functions.invoke("sendMail", {
        from: depuis || expediteur || undefined,
        to: destinataire,
        subject: objet,
        body: corps,
        deal_id: dossier.deal_id,
        intention,
      }),
    onSuccess: (r) => {
      if (r?.success) {
        toast.success("Mail envoyé");
        onDone?.();
      } else if (r?.simulated) {
        toast.info("Aucun compte expéditeur connecté : envoi simulé, le suivi avance quand même.");
        onDone?.();
      } else {
        toast.error(r?.error || "Envoi impossible");
      }
    },
  });

  // Sans boîte connectée, « Envoyer » ouvre d'abord la connexion Gmail : le
  // brouillon reste à l'écran et l'envoi part dès que la boîte est rattachée.
  const { connecter, enCours: connexionEnCours } = useConnexionGmail((email) => {
    setExpediteur(email);
    localStorage.setItem("klocka:dernier-expediteur", email);
    envoyer.mutate(email);
  });
  const sansCompte = comptes.length === 0;
  const googleConfigure = statutMail?.google?.enabled !== false;
  // Deal de test : l'envoi est simulé côté serveur, aucune boîte requise.
  const test = !!dossier.test;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-fond border-trait text-encre max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{TITRES_INTENTION[intention] || "Mail à l'agent"}</DialogTitle>
        </DialogHeader>

        {etape === "raisons" ? (
          <div className="space-y-3">
            <div>
              <Label className="text-ardoise text-xs mb-2 block">
                Raisons de l'abandon (reformulées professionnellement dans le mail)
              </Label>
              <div className="flex flex-wrap gap-[7px] mb-3">
                {RAISONS_ABANDON.map((r) => {
                  const choisie = raisonsChoisies.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setRaisonsChoisies((prev) =>
                          choisie ? prev.filter((x) => x !== r) : [...prev, r]
                        )
                      }
                      className={`px-3 py-[6px] rounded text-[11px] border transition-colors ${
                        choisie
                          ? "border-alerte text-alerte bg-alerte/10"
                          : "border-bord text-ardoise hover:border-alerte/60"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              <Textarea
                value={raisons}
                onChange={(e) => setRaisons(e.target.value)}
                rows={3}
                placeholder="Précisions libres — ex : travaux de toiture votés en AG non provisionnés, loyer 30 % au-dessus du marché…"
                className="bg-surface border-trait text-encre"
              />
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-ardoise hover:text-encre hover:bg-encre/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              {onSupprimer && (
                <Button variant="ghost" onClick={onSupprimer} title="Supprimer définitivement : le dossier disparaît et sa fiche ne compte plus comme importée" className={`text-alerte hover:bg-alerte/10 ${onArchiverSansMail ? "" : "mr-auto"}`}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer le dossier
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-ardoise hover:text-encre hover:bg-encre/5">
                Annuler
              </Button>
              <Button
                onClick={() =>
                  generer.mutate({ raisons: [...raisonsChoisies, raisons.trim()].filter(Boolean).join(" ; ") })
                }
                disabled={(!raisons.trim() && raisonsChoisies.length === 0) || generer.isPending}
                className="bg-menthe hover:bg-menthe-survol text-sur-menthe rounded-full"
              >
                {generer.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Rédiger le mail
              </Button>
            </DialogFooter>
          </div>
        ) : generer.isPending ? (
          <div className="py-10 text-center">
            <Loader2 className="w-6 h-6 text-ardoise animate-spin mx-auto mb-3" />
            <p className="text-ardoise text-sm">Rédaction du mail…</p>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {comptes.length > 0 && (
                <div>
                  <Label className="text-ardoise text-xs mb-1.5 block">Envoyer depuis</Label>
                  <Select
                    value={expediteur || comptes[0]?.id}
                    onValueChange={(v) => {
                      setExpediteur(v);
                      localStorage.setItem("klocka:dernier-expediteur", v);
                    }}
                  >
                    <SelectTrigger className="bg-surface border-trait text-encre">
                      <SelectValue placeholder="Choisir un compte" />
                    </SelectTrigger>
                    <SelectContent className="bg-fond border-trait text-encre">
                      {comptes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name ? `${c.name} — ${c.id}` : c.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {sansCompte && !test && (
                <EncartConnexionGmail
                  googleConfigure={googleConfigure}
                  onConnecte={(email) => {
                    setExpediteur(email);
                    localStorage.setItem("klocka:dernier-expediteur", email);
                  }}
                />
              )}
              <div>
                <Label className="text-ardoise text-xs mb-1.5 block">Destinataire</Label>
                <Input
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
                  placeholder="agent@agence.fr"
                  className="bg-surface border-trait text-encre"
                />
              </div>
              <div>
                <Label className="text-ardoise text-xs mb-1.5 block">Objet</Label>
                <Input value={objet} onChange={(e) => setObjet(e.target.value)} className="bg-surface border-trait text-encre" />
              </div>
              <div>
                <Label className="text-ardoise text-xs mb-1.5 block">Corps</Label>
                <Textarea
                  value={corps}
                  onChange={(e) => setCorps(e.target.value)}
                  rows={12}
                  className="bg-surface border-trait text-encre leading-relaxed"
                />
              </div>
              {EFFETS_INTENTION[intention] && (
                <p className="text-[11px] text-brume border-t border-trait pt-3">
                  À l'envoi : {EFFETS_INTENTION[intention]}
                </p>
              )}
            </div>
            <DialogFooter>
              {onArchiverSansMail && (
                <Button variant="ghost" onClick={onArchiverSansMail} className="text-ardoise hover:text-encre hover:bg-encre/5 mr-auto">
                  <Archive className="w-4 h-4 mr-1.5" /> Archiver sans mail
                </Button>
              )}
              {onSupprimer && (
                <Button variant="ghost" onClick={onSupprimer} title="Supprimer définitivement : le dossier disparaît et sa fiche ne compte plus comme importée" className={`text-alerte hover:bg-alerte/10 ${onArchiverSansMail ? "" : "mr-auto"}`}>
                  <Trash2 className="w-4 h-4 mr-1.5" /> Supprimer le dossier
                </Button>
              )}
              <Button variant="ghost" onClick={onClose} className="text-ardoise hover:text-encre hover:bg-encre/5">
                <X className="w-4 h-4 mr-1.5" /> Fermer
              </Button>
              <Button
                onClick={() => (sansCompte && googleConfigure && !test ? connecter() : envoyer.mutate())}
                disabled={
                  !destinataire.trim() || !objet.trim() || !corps.trim() || envoyer.isPending || connexionEnCours
                }
                className="bg-menthe hover:bg-menthe-survol text-sur-menthe font-medium rounded-full"
              >
                {envoyer.isPending || connexionEnCours ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {test ? "Envoyer (simulé)" : sansCompte && googleConfigure ? "Connecter Gmail et envoyer" : "Envoyer"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Journal de suivi
// ---------------------------------------------------------------------------

const LIBELLES_SUIVI = {
  analyse: "Analyse",
  statut: "Statut",
  mail_envoye: "Mail envoyé",
  relance: "Relance",
  documents_recus: "Documents",
  abandon: "Abandon",
  projet_cree: "Projet",
  monday_echec: "Twenty CRM",
  agent: "Agent",
};

export function JournalSuivi({ suivi }) {
  if (!suivi?.length) return null;
  return (
    <div className="bg-surface border border-trait rounded-md px-5 py-4">
      <p className="text-ardoise text-xs mb-3">Historique du dossier</p>
      <div className="space-y-2">
        {[...suivi].reverse().map((e, i) => (
          <div key={i} className="flex items-start gap-3 text-xs">
            <span className="text-brume w-32 flex-shrink-0">
              {new Date(e.le).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
            </span>
            <Badge className="bg-encre/5 text-ardoise border-encre/10 text-[11px] flex-shrink-0">
              {LIBELLES_SUIVI[e.type] || e.type}
            </Badge>
            <span className="text-ardoise min-w-0">
              {e.detail}
              {e.intention ? ` (${e.intention.replace(/_/g, " ")})` : ""}
              {e.destinataire ? ` → ${e.destinataire}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Carte d'un lot analysé (extraite d'AnalyseAnnonces)
// ---------------------------------------------------------------------------

// Situer le bien de deux façons : le plan et la vue piéton, qui réutilisent les vues de la
// page projet, alimentées par l'adresse du lot (ou le centre de la commune).
/**
 * L'emplacement, carte séparée au-dessus du tableau de la Pré-analyse (11 nov. 2026, Jules) : seulement Street View et le
 * plan, côte à côte (l'un sous l'autre au téléphone). L'adresse et l'emplacement qualifié sont la première ligne du tableau.
 */
export function CarteEmplacement({ lot, dealId = null, apercu = false }) {
  if (!lot || apercu) return null;
  return (
    <div className="p-2 lg:p-4">
      <VuesLieu lot={lot} enr={lot.enrichissement || {}} coteACote dealId={dealId} />
    </div>
  );
}

export function VuesLieu({ lot, enr, coteACote = false, dealId = null, empile = false }) {
  const [vue, setVue] = useState("carte");
  const a = lot.lot?.adresse?.valeur;
  const adresse = a?.rue ? [a.rue, a.code_postal, a.ville].filter(Boolean).join(", ") : null;
  // Sans rue, la fiche donne souvent un repère (« à proximité du métro
  // Rambuteau ») : le serveur le cherche et les vues s'y posent, plutôt qu'au
  // centre de la commune.
  const { data: situe } = useQuery({
    queryKey: ["lieu-lot", dealId, lot.index ?? 0],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/lots/${lot.index ?? 0}/lieu`),
    enabled: !!dealId && !adresse,
    staleTime: Infinity,
    retry: false,
  });
  const repere = situe?.mode === "repere" && situe.lat != null ? situe : null;
  const centre = repere ? { lat: repere.lat, lon: repere.lon } : { lat: enr?.commune?.centre?.lat, lon: enr?.commune?.centre?.lon };
  // Les vues de la page projet attendent un objet « projet » : on le compose.
  // La géolocalisation est mise en cache sur cet identifiant. « lot-0 » était
  // le même d'un dossier à l'autre : la rue affichée restait celle du dossier
  // précédent. L'adresse elle-même fait une clé qui change quand il le faut.
  const adresseComplete = adresse || [a?.code_postal, a?.ville].filter(Boolean).join(" ") || enr?.commune?.nom || null;
  const lieu = {
    id: `lot-${repere ? `repere:${repere.repere}` : adresseComplete || `${centre.lat ?? "?"},${centre.lon ?? "?"}`}`,
    // Un repère trouvé l'emporte sur « Paris » : le géocodage de la commune
    // renverrait au centre.
    adresse_complete: repere ? null : adresseComplete,
    latitude: adresse ? null : centre.lat || null,
    longitude: adresse ? null : centre.lon || null,
  };
  const localisable = !!(lieu.adresse_complete || (lieu.latitude && lieu.longitude));

  const VUES = [
    { id: "carte", label: "Plan" },
    { id: "street", label: "Street View" },
  ];

  // Dans la pré-analyse, on juge l'emplacement sur pièces : la rue à gauche,
  // le plan à droite, les deux d'un coup d'œil.
  if (coteACote) {
    return (
      <div className="space-y-3">
        <div className={`grid grid-cols-1 gap-4 ${empile ? "" : "lg:grid-cols-2"}`}>
          <figure className="m-0">
            <div className={`relative ${empile ? "h-[280px] rounded-[10px]" : "h-[300px] rounded-[14px]"} overflow-hidden border border-trait bg-surface`}>
              {!CLE_MAPS ? (
                <p className="absolute inset-0 flex items-center justify-center m-0 px-6 text-center text-[12.5px] text-ardoise">Street View indisponible : renseignez <code className="text-craie mx-1">VITE_GOOGLE_MAPS_API_KEY</code>.</p>
              ) : localisable ? <StreetViewRue project={lieu} /> : (
                <p className="absolute inset-0 flex items-center justify-center m-0 text-[12.5px] text-brume">Adresse inconnue pour ce lot.</p>
              )}
            </div>
          </figure>
          <figure className="m-0">
            <div className={empile ? "[&_iframe]:!h-[280px] [&_iframe]:!rounded-[10px]" : "[&_iframe]:!h-[300px] [&_iframe]:!rounded-[14px]"}>
              <CarteGoogle sansLien adresse={adresse} lat={centre.lat} lon={centre.lon} zoom={repere ? 17 : undefined} hauteur={empile ? "h-[280px]" : "h-[300px]"} />
            </div>
          </figure>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {VUES.map((v) => (
          <button
            key={v.id}
            onClick={() => setVue(v.id)}
            disabled={v.id !== "carte" && !localisable}
            aria-label={v.id !== "carte" && !localisable ? "Adresse inconnue pour ce lot" : undefined} title={v.id !== "carte" && !localisable ? "Adresse inconnue pour ce lot" : undefined}
            className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors disabled:opacity-40
              ${vue === v.id ? "bg-menthe rounded-full border-menthe text-sur-menthe font-medium" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {vue === "carte" && (
        <CarteGoogle adresse={adresse} lat={centre.lat} lon={centre.lon} zoom={repere ? 17 : undefined} />
      )}
      {vue === "street" && (
        <div className="relative h-[420px] max-md:h-[300px] rounded-md overflow-hidden border border-trait">
          <StreetViewRue project={lieu} />
        </div>
      )}
    </div>
  );
}

// Le prix FAI, modifiable partout où il s'affiche : la fiche ne le donne pas
// toujours, et tout en dépend — verdict, rendement AEM, simulateur, puis le
// projet créé depuis le deal. Un clic, un nombre, tout se recalcule.
export function PrixFai({ lot, onSaisie, enCours, apercu = false, compact = false }) {
  const c = lot?.lot?.prix_fai;
  const valeur = c && c.absent !== true && typeof c.valeur === "number" ? c.valeur : null;
  const [edition, setEdition] = useState(null);
  const montant = Number(String(edition ?? "").replace(/[^\d.,]/g, "").replace(",", "."));
  const valide = isFinite(montant) && montant > 0;
  const valider = () => { if (valide) { onSaisie?.({ prix_fai: Math.round(montant) }); setEdition(null); } };
  const modifiable = !apercu && !!onSaisie;

  if (edition !== null) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          autoFocus
          value={edition}
          onChange={(e) => setEdition(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") valider(); if (e.key === "Escape") setEdition(null); }}
          placeholder="400 000"
          inputMode="numeric"
          className={`w-[150px] bg-transparent border-b border-bord-vif focus:border-encre outline-none tabular-nums font-light text-encre placeholder:text-bord-vif ${compact ? "text-[13.5px] py-0.5 max-md:text-[16px]" : "text-[24px] py-1"}`}
        />
        <button onClick={valider} disabled={!valide || enCours} className="hover:bg-menthe-survol inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 bg-menthe text-sur-menthe font-semibold rounded-full disabled:opacity-40"><Check className="w-3 h-3" /> OK</button>
        <button onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
      </div>
    );
  }

  return (
    <button
      onClick={() => modifiable && setEdition(valeur != null ? String(valeur) : "")}
      disabled={!modifiable || enCours}
      aria-label={modifiable ? "Modifier le prix affiché" : undefined} title={modifiable ? "Modifier le prix affiché" : undefined}
      className={`group inline-flex items-baseline gap-2 text-left tabular-nums font-light ${compact ? "text-[13.5px]" : "text-[24px]"} ${valeur == null ? "text-ambre" : "text-encre"} disabled:cursor-default`}
    >
      {valeur == null ? "à renseigner" : euros(valeur)}
      {modifiable && <Pencil className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-brume opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity`} />}
    </button>
  );
}

// Un champ de la fiche, modifiable d'un clic : nombre, texte, oui/non ou
// adresse. La valeur enregistrée est marquée saisie à la main et tout se
// recalcule. Vider le champ le remet à « non renseigné ».
const BOOLEENS = new Set(["honoraires_inclus", "occupe"]);
const texteBrut = (champ, c) => {
  if (!c || c.absent) return "";
  const v = c.valeur;
  if (champ === "adresse" && v && typeof v === "object") return [v.rue, [v.code_postal, v.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  return v == null ? "" : String(v);
};

export function ChampFiche({ champ, lot, onSaisie, enCours, apercu = false, sansNote = false, aGauche = false, teinte = null, taille = null, crayonADroite = false }) {
  const c = lot?.lot?.[champ];
  const absent = !c || c.absent;
  const [edition, setEdition] = useState(null);
  const [choix, setChoix] = useState(null);
  useEffect(() => { if (!enCours) setChoix(null); }, [enCours]);
  const modifiable = !apercu && !!onSaisie;
  // On écrit, la case montre tout de suite la nouvelle valeur, un petit spinner à droite dit qu'elle se synchronise
  // (11 nov. 2026, Jules : « on modifie, hop, et on voit la bonne valeur ; le spinner, c'est la synchro avec le projet »).
  const [optimiste, setOptimiste] = useState(null);
  const [sync, setSync] = useState(false);
  const brute = texteBrut(champ, c);
  useEffect(() => { setOptimiste(null); }, [brute]);
  const valider = (v) => {
    setEdition(null);
    if (v === (brute ?? "")) return;
    setOptimiste(v);
    const r = onSaisie?.({ [champ]: v });
    if (r && typeof r.then === "function") {
      setSync(true);
      r.then((ok) => { if (ok === false) setOptimiste(null); }).catch(() => setOptimiste(null)).finally(() => setSync(false));
      // Si la relecture du dossier tarde, la valeur écrite reste affichée jusqu'à elle.
    } else setOptimiste(null);
  };
  const spinner = sync ? <Loader2 aria-label="Synchronisation" className={crayonADroite ? "absolute right-2.5 top-[9px] h-3.5 w-3.5 animate-spin text-ardoise" : "h-3 w-3 flex-none animate-spin text-ardoise"} /> : null;

  if (BOOLEENS.has(champ)) {
    const actuel = absent ? null : c.valeur === true;
    // Le clic répond tout de suite : le bouton choisi passe en menthe et
    // respire pendant le recalcul, avant même que le serveur ait répondu.
    const choisi = choix !== null && enCours ? choix : actuel;
    return (
      <span className="inline-flex items-center gap-1">
        {[["Oui", true], ["Non", false]].map(([mot, v]) => {
          const actif = choisi === v;
          const attend = enCours && choix === v;
          return (
            <button key={mot} onClick={() => { if (modifiable && actuel !== v) { setChoix(v); valider(v); } }} disabled={!modifiable || enCours} className={`px-2.5 py-0.5 rounded-full text-[12.5px] border transition-all duration-200 disabled:cursor-default ${attend ? "bg-menthe border-menthe text-sur-menthe font-semibold animate-pulse" : actif ? "bg-menthe rounded-full border-menthe text-sur-menthe font-semibold" : "border-bord-doux text-brume hover:text-encre hover:border-bord-vif"}`}>{mot}</button>
          );
        })}
        {enCours && choix !== null ? <span className="ml-1 text-[11px] text-menthe">recalcul…</span> : !sansNote && !absent && c.saisi_a_la_main && <span className="ml-1 text-[11px] text-ambre">saisi à la main</span>}
      </span>
    );
  }

  if (edition !== null) {
    // Sans OK ni Annuler : Entrée ou un clic ailleurs enregistre, Échap annule.
    return (
      <input
        autoFocus
        value={edition}
        onChange={(e) => setEdition(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => valider(edition.trim())}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setEdition(null); } }}
        placeholder={champ === "adresse" ? "12 rue Exemple, 69002 Lyon" : ""}
        className={`w-full min-w-0 rounded-[3px] border-0 bg-menthe/[0.12] px-1 -mx-1 py-0 outline-none tabular-nums text-encre placeholder:text-brume max-md:text-[16px] ${taille || "text-[13.5px]"}`}
      />
    );
  }

  return (
    <button
      onClick={() => modifiable && setEdition(texteBrut(champ, c))}
      disabled={!modifiable || (enCours && !crayonADroite)}
      aria-label={modifiable ? "Modifier" : c?.citation || undefined} title={modifiable ? "Modifier" : c?.citation || undefined}
      className={`group inline-flex min-w-0 items-baseline gap-2 tabular-nums disabled:cursor-default ${aGauche ? `text-left font-normal ${taille || "text-[15px]"}` : `text-right font-light ${taille || "text-[13.5px]"}`} ${absent && optimiste === null ? "text-brume" : teinte || "text-encre"}`}
    >
      <span className="truncate">{optimiste !== null ? (optimiste || "non renseigné") : absent ? "non renseigné" : afficherValeur(champ, c.valeur)}</span>
      {!sansNote && !absent && c.confiance === "basse" && <span className="text-[11px] text-ambre font-normal">confiance basse</span>}
      {c?.en_attente ? <span className="text-[11px] text-menthe font-normal">modifié</span> : !sansNote && !absent && c.saisi_a_la_main && <span className="text-[11px] text-ambre font-normal">saisi à la main</span>}
      {/* Dans le tableau, pas de crayon : on clique le texte (11 nov. 2026, Jules). */}
      {modifiable && !crayonADroite && !sync && <Pencil className="w-3 h-3 text-brume opacity-0 group-hover:opacity-100 max-md:opacity-100 transition-opacity flex-none" />}
      {spinner}
    </button>
  );
}

// Un champ vient d'être changé : le verdict, les rendements et le simulateur
// se recalculent. On le dit là où on a cliqué, pas seulement dans un toast.
export function BandeauRecalcul({ actif }) {
  if (!actif) return null;
  return (
    <div className="mb-4 flex items-center gap-3 rounded-[12px] border border-menthe/40 bg-menthe/10 px-4 py-2.5 animate-in fade-in duration-200">
      <PenseeIA etat="working" taille={20} />
      <p className="m-0 text-[12.5px] text-menthe-clair">Recalcul en cours — verdict, rendements et simulateur se mettent à jour.</p>
    </div>
  );
}

export function CarteLot({ lot, dossier, onSaisie, onRefresh, enCours, apercu = false, sansSimulateur = false, apresModes = null }) {
  // Vérifier un critère à la main : vert, jaune, ou retour au calcul.
  // Changer la couleur d'une ligne ne recalcule rien (5 nov. 2026, Jules : « juste on change la couleur ») : l'écran la
  // change tout de suite, le serveur l'enregistre derrière, le dossier n'est pas relu. Un échec la remet.
  const [statutsLocaux, setStatutsLocaux] = useState({});
  const verifier = useMutation({
    mutationFn: ({ cle, statut }) => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot.index ?? 0}/verification`, { body: { cle, statut } }),
    onMutate: ({ cle, statut }) => setStatutsLocaux((x) => ({ ...x, [cle]: { statut, par: null, le: new Date().toISOString() } })),
    onError: (e, { cle }) => { setStatutsLocaux((x) => { const n = { ...x }; delete n[cle]; return n; }); toast.error(e?.message || "Impossible"); },
  });
  const [modeFiche, setModeFiche] = useState("tableau");
  const lotVu = Object.keys(statutsLocaux).length ? { ...lot, verifications: { ...(lot.verifications || {}), ...statutsLocaux } } : lot;
  // Réécrire la note d'une ligne, ou la vider pour revenir à la note calculée.
  const noter = useMutation({
    mutationFn: ({ ligne, texte }) => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot.index ?? 0}/note`, { body: { ligne, texte } }),
    onSuccess: (_, v) => { toast.success(v.texte ? "Note enregistrée" : "Note calculée remise"); onRefresh?.(); },
    onError: (e) => toast.error(e?.message || "Note non enregistrée"),
  });
  // Le détail (critères, données extraites, enrichissement, lieu, marché) se
  // déplie en bas : on y descend pour vérifier, pas pour lire.

  const enr = lot.enrichissement;
  // Enregistrer tout de suite, hors du brouillon : le nom, l'activité, l'enseigne, l'adresse de la carte Emplacement.
  const enregistrerTout = apercu || !dossier?.deal_id ? null : (saisie) => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot.index ?? 0}`, { body: saisie })
    .then(() => { onRefresh?.(); return true; })
    .catch((e) => { toast.error(e?.message || "Non enregistré"); return false; });

  return (
    <div className="text-encre">
      <div>
        <main className="min-w-0">
          {/* La fiche du bien : un tableau au dessin des grilles du bail. */}
          <section className="pb-8">
            <BandeauRecalcul actif={enCours} />
            {/* Mode Fiche ou Tableau, en haut à gauche, à la place du bouton « Fiche commerciale » (5 nov. 2026, Jules). */}
            {/* « Rentrer le projet » à droite des deux modes (5 nov. 2026, Jules). */}
            {/* La bascule toujours là, la pilule Projet à sa droite (11 nov. 2026, Jules). */}
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <BasculeFiche tableau={modeFiche === "tableau"} onChange={(oui) => setModeFiche(oui ? "tableau" : "fiche")} />
              {apresModes}
            </div>
            {modeFiche === "fiche" ? (boutonFicheSource(dossier) ? <FicheSource dossier={dossier} /> : <p className={`m-0 ${VERRE} px-5 py-8 text-center text-[13.5px] text-ardoise`}>Ce dossier n'a pas de fiche commerciale : il a été créé sans pièce.</p>) : (
              <TableauBien
                lot={lotVu}
                emplacement={<CarteEmplacement lot={lotVu} dealId={dossier?.deal_id || null} apercu={apercu} />}
                onSaisie={onSaisie}
                enCours={enCours}
                apercu={apercu}
                onVerifier={apercu || !dossier?.deal_id ? null : (cle, statut) => verifier.mutate({ cle, statut })}
                titre="Fiche du bien"
                dealId={dossier?.deal_id || null}
                verdictChoisi={dossier?.verdict_choisi?.valeur || ""}
                verdictTexte={dossier?.verdict_texte?.texte || ""}
                onSaisieDirecte={enregistrerTout}
                onNoter={apercu || !dossier?.deal_id ? null : (ligne, texte) => noter.mutate({ ligne, texte })}
                enNote={noter.isPending ? noter.variables?.ligne : null}
              />
            )}
          </section>

          {/* L'emplacement (boutons N°1, N°2…) retiré le 17 oct. 2026 (Jules) ; Street View et plan sont dans la colonne de droite du dossier. */}

          {/* L'Intelligence (phase 6, 15 oct. 2026) : ce que Klocka sait déjà de l'enseigne, de la ville, de l'agent. */}
          {/* « Ce que Klocka sait déjà » retiré de l'Analyse le 16 oct. 2026 (Jules). */}


          {/* Le simulateur : sous les deux colonnes, sur toute la largeur, quand le dossier le montre lui-même (17 oct. 2026, Jules). */}
          {!sansSimulateur && (
          <section className="py-8">
            <div className="flex items-baseline gap-3 flex-wrap mb-5">
              <h2 className="m-0 text-[18px] font-semibold">Simulateur</h2>
              <span className="text-[12.5px] text-brume">pré-rempli avec ce dossier, tous les paramètres sont manipulables</span>
            </div>
            <SimulateurDossier parametres={lot.simulateur} dealId={dossier?.deal_id || null} lotIndex={lot.index ?? 0} onEnregistre={onRefresh} />
          </section>
          )}

          {/* Le bloc « Détail » (données extraites, enrichissement, marché local) retiré le 17 oct. 2026 (Jules). */}
        </main>

      </div>

    </div>
  );
}

/**
 * L'interrupteur Mode Fiche / Mode Tableau (5 nov. 2026, Jules : « comme le mode Libre / mode Clients de la Prospection
 * du mandataire, à la taille de son contenu ») : le dessin de BasculeMode (ProspecterClients.jsx).
 */
function BasculeFiche({ tableau, onChange }) {
  return (
    <button type="button" role="switch" aria-checked={tableau} onClick={() => onChange(!tableau)}
      className="inline-flex h-10 w-fit items-center gap-3 rounded-full border border-bord-doux bg-rail px-4 text-[14px] hover:border-bord-vif">
      <span className={`transition-colors duration-300 ${tableau ? "text-ardoise" : "text-encre"}`}>Fiche</span>
      <span aria-hidden className={`relative h-[20px] w-[36px] flex-none rounded-full transition-colors duration-300 ${tableau ? "bg-menthe" : "bg-relief"}`}>
        <span className={`absolute top-[2px] h-[16px] w-[16px] rounded-full bg-fond shadow-sm transition-all duration-300 ease-out ${tableau ? "left-[18px]" : "left-[2px]"}`} />
      </span>
      <span className={`transition-colors duration-300 ${tableau ? "text-encre" : "text-ardoise"}`}>Tableau</span>
    </button>
  );
}

function Metrique({ label, valeur, sousTitre, accent }) {
  return (
    <div className="px-4 py-3">
      <p className="text-ardoise text-[11px] mb-1">{label}</p>
      <p className={`text-lg font-light ${accent ? "text-menthe-clair" : "text-encre"}`}>{valeur}</p>
      {sousTitre && <p className="text-brume text-[11px]">{sousTitre}</p>}
    </div>
  );
}

function LigneDetail({ label, valeur, fort = undefined }) {
  return (
    <div className="flex justify-between gap-3 py-1.5 border-b border-relief">
      <span className="text-ardoise">{label}</span>
      <span className={fort ? "text-menthe-clair" : "text-encre"}>{valeur}</span>
    </div>
  );
}

function ValidationEnseigne({ nom, signature, apercu }) {
  const [fait, setFait] = useState(false);
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", "/api/preanalyse/enseignes", { body: { nom, niveau: signature.niveau } }),
    onSuccess: (r) => {
      if (r?.success) {
        setFait(true);
        toast.success("Enseigne ajoutée au référentiel");
      } else toast.error(r?.error || "Ajout impossible");
    },
  });

  if (fait) return <p className="text-menthe-clair text-xs mt-3">Enseigne ajoutée au référentiel.</p>;

  return (
    <div className="mt-3 rounded-lg border border-menthe/25 bg-menthe/10 px-3 py-2.5">
      <p className="text-amber-200/90 text-xs mb-1">
        « {nom} » est absente du référentiel. Qualification proposée par l'IA : <strong>{signature.niveau}</strong>.
      </p>
      {signature.justification && <p className="text-amber-200/60 text-[11px] mb-2">{signature.justification}</p>}
      <Button
        size="sm"
        onClick={() => enregistrer.mutate()}
        disabled={apercu || enregistrer.isPending}
        className="bg-menthe/20 hover:bg-menthe/30 text-amber-200 border-0 h-7 text-xs"
      >
        Valider et ajouter au référentiel
      </Button>
    </div>
  );
}
