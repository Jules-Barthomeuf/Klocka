import React, { useRef, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronRight, FileUp, Loader2, Plus, Search, Send, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { J } from "@/design/jetons";
import { BandeauExemples, Carte, Frise, PastilleExemple, PastilleTest, euros } from "@/components/mandataire/kit";
import { useAuthPeutEtre } from "@/lib/AuthContext";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import { MenuEtapesDroite } from "@/components/preanalyse/EtapesDossier";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import FicheMandataire from "@/components/mandataire/FicheMandataire";
import { CompteRendu, PreparationDuBien, useVersAvis } from "@/components/mandataire/PreVisite";
import { FichePoint } from "@/components/mandataire/TableauListe";
import { AnimatePresence, motion } from "framer-motion";
import { retenirBien } from "@/components/mandataire/BiensRecents";
import { DocumentTelephone } from "@/components/mandataire/GenerationDocument";
import ApercuMandat, { FenetreMandatPret } from "@/components/mandataire/ApercuMandat";
import PresentationAvis, { PresentationPleinEcran } from "@/components/mandataire/PresentationAvis";
import SourcesAvis from "@/components/mandataire/SourcesAvis";
import SuiviBien from "@/components/mandataire/SuiviBien";
import EnvoiAvis from "@/components/mandataire/EnvoiAvis";
import SurvolSources from "@/components/mandataire/SurvolSources";
import { ModeAvis } from "@/components/mandataire/EditeurAvis";
import { ModesEditeur } from "@/components/editeur/Editeur";
import { useReglagesChatMandataire } from "@/components/mandataire/ReglagesChatMandataire";
import { useLargeurChat } from "@/components/mandataire/PoigneeChat";
import Chargement from "@/components/ui/Chargement";
import { ETAPES_BIEN, MOTS_PERDU, bienDe, bienDuProprietaire, enAttenteDuProprietaire, regrouperBiens } from "@/lib/biens-mandataire";
import { ApercuAvis } from "@/pages/MandataireEstimation";
import { Detail as DetailMarche, ETAPES_MARCHE } from "@/pages/MandataireMarche";
import Visites from "@/components/mandataire/Visites";
import DossierVente, { MailDuChat } from "@/components/mandataire/DossierVente";
import VueEnsembleBien from "@/components/mandataire/VueEnsembleBien";
import RelectureBien from "@/components/mandataire/RelectureBien";
import AnnoncesBien from "@/components/mandataire/AnnoncesBien";
import TeaserBien, { ActionsTeaser } from "@/components/mandataire/Teaser";
import FilDossier from "@/components/mandataire/FilDossier";
import { Conversation, Resume, depuisMandataire } from "@/components/conversations/EspaceConversations";

// Biens (24 oct. 2026, Jules) : tous les biens du mandataire en cartes,
// chacun à son statut (la section « Aujourd'hui » est retirée le même jour). Un bien ouvert se suit comme un
// dossier de l'équipe : ses sept étapes à droite (Contact, Estimation, Mandat,
// Analyse, Mise en marché, Offre, Vente), l'étape en cours mise en avant, les
// autres un clic plus loin. Une étape ne montre que ce bien : son estimation (le chat à
// gauche, l'avis à droite), son mandat, son dossier, sa mise en marché ; pas
// les listes des autres biens. Une étape pas encore faite se commence là.

const CHAT = "/api/mandataire";

export default function MandataireBiens() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const estimations = useQuery({ queryKey: ["m-estimations"], queryFn: () => base44.request("GET", "/api/mandataire/estimations") });
  // Un mandat parti se relit toutes les 20 secondes : le PDF joint par l'équipe change le geste, et un message reçu
  // allume le point de « Conversation » (2 nov. 2026, Jules).
  const mandats = useQuery({ queryKey: ["m-mandats"], queryFn: () => base44.request("GET", "/api/mandataire/mandats"),
    refetchInterval: (q) => ((q.state.data?.mandats || []).some((m) => !m.exemple && m.statut && m.statut !== "brouillon") ? 20_000 : false) });
  const dossiers = useQuery({ queryKey: ["m-dossiers"], queryFn: () => base44.request("GET", "/api/mandataire/dossiers"), refetchInterval: 20_000 });
  const marches = useQuery({ queryKey: ["m-marches"], queryFn: () => base44.request("GET", "/api/mandataire/marches") });
  const proprietaires = useQuery({ queryKey: ["m-proprietaires"], queryFn: () => base44.request("GET", "/api/mandataire/proprietaires") });
  const chargement = estimations.isLoading || mandats.isLoading || dossiers.isLoading || marches.isLoading || proprietaires.isLoading;
  const erreur = estimations.isError || mandats.isError || dossiers.isError || marches.isError || proprietaires.isError;
  const biens = useMemo(() => regrouperBiens({
    estimations: estimations.data?.estimations || [], mandats: mandats.data?.mandats || [],
    dossiers: dossiers.data?.dossiers || [], marches: marches.data?.marches || [], proprietaires: proprietaires.data?.proprietaires || [],
  }), [estimations.data, mandats.data, dossiers.data, marches.data, proprietaires.data]);
  // Les fiches des biens à la Visite se chargent d'avance (27 oct. 2026, Jules : « on arrive sans chargement ») : en
  // ouvrant le bien, la fiche est déjà là.
  useEffect(() => {
    for (const b of biens.filter((x) => x.proprietaire && ETAPES_BIEN[x.etape - 1]?.id === "previsite").slice(0, 12)) {
      const id = b.proprietaire.id;
      queryClient.prefetchQuery({ queryKey: ["m-fiche", id], queryFn: () => base44.request("GET", `/api/mandataire/proprietaires/${id}/fiche`), staleTime: 60000 });
    }
  }, [biens, queryClient]);

  const cle = params.get("bien");
  const nouveau = cle === "nouveau";
  // Un propriétaire « à contacter », ouvert depuis le matin, n'est pas encore dans les cartes : son étape Contact seule.
  const bien = nouveau ? null : bienDe(biens, cle) || bienDuProprietaire(proprietaires.data?.proprietaires || [], cle);
  // Les adresses d'avant le 26 oct. 2026 (notifications, liens gardés) : rdv et visite mènent à la Pré-visite,
  // prix_accord à l'Avis de valeur.
  const demandee = { rdv: "previsite", visite: "previsite", prix_accord: "estimation", analyse: "marche" }[params.get("etape")] || params.get("etape");
  // Un bien s'ouvre sur sa vue d'ensemble (3 nov. 2026, Jules) ; une étape demandée dans l'adresse s'ouvre directement.
  const etape = demandee === "ensemble" && bien ? "ensemble" : ETAPES_BIEN.find((e) => e.id === demandee)?.id || (bien ? "ensemble" : "estimation");

  // L'adresse ne porte que le bien et l'étape : les écrans d'étape ne lisent plus rien dans l'adresse.
  const aller = (cleBien, id) => setParams(new URLSearchParams({ bien: cleBien, etape: id }));
  const fermer = () => setParams(new URLSearchParams());
  // Une estimation commencée dans « Nouveau bien » : le bien prend son nom dans l'adresse, une fois la liste à jour.
  const surCree = async (type, id) => {
    await queryClient.refetchQueries({ queryKey: [type === "estimation" ? "m-estimations" : "m-mandats"] });
    if (nouveau) aller(`${type}:${id}`, etape);
  };

  // Le bouton « Scénarios » du bien d'essai est retiré de l'écran (31 oct. 2026, Jules) ; ScenariosEssai.jsx reste.
  if (cle && !nouveau && !bien && chargement) return <Chargement taille="grand" />;
  if (cle && (bien || nouveau)) return <BienOuvert bien={bien} etape={etape} onAller={(id) => aller(bien ? bien.cle : "nouveau", id)} onFermer={fermer} onCree={surCree} types={marches.data?.types_activite || {}} estimations={dossiers.data?.estimations || []} />;
  return <TousLesBiens biens={biens} chargement={chargement} erreur={erreur} onOuvrir={(b) => aller(b.cle, "ensemble")} onNouveau={() => aller("nouveau", "estimation")} onTest={(id) => aller(`proprietaire:${id}`, "previsite")} onImporte={(id) => aller(`proprietaire:${id}`, "ensemble")} />;
}

/** L'arrivée : tous les biens, en cartes, chacun à son statut. « Aujourd'hui » retiré le 24 oct. 2026 (Jules). */
/**
 * « Bien test » (31 oct. 2026, PLAN.md 0.1) : l'équipe seule pose un bien marqué test, à l'étape Pré-visite, sans
 * commerce rattaché (il ne prend rien à un mandataire) et sans rien vers le CRM. Un compte mandataire ne le voit jamais.
 */
function BoutonBienTest({ onCree }) {
  const auth = useAuthPeutEtre();
  const queryClient = useQueryClient();
  const poser = useMutation({
    mutationFn: () => base44.request("POST", "/api/mandataire/proprietaires", { body: { commerce: "Bien test", statut: "rdv_pris", test: true } }),
    onSuccess: async (r) => { await queryClient.refetchQueries({ queryKey: ["m-proprietaires"] }); onCree(r.proprietaire.id); toast.success("Bien test posé"); },
    onError: (e) => toast.error(e?.message || "Bien test impossible"),
  });
  // Jules seul (31 oct. 2026, Jules).
  if (auth?.user?.role !== "admin" || String(auth?.user?.email || "").toLowerCase() !== "jules.b@klocka.immo") return null;
  return (
    <button type="button" onClick={() => poser.mutate()} disabled={poser.isPending} className="inline-flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full border border-trait px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
      <Plus className="h-3.5 w-3.5" /> Bien test
    </button>
  );
}

const PAR_PAGE = 9;

