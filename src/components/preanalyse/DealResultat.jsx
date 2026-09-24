/* eslint-disable no-restricted-syntax -- palette de données.
   Les couleurs de ce fichier ne sont pas des choix de design : ce sont des
   échelles qui portent un sens (classes DPE, séries d'un graphique, teintes
   d'une carte). Elles ne suivent pas la marque et ne doivent pas la suivre. */
import { TEINTE, FOND, MOT, Th, teinteDe, useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle, Archive, Check, ChevronDown, ChevronUp, Loader2, MapPin, Pencil, Quote, Send, X,
} from "lucide-react";
import { toast } from "@/components/ui/avis";
import SimulateurDossier from "@/components/preanalyse/SimulateurDossier";
import ClientsCorrespondants from "@/components/admin/ClientsCorrespondants";
import CarteGoogle from "@/components/CarteGoogle";
import StreetViewRue from "@/components/projet/StreetViewRue";
import FicheSource from "@/components/preanalyse/FicheSource";
import PenseeIA from "@/components/PenseeIA";

// Sans clé Maps, ni la rue ni le plan ne s'affichent : on le dit plutôt que de
// laisser deux cadres noirs.
const CLE_MAPS = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
import { EncartConnexionGmail, useConnexionGmail } from "@/components/mails/ConnexionGmail";
import { J } from "@/design/jetons";

// Bibliothèque partagée du workflow d'analyse : verdicts, statuts, carte d'un
// lot, dialogue de mail d'intention, journal de suivi. Consommée par
// WorkflowDeal (la page Analyse) et PipelineDeals (la liste des deals).

// Les clés sont les valeurs du moteur de règles (invariant serveur) ; seuls
// les libellés affichés changent — un langage de comité, pas de jargon GO/NO-GO.
export const VERDICTS = {
  "GO": { libelle: "Conforme", classe: "bg-menthe/15 text-menthe-clair border-menthe/30", bord: "border-menthe/40" },
  "GO SOUS RÉSERVE": { libelle: "Conforme sous réserve", classe: "bg-menthe/15 text-menthe border-menthe/30", bord: "border-menthe/30" },
  "INSUFFISANT": { libelle: "Dossier incomplet", classe: "bg-sky-500/15 text-sky-300 border-sky-500/30", bord: "border-sky-500/30" },
  "NO-GO": { libelle: "Non conforme", classe: "bg-red-500/15 text-red-300 border-red-500/30", bord: "border-red-500/30" },
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
const LIGNES_BIEN = [
  { id: "prix", element: "Prix FAI", champs: ["prix_fourchette"] },
  { id: "prix_marche", element: "Prix marché", marche: "prix" },
  { id: "rendement", element: "Rendement annoncé / réel", champs: ["rendement_net_moyen", "rendement_aem", "rendement_fai"] },
  { id: "loyer", element: "Loyer annuel HT HC", champs: ["loyer_annuel_ht_hc"] },
  { id: "loyer_marche", element: "Loyer marché", marche: "loyer" },
  { id: "occupe", element: "Occupé", champs: ["occupe"] },
  { id: "activite", element: "Activité", champs: ["categorie_activite", "activite_exclue"] },
  { id: "enseigne", element: "Qualité de l'enseigne", champs: ["signature", "locataire_nom"] },
  { id: "emplacement", element: "Emplacement", champs: ["emplacement"] },
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
 * « Voir détail » ouvre le chiffre du bien face au marché et d'où vient la
 * zone comparée ; « Voir la source » n'apparaît qu'à ce niveau-là, et ouvre
 * la liste des ventes en dessous.
 */
function FaceAuMarche({ bien, marche, suffixe = "", libelleBien, libelleMarche, chargement, sourceOuverte = false, onSource, manque = null, adresseComparaison = null }) {
  const [detail, setDetail] = useState(false);
  if (chargement) return <p className="m-0 inline-flex items-center gap-1.5 text-[12px] text-brume"><Loader2 className="w-3 h-3 animate-spin" /> Lecture du marché autour…</p>;
  if (!marche) return <p className="m-0 text-[12px] text-brume">{manque || "Pas de marché lisible autour."}</p>;
  const j = marche.jugement;
  const repere = marche.median ?? null;
  const ecart = j?.ecart != null ? `${j.ecart > 0 ? "+" : ""}${j.ecart} %` : j?.mot || "—";
  // La zone comparée : le repère de la fiche quand l'adresse manque, sinon
  // l'adresse elle-même — pour que l'analyste sache toujours sur quoi porte
  // le chiffre, pas seulement quand c'est approché.
  const zone = marche.approche ? marche.reserve : adresseComparaison ? `Comparé autour de ${adresseComparaison}.` : null;
  return (
    <div className="text-[12.5px] leading-[1.55]">
      {marche.kdata_en_cours && (
        <p className="m-0 mb-1 inline-flex items-center gap-1.5 text-[11.5px] text-ardoise"><Loader2 className="w-3 h-3 animate-spin" /> K-Data Valeur locative interroge Equimmox : quelques minutes.</p>
      )}
      <p className="m-0 font-medium text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{ecart}</p>
      <button type="button" onClick={() => setDetail((v) => !v)} className="mt-0.5 text-[11.5px] text-menthe-clair hover:text-encre" style={{ background: "transparent" }}>
        {detail ? "Masquer le détail" : "Voir détail"}
      </button>
      {detail && (
        <div className="mt-1.5">
          <p className="m-0 text-ardoise" style={{ fontVariantNumeric: "tabular-nums" }}>
            {libelleBien} <span className="text-encre">{eurosM2(bien, suffixe)}</span>
            <span className="text-brume"> vs </span>
            {libelleMarche} <span className="text-encre">{eurosM2(repere, suffixe)}</span>
            {marche.bas != null && marche.haut != null && <span className="text-brume"> ({Math.round(marche.bas).toLocaleString("fr-FR")} à {Math.round(marche.haut).toLocaleString("fr-FR")})</span>}
          </p>
          {zone && <p className="m-0 mt-1 text-[11.5px] text-brume">{zone}</p>}
          <button type="button" onClick={onSource} className="mt-1.5 text-[11.5px] text-menthe-clair hover:text-encre" style={{ background: "transparent" }}>
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
      {marche.kdata?.id && <a href={`/valeurlocative?id=${encodeURIComponent(marche.kdata.id)}`} target="_blank" rel="noopener noreferrer" className="mt-1 mr-4 inline-block text-[12px] text-menthe-clair hover:text-encre">Ouvrir l'analyse K-Data Valeur locative ↗</a>}
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
function TableauBien({ lot, dealId = null, onSaisie, enCours, apercu, onVerifier = null, enVerification = null, titre, sousTitre = null, actions = null }) {
  // Le marché autour : lu une fois par état du bien (prix, loyer, surface).
  const { data: marche, isLoading: marcheEnLecture } = useQuery({
    queryKey: ["marche-comparaison", dealId, lot.index ?? 0, valChamp(lot.lot?.prix_fai), valChamp(lot.lot?.loyer_annuel_ht_hc), valChamp(lot.lot?.surface_m2)],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/lots/${lot.index ?? 0}/marche-comparaison`),
    enabled: !!dealId && !apercu,
    staleTime: 10 * 60 * 1000,
    retry: false,
    refetchInterval: (q) => (q.state.data?.loyer?.kdata_en_cours ? 20000 : false),
  });
  const grille = lot.evaluation?.grille || [];
  const ctx = lot.evaluation?.contexte || {};
  const enr = lot.enrichissement || {};
  const [ouverts, setOuverts] = useState(() => new Set());
  const [choix, setChoix] = useState(null);
  const [source, setSource] = useState(null); // "prix" | "loyer"
  const menu = useFermerAuClicAilleurs(choix != null, () => setChoix(null));
  const bascule = (id) => setOuverts((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const loyerFiche = valChamp(lot.lot?.loyer_annuel_ht_hc);
  const { hors, fai } = prixDuLot(lot);
  // La fiche ne l'écrit pas toujours : le loyer sur le prix FAI en tient lieu.
  const annonce = valChamp(lot.lot?.rendement_annonce) ?? (fai && loyerFiche ? (loyerFiche / fai) * 100 : null);
  const reel = ctx.rendement_net_moyen ?? lot.evaluation?.aem?.rendement_aem ?? null;
  const emplacement = EMPLACEMENTS.find((e) => e.code === enr.emplacement)?.libelle || "à qualifier";
  const signature = SIGNATURES[ctx.signature] || (ctx.signature ? String(ctx.signature).replace(/_/g, " ") : null);

  const champ = (c) => <ChampFiche champ={c} lot={lot} onSaisie={onSaisie} enCours={enCours} apercu={apercu} sansNote aGauche />;
  const valeur = (id) => {
    switch (id) {
      case "prix":
        // Toujours le prix FAI : quand la fiche donne un net vendeur, les
        // honoraires s'y ajoutent, et c'est le net qui se corrige.
        return (
          <div>
            {hors ? (
              <>
                <span className="text-[15px] text-encre" style={{ fontVariantNumeric: "tabular-nums" }}>{euros(fai)}</span>
                <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-[11.5px] text-brume">net vendeur {champ("prix_fai")} + {euros(valChamp(lot.lot?.montant_honoraires))} d'honoraires</span>
              </>
            ) : champ("prix_fai")}
          </div>
        );
      case "prix_marche":
        return <FaceAuMarche bien={marche?.bien?.prix_m2} marche={marche?.prix} libelleBien="le bien" libelleMarche="ventes autour" chargement={marcheEnLecture} sourceOuverte={source === "prix"} onSource={() => setSource(source === "prix" ? null : "prix")} manque={marche?.manque} adresseComparaison={marche?.adresse} />;
      case "rendement":
        return (
          <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13.5px]" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span className="text-craie">{pourcent(annonce) || "—"} <span className="text-[11px] text-brume">annoncé</span></span>
            <span className="text-encre" title="Rendement net moyen du simulateur, sur toute la durée du projet">{pourcent(reel) || "—"} <span className="text-[11px] text-brume">réel</span></span>
          </span>
        );
      case "loyer": return champ("loyer_annuel_ht_hc");
      case "loyer_marche":
        return <FaceAuMarche bien={marche?.bien?.loyer_m2} marche={marche?.loyer} suffixe="/an" libelleBien="le bien" libelleMarche="le marché" chargement={marcheEnLecture} sourceOuverte={source === "loyer"} onSource={() => setSource(source === "loyer" ? null : "loyer")} manque={marche?.manque} adresseComparaison={marche?.adresse} />;
      case "occupe": return champ("occupe");
      case "activite": return champ("locataire_activite");
      case "enseigne":
        return (
          <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {champ("locataire_nom")}
            {signature && <span className="text-[12.5px] text-ardoise">{signature}</span>}
          </span>
        );
      case "emplacement":
        return <span className={`text-[13.5px] ${enr.emplacement && enr.emplacement !== "a_qualifier" ? "text-encre" : "text-brume"}`}>{emplacement}</span>;
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
  const lignes = LIGNES_BIEN.map((l) => {
    if (l.marche) {
      return { ...l, c: null, decision: null, st: marcheEnLecture ? "vide" : statutMarche(marche?.[l.marche]), attenduMarche: "dans le marché, à 15 % près" };
    }
    const c = critereDe(grille, l.champs);
    const decision = decisionDe(c);
    // Un marché lu sur le quartier, faute d'adresse, met une réserve sur le
    // prix et le loyer : ils tiennent peut-être, mais ce n'est pas établi.
    const approche = (l.id === "prix" && marche?.prix?.approche) || (l.id === "loyer" && marche?.loyer?.approche);
    const calcule = statutDe(c);
    return { ...l, c, decision, st: decision?.statut || (approche && calcule === "ok" ? "a_verifier" : calcule) };
  });
  const resume = { ok: 0, warning: 0, no_go: 0, vide: 0 };
  for (const l of lignes) {
    const st = l.st;
    if (st === "ok") resume.ok += 1;
    else if (st === "no_go") resume.no_go += 1;
    else if (st === "vide") resume.vide += 1;
    else resume.warning += 1;
  }

  return (
    <div className="overflow-hidden rounded-[16px] border border-trait bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="m-0 text-[18px] font-semibold text-encre">{titre}</h2>
          {sousTitre && <span className="text-[12.5px] text-ardoise">{sousTitre}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex items-center gap-3 text-[12.5px] text-craie">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.ok }} />{resume.ok} OK</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.warning }} />{resume.warning} à vérifier</span>
            {resume.no_go > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.no_go }} />{resume.no_go} no go</span>}
            {resume.vide > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: TEINTE.vide }} />{resume.vide} sans valeur</span>}
          </span>
          {actions}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] table-fixed border-collapse">
          <thead><tr><Th className="w-1/4">Critère</Th><Th className="w-1/4">Valeur lue</Th><Th className="w-1/4">Statut</Th><Th className="w-1/4">Attendu</Th></tr></thead>
          <tbody>
            {lignes.map(({ id, element, c, st, decision, attenduMarche, marche: cleMarche }, iLigne) => {
              const modifiable = !!(c && onVerifier);
              return (
                <React.Fragment key={id}>
                <tr className="align-top">
                  <td className="px-4 py-3 border-b border-r border-trait">
                    <button onClick={() => bascule(id)} className="text-left text-[13.5px] text-encre hover:text-[#ffffff]">{element}</button>
                    {ouverts.has(id) && c && (
                      <p className="m-0 mt-1 text-[11px] leading-[1.45] text-brume">{c.critere}{c.groupe ? ` · ${c.groupe}` : ""}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 border-b border-r border-trait break-words [&_*]:whitespace-normal">
                    {valeur(id)}
                    {c?.ok === false && c.motif && <p className="m-0 mt-1 text-[12.5px] leading-[1.45] text-ardoise">{c.motif}</p>}
                  </td>
                  <td
                    className={`px-4 py-3 border-b border-r border-trait relative ${modifiable ? "cursor-pointer" : ""}`}
                    style={{ background: FOND[st] || FOND.vide }}
                    onClick={() => modifiable && setChoix(choix === id ? null : id)}
                    title={modifiable ? "Confirmer le statut" : undefined}
                  >
                    <span className="inline-flex items-center gap-2 text-[12.5px] font-medium" style={{ color: teinteDe(st) }}>
                      {MOT[st] || st}
                      {c && enVerification === cleLigne(c) && <Loader2 className="w-3.5 h-3.5 animate-spin" aria-label="Changement en cours" />}
                    </span>
                    {decision && <span className="block text-[11px] text-ardoise">décidé{decision.par ? ` · ${decision.par.split("@")[0]}` : ""}</span>}
                    {choix === id && (
                      <div ref={menu} className={`absolute left-2 z-20 bg-surface border border-bord-doux rounded-lg shadow-[0_12px_30px_rgba(0,0,0,.5)] p-1.5 flex flex-col gap-1 min-w-[150px] ${iLigne >= lignes.length - 2 ? "bottom-full mb-1" : "top-full mt-1"}`} onClick={(e) => e.stopPropagation()}>
                        {[["ok", "OK"], ["a_verifier", "À vérifier"], ["no_go", "No go"]].map(([statut, mot]) => (
                          <button key={statut} onClick={() => { onVerifier(cleLigne(c), statut); setChoix(null); }} className="rounded-md px-3 py-1.5 text-left text-[12.5px] font-medium" style={{ background: FOND[statut], color: teinteDe(statut) }}>{mot}</button>
                        ))}
                        {decision && <button onClick={() => { onVerifier(cleLigne(c), null); setChoix(null); }} className="text-left text-[12.5px] text-ardoise hover:text-encre px-3 py-1">Revenir au calcul</button>}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 border-b border-trait">
                    {c?.attendu || attenduMarche ? <p className="m-0 text-[12.5px] leading-[1.5] text-craie">{c?.attendu || attenduMarche}</p> : <span className="text-[12.5px] text-brume">—</span>}
                  </td>
                </tr>
                {cleMarche && marche?.[cleMarche] && (
                  // La source glisse : la hauteur passe de 0 à son contenu.
                  <tr aria-hidden={source !== cleMarche}>
                    <td colSpan={4} className={`p-0 bg-fond/40 transition-[border-color] duration-300 ${source === cleMarche ? "border-b border-trait" : "border-b border-transparent"}`}>
                      <div className="grid transition-[grid-template-rows] duration-300 ease-out" style={{ gridTemplateRows: source === cleMarche ? "1fr" : "0fr" }}>
                        <div className={`min-h-0 overflow-hidden transition-opacity duration-300 ${source === cleMarche ? "opacity-100" : "opacity-0"}`}>
                          <SourceMarche marche={marche[cleMarche]} />
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
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
      ? "border-menthe/25 bg-menthe/10 text-amber-200/90"
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

export function DialogMailIntention({ dossier, intention, mailInitial = undefined, onClose, onDone, onArchiverSansMail = undefined, parametres = null }) {
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
export function VuesLieu({ lot, enr, coteACote = false, dealId = null }) {
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
  const noteSansAdresse = repere
    ? `Adresse précise absente de la fiche : les vues sont posées sur le repère qu'elle donne, ${repere.repere}.`
    : "Adresse précise absente de la fiche : les vues sont centrées sur la commune.";
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <figure className="m-0">
            <div className="relative h-[300px] rounded-[14px] overflow-hidden border border-trait bg-surface">
              {!CLE_MAPS ? (
                <p className="absolute inset-0 flex items-center justify-center m-0 px-6 text-center text-[12.5px] text-ardoise">Street View indisponible : renseignez <code className="text-craie mx-1">VITE_GOOGLE_MAPS_API_KEY</code>.</p>
              ) : localisable ? <StreetViewRue project={lieu} /> : (
                <p className="absolute inset-0 flex items-center justify-center m-0 text-[12.5px] text-brume">Adresse inconnue pour ce lot.</p>
              )}
            </div>
          </figure>
          <figure className="m-0">
            <div className="[&_iframe]:!h-[300px] [&_iframe]:!rounded-[14px]">
              <CarteGoogle adresse={adresse} lat={centre.lat} lon={centre.lon} zoom={repere ? 17 : undefined} hauteur="h-[300px]" />
            </div>
          </figure>
        </div>
        {!adresse && <p className="m-0 text-[12.5px] text-brume">{noteSansAdresse}</p>}
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
        <div className="relative h-[420px] rounded-md overflow-hidden border border-trait">
          <StreetViewRue project={lieu} />
        </div>
      )}
      {vue !== "carte" && !adresse && (
        <p className="m-0 text-[11px] text-brume">
          {noteSansAdresse}
        </p>
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
          className={`w-[150px] bg-transparent border-b border-bord-vif focus:border-encre outline-none tabular-nums font-light text-encre placeholder:text-bord-vif ${compact ? "text-[13.5px] py-0.5" : "text-[24px] py-1"}`}
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
      {modifiable && <Pencil className={`${compact ? "w-3 h-3" : "w-3.5 h-3.5"} text-brume opacity-0 group-hover:opacity-100 transition-opacity`} />}
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

export function ChampFiche({ champ, lot, onSaisie, enCours, apercu = false, sansNote = false, aGauche = false, teinte = null }) {
  const c = lot?.lot?.[champ];
  const absent = !c || c.absent;
  const [edition, setEdition] = useState(null);
  const [choix, setChoix] = useState(null);
  useEffect(() => { if (!enCours) setChoix(null); }, [enCours]);
  const modifiable = !apercu && !!onSaisie;
  const valider = (v) => { onSaisie?.({ [champ]: v }); setEdition(null); };

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
    return (
      <span className="inline-flex flex-wrap items-center gap-2 justify-end">
        <input
          autoFocus
          value={edition}
          onChange={(e) => setEdition(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") valider(edition.trim()); if (e.key === "Escape") setEdition(null); }}
          placeholder={champ === "adresse" ? "12 rue Exemple, 69002 Lyon" : ""}
          className="min-w-[220px] bg-transparent border-b border-bord-vif focus:border-encre outline-none text-[13.5px] font-light tabular-nums text-encre py-0.5 placeholder:text-bord-vif"
        />
        <button onClick={() => valider(edition.trim())} disabled={enCours} className="inline-flex items-center gap-1 text-[12.5px] px-2.5 py-1 bg-menthe rounded-full text-sur-menthe font-semibold rounded-md disabled:opacity-40"><Check className="w-3 h-3" /> OK</button>
        <button onClick={() => setEdition(null)} className="text-[12.5px] text-ardoise hover:text-encre">Annuler</button>
      </span>
    );
  }

  return (
    <button
      onClick={() => modifiable && setEdition(texteBrut(champ, c))}
      disabled={!modifiable || enCours}
      aria-label={modifiable ? "Modifier" : c?.citation || undefined} title={modifiable ? "Modifier" : c?.citation || undefined}
      className={`group inline-flex min-w-0 items-baseline gap-2 tabular-nums disabled:cursor-default ${aGauche ? "text-left text-[15px] font-normal" : "text-right text-[13.5px] font-light"} ${absent ? "text-brume" : teinte || "text-encre"}`}
    >
      <span className="truncate">{absent ? "non renseigné" : afficherValeur(champ, c.valeur)}</span>
      {!sansNote && !absent && c.confiance === "basse" && <span className="text-[11px] text-ambre font-normal">confiance basse</span>}
      {!sansNote && !absent && c.saisi_a_la_main && <span className="text-[11px] text-ambre font-normal">saisi à la main</span>}
      {modifiable && <Pencil className="w-3 h-3 text-brume opacity-0 group-hover:opacity-100 transition-opacity flex-none" />}
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

export function CarteLot({ lot, dossier, onSaisie, onRefresh, enCours, apercu = false }) {
  // Vérifier un critère à la main : vert, jaune, ou retour au calcul.
  const verifier = useMutation({
    mutationFn: ({ cle, statut }) => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/${lot.index ?? 0}/verification`, { body: { cle, statut } }),
    onSuccess: () => onRefresh?.(),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Le détail (critères, données extraites, enrichissement, lieu, marché) se
  // déplie en bas : on y descend pour vérifier, pas pour lire.
  const [detailOuvert, setDetailOuvert] = useState(false);

  // À qui ce bien pourrait correspondre, d'après les investisseurs de Monday.
  const {
    data: correspondances,
    isLoading: chargementCorrespondances,
    isError: erreurCorrespondances,
  } = useQuery({
    queryKey: ["dossier-clients", dossier?.deal_id],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dossier.deal_id}/clients`),
    enabled: !!dossier?.deal_id,
    staleTime: 5 * 60 * 1000,
  });
  const [mailOuvert, setMailOuvert] = useState(false);
  const enr = lot.enrichissement;

  return (
    <div className="text-encre">
      <div className="pt-2">
        <main className="min-w-0">
          {/* La fiche du bien : un tableau au dessin des grilles du bail. */}
          <section className="pb-8">
            <BandeauRecalcul actif={enCours} />
            <TableauBien
              lot={lot}
              onSaisie={onSaisie}
              enCours={enCours}
              apercu={apercu}
              onVerifier={apercu || !dossier?.deal_id ? null : (cle, statut) => verifier.mutate({ cle, statut })}
              titre="Fiche du bien"
              dealId={dossier?.deal_id || null}
              enVerification={verifier.isPending ? verifier.variables?.cle : null}
              actions={(
                <span className="flex items-center gap-2">
                  <FicheSource dossier={dossier} />
                  {lot.mail_agent && (
                    <button onClick={() => !apercu && setMailOuvert(true)} disabled={apercu} className="inline-flex items-center gap-2 rounded-full border border-bord-doux px-3.5 py-1.5 text-[12.5px] text-craie hover:text-encre hover:border-bord-vif disabled:opacity-40">
                      <Send className="w-3.5 h-3.5" /> Mail de relance à l'agent
                    </button>
                  )}
                </span>
              )}
            />
          </section>

          {/* L'emplacement, juste sous la fiche : on regarde la rue avant tout
              le reste, et la qualification qu'on en tire change le verdict. */}
          <section className="py-8">
            <div className="flex items-baseline gap-3 flex-wrap mb-4">
              <h2 className="m-0 text-[18px] font-semibold">Emplacement</h2>
              <span className="text-[12.5px] text-brume">{enCours ? "recalcul…" : "le verdict est recalculé à chaque changement"}</span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <div className="inline-flex flex-wrap rounded-full border border-bord-doux p-0.5">
                {EMPLACEMENTS.map((e) => (
                  <button key={e.code} disabled={apercu || enCours} onClick={() => onSaisie?.({ emplacement: e.code })} className={`px-3.5 py-1.5 rounded-full text-[12.5px] transition-colors disabled:opacity-50 ${enr?.emplacement === e.code ? "bg-menthe rounded-full text-sur-menthe font-semibold" : "text-ardoise hover:text-encre"}`}>{e.libelle}</button>
                ))}
              </div>
              {(!enr?.emplacement || enr.emplacement === "a_qualifier") && (
                <span className="border border-bord-vif rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-[.18em]" style={{ color: J["ambre"] }}>à qualifier</span>
              )}
            </div>
            <VuesLieu lot={lot} enr={enr} coteACote dealId={dossier?.deal_id} />
          </section>


          {/* Le simulateur, tel quel */}
          <section className="py-8">
            <div className="flex items-baseline gap-3 flex-wrap mb-5">
              <h2 className="m-0 text-[18px] font-semibold">Simulateur</h2>
              <span className="text-[12.5px] text-brume">pré-rempli avec ce dossier, tous les paramètres sont manipulables</span>
            </div>
            <SimulateurDossier parametres={lot.simulateur} dealId={dossier?.deal_id || null} lotIndex={lot.index ?? 0} onEnregistre={onRefresh} />
          </section>

          {/* Les clients à qui ce bien pourrait correspondre */}
          <section className="pt-8">
            <div className="flex items-baseline gap-3 flex-wrap mb-3">
              <h2 className="m-0 text-[18px] font-semibold">Clients à qui ce bien pourrait correspondre</h2>
              <span className="text-[12.5px] text-brume">budget, apport et zone de recherche, d'après Monday</span>
            </div>
            <ClientsCorrespondants clients={correspondances?.clients} chargement={chargementCorrespondances} configure={correspondances?.configure} erreur={erreurCorrespondances} />
          </section>

          {/* Le détail */}
          <div className="mt-8 border-t border-trait">
            <button onClick={() => setDetailOuvert((o) => !o)} className="w-full py-3 flex items-center justify-between text-ardoise hover:text-encre text-xs transition-colors">
              <span>Détail — données extraites avec citations, enrichissement{lot.contexte_marche ? ", marché local" : ""}</span>
              {detailOuvert ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
      {detailOuvert && (
        <div className="pb-5">
          <Tabs defaultValue="extraction">
            <TabsList className="mb-4 gap-5">
              <TabsTrigger value="extraction">Données extraites</TabsTrigger>
              <TabsTrigger value="enrichissement">Enrichissement</TabsTrigger>
              {lot.contexte_marche && <TabsTrigger value="marche">Marché local</TabsTrigger>}
            </TabsList>

            <TabsContent value="extraction">
              {lot.incidents_garde_fou?.length > 0 && (
                <div className="mb-3 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2">
                  <p className="text-red-300 text-xs font-medium mb-1">
                    {lot.incidents_garde_fou.length} valeur(s) rejetée(s) par le garde-fou
                  </p>
                  {lot.incidents_garde_fou.map((i, k) => (
                    <p key={k} className="text-red-300/70 text-[11px]">
                      {i.champ} : {i.motif}
                      {i.valeur_rejetee != null && ` (valeur écartée : ${JSON.stringify(i.valeur_rejetee)})`}
                    </p>
                  ))}
                </div>
              )}
              <div className="space-y-1">
                {CHAMPS_AFFICHES.map(([champ, libelle]) => {
                  const c = lot.lot[champ];
                  const absent = !c || c.absent;
                  return (
                    <div key={champ} className="flex items-start gap-3 py-1.5 border-b border-relief">
                      <span className="text-ardoise text-xs w-40 flex-shrink-0">{libelle}</span>
                      <span className={`text-xs flex-1 ${absent ? "text-brume italic" : "text-encre"}`}>
                        {absent ? "non renseigné dans la fiche" : afficherValeur(champ, c.valeur)}
                      </span>
                      {!absent && c.citation && (
                        <span
                          title={c.citation}
                          className="text-brume text-[11px] flex items-center gap-1 max-w-[45%] truncate cursor-help"
                        >
                          <Quote className="w-3 h-3 flex-shrink-0" />
                          {c.citation}
                        </span>
                      )}
                      {!absent && c.confiance === "basse" && (
                        <Badge className="bg-menthe/15 text-menthe border-menthe/25 text-[11px]">
                          confiance basse
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="enrichissement">
              <div className="space-y-1 text-xs">
                <LigneDetail label="Commune" valeur={enr?.commune ? `${enr.commune.nom} (${enr.commune.code_insee})` : "non résolue"} />
                <LigneDetail label="Population" valeur={enr?.commune?.population?.toLocaleString("fr-FR") ?? "—"} />
                <LigneDetail label="Typologie" valeur={enr?.typologie_ville ? enr.typologie_ville.replace("_", " ") : enr?.commune ? "population inconnue" : "commune non résolue"} />
                <LigneDetail
                  label="Ville riche"
                  valeur={enr?.ville_riche === null ? "inconnu (revenu médian non renseigné)" : enr?.ville_riche ? "oui" : "non"}
                />
                <LigneDetail label="Paris" valeur={enr?.paris ? "oui" : "non"} />
                <LigneDetail
                  label="Signature"
                  valeur={`${enr?.signature?.niveau ?? "—"} (${enr?.signature?.source ?? "—"}, confiance ${enr?.signature?.confiance ?? "—"})`}
                />
                <LigneDetail label="Activité" valeur={`${enr?.activite?.libelle ?? "—"}${enr?.activite?.exclue ? " — EXCLUE" : ""}`} />
                <LigneDetail label="Emplacement" valeur={enr?.emplacement ?? "—"} />
              </div>
              {enr?.signature?.a_valider && (
                <ValidationEnseigne nom={lot.lot.locataire_nom?.valeur} signature={enr.signature} apercu={apercu} />
              )}
            </TabsContent>

            {lot.contexte_marche && (
              <TabsContent value="marche">
                <div className="space-y-3">
                  <p className="text-craie text-sm leading-relaxed whitespace-pre-wrap">
                    {lot.contexte_marche.resume}
                  </p>
                  {lot.contexte_marche.sources?.length > 0 && (
                    <div>
                      <p className="text-ardoise text-xs mb-1.5">Sources consultées :</p>
                      <ul className="space-y-1">
                        {lot.contexte_marche.sources.map((s, i) => (
                          <li key={i}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-menthe-clair hover:text-encre text-xs underline underline-offset-2 transition-colors"
                            >
                              {s.titre}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <p className="text-brume text-[11px]">
                    Généré avec recherche web — à vérifier avant décision. Ce contexte n'entre pas dans le
                    verdict.
                  </p>
                </div>
              </TabsContent>
            )}
          </Tabs>
        </div>
      )}

          </div>
        </main>

      </div>

      {mailOuvert && (
        <DialogMailIntention
          dossier={dossier}
          intention="complement"
          mailInitial={lot.mail_agent}
          onClose={() => setMailOuvert(false)}
          onDone={() => setMailOuvert(false)}
        />
      )}
    </div>
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