function TousLesBiens({ biens, chargement, erreur, onOuvrir, onNouveau, onTest, onImporte }) {
  const [recherche, setRecherche] = useState("");
  const queryClient = useQueryClient();
  // Importer un bien qu'on a déjà (4 nov. 2026, Jules) : sa fiche naît tout de suite, sa vue d'ensemble s'ouvre, et le
  // chat du milieu la remplit (l'adresse, le type, le récit en vocal, puis les documents). L'import d'un registre de
  // mandats (ImportBiens) reste dans le code.
  const importer = useMutation({
    mutationFn: () => base44.request("POST", "/api/mandataire/biens/importer-un-bien"),
    onSuccess: async (r) => { await queryClient.refetchQueries({ queryKey: ["m-proprietaires"] }); onImporte(r.proprietaire.id); },
    onError: (e) => toast.error(e?.message || "Import impossible"),
  });
  // Supprimer un bien qu'on ne veut plus (4 nov. 2026, Jules) : il quitte la page tout de suite, « Annuler » le remet.
  const relireBiens = () => Promise.all(["m-proprietaires", "m-estimations", "m-mandats", "m-dossiers", "m-marches"].map((k) => queryClient.invalidateQueries({ queryKey: [k] })));
  const supprimer = useMutation({
    mutationFn: ({ ids, annuler = false }) => base44.request("POST", "/api/mandataire/biens/retirer", { body: { ids, annuler } }),
    onSuccess: async (_, { ids, titre, annuler }) => {
      await relireBiens();
      if (!annuler) toast.success(`${titre} supprimé`, { action: { mot: "Annuler", faire: () => supprimer.mutate({ ids, titre, annuler: true }) } });
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });
  // « Estimation envoyée » (26 oct. 2026, Jules ; renommé le 27 avec la restitution) : les avis envoyés sans réponse
  // du propriétaire, ce que l'étape Prix d'accord montrait.
  const [enAttente, setEnAttente] = useState(false);
  const attente = useMemo(() => biens.filter(enAttenteDuProprietaire), [biens]);
  const liste = useMemo(() => {
    const t = recherche.trim().toLowerCase();
    return (enAttente ? attente : biens).filter((b) => !t || `${b.titre} ${b.adresse || ""}`.toLowerCase().includes(t));
  }, [biens, attente, enAttente, recherche]);
  // Neuf biens à la fois (2 nov. 2026, Jules) : trois rangées de trois, puis Précédent / Suivant.
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [recherche, enAttente]);
  const pages = Math.max(1, Math.ceil(liste.length / PAR_PAGE));
  const ici = Math.min(page, pages - 1);
  const vus = liste.slice(ici * PAR_PAGE, (ici + 1) * PAR_PAGE);
  return (
    <div className="mx-auto w-full max-w-[1500px] px-5 py-6 md:px-8 md:py-7">
      <header className="grid items-center gap-4 md:grid-cols-[1fr_auto_1fr] md:gap-6">
        <label className="flex h-11 w-full max-w-[340px] items-center gap-2.5 rounded-full border border-trait px-[18px] text-ardoise max-md:order-2 max-md:max-w-none">
          <Search className="h-4 w-4 flex-none" />
          <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Rechercher un bien…" aria-label="Rechercher un bien"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        </label>
        <h1 className="m-0 text-center text-[30px] font-medium tracking-[-0.01em] text-encre max-md:order-1 max-md:text-left max-md:text-[26px]">Vos biens</h1>
        {/* Sur une ligne (31 oct. 2026, Jules) : « + » (Nouveau bien), Importer, Bien test. */}
        <div className="flex flex-nowrap items-center gap-2.5 max-md:order-3 md:justify-end">
          <button type="button" onClick={onNouveau} aria-label="Nouveau bien" title="Nouveau bien" className="grid h-11 w-11 flex-none place-items-center rounded-full bg-encre text-fond hover:opacity-90">
            <Plus className="h-4 w-4" />
          </button>
          <button type="button" onClick={() => importer.mutate()} disabled={importer.isPending} className="inline-flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-full border border-trait px-5 text-[14px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            {importer.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />} Importer
          </button>
          <BoutonBienTest onCree={onTest} />
        </div>
      </header>


      {(!!attente.length || enAttente) && (
        <div className="mt-5 flex justify-center max-md:justify-start">
          <button type="button" onClick={() => setEnAttente((v) => !v)} aria-pressed={enAttente}
            className={`inline-flex h-9 items-center gap-2 rounded-full border px-4 text-[13.5px] transition-colors ${enAttente ? "border-ambre/60 bg-ambre/10 text-encre" : "border-trait text-craie hover:text-encre"}`}
            style={enAttente ? undefined : { background: "transparent" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-ambre" />Estimation envoyée<span className="tabular-nums text-ardoise">{attente.length}</span>
          </button>
        </div>
      )}
      {/* L'attente seulement quand rien n'est encore là (2 nov. 2026, Jules : « les biens sont déjà en dessous »). */}
      {chargement && !biens.length && <Chargement taille="grand" />}
      {erreur && !chargement && <p className="m-0 mt-8 text-[13.5px] text-alerte">Les biens ne se chargent pas. Rechargez la page.</p>}
      {!chargement && !erreur && !biens.length && <p className="m-0 mt-16 text-center text-[14px] text-brume">Aucun bien encore : un propriétaire contacté en devient un, ou commencez par une estimation avec « Nouveau bien ».</p>}
      {!!biens.length && !liste.length && <p className="m-0 mt-10 text-center text-[13.5px] text-brume">Rien ne correspond.</p>}

      <BandeauExemples liste={biens} />
      {!!liste.length && (
        <div className="mt-[26px] grid grid-cols-1 gap-[18px] md:grid-cols-2 xl:grid-cols-3">
          {vus.map((b) => <CarteBien key={b.cle} b={b} onOuvrir={() => onOuvrir(b)} onSupprimer={() => supprimer.mutate({ ids: b.ids, titre: b.titre })} />)}
        </div>
      )}
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-3 text-[13.5px]" aria-label="Pages des biens">
          <button type="button" onClick={() => setPage(ici - 1)} disabled={ici === 0} className="inline-flex h-9 items-center rounded-full border border-trait px-4 text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Précédent</button>
          <span className="tabular-nums text-ardoise">{ici * PAR_PAGE + 1}-{Math.min((ici + 1) * PAR_PAGE, liste.length)} sur {liste.length}</span>
          <button type="button" onClick={() => setPage(ici + 1)} disabled={ici >= pages - 1} className="inline-flex h-9 items-center rounded-full border border-trait px-4 text-craie hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Suivant</button>
        </nav>
      )}
    </div>
  );
}

/** La carte d'un bien, au dessin de celle d'un dossier : le statut et la date sur la grille de points, le bien, puis ses étapes en segments. */
function CarteBien({ b, onOuvrir, onSupprimer = null }) {
  const e = ETAPES_BIEN[b.etape - 1];
  const nonLus = b.dossier?.transfere ? b.dossier.fil_non_lus || 0 : 0;
  const ecarte = b.dossier?.statut === "no_go" && !b.marche;
  const prix = b.mandat?.prix || b.dossier?.carte?.prix || b.dossier?.prix || null;
  const fourchette = b.estimation?.rapport?.prix_bas ? `${euros(b.estimation.rapport.prix_bas)} – ${euros(b.estimation.rapport.prix_haut)}` : null;
  const lieu = [b.dossier?.carte?.ville, b.dossier?.carte?.surface_m2 ? `${b.dossier.carte.surface_m2} m²` : null, prix ? euros(prix) : fourchette].filter(Boolean).join(" · ") || b.adresse || "Adresse à compléter";
  return (
    <article className="group relative flex cursor-pointer flex-col rounded-[18px] border border-trait bg-rail transition-colors hover:border-bord-doux" onClick={onOuvrir}
      role="button" tabIndex={0} onKeyDown={(ev) => { if (ev.key === "Enter") onOuvrir(); }}>
      <div className="k-grid k-grid-toujours relative h-[112px] flex-none rounded-t-[17px] border-b border-trait">
        <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full border border-trait bg-fond px-2.5 py-[5px] text-[12px] text-craie">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: ecarte ? J["alerte"] : J["menthe"] }} />{b.statut || e.label}
        </span>
        <span className="absolute right-4 top-[18px] inline-flex items-center gap-2 text-[12px] tabular-nums text-brume">
          <PointNouveau n={nonLus} />{b.modifie ? new Date(b.modifie).toLocaleDateString("fr-FR") : ""}
        </span>
        {/* Supprimer : la corbeille au survol, sous la date (toujours visible au téléphone). Les exemples ne se suppriment pas. */}
        {onSupprimer && !b.exemple && (
          <button type="button" onClick={(ev) => { ev.stopPropagation(); onSupprimer(); }} aria-label={`Supprimer ${b.titre}`} title="Supprimer ce bien"
            className="absolute bottom-3 right-3 grid h-8 w-8 place-items-center rounded-full border border-trait bg-fond text-ardoise opacity-0 transition-opacity hover:text-alerte focus:opacity-100 group-hover:opacity-100 max-md:opacity-100">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3.5 px-5 pb-5 pt-[18px]">
        <div className="flex min-w-0 flex-col gap-2">
          <p className="m-0 flex min-w-0 items-center text-[17px] font-medium text-encre" title={b.titre}><span className="truncate">{b.titre}</span><PastilleExemple x={b} /><PastilleTest x={b} /></p>
          <p className="m-0 flex min-w-0 flex-wrap items-center gap-2">
            {/* Murs ou fonds, d'un coup d'œil (3 nov. 2026, Jules). */}
            {b.type && <span className="flex-none rounded-full border border-trait px-2.5 py-[3px] text-[12px] text-craie">{b.type.mot}</span>}
            {b.dossier?.transfere && <span className="flex-none rounded-full border border-menthe/40 px-2.5 py-[3px] text-[12px] text-menthe">Chez {b.dossier.analyste_nom || "Klocka"}</span>}
            <span className="truncate text-[13px] text-ardoise">{lieu}</span>
          </p>
        </div>
        <div className="flex flex-col gap-1.5" aria-label={`Étape ${e.n} sur ${ETAPES_BIEN.length} : ${e.label}`}>
          <div className="flex justify-between text-[12px] text-ardoise"><span>Étapes</span><span className="tabular-nums">{e.n} / {ETAPES_BIEN.length}</span></div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${ETAPES_BIEN.length}, minmax(0, 1fr))` }}>
            {ETAPES_BIEN.map((x) => <span key={x.id} className={`h-1 rounded-full ${b.faites.has(x.id) ? "bg-menthe" : x.n === e.n ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />)}
          </div>
        </div>
      </div>
    </article>
  );
}

/** Un écran assez large pour le chat et le document côte à côte, comme les pages Estimation et Mandat. */
function useEcranLarge() {
  const requete = "(min-width: 1024px)";
  const [large, setLarge] = useState(() => typeof window !== "undefined" && window.matchMedia(requete).matches);
  useEffect(() => {
    const m = window.matchMedia(requete);
    const changer = () => setLarge(m.matches);
    m.addEventListener("change", changer);
    return () => m.removeEventListener("change", changer);
  }, []);
  return large;
}

/**
 * Le titre d'un bien ouvert, un seul (25 oct. 2026, Jules) : « Tous les biens › le nom du bien › l'étape », en fil
 * d'Ariane ; au téléphone il remplace la frise.
 */
// Au téléphone (27 oct. 2026, Jules) : la flèche et le nom de l'étape ; les étapes sont dans le menu de droite.
// Le libellé de la flèche de retour : « Vue d'ensemble » dans une étape, « Mes biens » ailleurs.
const RetourBien = React.createContext("Mes biens");
const libelleEtape = (etape) => (etape === "ensemble" ? "Vue d'ensemble" : ETAPES_BIEN.find((e) => e.id === etape)?.label);
function EnTeteBien({ bien, etape, onFermer, className = "" }) {
  const retour = useContext(RetourBien);
  return (
    <nav aria-label="Fil d'Ariane" className={`flex min-h-[56px] min-w-0 items-center gap-1.5 text-[13.5px] max-md:relative max-md:min-h-[48px] ${className}`}>
      <button type="button" onClick={onFermer} aria-label={retour} className="flex flex-none items-center gap-1.5 text-ardoise transition-colors hover:text-encre max-md:-ml-2 max-md:h-10 max-md:w-10 max-md:justify-center" style={{ background: "transparent" }}>
        <ArrowLeft className="h-3.5 w-3.5 max-md:h-5 max-md:w-5" /><span className="max-md:hidden">{retour}</span>
      </button>
      {/* Au téléphone, l'étape sur la ligne de la flèche, centrée (27 oct. 2026, Jules). */}
      <span className="pointer-events-none absolute inset-x-12 truncate text-center text-[17px] text-encre md:hidden">{libelleEtape(etape)}</span>
      <ChevronRight className="h-3.5 w-3.5 flex-none text-brume max-md:hidden" />
      <span className="min-w-0 truncate text-craie max-md:hidden">{bien ? bien.titre : "Nouveau bien"}</span>
      <ChevronRight className="h-3.5 w-3.5 flex-none text-brume max-md:hidden" />
      <span className="flex-none text-encre max-md:hidden">{libelleEtape(etape)}</span>
    </nav>
  );
}

/**
 * Un bien ouvert : l'écran de son étape, et ses six étapes à droite (au téléphone, la frise en haut).
 * Estimation et Mandat, sur grand écran, prennent l'écran comme un dossier de l'équipe en mode IA : le chat à
 * gauche (le retour à tous les biens en tête), le document à droite.
 */
function BienOuvert({ bien, etape, onAller, onFermer, onCree, types, estimations }) {
  const queryClient = useQueryClient();
  const valider = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/mandataire/proprietaires/${bien.proprietaire.id}/etape`, { body: { etape: id } }),
    onSuccess: () => ["m-proprietaires", "m-fiche"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })),
    onError: (e) => toast.error(e?.message || "Étape non enregistrée"),
  });
  const large = useEcranLarge();
  // Le bien ouvert rejoint les accès rapides sous « Biens » dans le menu.
  useEffect(() => { if (bien?.cle) retenirBien(bien.cle, bien.titre); }, [bien?.cle, bien?.titre]);
  // Le prix d'accord confirmé au chat, le bien passe au Mandat (27 oct. 2026, Jules).
  const pid = bien?.proprietaire?.id || null;
  useEffect(() => {
    const aller = (e) => { if (pid && e.detail?.proprietaire_id === pid && e.detail.etape) onAller(e.detail.etape); };
    window.addEventListener("klocka:aller-etape", aller);
    return () => window.removeEventListener("klocka:aller-etape", aller);
  }, [pid, onAller]);
  const faites = bien?.faites || new Set();
  const items = ETAPES_BIEN.map((e) => ({ cle: e.id, titre: e.label, n: e.n, faite: faites.has(e.id) }));
  // Les étapes à chat portent le titre du bien dans leur colonne : Pré-visite, Avis de valeur, Mandat (26 oct. 2026).
  // La Pré-visite (26 oct. 2026, refaite) : sur ordinateur, la préparation au centre, la page défile, ni écran scindé ni
  // frise en haut ; au téléphone, la mise en page d'avant (le chat), seul le contenu de la préparation change.
  // Le dossier de vente, piloté par Haka (27 oct. 2026, Jules) : chat à gauche. Il est l'étape Data room depuis le
  // 2 nov. 2026 (Jules, après avis produit : la Commercialisation portait deux métiers).
  const dossierVente = etape === "dataroom" && !!bien?.dossier?.id;
  // En vente, la Commercialisation garde Haka à gauche, le teaser à droite (28 oct. 2026, Jules).
  const enVente = etape === "marche" && !!bien?.marche;
  // Mis en vente depuis la Data room (l'assistant le propose), le bien passe à la Commercialisation, comme le mandat
  // signé passe à la Data room.
  const marcheId = bien?.marche?.id || null;
  const marcheAvant = useRef(marcheId);
  useEffect(() => {
    if (marcheId && !marcheAvant.current && etape === "dataroom") onAller("marche");
    marcheAvant.current = marcheId;
  }, [marcheId, etape, onAller]);
  // Un fil par bien (1er nov. 2026, Jules) : la Pré-visite aussi, sur ordinateur, a le chat à gauche et la préparation à droite.
  // La vue d'ensemble, sans chat (3 nov. 2026, Jules : « ne mets pas le chat à gauche ») : le tableau de bord du bien seul.
  const ensemble = etape === "ensemble";
  // Un bien qu'on importe, sur ordinateur (4 nov. 2026, Jules) : le chat d'abord, puis le bien à droite comme une page éditeur.
  const enImport = ensemble && large && !!bien?.proprietaire?.biens?.import && !bien.proprietaire.biens.import.fini;
  const chat = ["previsite", "estimation", "mandat"].includes(etape) || dossierVente || enVente || enImport;
  const plein = chat && large;
  useEffect(() => {
    if (!plein) return undefined;
    document.documentElement.classList.add("k-sans-defilement", "k-sans-ak");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-defilement", "k-sans-ak");
  }, [plein]);
  // Dans une étape, la flèche ramène à la vue d'ensemble du bien ; de la vue d'ensemble, à tous les biens (4 nov. 2026, Jules).
  const retourEtape = useMemo(() => (ensemble || !bien ? onFermer : () => onAller("ensemble")), [ensemble, bien, onFermer, onAller]);
  const libelleRetour = ensemble || !bien ? "Mes biens" : "Vue d'ensemble";
  const entete = <EnTeteBien bien={bien} etape={etape} onFermer={retourEtape} />;
  return (
    <RetourBien.Provider value={libelleRetour}>
    <div className="relative w-full">
      {/* Un seul titre et plus de frise (25 oct. 2026, Jules) : l'Estimation et le Mandat portent le titre dans leur colonne de chat. */}
      {!chat && etape !== "previsite" && <EnTeteBien bien={bien} etape={etape} onFermer={retourEtape} className="px-5 pt-3 md:px-10 md:pr-20" />}
      <div key={etape} className="animate-in fade-in duration-500 ease-out">
        {enImport && <EtapeImport bien={bien} onAller={onAller} onFermer={retourEtape} entete={entete} />}
        {ensemble && !enImport && <div className="mx-auto max-w-[1180px] px-5 pb-16 pt-6 md:px-10 md:pr-20"><VueEnsembleBien bien={bien} onAller={onAller} /></div>}
        {etape === "previsite" && <EtapeRaconte bien={bien} etape={etape} large={large} onFermer={retourEtape} entete={entete} onAvis={() => onAller("estimation")} />}
        {etape === "estimation" && <EtapeChat espace="estimation" bien={bien} objet={bien?.estimation} large={large} entete={entete} onFermer={retourEtape} onCree={(id) => onCree("estimation", id)} />}
        {etape === "mandat" && <EtapeChat espace="mandat" bien={bien} objet={bien?.mandat} large={large} entete={entete} onFermer={retourEtape} onCree={(id) => onCree("mandat", id)} onSuivante={() => onAller("dataroom")} />}
        {dossierVente && <EtapeDossierVente bien={bien} large={large} entete={entete} onFermer={retourEtape} />}
        {enVente && <EtapeVente bien={bien} large={large} entete={entete} onFermer={retourEtape} onSuivante={() => onAller("offre")} />}
        {["dataroom", "marche", "offre", "vente"].includes(etape) && !dossierVente && !enVente && <EtapeMarche bien={bien} types={types} etape={etape} />}
      </div>
      {/* Le check à droite d'une étape la valide, avec celles d'avant, comme dans les dossiers de l'équipe : seulement pour
          un bien né d'une fiche de la Prospection (24 oct. 2026). */}
      {/* La vue d'ensemble porte déjà les étapes, à gauche : pas de menu à droite (maquette de Jules, 3 nov. 2026). */}
      {!ensemble && <MenuEtapesDroite items={items} valeur={etape} onChange={onAller} tete={{ cle: "ensemble", titre: "Vue d'ensemble" }} enCours={ETAPES_BIEN[(bien?.etape || 1) - 1].id} onValider={bien?.proprietaire ? (n) => valider.mutate(ETAPES_BIEN[n - 1].id) : null} occupe={valider.isPending} telephone />}
    </div>
    </RetourBien.Provider>
  );
}

// Les quatre temps d'un mandat envoyé (2 nov. 2026, Jules) : qui agit à chacun, coché au fil de l'eau.
const tempsDuMandat = (m) => (!m?.statut || m.statut === "brouillon" ? null
  : m.statut === "signe" || m.statut === "enregistre" ? 4 : m.statut === "pret" ? 3 : m.valide_le ? 2 : m.a_relire ? 1 : 0);
// Depuis le 2 nov. 2026 (Jules), l'équipe coche elle-même les étapes : le mandataire relit le mandat rempli dans la
// conversation et dit si c'est bon ; l'équipe le valide et l'envoie en signature.
const TEMPS_MANDAT = [["Envoyé", "l'équipe le remplit au plus vite"], ["Mandat à relire", "vous, dans la conversation"], ["En signature", "le vendeur"], ["Mandat signé reçu", "vous"]];

/** À gauche, une fois le mandat envoyé : ce qu'il se passe, et où (la conversation à droite). */
function TempsMandat({ mandat, large, compact = false, geste = null }) {
  const n = tempsDuMandat(mandat);
  if (n == null || mandat.exemple) return null;
  const phrase = n >= 4 ? "Mandat signé reçu : le bien passe à la Data room."
    : n === 3 ? "Le mandat signé est arrivé dans la conversation. Vérifiez-le, puis « Mandat signé reçu »."
    : n === 2 ? "Mandat validé : il part en signature. La version finale signée arrivera dans la conversation."
    : n === 1 ? "Le mandat rempli est dans la conversation. Relisez-le et dites à l'équipe si c'est bon : elle l'envoie en signature."
    // Les mots de Jules (3 nov. 2026) : plus de « le mandat à droite », ni de suite détaillée.
    : "Le mandat est bien envoyé. L'équipe le remplit au plus vite et vous le renverra dans cette conversation. Relisez-le et dites-lui si c'est bon.";
  // Pendant l'échange, sous la barre du chat : la phrase et les temps sur une ligne, pour laisser la place au fil.
  return (
    <div className={`flex-none rounded-[12px] border border-bord-doux bg-surface/40 text-left ${compact ? "mt-2 px-3.5 py-2.5" : "mt-3 px-4 py-3.5"}`}>
      <p className={`m-0 leading-[1.5] text-encre ${compact ? "text-[13px]" : "text-[14px]"}`}>{phrase}</p>
      <ol className={`m-0 flex list-none p-0 ${compact ? "mt-2 flex-wrap gap-x-4 gap-y-1" : "mt-3 flex-col gap-1.5"}`}>
        {TEMPS_MANDAT.map(([mot, qui], i) => {
          const fait = i < n || (i === 0 && n >= 0) || n >= 4;
          const ici = i === n && n < 4;
          return (
            <li key={mot} className={`flex items-center ${compact ? "gap-1.5 text-[12.5px]" : "gap-2.5 text-[13.5px]"}`}>
              <span className={`grid h-4 w-4 flex-none place-items-center rounded-full ${fait ? "bg-menthe text-sur-menthe" : ici ? "border border-pervenche" : "border border-bord-vif"}`}>
                {fait && <Check className="h-2.5 w-2.5" />}
              </span>
              <span className={fait ? "text-ardoise" : ici ? "text-encre" : "text-brume"}>{mot}</span>
              {!compact && <span className="text-[12.5px] text-brume">{qui}</span>}
              {/* Le geste du moment, sur la ligne de son étape (2 nov. 2026, Jules) : plus de barre en haut. */}
              {ici && geste && <span className="ml-auto pl-2">{geste}</span>}
            </li>
          );
        })}
      </ol>
      {n >= 4 && geste && <div className="mt-3 flex justify-end">{geste}</div>}
    </div>
  );
}

/** La droite de l'Estimation tant que l'avis n'est pas rédigé : une phrase, sans flèche (3 nov. 2026, Jules). */
function GuideAssistant() {
  return (
    <div className="grid h-[100dvh] place-items-center border-l border-trait px-10">
      <div className="max-w-[34ch]">
        <p className="m-0 text-[24px] leading-[1.25] tracking-[-0.01em] text-encre">Laissez-vous guider par votre assistant</p>
        <p className="m-0 mt-2 text-[14px] leading-[1.55] text-ardoise">Répondez-lui dans le chat : l'avis de valeur s'affichera ici, une fois rédigé.</p>
      </div>
    </div>
  );
}

const TEXTES = {
  estimation: { api: "/api/mandataire/estimations", cle: "estimation_id", titre: "Commencez l'estimation de ce bien", sous: "Joignez le bail avec « + » : il est lu, seul ce qui manque est demandé.", document: "Voir l'avis de valeur" },
  mandat: { api: "/api/mandataire/mandats", cle: "mandat_id", titre: "Préparez le mandat de ce bien", sous: "Dites le vendeur, le prix et les honoraires : seul ce qui manque est demandé, puis le mandat part dans MyNotary.", document: "Voir le mandat" },
};

/**
 * Estimation ou Mandat d'un bien : sa conversation rouverte d'elle-même et son document à côté ;
 * sans objet encore, le chat qui le commence. Aucune liste : seulement ce bien.
 */
function EtapeChat({ espace, bien, objet, large, entete, onFermer, onCree, onSuivante = null }) {
  const libelleRetour = useContext(RetourBien);
  const t = TEXTES[espace];
  // Les sources, choisies par « Sources » dans la barre (26 oct. 2026, Jules ; sans la ligne de compétences sous la saisie).
  const outilsChat = useReglagesChatMandataire(espace === "estimation" ? ["estimation"] : ["mandat", "dossier"]);
  const largeurChat = useLargeurChat({ moitie: espace === "estimation" });
  // Un bien né d'une fiche, sans avis encore : l'Avis de valeur commence par le récit de la visite (26 oct. 2026, Jules :
  // la Pré-visite ne parle que d'avant la visite).
  const recit = espace === "estimation" && !!bien?.proprietaire && !objet;
  // L'avis envoyé, on reste ici : le chat suit la relation avec le propriétaire (27 oct. 2026, Jules).
  const relation = espace === "estimation" && objet?.statut === "envoye";
  // Venu d'un bien (29 oct. 2026, Jules) : l'estimation naît avec l'adresse de la fiche du bien et ce que la visite dit ;
  // Haka le fait confirmer à gauche (ou demande l'adresse si la fiche n'en a pas), l'avis à droite ne se remplit qu'au oui.
  const depuisLeBien = espace === "estimation" && !objet && !!bien && !bien.exemple;
  const avisLance = useRef(null);
  useEffect(() => {
    if (!depuisLeBien || avisLance.current === bien?.cle) return undefined;
    avisLance.current = bien?.cle;
    let fini = false;
    // L'assistant relit tout le fil du bien avant de dire ce qu'il sait (1er nov. 2026) : quelques secondes, annoncées.
    const attente = bien.proprietaire?.id ? toast.loading("Je relis tout le fil du bien…") : null;
    base44.request("POST", "/api/mandataire/avis-bien", { body: { proprietaire_id: bien.proprietaire?.id || null, adresse: bien.adresse || null, titre: bien.titre || null } })
      .then((r) => { if (r?.estimation_id) nouvelObjet(r.estimation_id); })
      .catch((e) => { avisLance.current = null; toast.error(e?.message || "L'avis n'a pas pu commencer"); })
      .finally(() => { if (attente != null) toast.dismiss(attente); });
    return () => { fini = true; };
  }, [depuisLeBien, bien?.cle]);
  const qs = `?espace=${espace}`;
  const queryClient = useQueryClient();
  const [courant, setCourant] = useState(objet?.id || null);
  const [conversation, setConversation] = useState(false);
  const [fenetre, setFenetre] = useState(null);
  // Le chat n'écoute « ouvrir une conversation » que si la page tient un historique : on le lui dit, sans en montrer.
  const sansHistorique = useCallback(() => {}, []);
  // L'objet du bien : sa conversation se rouvre (recréée au besoin par le serveur avec ce qu'on sait déjà).
  useEffect(() => {
    if (!objet?.id) return undefined;
    setCourant(objet.id);
    let fini = false;
    base44.request("POST", `${t.api}/${objet.id}/conversation`)
      // Un objet né d'un bien s'écrit dans le fil du bien (`fil` : l'id de sa fiche) : on l'ouvre là.
      .then((r) => { if (!fini) window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: r.conversation_id, api: CHAT, qs: r.fil ? `?espace=fiche&fiche=${encodeURIComponent(r.fil)}` : qs } })); })
      .catch((e) => toast.error(e?.message || "Impossible d'ouvrir la conversation"));
    return () => { fini = true; };
  }, [objet?.id, t.api, qs]);
  // Un bien estimé qui arrive au Mandat : le mandat se prépare d'office avec l'avis et la fiche, puis le chat ne
  // demande que ce qui manque (27 oct. 2026, Jules).
  const [prepare, setPrepare] = useState(false);
  const aPreparer = espace === "mandat" && !objet && !!bien?.estimation?.id;
  useEffect(() => {
    if (!aPreparer) return undefined;
    let fini = false;
    setPrepare(true);
    base44.request("POST", "/api/mandataire/mandats/preparer", { body: { estimation_id: bien.estimation.id } })
      .then((r) => { if (!fini && r?.mandat_id) onCree(r.mandat_id); })
      .catch((e) => { if (!fini) { setPrepare(false); toast.error(e?.message || "Le mandat n'a pas pu être préparé"); } });
    return () => { fini = true; };
  }, [aPreparer, bien?.estimation?.id]);
  const rafraichir = () => {
    queryClient.invalidateQueries({ queryKey: [espace === "estimation" ? "m-estimations" : "m-mandats"] });
    queryClient.invalidateQueries({ queryKey: [espace === "estimation" ? "m-apercu" : "m-apercu-mandat"] });
    // Le Suivi (sous « m-fiche ») montre aussitôt ce que Haka vient de noter.
    queryClient.invalidateQueries({ queryKey: ["m-fiche"] });
  };
  const nouvelObjet = async (id) => {
    if (!id || id === objet?.id) return;
    setCourant(id);
    // Ce qui naît dans un bien y reste : le mandat garde l'estimation du bien ; une estimation faite après coup
    // se rattache au mandat et au dossier du bien.
    const lier = (url, estimationId) => base44.request("PATCH", url, { body: { estimation_id: estimationId } }).catch(() => {});
    if (espace === "mandat" && bien?.estimation && !objet) await lier(`${t.api}/${id}/estimation`, bien.estimation.id);
    if (espace === "estimation" && !objet) {
      if (bien?.proprietaire) await base44.request("PATCH", `${t.api}/${id}`, { body: { proprietaire_id: bien.proprietaire.id } }).catch(() => {});
      if (bien?.mandat && !bien.mandat.estimation_id) await lier(`/api/mandataire/mandats/${bien.mandat.id}/estimation`, id);
      if (bien?.dossier && !bien.dossier.estimation) await lier(`/api/mandataire/dossiers/${bien.dossier.id}/estimation`, id);
    }
    onCree(id);
  };
  const surReponse = (r) => { rafraichir(); nouvelObjet(r?.[t.cle]); };
  const surRecherche = (r) => { const id = espace === "estimation" ? r?.avis_id : r?.mandat_id; if (id) { rafraichir(); nouvelObjet(id); } };

  // Le mandat rempli relu : le mandataire le valide, il part en signature (2 nov. 2026, Jules).
  const valider = useMutation({
    mutationFn: () => base44.request("POST", `${t.api}/${objet.id}/valider`),
    onSuccess: () => { rafraichir(); toast.success("Mandat validé : il part en signature"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  // Le mandat signé reçu dans la conversation : le mandataire le dit, et passe à la Commercialisation (27 oct. 2026 ;
  // « Mandat signé reçu » remplace « Passer à l'étape suivante » le 2 nov.).
  const suite = useMutation({
    mutationFn: () => base44.request("POST", `${t.api}/${objet.id}/suite`),
    onSuccess: () => { rafraichir(); queryClient.invalidateQueries({ queryKey: ["m-dossiers"] }); onSuivante?.(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const mandat = espace === "mandat" ? objet : null;
  // Un seul geste à la fois, à la place de l'ancien « Passer à l'étape suivante ».
  const temps = tempsDuMandat(mandat);
  // Le mandat signé (par le mandataire ou coché par l'équipe, 2 nov. 2026) : rien à valider, on passe à la
  // Commercialisation (Jules : « je ne peux pas passer à l'étape suivante »).
  const allerSuite = { mutate: () => onSuivante?.(), isPending: false };
  const geste = temps === 1 ? [valider, "Je valide le mandat"] : temps === 3 ? [suite, "Mandat signé reçu"]
    : temps === 4 && onSuivante ? [allerSuite, "Passer à la Data room"] : null;
  const boutonSuite = geste ? (
    <button type="button" onClick={() => geste[0].mutate()} disabled={geste[0].isPending}
      className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] font-medium text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
      {geste[0].isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {geste[1]}
    </button>
  ) : null;
  const document = espace === "estimation"
    // Dans un bien, la barre ne dit pas « n informations encore attendues · vos retouches sont gardées » (24 oct. 2026, Jules).
    ? <ApercuAvis id={courant} sansStatut onEnvoyer={ouvrirEnvoi} />
    : <ApercuMandat id={courant} onOuvrirPret={setFenetre} />;
  const mandatFenetre = fenetre && mandat?.id === fenetre ? mandat : null;
  // La conversation du mandat, une fois envoyé (27 oct. 2026, Jules : « je veux pouvoir communiquer avec le mandataire
  // et le mandataire communiquer depuis la plateforme avec l'admin »). Le mandat rédigé sur MyNotary y arrive. Le mot
  // « Klocka » ne s'affiche pas chez le mandataire : l'onglet s'appelle Conversation.
  // L'étape Mandat, une seule disposition (2 nov. 2026, Jules : « on voit toujours le mandat à droite, et à gauche soit
  // la conversation avec l'équipe Klocka, soit l'assistant »). L'équipe : la conversation du bien (née dès l'avis de
  // valeur), reprise par le mandat une fois parti, les quatre temps en tête avec le geste du moment. L'assistant : le
  // chat qui remplit le mandat. Avant l'envoi on arrive sur l'assistant, après sur l'équipe.
  const [paramsMandat] = useSearchParams();
  const envoye = espace === "mandat" && !!mandat && mandat.statut !== "brouillon" && !mandat.exemple;
  const pidMandat = espace === "mandat" && !bien?.exemple ? bien?.proprietaire?.id || mandat?.proprietaire_id || null : null;
  const apiEquipe = envoye ? `/api/mandataire/mandats/${mandat.id}` : pidMandat ? `/api/mandataire/mandats/bien-${pidMandat}` : null;
  const [gauche, setGauche] = useState(() => (paramsMandat.get("vue") === "conversation" || envoye ? "equipe" : "assistant"));
  const envoyeId = envoye ? mandat.id : null;
  useEffect(() => { if (envoyeId) setGauche("equipe"); }, [envoyeId]);
  const surEquipe = espace === "mandat" && !!apiEquipe && gauche === "equipe";
  const filMandat = apiEquipe ? (
    <FilDossier api={apiEquipe} titre="Conversation" plein={large} sansCadre
      enTete={envoye ? <TempsMandat mandat={mandat} large={large} geste={boutonSuite} /> : null}
      vide={envoye ? "Le mandat rempli arrivera ici pour relecture, puis la version signée. Une question, une correction : écrivez ici."
        : "Une question à l'équipe sur ce mandat : écrivez ici. Une fois le mandat envoyé, la conversation continue."} />
  ) : null;
  // La conversation se charge avec l'étape, pas au clic : elle est là tout de suite.
  useEffect(() => {
    if (apiEquipe) queryClient.prefetchQuery({ queryKey: ["fil-dossier", apiEquipe, "mandataire"], queryFn: () => base44.request("GET", `${apiEquipe}/fil?lire=0`), staleTime: 10_000 });
  }, [apiEquipe]);
  const choixGauche = espace === "mandat" && apiEquipe ? (
    <div className="flex flex-none justify-center py-2.5">
      <div className="flex gap-0.5 rounded-full border border-bord-doux bg-rail p-0.5" role="tablist" aria-label="L'équipe Klocka ou l'assistant">
        {[["equipe", "Équipe Klocka"], ["assistant", "Assistant"]].map(([k, mot]) => (
          <button key={k} type="button" role="tab" aria-selected={gauche === k} onClick={() => setGauche(k)}
            className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3.5 text-[13px] ${gauche === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
            style={gauche === k ? undefined : { background: "transparent" }}>{mot}{k === "equipe" && envoye && <PointNouveau n={mandat.fil_non_lus || 0} />}</button>
        ))}
      </div>
    </div>
  ) : null;
  // La présentation de l'avis (26 oct. 2026, Jules) : le deck que le mandataire montre au vendeur, construit sur l'avis.
  // L'avis envoyé, le Suivi s'ouvre en premier, à gauche de l'Avis (27 oct. 2026, Jules).
  const [paramsAvis] = useSearchParams();
  const [vueAvis, setVueAvis] = useState(() => (paramsAvis.get("vue") === "conversation" ? "conversation" : relation ? "suivi" : "avis"));
  // La conversation avec l'équipe, dès l'avis de valeur (2 nov. 2026, Jules) : la même que celle du mandat, qui la
  // reprendra à la suite. Une par bien (sa fiche).
  const pidEquipe = espace === "estimation" && bien?.proprietaire?.id && !bien?.exemple ? bien.proprietaire.id : null;
  const filEquipe = pidEquipe ? (
    <FilDossier api={`/api/mandataire/mandats/bien-${pidEquipe}`} titre="Conversation" plein={large}
      vide="Une question à l'équipe sur ce bien (le taux, le prix, le propriétaire) : écrivez ici. La conversation suit le bien jusqu'au mandat." />
  ) : null;
  const suivi = relation && !!bien?.proprietaire;
  useEffect(() => { if (!suivi && vueAvis === "suivi") setVueAvis("avis"); }, [suivi, vueAvis]);
  // L'avis vient de partir : le Suivi prend la place de l'Avis.
  useEffect(() => { if (suivi && paramsAvis.get("vue") !== "conversation") setVueAvis("suivi"); }, [suivi]);
  const [presenter, setPresenter] = useState(false);
  // Édition, Lecture, Sources (26 oct. 2026, Jules : « comme dans les autres pages »), pour l'avis comme pour le deck.
  const [modeDoc, setModeDoc] = useState("edition");
  const apercuAvis = useQuery({ queryKey: ["m-apercu", courant], queryFn: () => base44.request("GET", `/api/mandataire/estimations/${courant}/apercu`), enabled: espace === "estimation" && !!courant });
  // Ce que le mandataire regarde à droite, envoyé avec chaque message (26 oct. 2026) : « la page 05 » est celle du deck
  // quand la Présentation est ouverte, celle de l'avis sinon.
  const [pageDeck, setPageDeck] = useState(null);
  const reglagesChat = useMemo(() => ({ ...outilsChat.reglages, vue: espace !== "estimation" ? null : vueAvis === "presentation" ? { document: "presentation", page: pageDeck } : { document: vueAvis } }),
    [outilsChat.reglages, espace, vueAvis, pageDeck]);
  // À l'Estimation, l'assistant d'abord (2 nov. 2026, Jules : « il a regardé l'estimation directe, donc pas l'IA ») :
  // tant que l'avis n'est pas rédigé, la droite ne montre pas l'avis en construction mais renvoie au chat, et la barre
  // de navigation s'efface pour laisser toute la place au chat et à l'avis.
  const guide = espace === "estimation" && !relation && (!courant || !!apercuAvis.data?.provisoire);
  useEffect(() => {
    if (espace !== "estimation" || !large) return undefined;
    // window.document : `document` est ici le document de l'aperçu (plus haut), pas la page.
    window.document.documentElement.classList.add("k-sans-barre");
    return () => window.document.documentElement.classList.remove("k-sans-barre");
  }, [espace, large]);
  const droite = guide ? <GuideAssistant /> : espace === "estimation" ? (
    <div className="flex h-[100dvh] min-h-0 flex-col">
      <div className="flex h-12 flex-none items-center gap-3 border-b border-l border-trait px-4 md:pr-[72px] k-barre-apercu">
        <div className="flex gap-0.5 rounded-full border border-bord-doux bg-rail p-0.5" role="tablist" aria-label="Suivi, avis, présentation ou sources">
          {/* Sources remplace Rapport (27 oct. 2026, Jules) : le rapport Equimmox et toutes les autres données de l'avis. */}
          {[...(suivi ? [["suivi", "Suivi"]] : []), ["avis", "Avis"], ["presentation", "Présentation"], ["sources", "Sources"], ...(filEquipe ? [["conversation", "Conversation"]] : [])].map(([k, mot]) => (
            <button key={k} type="button" role="tab" aria-selected={vueAvis === k} onClick={() => setVueAvis(k)}
              className={`h-7 rounded-full px-3.5 text-[13px] ${vueAvis === k ? "bg-relief text-encre" : "text-ardoise hover:text-craie"}`}
              style={vueAvis === k ? undefined : { background: "transparent" }}>{mot}</button>
          ))}
        </div>
        <span className="flex-1" />
        {vueAvis !== "sources" && vueAvis !== "suivi" && vueAvis !== "conversation" && courant && (
          <ModesEditeur mode={modeDoc} onMode={setModeDoc} />
        )}
      </div>
      {/* L'état de l'avis avec le propriétaire, au-dessus de l'avis (et plus au-dessus du chat, où il le poussait hors de l'écran). */}
      {bien?.proprietaire && vueAvis !== "suivi" && vueAvis !== "conversation" && <EtatAvis bien={bien} className="mx-4 mt-3 flex-none" />}
      {/* La ligne verticale entre le chat et le document : l'avis porte la sienne, la présentation et les sources la reçoivent ici. */}
      <div className={`min-h-0 flex-1 [&>div]:h-full ${vueAvis !== "avis" ? "border-l border-trait" : ""}`}>
        {vueAvis === "conversation" && filEquipe ? filEquipe : vueAvis === "suivi" ? <SuiviBien proprietaireId={bien.proprietaire.id} /> : vueAvis === "sources" ? <SourcesAvis id={courant} /> : (
          <SurvolSources actif={modeDoc === "sources"} avis={apercuAvis.data?.avis} estimation={apercuAvis.data?.estimation} className={`h-full ${modeDoc !== "edition" ? "k-avis-lecture" : ""}`}>
            {vueAvis === "avis"
              ? <ModeAvis.Provider value={modeDoc}>{document}</ModeAvis.Provider>
              : <PresentationAvis id={courant} mode={modeDoc} onPleinEcran={() => setPresenter(true)} onPage={setPageDeck} />}
          </SurvolSources>
        )}
      </div>
    </div>
  ) : document;

  const colonne = surEquipe ? (
    <div className={large ? "k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5" : "flex flex-col px-5 pb-6"}>
      {entete}
      {choixGauche}
      {/* Au téléphone, le mandat s'ouvre par-dessus. */}
      {!large && courant && <div className="flex flex-none justify-center pb-2"><DocumentTelephone enLigne serre libelle="Voir le mandat">{document}</DocumentTelephone></div>}
      <div className={large ? "min-h-0 flex-1 [&>div]:h-full" : ""}>{filMandat}</div>
    </div>
  ) : (
    // Au téléphone (26 oct. 2026, Jules : « ne va pas du tout ») : un seul en-tête, le fil d'Ariane ; dessous, une ligne avec
    // l'état de l'avis et « Voir l'avis de valeur » ; puis le chat sans sa barre du haut, sur la hauteur qui reste.
    <div className={large ? "k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5" : `flex flex-col px-5 ${conversation ? "k-chat-hauteur" : ""}`}>
      {(!conversation || !large || choixGauche) && entete}
      {choixGauche}
      {!conversation && (
        <div className={large ? "flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto py-6 text-center" : "pb-6 pt-4 text-center"}>
          <h1 className="k-balayage m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>{objet ? bien?.titre : recit ? "Racontez la visite" : t.titre}</h1>
          <p className="m-0 text-[14px] text-ardoise">{relation ? "Racontez la suite avec le propriétaire : Assistant KPartners note, pose les relances et passe au mandat quand le prix est d'accord." : objet ? "" : prepare ? "L'Assistant KPartners prépare le mandat avec l'avis de valeur et la fiche…" : recit ? "La surface, le loyer, le bail, l'état, ce que veut le propriétaire : Assistant KPartners rédige l'avis de valeur. Le bail se joint avec « + »." : t.sous}</p>
        </div>
      )}
      {large ? null : (
        (courant || (espace === "estimation" && bien?.proprietaire)) && (
          // Au téléphone (27 oct. 2026, Jules : « problème de layout ») : le bandeau de l'avis sur toute la largeur, les
          // documents sur la ligne dessous ; côte à côte, le bandeau s'écrasait sous les trois boutons.
          <div className="flex flex-none flex-col gap-2 pb-3">
            {espace === "estimation" && bien?.proprietaire && <EtatAvis bien={bien} className="mb-0 w-full" />}
            {courant && (
              <div className="flex flex-wrap items-center gap-1.5">
                {/* Les trois documents de l'avis (27 oct. 2026, Jules) : Présenter, l'Avis de valeur, ses Sources. */}
                {espace === "estimation" && (
                  <button type="button" onClick={() => setPresenter(true)}
                    className="inline-flex h-9 flex-none items-center gap-1.5 rounded-full bg-pervenche px-3.5 text-[13px] text-sur-pervenche">Présenter</button>
                )}
                {suivi && <DocumentTelephone enLigne serre libelle="Suivi"><SuiviBien proprietaireId={bien.proprietaire.id} /></DocumentTelephone>}
                <DocumentTelephone enLigne serre libelle={espace === "estimation" ? "Avis de valeur" : "Voir le mandat"}>{document}</DocumentTelephone>
                {espace === "estimation" && <DocumentTelephone enLigne serre libelle="Sources"><SourcesAvis id={courant} /></DocumentTelephone>}
                {filEquipe && <DocumentTelephone enLigne serre libelle="Conversation"><div className="p-3">{filEquipe}</div></DocumentTelephone>}
              </div>
            )}
          </div>
        )
      )}
      <div className={conversation ? "min-h-0 w-full flex-1" : "w-full flex-none pb-5"}>
        {/* Dans un bien, l'estimation n'a plus le choix « Avec le bail / Sans document » (25 oct. 2026, Jules) : `epure`. */}
        <ChatDashboard lueur epure={espace === "estimation"} espace={espace} reglages={reglagesChat} onConversation={setConversation}
          proprietaireId={bien?.proprietaire?.id || null} reprendre={!!bien?.proprietaire?.id}
          enTeteFil={null}
          placeholderFil={relation ? "Racontez la suite : l'appel, le rendez-vous, sa réponse…" : null} onHistorique={sansHistorique} onReponse={surReponse} onRecherche={surRecherche}
          menusVersLeHaut avisACote={espace === "estimation" && large} barreApercu={large && conversation && !choixGauche} sansBarreHaut={(!large || !!choixGauche) && conversation} retour={{ libelle: libelleRetour, onClick: onFermer }} />
      </div>
    </div>
  );
  return (
    <>
      {large ? (
        // Les classes de l'Analyse de l'équipe en mode IA : le fond choisi passe sous le chat et sous le document,
        // séparés par une fine ligne (index.css, « k-bien-ia »).
        <div className={`k-page-presentation k-dossier-ia k-bien-ia relative grid h-[100dvh] overflow-hidden ${largeurChat.tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${largeurChat.largeur}px minmax(0,1fr)` }}>
          {largeurChat.poignee}
          {colonne}
          <div className="k-apercu-bien min-h-0 min-w-0">{droite}</div>
        </div>
      ) : (
        colonne
      )}
      {espace === "mandat" && <FenetreMandatPret mandat={mandatFenetre} onFermer={() => setFenetre(null)} />}
      {espace === "estimation" && <EcouteEnvoi />}
      {presenter && courant && <PresentationPleinEcran id={courant} onFermer={() => setPresenter(false)} />}
    </>
  );
}

/**
 * La Commercialisation avant la vente (27 oct. 2026, Jules : « un chat à gauche, comme dans les autres pages ; le chat
 * pilote et gère toute cette partie »). Haka, à gauche, propose le geste suivant (écrire au vendeur avec son lien de
 * dépôt, relancer, trancher les points, notifier le locataire, mettre en vente) et rédige ; le dossier, à droite.
 * La conversation est celle du bien quand il vient de la Prospection.
 */
function EtapeDossierVente({ bien, large, entete, onFermer }) {
  const dossierId = bien.dossier.id;
  const { data: v } = useQuery({ queryKey: ["m-dossier-vente", dossierId], queryFn: () => base44.request("GET", `/api/mandataire/dossiers/${encodeURIComponent(dossierId)}/vente`) });
  // Ce que Haka propose, tant que la conversation n'a pas commencé : la phrase du dossier, puis ses gestes en un tap.
  // Le mail que la veille a préparé passe avant tout le reste : c'est la question du jour.
  // Le mail préparé revient à gauche, sous ce message (3 nov. 2026, Jules : « à droite, la Data room seule, sans le mail ;
  // le mail s'écrit dans le chat »), sous la forme du brouillon du chat.
  const proposition = v ? (
    <div className="text-left">
      <p className="m-0 text-[12.5px] text-ardoise">L'Assistant KPartners</p>
      <p className="m-0 mt-1 text-[15px] leading-[1.55] text-encre">
        {v.preference?.statut === "a_notifier" ? "D'abord le locataire : il est prioritaire pour acheter, et son mois pour répondre ne court qu'à la réception de la notification. Je la prépare\u00a0?" : ""}
        {(() => {
          // La préférence se dit au-dessus : les autres raisons seulement, pour ne rien dire deux fois.
          const autres = v.raisons.filter((r) => !/préférence|locataire achète/.test(r));
          if (v.pret) return "Le dossier est prêt : on peut mettre le bien en vente.";
          if (!autres.length) return "";
          return `${v.preference?.statut === "a_notifier" ? " Ensuite, pour la mise en vente" : "Pour mettre le bien en vente"} : ${autres.join(" ").replace(/\.$/, "").replace(/^./, (c) => c.toLowerCase())}.`;
        })()}
        {v.depot?.ouvert_le ? ` Le vendeur a ouvert son espace de dépôt le ${new Date(v.depot.ouvert_le).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}${v.depot.deposes ? ` et y a déposé ${v.depot.deposes} fichier${v.depot.deposes > 1 ? "s" : ""}` : ""}.` : v.depot?.propose_le ? " Le lien de dépôt est parti, le vendeur ne l'a pas encore ouvert." : ""}
        {v.mail_propose ? ` ${v.mail_propose.raison} Envoyer\u00a0?` : ""}
      </p>
      {v.mail_propose && <MailDuChat key={v.mail_propose.le} dossierId={dossierId} mail={v.mail_propose} boite={v.boite} />}
      {v.gestes?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {v.gestes.map((g) => (
            <button key={g.cle} type="button" onClick={() => window.dispatchEvent(new CustomEvent("klocka:lancer", { detail: { texte: g.texte } }))}
              className={g.principal ? "inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol" : "inline-flex h-9 items-center rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre"}
              style={g.principal ? undefined : { background: "transparent" }}>{g.libelle}</button>
          ))}
        </div>
      )}
    </div>
  ) : null;
  return (
    <EcranHaka bien={bien} large={large} entete={entete} onFermer={onFermer} dossierVenteId={dossierId} cles={["m-dossier-vente", "m-dossiers", "m-marches"]}
      placeholder="Demandez à l'Assistant KPartners : écris au vendeur, relance-le, explique ce point…" proposition={proposition} barre="La Data room" libelleTel="Voir la Data room"
      droite={<DossierVente dossierId={dossierId} lecture />} classeDroite="k-dataroom-fond"
      finFil={v?.mail_propose ? <MailDuChat key={v.mail_propose.le} dossierId={dossierId} mail={v.mail_propose} boite={v.boite} /> : null} />
  );
}

/**
 * La Commercialisation une fois en vente (28 oct. 2026, Jules : « le teaser à droite et le chat à gauche, on modifie
 * comme dans le mandat ou l'avis ») : Haka à gauche (il retouche le teaser sur demande), le teaser à droite, modifiable
 * d'un clic, puis la frise de la vente, les visites et le suivi.
 */
function EtapeVente({ bien, large, entete, onFermer, onSuivante }) {
  const m = bien.marche;
  const [mode, setMode] = useState("edition");
  // Le teaser ou les annonces (4 nov. 2026, Jules) : la même colonne de droite, une bascule dans sa barre.
  const [vue, setVue] = useState("teaser");
  const proposition = (
    <div className="text-left">
      <p className="m-0 text-[12.5px] text-ardoise">L'Assistant KPartners</p>
      <p className="m-0 mt-1 text-[15px] leading-[1.55] text-encre">Le bien est en vente. J'ai composé le teaser depuis le mandat et l'avis : relisez-le à droite, corrigez d'un clic ou dites-moi ce qu'il faut changer. Validé, on passe aux offres.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[["Relis le teaser", "Relis le teaser et dis-moi ce qui manque ou ce qui affaiblit l'argument."], ["Complète les champs", "Complète les champs du teaser encore à compléter avec ce que tu sais du bien."]].map(([l, t], i) => (
          <button key={l} type="button" onClick={() => window.dispatchEvent(new CustomEvent("klocka:lancer", { detail: { texte: t } }))}
            className={i === 0 ? "inline-flex h-9 items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe hover:bg-menthe-survol" : "inline-flex h-9 items-center rounded-full border border-bord-vif px-3.5 text-[13px] text-craie hover:border-menthe hover:text-encre"}
            style={i === 0 ? undefined : { background: "transparent" }}>{l}</button>
        ))}
      </div>
    </div>
  );
  // Le teaser seul (28 oct. 2026, Jules) : la frise, les visites, le dossier investisseur et les offres vont aux Offres.
  return (
    <EcranHaka bien={bien} large={large} entete={entete} onFermer={onFermer} marcheId={m.id} cles={["m-teaser", "m-marches"]}
      placeholder="Demandez à l'Assistant KPartners : raccourcis le titre, mets le rendement en avant…" proposition={proposition} libelleTel={vue === "annonces" ? "Voir les annonces" : "Voir le teaser"}
      droite={vue === "annonces" ? <AnnoncesBien marcheId={m.id} dossierId={bien?.dossier?.id || null} /> : <TeaserBien marcheId={m.id} mode={mode} />}
      barre={(
        <div className="flex w-full items-center justify-between gap-3 md:pr-14">
          <div className="flex w-fit gap-0.5 rounded-full bg-rail-actif p-1" role="tablist" aria-label="Teaser ou annonces">
            {[["teaser", "Le teaser"], ["annonces", "Annonces"]].map(([k, mot]) => (
              <button key={k} type="button" role="tab" aria-selected={vue === k} onClick={() => setVue(k)}
                className={`h-7 rounded-full px-3.5 text-[13px] ${vue === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-craie"}`} style={vue === k ? undefined : { background: "transparent" }}>{mot}</button>
            ))}
          </div>
          {vue === "teaser" && <ActionsTeaser marcheId={m.id} mode={mode} onMode={setMode} onValide={onSuivante} />}
        </div>
      )} />
  );
}

/**
 * L'écran scindé d'une étape pilotée par Haka : son chat à gauche (la conversation du bien quand il vient de la
 * Prospection), ce qu'il propose tant qu'on n'a rien dit, et le document à droite. Au téléphone, comme la Visite.
 */
function EcranHaka({ bien, large, entete, onFermer, dossierVenteId = null, marcheId = null, cles = [], placeholder, proposition, droite, barre, libelleTel, classeDroite = "", finFil = null }) {
  const libelleRetour = useContext(RetourBien);
  const outilsChat = useReglagesChatMandataire(["mail", "dossier"]);
  const largeurChat = useLargeurChat();
  const queryClient = useQueryClient();
  const p = bien?.proprietaire || null;
  const [conversation, setConversation] = useState(false);
  const cible = p ? `bien:${p.id}` : `dossier:${dossierVenteId || marcheId}`;
  const sansHistorique = useCallback(() => {}, []);
  // Le fil du bien se rouvre (1er nov. 2026, Jules : « un fil par bien »).
  const lie = p?.biens?.conversation_id || null;
  const lier = useCallback((cid) => {
    if (!cid || cid === lie || !p) return;
    base44.request("POST", `/api/mandataire/proprietaires/${p.id}/conversation`, { body: { conversation_id: cid } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["m-proprietaires"] })).catch(() => {});
  }, [lie, p, queryClient]);
  const surReponse = () => cles.forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const replier = conversation && large;
  useEffect(() => {
    if (!replier) return undefined;
    window.dispatchEvent(new CustomEvent("klocka:replier-barre", { detail: { replier: true } }));
    return () => window.dispatchEvent(new CustomEvent("klocka:replier-barre", { detail: { replier: false } }));
  }, [replier]);
  // Au téléphone, une barre qui porte des commandes (le teaser) passe au-dessus du document ; un simple titre, non.
  const barreTel = typeof barre === "string" ? null : <div className="pb-3 text-[12.5px] text-ardoise">{barre}</div>;

  const chat = (
    <ChatDashboard lueur dansLeFil={!!p} espace="mandataire" proprietaireId={p?.id || null} dossierVenteId={dossierVenteId} marcheId={marcheId} cible={cible} reglages={outilsChat.reglages} onHistorique={sansHistorique} onConversation={setConversation}
      onConversationId={lier} onReponse={surReponse} sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil={placeholder}
      barreApercu={large} sansBarreHaut={!large && conversation} retour={{ libelle: libelleRetour, onClick: onFermer }} reprendre={!!p} finFil={finFil} />
  );

  if (large) {
    // Le dossier ouvert d'office, sans bouton pour le fermer (2 nov. 2026, Jules : « on arrive, il doit être ouvert »).
    return (
      <div className={`k-page-presentation k-dossier-ia k-bien-ia relative grid h-[100dvh] overflow-hidden ${largeurChat.tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${largeurChat.largeur}px minmax(0,1fr)` }}>
        {largeurChat.poignee}
        <div className="k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5">
          {!conversation && entete}
          {!conversation && <div className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto py-6">{proposition}</div>}
          <div className={conversation ? "min-h-0 w-full flex-1" : "w-full flex-none pb-5"}>{chat}</div>
        </div>
        <div className={`k-apercu-bien min-h-0 min-w-0 ${classeDroite}`}>
          <div className="flex h-full min-h-0 flex-col border-l border-trait">
            <div className="k-barre-apercu flex h-14 flex-none items-center border-b border-trait px-5 text-[12.5px] text-ardoise">{barre}</div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-6 pl-6 pr-20 pt-4"><div className="mx-auto max-w-[820px]">{droite}</div></div>
          </div>
        </div>
      </div>
    );
  }
  // Au téléphone, comme la Visite : la proposition de Haka et le document défilent, la saisie reste en bas ; la
  // conversation commencée prend la hauteur, et le document s'ouvre par son bouton.
  return conversation ? (
    <div className="k-chat-hauteur flex flex-col px-5">
      {entete}
      <div className="flex flex-none items-center justify-end gap-2 pb-3"><DocumentTelephone enLigne libelle={libelleTel}><div className="overflow-y-auto px-5 pb-10 pt-4">{barreTel}{droite}</div></DocumentTelephone></div>
      <div className="min-h-0 w-full flex-1">{chat}</div>
    </div>
  ) : (
    <div className="flex flex-col px-5 pb-[calc(11rem+env(safe-area-inset-bottom))]">
      {entete}
      <div className="pb-4">{proposition}</div>
      {barreTel}
      {droite}
      <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)", background: `linear-gradient(to top, ${J["fond"]} 65%, transparent)` }}>{chat}</div>
    </div>
  );
}

/** Commercialisation, Offres et Vente d'un bien : sa commercialisation seule, ouverte (dossier investisseur, vidéo, offres, suivi jusqu'à l'acte). */
function EtapeMarche({ bien, types, etape }) {
  const queryClient = useQueryClient();
  const m = bien?.marche;
  // Sans dossier, la Data room attend le mandat signé ; sans mise en vente, la Commercialisation attend la Data room.
  if (!m) {
    return (
      <div className="mx-auto max-w-[900px] px-5 pb-16 pt-3 md:px-8">
        <PasEncore texte={etape === "dataroom" || !bien?.dossier?.id ? "La Data room du bien s'ouvre au mandat signé : les pièces, leurs vérifications, puis la mise en vente se font ici." : "La Commercialisation commence à la mise en vente : l'assistant la propose dans la Data room quand le dossier est prêt."} />
      </div>
    );
  }
  // Après le teaser, deux voies (28 oct. 2026, Jules) : le commercialiser soi-même, ou l'envoyer à Klocka, qui fait le
  // reste ; l'analyste coche l'avancement dans la conversation du dossier.
  if (!m.voie) return <ChoixVoie m={m} />;
  if (m.voie === "klocka" && m.dossier_id) return <ChezKlocka dossierId={m.dossier_id} marcheId={m.id} />;
  return (
    <div className="mx-auto max-w-[1100px] px-5 pb-16 pt-3 md:px-8">
      {m.voie === "moi" && <div className="mb-2 flex justify-end"><ChangerVoie marcheId={m.id} vers="klocka" /></div>}
      <Carte actif>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="m-0 text-[15.5px] text-encre">{m.bien}<PastilleExemple x={m} /></p>
          <span className="text-[12.5px] text-ardoise">{(m.activite || []).length} signe{(m.activite || []).length > 1 ? "s" : ""} d'intérêt · {(m.offres || []).length} offre{(m.offres || []).length > 1 ? "s" : ""}</span>
        </div>
        <div className="mt-3"><Frise etapes={ETAPES_MARCHE} statut={m.statut} /></div>
      </Carte>
      <Visites bien={bien} />
      <DetailMarche m={m} types={types} rafraichir={() => queryClient.invalidateQueries({ queryKey: ["m-marches"] })} />
    </div>
  );
}

const jourMois = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }) : "");

/**
 * Le bien envoyé à Klocka (28 oct. 2026, Jules : « le même layout que chez Klocka ») : la conversation avec l'équipe à
 * gauche, à droite le bien, son avancement (coché par l'équipe), ses photos et ses pièces.
 */
/** Changer de voie après coup (29 oct. 2026, Jules) : reprendre la vente soi-même, ou la confier à Klocka. */
function ChangerVoie({ marcheId, vers }) {
  const queryClient = useQueryClient();
  const changer = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(marcheId)}/voie`, { body: { voie: vers } }),
    onSuccess: () => { ["m-marches", "m-dossiers", "fil-dossier"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); toast.success(vers === "klocka" ? "Envoyé à Klocka" : "Vous reprenez la vente"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <button type="button" onClick={() => { if (window.confirm(vers === "klocka" ? "Confier la vente de ce bien à Klocka ?" : "Reprendre la vente de ce bien vous-même ? Klocka arrête de le présenter.")) changer.mutate(); }}
      disabled={changer.isPending} className="text-[12.5px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>
      {vers === "klocka" ? "L'envoyer à Klocka" : "Le commercialiser moi-même"}
    </button>
  );
}

function ChezKlocka({ dossierId, marcheId = null }) {
  const { data } = useQuery({ queryKey: ["m-dossiers"], queryFn: () => base44.request("GET", "/api/mandataire/dossiers") });
  const d = (data?.dossiers || []).find((x) => x.id === dossierId);
  if (!d) return <p className="m-0 px-5 py-10 text-center text-[13.5px] text-brume">La conversation se charge…</p>;
  const c = depuisMandataire(d);
  return (
    <div className="px-5 pb-6 pt-3 md:px-8">
      {marcheId && <div className="mb-2 flex justify-end"><ChangerVoie marcheId={marcheId} vers="moi" /></div>}
      <div className="flex h-[calc(100dvh-130px)] min-h-[520px] overflow-hidden rounded-[16px] border border-bord-doux bg-rail max-lg:h-auto max-lg:flex-col">
        <Conversation key={c.id} c={c} cote="mandataire" />
        <Resume c={c} cote="mandataire" />
      </div>
    </div>
  );
}

/** Les deux voies après le teaser : Klocka fait le reste, ou le mandataire le commercialise lui-même. */
function ChoixVoie({ m }) {
  const queryClient = useQueryClient();
  const choisir = useMutation({
    mutationFn: (voie) => base44.request("POST", `/api/mandataire/marches/${encodeURIComponent(m.id)}/voie`, { body: { voie } }),
    onSuccess: (_r, voie) => { ["m-marches", "m-dossiers"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] })); toast.success(voie === "klocka" ? "Envoyé à Klocka" : "À vous de le diffuser"); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const voies = [
    ["klocka", "L'envoyer à Klocka", "Le teaser, le mandat, l'avis de valeur, les photos et la data room partent chez Klocka. L'équipe Klocka le présente à ses clients ; vous suivez l'avancement et lui écrivez dans la conversation du dossier."],
    ["moi", "Le commercialiser moi-même", "Vous diffusez le teaser à vos acquéreurs : visites, offres et suivi se notent ici."],
  ];
  return (
    <div className="mx-auto max-w-[720px] px-5 pb-16 pt-10 md:px-8">
      <h2 className="m-0 text-center text-[22px] font-normal text-encre">Le teaser est prêt. Qui le commercialise ?</h2>
      <div className="mt-6 grid gap-3 md:grid-cols-2">
        {voies.map(([k, titre, texte], i) => (
          <button key={k} type="button" onClick={() => choisir.mutate(k)} disabled={choisir.isPending}
            className={`rounded-[16px] border p-5 text-left transition-colors ${i === 0 ? "border-menthe/50 hover:border-menthe" : "border-trait hover:border-bord-vif"}`} style={{ background: "transparent" }}>
            <span className={`block text-[15.5px] ${i === 0 ? "text-menthe" : "text-encre"}`}>{titre}</span>
            <span className="mt-1.5 block text-[13.5px] leading-[1.55] text-ardoise">{texte}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Où en est l'avis avec le propriétaire (26 oct. 2026, Jules : le prix d'accord est le résultat de l'avis, plus une étape) :
 * Pas encore d'avis, En rédaction, Prêt, Envoyé le … (en attente du propriétaire), Accepté à … €, Refusé (relance le …).
 * L'avis parti, le prix convenu se note ici (il fait l'étape et le mandat le reprend) ; « Refusé » met le bien en pause.
 */
const ouvrirEnvoi = (id) => window.dispatchEvent(new CustomEvent("klocka:envoyer-avis", { detail: { estimation_id: id } }));

/** La fenêtre d'envoi de l'avis, ouverte par Haka (sa carte « Relire et envoyer ») ou par le bouton du bandeau. */
function EcouteEnvoi() {
  const [id, setId] = useState(null);
  useEffect(() => {
    const ouvrir = (e) => setId(e.detail?.estimation_id || null);
    window.addEventListener("klocka:envoyer-avis", ouvrir);
    return () => window.removeEventListener("klocka:envoyer-avis", ouvrir);
  }, []);
  return id ? <EnvoiAvis estimationId={id} onFermer={() => setId(null)} /> : null;
}

/**
 * Le bandeau de l'avis d'un bien (27 oct. 2026, la restitution) : prêt, il s'envoie ; envoyé, il dit le statut et la
 * prochaine action datée. Ce que dit le propriétaire se raconte au chat (27 oct. 2026, Jules : plus de formulaire).
 */
function EtatAvis({ bien, className = "mb-3" }) {
  const queryClient = useQueryClient();
  const p = bien.proprietaire;
  const e = bien.estimation;
  const accord = p.biens?.prix_accord || null;
  const pause = p.biens?.pause || null;
  const perdu = p.biens?.perdu || null;
  const resti = p.biens?.restitution || null;
  const prochaine = p.biens?.prochaine || null;
  const rafraichir = () => ["m-proprietaires", "m-fiche", "m-rappels"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  const reprendre = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/proprietaires/${p.id}/reprendre`, { body: {} }),
    onSuccess: rafraichir,
    onError: (x) => toast.error(x?.message || "Impossible"),
  });
  const envoye = e?.statut === "envoye";
  const suite = prochaine?.le ? ` · ${prochaine.quoi}, le ${jourMois(prochaine.le)}` : "";
  const [teinte, texte] = perdu ? ["bg-alerte", `Perdu · ${MOTS_PERDU[perdu.motif] || perdu.motif || "sans motif"}${suite}`]
    : pause ? ["bg-ambre", `En pause${suite || (pause.relance_le ? ` · relance le ${jourMois(pause.relance_le)}` : "")}`]
      : accord ? ["bg-menthe", `Prix d'accord : ${euros(accord)}${suite}`]
        : envoye ? ["bg-ambre", `Estimation envoyée${e.envoye_le ? ` le ${jourMois(e.envoye_le)}` : ""}${resti?.a_revoir ? " · à revoir" : ""}${suite}`]
          : [null, null];
  // Pas de ligne pendant la rédaction (26 oct. 2026, Jules) : l'avis à côté dit déjà où il en est. Prêt, pas de ligne non
  // plus (27 oct. 2026) : « Envoyer » est dans la barre de l'avis, à droite de Télécharger.
  if (!teinte) return null;
  return (
    <div className={`rounded-[14px] border border-bord-doux bg-rail px-4 py-2.5 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        <p className="m-0 flex min-w-0 flex-1 items-center gap-2 text-[13.5px] text-encre"><span className={`h-1.5 w-1.5 flex-none rounded-full ${teinte}`} /><span className="min-w-0 truncate" title={texte}>{texte}</span></p>
        {resti?.a_revoir && (
          <button type="button" onClick={() => ouvrirEnvoi(e.id)} className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">
            <Send className="h-3.5 w-3.5" />{envoye ? "Renvoyer" : "Envoyer"}
          </button>
        )}
        {(pause || perdu) && (
          <button type="button" onClick={() => reprendre.mutate()} disabled={reprendre.isPending}
            className="h-8 flex-none rounded-full border border-trait px-3.5 text-[13px] text-craie hover:text-encre" style={{ background: "transparent" }}>Reprendre</button>
        )}
      </div>
      {resti?.alerte && accord && <p className="m-0 mt-1.5 text-[12.5px] text-ambre">{resti.alerte}</p>}
    </div>
  );
}

const PasEncore = ({ texte }) => <p className="m-0 mx-auto max-w-[56ch] px-5 py-20 text-center text-[14px] leading-[1.6] text-brume">{texte}</p>;

// Ce que dit la Pré-visite en tête de son chat (26 oct. 2026 : Visité et Prix d'accord ne sont plus des étapes).
const QUESTIONS = {
  previsite: ["Préparer la visite", "Votre préparation est à droite. Après le rendez-vous, racontez la visite à votre assistant : il fait le compte rendu, puis vous demande s'il faut passer à l'estimation."],
};

/**
 * Faire entrer un bien qu'on a déjà (4 nov. 2026, Jules : « comme dans les autres pages avec Assistant KPartners » ; « lorsqu'il
 * crée le dossier, la preview se met à droite comme dans une page éditeur, avec une transition smooth »). D'abord le chat
 * seul, centré, sous sa question ; au premier message, la colonne du chat glisse à gauche et la vue d'ensemble du bien
 * arrive à droite, qui se remplit à chaque réponse. Le même arbre avant et après : le chat ne se recharge pas. La
 * transition ne joue pas pendant qu'on tire la poignée : la colonne suit le curseur sans retard.
 */
function EtapeImport({ bien, onAller, onFermer, entete }) {
  const p = bien.proprietaire;
  const queryClient = useQueryClient();
  const outilsChat = useReglagesChatMandataire(["estimation", "mandat", "dossier"]);
  const largeurChat = useLargeurChat();
  const [conversation, setConversation] = useState(false);
  const sansHistorique = useCallback(() => {}, []);
  const [, setParams] = useSearchParams();
  const relire = () => ["m-proprietaires", "m-documents-bien", "m-fiche", "m-dossiers"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  // L'assistant a reconnu un bien déjà là (même adresse) : l'écran ouvre celui-là, la conversation l'a suivi (4 nov. 2026).
  const surReponse = async (r) => {
    const ouvrir = (r?.actions || []).find((a) => a.type === "ouvrir_bien");
    if (ouvrir) {
      await queryClient.refetchQueries({ queryKey: ["m-proprietaires"] });
      setParams(new URLSearchParams({ bien: `proprietaire:${ouvrir.proprietaire_id}`, etape: "ensemble" }));
      return;
    }
    relire();
  };
  const finir = useMutation({
    mutationFn: () => base44.request("POST", `/api/mandataire/proprietaires/${p.id}/import/fini`),
    onSuccess: relire,
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  return (
    <div className={`k-page-presentation k-dossier-ia k-bien-ia relative grid h-[100dvh] overflow-hidden ${largeurChat.tire ? "select-none" : "transition-[grid-template-columns] duration-700 ease-[cubic-bezier(.22,1,.36,1)]"}`}
      style={{ gridTemplateColumns: conversation ? `${largeurChat.largeur}px minmax(0,1fr)` : "minmax(0,1fr) 0px" }}>
      {conversation && largeurChat.poignee}
      <div className="k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5">
        {!conversation && entete}
        {!conversation && (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto py-6 text-center">
            <h1 className="k-balayage m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>Faire entrer ce bien</h1>
            <p className="mx-auto m-0 max-w-[60ch] text-[14px] text-ardoise">Racontez-moi ce bien : où il est, ce que c'est, où vous en êtes avec le propriétaire, qui s'est placé dessus. En vocal si vous voulez, et joignez ce que vous avez (mandat, avis de valeur, bail).</p>
          </div>
        )}
        <div className={conversation ? "min-h-0 w-full flex-1" : "mx-auto w-full max-w-[760px] flex-none pb-8"}>
          <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={p.id} reglages={outilsChat.reglages} onHistorique={sansHistorique} onConversation={setConversation}
            onReponse={surReponse} sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Racontez ce bien…"
            barreApercu={conversation} retour={{ libelle: "Mes biens", onClick: onFermer }} reprendre />
        </div>
      </div>
      <div className="k-apercu-bien relative min-h-0 min-w-0 overflow-hidden">
        <AnimatePresence>
          {conversation && (
            <motion.div key="apercu" className="flex h-full min-h-0 flex-col border-l border-trait"
              initial={{ opacity: 0, x: 48 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 48 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}>
              <div className="k-barre-apercu flex h-14 flex-none items-center justify-between gap-3 border-b border-trait pl-5 pr-20 text-[12.5px] text-ardoise">
                <span className="truncate">{bien.titre}</span>
                <button type="button" onClick={() => finir.mutate()} disabled={finir.isPending} className="inline-flex h-8 flex-none items-center rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>C'est fait</button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto pb-10 pl-6 pr-20 pt-2"><div className="mx-auto max-w-[1180px]"><RelectureBien proprietaire={p} /><VueEnsembleBien bien={bien} onAller={onAller} sansImport /></div></div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * La Pré-visite (26 oct. 2026, Jules) : le chat du bien à gauche, la fiche et sa préparation à droite, dès l'arrivée.
 * La conversation est celle du bien (gardée sur la fiche) : elle se rouvre d'elle-même en revenant. Raconter la visite
 * lance l'avis, et le bien passe à l'Avis de valeur. Au téléphone, le chat et « Voir la fiche ».
 */
function EtapeRaconte({ bien, etape, large, onFermer, entete, onAvis = null }) {
  const libelleRetour = useContext(RetourBien);
  const outilsChat = useReglagesChatMandataire(["appel", "mail", "estimation"]);
  const largeurChat = useLargeurChat();
  const p = bien?.proprietaire;
  const queryClient = useQueryClient();
  const [conversation, setConversation] = useState(false);
  const cible = p ? `bien:${p.id}` : null;
  const sansHistorique = useCallback(() => {}, []);
  // Le fil du bien se rouvre (1er nov. 2026, Jules : « un fil par bien ») : ce qui s'est dit en prospectant, puis ici.
  const lie = p?.biens?.conversation_id || null;
  const [ficheOuverte, setFicheOuverte] = useState(false);
  const lier = useCallback((cid) => {
    if (!cid || cid === lie || !p) return;
    base44.request("POST", `/api/mandataire/proprietaires/${p.id}/conversation`, { body: { conversation_id: cid } })
      .then(() => queryClient.invalidateQueries({ queryKey: ["m-proprietaires"] })).catch(() => {});
  }, [lie, p, queryClient]);
  const surReponse = () => ["m-proprietaires", "m-fiche", "m-estimations"].forEach((k) => queryClient.invalidateQueries({ queryKey: [k] }));
  // En conversation sur grand écran : la barre de gauche se replie, la page ne défile plus (chaque colonne défile).
  // La préparation est à lire tout de suite : le chat à gauche, la fiche et sa préparation à droite dès l'arrivée.
  const ouvert = conversation || etape === "previsite";
  const scinde = ouvert && large;
  // La barre de gauche se replie quand la conversation commence (comme au Mandat, elle reste à l'arrivée) ; le défilement
  // de la page est géré par BienOuvert, comme pour l'Estimation et le Mandat.
  const replier = conversation && large;
  useEffect(() => {
    if (!replier) return undefined;
    window.dispatchEvent(new CustomEvent("klocka:replier-barre", { detail: { replier: true } }));
    return () => window.dispatchEvent(new CustomEvent("klocka:replier-barre", { detail: { replier: false } }));
  }, [replier]);
  useVersAvis(bien, onAvis);
  // Un bien hors Prospection : la préparation allégée, depuis son adresse (26 oct. 2026).
  if (!p) return <div className="px-5 pb-6">{entete}<PreparationDuBien bien={bien} /></div>;

  const [titre, sous] = QUESTIONS[etape] || QUESTIONS.previsite;
  // Plus de bouton « La visite est faite » (26 oct. 2026, Jules) : à la fin du rendez-vous, un vocal à Haka ; l'avis
  // qu'il lance fait passer le bien à l'Avis de valeur. Les autres issues (décaler, annulé, pas vendeur) se disent aussi à Haka
  // (27 oct. 2026 : plus de menu « ... »).
  const chat = (
    <ChatDashboard lueur dansLeFil espace="mandataire" proprietaireId={p.id} cible={cible} reglages={outilsChat.reglages} onHistorique={sansHistorique} onConversation={setConversation}
      onConversationId={lier} onReponse={surReponse} sansSkills epure libelleAccueil="Assistant KPartners" menusVersLeHaut placeholderAccueil="Une question, ou racontez la visite…"
      barreApercu={scinde} sansBarreHaut={!large && conversation} retour={{ libelle: libelleRetour, onClick: onFermer }} reprendre />
  );
  // Le contenu de la préparation (26 oct. 2026, refait) au-dessus de la fiche, qui ne la répète pas. Au téléphone, la fiche
  // du bien d'abord, la préparation ensuite (31 oct. 2026, Jules).
  const ficheDuBien = <div className="k-grid rounded-[18px] border border-trait"><FicheMandataire id={p.id} sansChat sansPreparation /></div>;
  const fiche = (
    <div className="flex flex-col gap-4">
      {!large && ficheDuBien}
      {p.biens?.compte_rendu && <CompteRendu cr={p.biens.compte_rendu} onEstimation={bien?.estimation?.avis ? null : onAvis} />}
      <PreparationDuBien bien={bien} />
    </div>
  );

  // Avant le premier message : le chat seul, centré, sous la question de l'étape.
  if (!ouvert) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-80px)] w-full max-w-[760px] flex-col px-5 pb-10">
        {entete}
        <div className="flex flex-1 flex-col justify-center">
        <div className="pb-6 text-center">
          <h1 className="k-balayage m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>{titre}</h1>
          <p className="m-0 mt-2 text-[14px] text-ardoise">{sous}</p>
        </div>
        {chat}
        </div>
      </div>
    );
  }
  // Ensuite, et dès l'arrivée au rendez-vous fixé : la mise en page du Mandat (26 oct. 2026, Jules) : une colonne de chat
  // sur toute la hauteur, le titre du bien et la question de l'étape en tête tant qu'on n'a rien dit, la saisie en bas ;
  // la fiche (et sa préparation) à droite, sur toute la hauteur.
  return large ? (
    <div className={`k-page-presentation k-dossier-ia k-bien-ia relative grid h-[100dvh] overflow-hidden ${largeurChat.tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${largeurChat.largeur}px minmax(0,1fr)` }}>
          {largeurChat.poignee}
      <div className="k-colonne-chat flex h-[100dvh] min-h-0 min-w-0 flex-col px-5">
        {!conversation && entete}
        {!conversation && (
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-2 overflow-y-auto py-6 text-center">
            <h1 className="k-balayage m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>{titre}</h1>
            <p className="m-0 text-[14px] text-ardoise">{sous}</p>
          </div>
        )}
        <div className={conversation ? "min-h-0 w-full flex-1" : "w-full flex-none pb-5"}>{chat}</div>
      </div>
      {/* Comme le Mandat (26 oct. 2026, Jules) : une ligne verticale entre le chat et la fiche, et la barre du haut à droite,
          soulignée d'une ligne horizontale. */}
      {/* La préparation à droite, seule (1er nov. 2026, Jules) : la fiche du bien n'est plus une colonne ouverte en
          permanence, « La fiche » l'ouvre en panneau, comme un point de la carte du terrain. */}
      <div className="k-apercu-bien relative min-h-0 min-w-0">
        <div className="flex h-full min-h-0 flex-col border-l border-trait">
          <div className="k-barre-apercu flex h-14 flex-none items-center justify-between gap-3 border-b border-trait pl-5 pr-20 text-[12.5px] text-ardoise">
            <span>Préparer la visite</span>
            <button type="button" onClick={() => setFicheOuverte(true)} className="inline-flex h-8 items-center rounded-full border border-bord-doux px-3.5 text-[13px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>La fiche</button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-6 pl-6 pr-20 pt-6"><div className="mx-auto max-w-[760px]">{fiche}</div></div>
        </div>
        <AnimatePresence>{ficheOuverte && <FichePoint key={p.id} fiche={{ id: p.id, commerce: p.commerce, nom: p.nom, adresse: p.adresse }} onFermer={() => setFicheOuverte(false)} />}</AnimatePresence>
      </div>
    </div>
  ) : (
    // Au téléphone (27 oct. 2026, Jules : « visible comme sur ordinateur ») : à l'arrivée, la préparation et la fiche du bien
    // se lisent en défilant, sans bouton ; la saisie de Haka reste fixée en bas. La conversation commencée prend la hauteur,
    // et la fiche s'ouvre alors par « Voir la fiche ».
    conversation ? (
      <div className="k-chat-hauteur flex flex-col px-5">
        {entete}
        <div className="flex flex-none items-center justify-end gap-2 pb-3"><DocumentTelephone enLigne libelle="Voir la fiche"><div className="overflow-y-auto px-5 pb-10 pt-4">{fiche}</div></DocumentTelephone></div>
        <div className="min-h-0 w-full flex-1">{chat}</div>
      </div>
    ) : (
      <div className="flex flex-col px-5 pb-[calc(11rem+env(safe-area-inset-bottom))]">
        {entete}
        {fiche}
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pt-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)", background: `linear-gradient(to top, ${J["fond"]} 65%, transparent)` }}>{chat}</div>
      </div>
    )
  );
}
