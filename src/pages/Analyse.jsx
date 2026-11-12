import FlechesHistorique from "@/components/ui/fleches-historique";
import Pages from "@/components/ui/Pages";
import { motion } from "framer-motion";
import { Depliant, PanneauSources } from "@/components/haka/ReglagesDemande";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { createPortal } from "react-dom";
import { ArrowLeft, Loader2, Plus, Clock, MoreHorizontal, Pencil, Archive, RotateCcw, Trash2, X, UserRound, Folder, Search, SlidersHorizontal, ChevronDown, MessagesSquare, ArrowRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { toast } from "@/components/ui/avis";
import WorkflowDeal from "@/components/preanalyse/WorkflowDeal";
import { VERDICTS } from "@/components/preanalyse/DealResultat";
import { PoigneeEditeur, useLargeurChat } from "@/components/editeur/Editeur";
import { useFermerAuClicAilleurs } from "@/components/preanalyse/GrilleCriteres";
import { Conversation, Resume } from "@/components/conversations/EspaceConversations";
import { PointNouveau } from "@/components/conversations/DossiersMandataire";
import DecisionMandataire from "@/components/mandataire/DecisionMandataire";
import { useUser } from "@/components/providers/UserProvider";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import FondHalo from "@/components/projet/FondHalo";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, themeEffectif } from "@/lib/personnalisation";
import PenseeIA from "@/components/PenseeIA";
import Chargement from "@/components/ui/Chargement";
import { FRISE, estEcarte, etapeFrise } from "@/lib/dossiers-architecture";
import { BoutonPrincipal, CLASSE_OUTIL, Recherche, Statut, TitrePage } from "@/components/mandataire/elements";
import { ajouterAuBrouillon, champsEnAttente, dossierAvecBrouillon } from "@/lib/brouillon-fiche";

// Dossiers (architecture du 17 oct. 2026) : la liste en trois blocs de cartes,
// À traiter (à toi d'agir, en attente d'un tiers), Pipeline (Tri, Qualification,
// Commercialisation, Transaction) et Écartés par AK ; le dossier ouvert suit
// une frise de huit étapes. Les règles sont dans src/lib/dossiers-architecture.js.
// « Nouveau dossier » démarre à la réception ; ?deal_id= rouvre un dossier en cours.

// Les admins proposés à la création d'un dossier.
const ADMINS = ["Jules", "Maxime", "Paul", "Coralie", "Nora"];



export default function Analyse() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const dealId = params.get("deal_id");
  const nouveau = params.get("nouveau") === "1";
  // La recherche et le filtre par étape, au-dessus des cartes.
  const [recherche, setRecherche] = useState("");
  // Une fiche glissée n'importe où sur la liste : elle est analysée, et le dossier s'ouvre.
  const [survol, setSurvol] = useState(false);
  const [large, setLarge] = useState(false);
  // Un dossier ouvert (17 oct. 2026, Jules) : la barre latérale s'efface, AK à gauche, le dossier à droite, à toutes les étapes.
  const ecranLarge = useEcranLarge();
  const [vueDossier, setVueDossier] = useState(null);
  const [chatOuvert, setChatOuvert] = useState(false);
  const analyserFiche = useMutation({
    mutationFn: (fichier) => { const form = new FormData(); form.append("fichier", fichier); return base44.request("POST", "/api/preanalyse/analyser", { body: form, isForm: true }); },
    onSuccess: (d) => { toast.success("Fiche analysée"); rafraichirListes(); montrerDeal(d.deal_id); },
    onError: (e) => toast.error(e?.message || "Analyse impossible"),
  });
  const moi = useUser()?.email || "";
  // Création d'un dossier nommé : nom + responsables, avant toute analyse.
  const [creationOuverte, setCreationOuverte] = useState(false);
  const [nomDossier, setNomDossier] = useState("");
  const [adminsChoisis, setAdminsChoisis] = useState([]);
  const [menuCarte, setMenuCarte] = useState(null); // deal_id du menu ⋯ ouvert
  const [posMenu, setPosMenu] = useState(null); // position du bouton ⋯ ouvert (le menu est posé en fixe sur la page)
  // Changer les responsables d'un dossier : le dossier visé et la sélection en cours.
  const [proprio, setProprio] = useState(null); // { deal_id, titre, choix: [] }

  const [dossier, setDossier] = useState(null);

  // 20 dossiers par page (30 oct. 2026, Jules) : le serveur trie, filtre et ne renvoie que la page ; la recherche part
  // au serveur un quart de seconde après la dernière touche, et ramène à la première page.
  const [page, setPage] = useState(1);
  const [cherche, setCherche] = useState("");
  useEffect(() => {
    const t = setTimeout(() => { setCherche(recherche.trim()); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [recherche]);
  const { data: pipeline, isLoading } = useQuery({
    queryKey: ["preanalyse-pipeline", "page", page, cherche],
    queryFn: () => base44.request("GET", `/api/preanalyse/pipeline?page=${page}&q=${encodeURIComponent(cherche)}`),
    placeholderData: (avant) => avant,
    refetchOnWindowFocus: true,
  });

  // Un dossier ouvert entre dans « Dossiers récents », sous Projets dans la barre (17 oct. 2026).
  useEffect(() => {
    if (!dealId) return;
    base44.request("POST", `/api/preanalyse/dossiers/${dealId}/ouvert`, { body: {} }).then(() => queryClient.invalidateQueries({ queryKey: ["dossiers-recents"] })).catch(() => {});
  }, [dealId, queryClient]);

  const montrerDeal = (id) => {
    const suivant = new URLSearchParams(params);
    suivant.delete("nouveau");
    if (id) suivant.set("deal_id", id);
    else suivant.delete("deal_id");
    setParams(suivant);
  };

  const creerDossier = useMutation({
    mutationFn: () =>
      base44.request("POST", "/api/preanalyse/dossiers", {
        body: { nom: nomDossier.trim(), responsables: adminsChoisis },
      }),
    onSuccess: (d) => {
      setCreationOuverte(false);
      setNomDossier("");
      setAdminsChoisis([]);
      rafraichirListes();
      montrerDeal(d.deal_id);
    },
    onError: (e) => toast.error(e?.message || "Création impossible"),
  });

  const renommer = useMutation({
    mutationFn: ({ id, nom }) => base44.request("POST", `/api/preanalyse/dossiers/${id}/renommer`, { body: { nom } }),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier renommé"); },
    onError: (e) => toast.error(e?.message || "Renommage impossible"),
  });

  const revenirEtape1 = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${id}/revenir`, { body: { etape: 1 } }),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier ramené à l'étape 1"); },
    onError: (e) => toast.error(e?.message || "Retour impossible"),
  });

  const changerResponsables = useMutation({
    mutationFn: ({ id, responsables }) => base44.request("POST", `/api/preanalyse/dossiers/${id}/responsables`, { body: { responsables } }),
    onSuccess: (r) => { rafraichirListes(); setProprio(null); toast.success(`Responsable${r.responsables.length > 1 ? "s" : ""} : ${r.responsables.join(", ")}`); },
    onError: (e) => toast.error(e?.message || "Changement impossible"),
  });

  const abandonner = useMutation({
    mutationFn: (id) => base44.request("POST", `/api/preanalyse/dossiers/${id}/abandonner`),
    onSuccess: () => { rafraichirListes(); toast.success("Dossier abandonné"); },
    onError: (e) => toast.error(e?.message || "Abandon impossible"),
  });

  const supprimer = useMutation({
    mutationFn: (id) => base44.request("DELETE", `/api/preanalyse/dossiers/${id}`),
    onSuccess: () => {
      rafraichirListes();
      queryClient.invalidateQueries({ queryKey: ["dossiers"] });
      queryClient.invalidateQueries({ queryKey: ["fiches-commerciales"] });
      queryClient.invalidateQueries({ queryKey: ["k-conversations"] });
      toast.success("Dossier supprimé");
    },
    onError: (e) => toast.error(e?.message || "Suppression impossible"),
  });

  const rafraichirListes = () => {
    queryClient.invalidateQueries({ queryKey: ["preanalyse-pipeline"] });
  };

  const ouvrirDossier = useMutation({
    mutationFn: (id) => base44.request("GET", `/api/preanalyse/dossiers/${id}`),
    onSuccess: (d) => setDossier(d),
    onError: (e) => toast.error(e?.message || "Dossier introuvable"),
  });

  // Charge le dossier désigné par l'URL (liste, boîte de réception, lien).
  useEffect(() => {
    if (dealId && dossier?.deal_id !== dealId && !ouvrirDossier.isPending) {
      ouvrirDossier.mutate(dealId);
    }
    if (!dealId && !nouveau && dossier) setDossier(null);
  }, [dealId, nouveau]);

  const recharger = () => {
    if (dealId) ouvrirDossier.mutate(dealId);
    rafraichirListes();
    // Les tableaux et la Data Room aussi (10 nov. 2026, Jules) : une case écrite par le chat restait cachée derrière le cache.
    if (dealId) for (const k of ["analyse-pieces", "depots", "bien-analyse", "versions-dossier"]) queryClient.invalidateQueries({ queryKey: [k, dealId] });
  };

  // Le brouillon de la fiche (19 oct. 2026, Jules) : chaque champ modifié s'y ajoute et s'affiche tout de suite ;
  // la pré-analyse ne se refait qu'au clic sur OK, une fois pour tous les champs (un appel au modèle, pas un par champ).
  const [brouillons, setBrouillons] = useState({});
  useEffect(() => { setBrouillons({}); }, [dealId]);
  const enAttente = champsEnAttente(brouillons);
  const dossierVu = useMemo(() => dossierAvecBrouillon(dossier, brouillons), [dossier, brouillons]);
  const validerBrouillon = async () => {
    const lots = Object.entries(brouillons).filter(([, saisie]) => Object.keys(saisie).length);
    try {
      for (const [index, saisie] of lots) await majLot.mutateAsync({ index: Number(index), saisie });
      setBrouillons({});
    } catch { /* le toast d'erreur le dit ; le brouillon reste, à renvoyer */ }
  };

  const majLot = useMutation({
    mutationFn: ({ index, saisie }) =>
      base44.request("POST", `/api/preanalyse/dossiers/${dealId}/lots/${index}`, { body: saisie }),
    // Le recalcul se voit tout de suite : un toast qui attend, puis le verdict.
    onMutate: () => { toast.loading("Recalcul en cours…", { id: "recalcul", description: "Verdict, rendements et simulateur se mettent à jour." }); },
    onSuccess: (r, vars) => {
      const idx = r?.lot?.index ?? vars.index;
      setDossier((d) => {
        if (!d) return d;
        const lots = [...d.lots];
        lots[idx] = { ...lots[idx], ...r.lot, index: idx };
        return { ...d, lots, ...(r?.nom ? { nom: r.nom, titre: r.nom } : {}) };
      });
      const relance = r?.lot?.marche_relance && Date.now() - Date.parse(r.lot.marche_relance.le) < 60000;
      toast.success("Préanalyse recalculée", { id: "recalcul", description: relance ? "Nouvelle adresse : la lecture de marché (valeur locative, loyers, ventes…) se refait, quelques minutes." : undefined });
    },
    onError: (e) => toast.error(e?.message || "Recalcul impossible", { id: "recalcul", description: undefined }),
  });

  const enWorkflow = dealId || nouveau;
  // Un dossier venu d'un mandataire s'ouvre sur sa conversation ; l'analyse est
  // une autre page (`vue=analyse`), d'où l'on revient à la conversation.
  const { data: conversationsK } = useQuery({ queryKey: ["k-conversations"], queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"), refetchInterval: 20_000 });
  const conversationDuDeal = dealId ? (conversationsK?.conversations || []).find((x) => x.deal_id === dealId) || null : null;
  const vueConversation = !!conversationDuDeal && params.get("vue") !== "analyse";
  const changerVue = (v) => { const suivant = new URLSearchParams(params); if (v === "analyse") suivant.set("vue", "analyse"); else suivant.delete("vue"); setParams(suivant); };
  const aRelancer = pipeline?.a_relancer || 0;

  const nbDossiers = pipeline?.nb_dossiers ?? 0;
  // Tous les dossiers, en une seule liste, du plus récemment modifié au plus ancien (18 oct. 2026, Jules).
  // La page reçue est déjà filtrée et triée par le serveur.
  const tous = pipeline?.dossiers || [];
  // Les trois derniers ouverts (modifiés) en cartes, les autres en lignes dans l'ordre choisi.
  const ouvrirResponsables = (d) => {
    const actuels = (d.responsables?.length ? d.responsables : [String(d.responsable || "").split("@")[0]]).map((x) => ADMINS.find((a) => a.toLowerCase() === String(x).split(/[.\s]/)[0].toLowerCase()) || x).filter(Boolean);
    setProprio({ deal_id: d.deal_id, titre: d.titre, choix: actuels });
  };
  const qui = (d) => (d.responsables?.length ? d.responsables.join(", ") : (d.responsable || "—").split("@")[0]);
  // Le menu ⋯ d'un dossier : renommer, revenir à l'étape 1, abandonner. Un
  // clic ailleurs (ou Échap) le referme, comme les autres menus de la page.
  const MenuDossier = ({ d, bouton, place }) => {
    const ouvert = menuCarte === d.deal_id;
    const zone = useFermerAuClicAilleurs(ouvert, () => setMenuCarte(null));
    // Le menu est posé sur la page (portail, position fixe) : aucune carte voisine ni aucun cadre ne le recouvre ni ne le coupe (19 oct. 2026, Jules).
    const r = ouvert ? posMenu : null;
    return (
    <div ref={zone} className="contents">
    <button
      onClick={(e) => { e.stopPropagation(); const b = e.currentTarget.getBoundingClientRect(); setPosMenu({ bottom: b.bottom, right: b.right }); setMenuCarte(ouvert ? null : d.deal_id); }}
      className={`absolute ${bouton} text-ardoise hover:text-encre transition-colors max-md:-m-2.5 max-md:p-2.5`}
      aria-label="Actions" title="Actions" style={{ background: "transparent" }}
    >
      <MoreHorizontal className="w-4 h-4" />
    </button>
    {ouvert && r && createPortal(
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: "fixed", top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) }} className="z-[1000] rounded-[14px] border border-trait bg-surface-pleine py-1.5 min-w-[190px] shadow-[0_18px_40px_rgb(0_0_0/0.14)]">
        <button
          onClick={() => {
            setMenuCarte(null);
            const nom = window.prompt("Nouveau nom du dossier :", d.titre || "");
            if (nom?.trim()) renommer.mutate({ id: d.deal_id, nom: nom.trim() });
          }}
          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
        >
          <Pencil className="w-3.5 h-3.5" /> Renommer
        </button>
        <button
          onClick={() => {
            setMenuCarte(null);
            ouvrirResponsables(d);
          }}
          className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
        >
          <UserRound className="w-3.5 h-3.5" /> Changer le responsable
        </button>
        {(d.etape_max || 1) > 1 && (
          <button
            onClick={() => {
              setMenuCarte(null);
              if (window.confirm(`Ramener « ${d.titre} » à l'étape 1 ? Les documents et analyses sont conservés.`)) revenirEtape1.mutate(d.deal_id);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-craie hover:bg-encre/[0.06] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Revenir à l'étape 1
          </button>
        )}
        {d.statut !== "abandonne" && d.statut !== "projet_cree" && (
          <button
            onClick={() => {
              setMenuCarte(null);
              if (window.confirm(`Abandonner « ${d.titre} » ? Le dossier restera consultable.`)) abandonner.mutate(d.deal_id);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-alerte hover:bg-alerte/[0.08] transition-colors"
          >
            <Archive className="w-3.5 h-3.5" /> Abandonner
          </button>
        )}
        {d.statut !== "projet_cree" && (
          <button
            onClick={() => {
              setMenuCarte(null);
              if (window.confirm(d.origine === "mandataire" ? `Supprimer définitivement « ${d.titre} » ? Il disparaît avec ses pièces, le dossier du mandataire et toute sa conversation. Le mandataire ne le verra plus.` : `Supprimer définitivement « ${d.titre} » ? Il disparaît avec ses pièces, et sa fiche ne compte plus comme importée.`)) supprimer.mutate(d.deal_id);
            }}
            className="flex items-center gap-2.5 w-full px-3.5 py-2 text-[12.5px] text-alerte hover:bg-alerte/[0.08] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" /> Supprimer
          </button>
        )}
      </div>,
      document.body
    )}
    </div>
    );
  };

  // Plus de Mode IA / Normal (29 oct. 2026, Jules : « juste enlève les modes ») : le dossier est toujours en vue
  // normale. Seule l'Offre, éditeur de la lettre, garde son chat à gauche (28 oct. 2026).
  // Le chat à gauche, l'analyse à droite (2 nov. 2026, Jules : « on arrive, le chat est ouvert ») : à toutes les étapes.
  // Il se réduit en une fine colonne et se rouvre, sans jamais disparaître (même jour : « pas une croix où on ne peut
  // plus voir le chat ») ; la conversation reste. L'Offre garde toujours le sien en grand.
  const [chatReduit, setChatReduit] = useState(false);
  const [ongletAnalyse, setOngletAnalyse] = useState(null);
  // Chaque dossier s'ouvre chat ouvert, sauf sur sa Pré-analyse (5 nov. 2026, Jules : « lorsqu'on ouvre une fiche de
  // préanalyse, le chat de gauche doit être fermé de base ») : la première étape montrée décide, puis on choisit.
  // Le chat attend replié que le dossier dise sa première étape (pas d'ouverture puis de fermeture à l'écran).
  const ouverture = useRef(null);
  useEffect(() => { ouverture.current = dealId; setChatReduit(true); }, [dealId]);
  const surVue = (v) => {
    setVueDossier(v);
    if (!v || ouverture.current !== dealId) return;
    ouverture.current = null;
    // On arrive sur un dossier sans l'assistant, à toutes les étapes (12 nov. 2026, Jules : « on ne le voit pas
    // directement ; on peut l'ouvrir mais on n'est pas obligé ») : il reste replié jusqu'au clic sur son icône.
    setChatReduit(true);
  };
  const modeIA = true;
  const reduit = chatReduit && vueDossier !== "offre";
  // Fermer et ouvrir le panneau du chat, à gauche de la maison (2 nov. 2026, Jules : « enlève l'icône IA et mets l'icône
  // pour fermer et ouvrir le panneau à gauche de maison ») : un seul bouton, toujours au même endroit ; fermé, le chat
  // ne laisse plus de colonne, la conversation reste montée.
  const IconePanneau = chatReduit ? PanelLeftOpen : PanelLeftClose;
  const basculePanneau = (
    <button type="button" onClick={() => setChatReduit((r) => !r)} aria-label={chatReduit ? "Ouvrir l'assistant" : "Fermer l'assistant"} title={chatReduit ? "Ouvrir l'assistant" : "Fermer l'assistant"}
      className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise transition-colors hover:bg-rail-actif hover:text-encre" style={{ background: "transparent" }}><IconePanneau className="h-4 w-4" /></button>
  );
  // Les réglages du chat du dossier, comme sur la page Haka (18 oct. 2026, Jules) : sources « Auto » ou choisies.
  // Ni Répondre ni Produire dans ce petit chat : l'assistant choisit selon la demande (Jules, le même jour).
  const [sourcesChat, setSourcesChat] = useState([]);
  const [sourcesOuvert, setSourcesOuvert] = useState(false);
  const reglagesChat = useMemo(() => ({
    sources: sourcesChat, sortie: null, sourcesOuvert,
    onOuvrirSources: () => setSourcesOuvert((o) => !o), competence: null, eteintes: [], choisirCompetence: () => {},
    // Pendant une conversation, le chat pose ce panneau juste au-dessus de la saisie (18 oct. 2026, Jules) : le fil remonte, la barre du haut ne bouge pas.
    panneau: <PanneauSources sources={sourcesChat} onChange={setSourcesChat} />,
  }), [sourcesChat, sourcesOuvert]);
  // Le fond du cadre du dossier : celui que chacun a choisi, comme sur les autres pages (Layout) : le halo seulement
  // s'il l'a gardé, en sombre ; sinon la couleur de fond choisie, noir pur, anthracite… (12 nov. 2026, Jules).
  const { prefs } = usePersonnalisation();
  const avecHalo = !!prefs?.halo && themeEffectif(prefs) !== CLAIR;
  const glisse = useRef(false);
  const scinde = ecranLarge && !!dealId && !vueConversation && modeIA;
  // La largeur du chat, celle de l'Éditeur (components/editeur) : la ligne se tire, un double-clic la remet.
  const poignee = useLargeurChat("klocka.dossiers.largeur-chat");
  const { largeur: largeurChat, tire } = poignee;
  // L'Offre est le canevas de l'Éditeur (28 oct. 2026, Jules) : la lettre et sa barre sur toute la hauteur, sans marges.
  const enEditeur = scinde && vueDossier === "offre";
  useEffect(() => {
    if (!scinde) return undefined;
    const fin = setTimeout(() => { glisse.current = false; }, 900);
    // Sans « k-sobre » : le fond « Halo » reste, le même que sur Projets (18 oct. 2026, Jules).
    // Sans « k-sans-barre » : la barre de navigation reste à gauche du chat, repliée en rail (18 oct. 2026, Jules).
    document.documentElement.classList.add("k-sans-defilement", "k-sans-ak", "k-cadre-dossier");
    window.scrollTo(0, 0);
    return () => { clearTimeout(fin); document.documentElement.classList.remove("k-sans-defilement", "k-sans-ak", "k-cadre-dossier"); };
  }, [scinde]);

  // Le dossier s'affiche ici avec sa propre ligne de titre (le retour y est).
  const dossierOuvertIci = !vueConversation && !(nouveau && !dealId) && dossier?.deal_id === dealId && !!dealId;
  // Le contenu d'un dossier ouvert : à droite du chat sur grand écran, seul au téléphone.
  const contenuDossier = (
    <div className={`mx-auto ${large ? "max-w-none" : "max-w-[1500px]"}`}>
      {/* md:pr-14 : la marge du bouton Rappel, fixé dans le coin. Dans l'Éditeur, la barre du document suffit. */}
      {/* Le dossier ouvert porte « Tous les dossiers » sur la ligne de son nom (29 oct. 2026, Jules) ; ici, seulement ailleurs. */}
      <div className={`${enEditeur || (dossierOuvertIci && !conversationDuDeal) ? "hidden" : ""} mb-4 flex items-center justify-between gap-3 md:pr-14`}>
        {!dossierOuvertIci ? (
        <button
          onClick={() => montrerDeal(null)}
          className="text-ardoise hover:text-encre text-xs flex flex-none items-center gap-1.5 transition-colors max-md:min-h-[36px]"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Tous les dossiers
        </button>
        ) : <span />}
        {conversationDuDeal && (vueConversation ? (
          <button type="button" onClick={() => changerVue("analyse")}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol">
            Voir l'analyse <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button type="button" onClick={() => changerVue(null)}
            className="inline-flex h-9 min-w-0 items-center gap-2.5 rounded-full border border-bord-doux px-4 text-[13.5px] text-craie hover:border-bord-vif hover:text-encre" style={{ background: "transparent" }}>
            <MessagesSquare className="h-4 w-4 flex-none" /> <span className="truncate"><span className="max-md:hidden">Revenir à la conversation · </span>{conversationDuDeal.mandataire_nom}</span> <PointNouveau n={conversationDuDeal.non_lus} />
          </button>
        ))}
      </div>
      {vueConversation ? (
        <div className="flex h-[calc(100dvh-150px)] min-h-[560px] overflow-hidden rounded-[16px] border border-bord-doux bg-rail max-lg:h-auto max-lg:flex-col">
          <Conversation key={conversationDuDeal.id} c={conversationDuDeal} cote="klocka" />
          <Resume c={conversationDuDeal} cote="klocka" onAnalyse={() => changerVue("analyse")} />
        </div>
      ) : nouveau && !dealId ? (
        <WorkflowDeal
          dossier={null}
          onAnalyse={(d) => {
            setDossier(d);
            montrerDeal(d.deal_id);
            rafraichirListes();
          }}
        />
      ) : dossier?.deal_id === dealId ? (
        <>
        {/* Plus de carte derrière le dossier (2 nov. 2026, Jules : « enlève la card derrière toute la partie analyse ») : il est
            posé sur le fond de la page, comme les autres pages. Remplace la carte du 29 oct. */}
        <div>
        <WorkflowDeal
          dossier={dossierVu}
          enCours={majLot.isPending}
          onSaisie={(index, saisie) => setBrouillons((b) => ajouterAuBrouillon(b, index, saisie))}
          onRefresh={recharger}
          onLargeur={setLarge}
          onVue={surVue}
          onGrille={setOngletAnalyse}
          assistantAGauche={scinde}
          onOuvrirAssistant={ecranLarge ? (texte) => { setChatReduit(false); if (texte) setTimeout(() => window.dispatchEvent(new CustomEvent("klocka:lancer", { detail: { texte } })), 400); } : null}
          onRetour={() => montrerDeal(null)}
          avantRetour={scinde && vueDossier !== "offre" ? basculePanneau : null}
        />
        </div>
        {enAttente > 0 && createPortal(
          <div role="status" className="k-entree fixed bottom-6 left-1/2 z-[45] flex -translate-x-1/2 items-center gap-3 rounded-full border border-bord-doux bg-surface-pleine py-2 pl-5 pr-2 shadow-[0_18px_40px_rgb(0_0_0/0.22)] max-md:bottom-4 max-md:w-[calc(100vw-2rem)] max-md:justify-between">
            <span className="text-[13.5px] text-craie">{enAttente} champ{enAttente > 1 ? "s" : ""} modifié{enAttente > 1 ? "s" : ""}</span>
            <button type="button" onClick={() => setBrouillons({})} disabled={majLot.isPending} className="h-9 rounded-full px-3.5 text-[13.5px] text-ardoise transition-colors hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Annuler</button>
            <button type="button" onClick={validerBrouillon} disabled={majLot.isPending} className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-60">
              {majLot.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} OK, refaire la pré-analyse
            </button>
          </div>,
          document.body,
        )}
        </>
      ) : (
        // L'ouverture d'un dossier : l'animation Klocka, en grand au milieu (29 oct. 2026, Jules).
        <div className="k-entree flex min-h-[60vh] items-center justify-center" role="status">
          <Chargement taille="grand" titre="Ouverture du dossier" etats={["Les pièces et les grilles", "Les étapes du dossier", "J'affiche"]} />
        </div>
      )}
    </div>
  );

  if (scinde) {
    return (
      // Le cadre des Outils autour du dossier (12 nov. 2026, Jules : « la navbar remonte jusqu'en haut comme dans les
      // Outils ; à la place de la recherche, le titre du dossier, Projet et les deux icônes ; en haut à droite, retour
      // arrière et avant »). La bande du haut, de la couleur de la barre, ne fait qu'un bloc avec elle (k-cadre-dossier) ;
      // WorkflowDeal y pose son titre et ses gestes (#bande-dossier-titre, #bande-dossier-droite). Le fond de chacun,
      // halo compris, reste dans le cadre.
      <div className="flex h-[100dvh] flex-col overflow-hidden bg-rail text-encre">
      <header className="relative flex h-12 flex-none items-center justify-center px-4">
        {/* Les deux icônes (assistant, tous les dossiers) au-dessus du panneau des parties : le bord gauche du dossier. */}
        <div id="bande-dossier-gauche" className="absolute flex items-center gap-1" style={{ left: (reduit ? 0 : largeurChat) + 32, transition: tire ? undefined : "left 520ms cubic-bezier(0.22, 1, 0.36, 1)" }} />
        <div id="bande-dossier-titre" className="flex min-w-0 items-center gap-1.5" />
        {/* Les flèches au bord droit des tableaux (12 nov. 2026, Jules) : la marge du dossier (32 px) et celle de la colonne des étapes (56 px). */}
        <div id="bande-dossier-droite" className="absolute right-[88px] flex items-center gap-2" />
      </header>
      <div className={`k-page-presentation k-dossier-ia k-crm-contenu relative grid min-h-0 flex-1 overflow-hidden rounded-tl-[16px] ${glisse.current ? "" : "duration-500 ease-out animate-in fade-in-0"} ${tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${reduit ? 0 : largeurChat}px minmax(0,1fr)`, transition: tire ? undefined : "grid-template-columns 520ms cubic-bezier(0.22, 1, 0.36, 1)", transform: "translateZ(0)" }}>
        {/* `transform` : le halo, posé en `fixed` par FondHalo, se cale sur ce cadre et non sur l'écran. */}
        {avecHalo ? <FondHalo /> : <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 bg-fond" />}
        {/* À gauche, AK sur ce dossier, le design de Présentations : la question au centre, le chat en bas. */}
        <motion.div className="k-colonne-chat relative z-10 flex h-full min-h-0 min-w-0 flex-col overflow-hidden"
          initial={glisse.current ? { opacity: 0, x: -40 } : { opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: glisse.current ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}>
          {/* Ouvrir le chat (2 nov. 2026, Jules : « pas du haut en bas, juste que ça apparaisse de droite à gauche, plus
              smooth ») : le contenu garde sa largeur pendant que la colonne s'ouvre (le texte ne se replie plus ligne après
              ligne) et glisse de la droite vers sa place en fondu ; fermé, il reste monté, caché. */}
          <motion.div className="flex min-h-0 flex-1 flex-col px-5" style={{ width: largeurChat, minWidth: largeurChat }}
            initial={false} animate={reduit ? { opacity: 0, x: 28 } : { opacity: 1, x: 0 }}
            transition={reduit ? { duration: 0.2, ease: "easeOut" } : { duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden={reduit} inert={reduit ? "" : undefined}>
          {!chatOuvert && (
            <div className="flex min-h-0 flex-1 flex-col justify-center gap-6 overflow-y-auto py-6">
              <h1 className="m-0 text-center font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 28px)" }}>Une question sur ce dossier ?</h1>
              {/* Plus de cartes de compétences ici : la question et la saisie suffisent (18 oct. 2026, Jules). */}
            </div>
          )}
          <div className={chatOuvert ? "min-h-0 w-full flex-1" : "w-full flex-none pb-5"}>
            {!chatOuvert && <Depliant ouvert={sourcesOuvert}><div className="pb-4"><PanneauSources sources={sourcesChat} onChange={setSourcesChat} /></div></Depliant>}
            <ChatDashboard key={dealId} espace="dossier" onConversation={setChatOuvert} barreApercu={chatOuvert} reglages={reglagesChat}
              retour={{ libelle: "Tous les dossiers", onClick: () => montrerDeal(null) }}
              contexte={{ deal_id: dealId, etape: vueDossier, ...(vueDossier !== "offre" ? { onglet: vueDossier === "analyse" ? ongletAnalyse : vueDossier === "documents" ? "data_room" : null } : {}) }}
              onReponse={() => { recharger(); rafraichirListes(); if (vueDossier === "offre") { queryClient.invalidateQueries({ queryKey: ["offres"] }); queryClient.invalidateQueries({ queryKey: ["offre"] }); } }} />
          </div>
          </motion.div>
        </motion.div>
        {/* Le dossier comme en mode normal, à droite, séparé du chat par une fine ligne : plus de carte posée sur la page (18 oct. 2026, Jules). */}
        <motion.div className={`relative z-10 h-full min-h-0 min-w-0 ${enEditeur ? "overflow-hidden" : `overflow-y-auto px-8 py-8 ${vueDossier === "analyse" ? "lg:pt-0" : ""}`}`}
          initial={glisse.current ? { x: -largeurChat } : { opacity: 0 }} animate={{ x: 0, opacity: 1 }}
          transition={{ duration: glisse.current ? 0.7 : 0.5, ease: [0.65, 0, 0.35, 1] }}>
          {contenuDossier}
        </motion.div>
        {/* La ligne entre le chat et le dossier, celle de l'Éditeur : on la tire pour régler la largeur. */}
        {!reduit && <PoigneeEditeur {...poignee} />}
      </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen text-encre w-full max-w-full overflow-x-hidden">
      {/* Plus de lumière propre dans le coin : le fond « Halo » commun suffit (18 oct. 2026). */}
      <div
        key={`${dealId || (nouveau ? "nouveau" : "accueil")}-${modeIA ? "ia" : "normal"}`}
        // À l'Analyse d'un dossier, le panneau des parties part du haut de l'écran (12 nov. 2026, Jules).
        className={`px-5 py-6 md:px-10 md:py-9 ${enWorkflow && vueDossier === "analyse" ? "lg:!pt-0" : ""} animate-in fade-in slide-in-from-bottom-4 duration-700 ease-out`}
      >
        {enWorkflow ? (
          contenuDossier
        ) : (
          <div className="relative mx-auto max-w-[1400px]"
            onDragOver={(e) => { if (e.dataTransfer?.types?.includes("Files")) { e.preventDefault(); setSurvol(true); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setSurvol(false); }}
            onDrop={(e) => { e.preventDefault(); setSurvol(false); const f = e.dataTransfer?.files?.[0]; if (f && !analyserFiche.isPending) analyserFiche.mutate(f); }}>
            {survol && (
              <div className="pointer-events-none fixed inset-4 z-40 grid place-items-center rounded-[24px] border-2 border-dashed border-menthe bg-fond/80 text-[18px] text-encre backdrop-blur-sm duration-200 animate-in fade-in-0 md:left-[calc(var(--k-barre-largeur,0px)+16px)]">
                Lâche la fiche pour l'ajouter
              </div>
            )}
            {/* Le titre au centre, les onglets en pilule dessous, comme la Prospection. */}
            {/* Une seule ligne (30 oct. 2026, Jules) : les flèches et le titre à gauche, les gestes à droite. Plus d'absolu : avec
                Mandats, Mémoire, les relances et Nouveau dossier, le groupe passait sur un titre centré. */}
            <div className="k-entree mb-3.5 flex items-center gap-3">
              <FlechesHistorique />
              <TitrePage titre="Dossiers" nombre={pipeline?.total || null} className="min-w-0 flex-1 md:!pr-[112px]" actions={<>
                <LienMandats />
                <LienMemoire />
                <span className={`text-[13px] ${aRelancer ? "text-alerte" : "text-ardoise"}`}>{aRelancer} relance{aRelancer > 1 ? "s" : ""} en attente</span>
                <BoutonPrincipal onClick={() => setCreationOuverte(true)}><Plus className="w-4 h-4" /> Nouveau dossier</BoutonPrincipal>
              </>} />
            </div>

            {/* Recherche, et ce que fait la page toute seule. */}
            <div className="k-entree flex flex-wrap items-center gap-x-4 gap-y-3 pb-2" style={{ "--k-delai": ".1s" }}>
              <Recherche value={recherche} onChange={setRecherche} placeholder="Adresse, agent, ville" className="w-full md:w-[320px]" />
              {/* La fiche en cours d'analyse : l'orbe d'AK et un reflet qui passe sur la phrase (19 oct. 2026). */}
              {analyserFiche.isPending ? (
                <p key="analyse" className="k-entree m-0 inline-flex flex-1 items-center gap-2.5 text-[13px]" role="status">
                  <PenseeIA etat="working" taille={22} />
                  <span className="k-scintille">L'Assistant Klocka analyse la fiche…</span>
                </p>
              ) : (
                <p key="repos" className="k-entree m-0 flex-1 text-[13px] text-ardoise">Glisse une fiche n'importe où pour l'ajouter.</p>
              )}
            </div>

            {/* Les cartes */}
            <QuestionsMandataires />
            {isLoading ? (
              <div className="k-entree flex justify-center py-16">
                <PenseeIA etat="searching" taille={40} />
              </div>
            ) : nbDossiers === 0 ? (
              <p className="text-brume text-sm text-center py-16">
                Aucun dossier — créez le premier avec « Nouveau dossier ».
              </p>
            ) : (
              <div className="k-serie k-serie-leve grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2 lg:grid-cols-3">
                {tous.map((d) => <CarteCompacte key={d.deal_id} d={d} qui={qui(d)} ecarte={estEcarte(d)} onOuvrir={() => montrerDeal(d.deal_id)} menu={<MenuDossier d={d} bouton="top-3.5 right-3" place="top-9 right-3" />} />)}
                {!tous.length && <p className="m-0 col-span-full py-12 text-center text-[14px] text-brume">Aucun dossier ne correspond.</p>}
              </div>
            )}
            {!isLoading && <Pages page={page} total={pipeline?.total || 0} parPage={pipeline?.par_page || 20} onPage={setPage} />}
          </div>
        )}

        {/* Changer les responsables d'un dossier */}
        {proprio && (
          <div className="animate-in fade-in duration-200 fixed inset-0 z-[60] flex items-center justify-center bg-fond/60 px-4 backdrop-blur-sm" onClick={() => setProprio(null)}>
            <div className="w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto rounded-[18px] border border-trait bg-surface-pleine p-6 max-md:p-5 shadow-[0_24px_60px_rgb(0_0_0/0.18)]" onClick={(e) => e.stopPropagation()}>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="m-0 text-[17px] font-medium text-encre">Qui s'occupe du dossier ?</h3>
                <button onClick={() => setProprio(null)} className="text-ardoise hover:text-encre" aria-label="Fermer" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
              </div>
              <p className="m-0 mb-4 truncate text-[13px] text-ardoise">{proprio.titre}</p>
              <div className="mb-5 flex flex-wrap gap-2">
                {[...new Set([...ADMINS, ...proprio.choix])].map((a) => {
                  const actif = proprio.choix.includes(a);
                  return (
                    <button key={a} type="button"
                      onClick={() => setProprio((p) => ({ ...p, choix: actif ? p.choix.filter((x) => x !== a) : [...p.choix, a] }))}
                      className={`rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${actif ? "border-menthe bg-menthe/[0.12] text-encre" : "border-bord text-ardoise hover:border-bord-vif hover:text-encre"}`}
                      style={actif ? undefined : { background: "transparent" }}>
                      {a}
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end gap-2.5">
                <button onClick={() => setProprio(null)} className="rounded-full border border-bord px-4 py-2 text-[13.5px] text-craie hover:border-bord-vif" style={{ background: "transparent" }}>Annuler</button>
                <button onClick={() => changerResponsables.mutate({ id: proprio.deal_id, responsables: proprio.choix })} disabled={!proprio.choix.length || changerResponsables.isPending}
                  className="inline-flex items-center gap-2 rounded-full bg-menthe px-5 py-2 text-[13.5px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                  {changerResponsables.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Enregistrer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Nouveau dossier : nom + responsables */}
        {creationOuverte && (
          <div className="animate-in fade-in duration-200 fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4" onClick={() => setCreationOuverte(false)}>
            <div className="w-full max-w-md max-h-[calc(100dvh-32px)] overflow-y-auto bg-surface border border-trait rounded-lg p-6 max-md:p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="m-0 text-[18px] font-medium">Nouveau dossier</h3>
                <button onClick={() => setCreationOuverte(false)} aria-label="Fermer" title="Fermer" className="text-ardoise hover:text-encre transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <label className="block text-[11px] tracking-[0.14em] uppercase text-ardoise mb-1.5">Nom du dossier</label>
              <input
                autoFocus
                value={nomDossier}
                onChange={(e) => setNomDossier(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && nomDossier.trim()) creerDossier.mutate(); }}
                placeholder="Ex. : Boulangerie — Marseille République"
                className="w-full bg-surface border border-trait focus:border-menthe rounded-md px-3.5 py-2.5 text-[13.5px] text-encre outline-none placeholder:text-bord-vif transition-colors mb-4 max-md:text-[16px]"
              />

              <label className="block text-[11px] tracking-[0.14em] uppercase text-ardoise mb-1.5">Admins responsables</label>
              <div className="flex flex-wrap gap-2 mb-5">
                {ADMINS.map((a) => {
                  const actif = adminsChoisis.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => setAdminsChoisis((l) => (actif ? l.filter((x) => x !== a) : [...l, a]))}
                      className={`px-3.5 py-1.5 rounded-full text-[12.5px] border transition-colors
                        ${actif ? "bg-menthe/[0.15] border-menthe text-menthe-clair" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`}
                    >
                      {a}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-end gap-2.5">
                <button onClick={() => setCreationOuverte(false)}
                  className="bg-transparent border border-encre/[0.14] text-craie rounded-md px-4 py-2.5 text-[13.5px] font-semibold hover:bg-encre/[0.06] transition-colors">
                  Annuler
                </button>
                <button
                  onClick={() => creerDossier.mutate()}
                  disabled={!nomDossier.trim() || creerDossier.isPending}
                  className="inline-flex items-center gap-2 bg-menthe text-sur-menthe rounded-full px-5 py-2.5 text-[13.5px] font-semibold disabled:opacity-50 hover:bg-menthe-survol transition-colors"
                >
                  {creerDossier.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Création…</> : "Créer le dossier"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** La carte compacte d'un dossier dans les blocs de la liste : nom, étape de la frise, qui, ce qui attend. */

function CarteCompacte({ d, qui, onOuvrir, menu, ecarte = false }) {
  const n = etapeFrise(d);
  // Le verdict choisi par l'équipe, seul (10 nov. 2026, Jules : « je ne veux plus voir insuffisant ») ; sans choix, rien.
  const verdict = d.verdict_choisi ? VERDICTS[d.verdict_choisi] : null;
  return (
    <article className="relative cursor-pointer rounded-[12px] border border-trait k-carte-rail px-3.5 py-2.5 pr-9 transition-colors hover:border-bord-doux" onClick={onOuvrir}>
      <div className="flex min-w-0 items-center justify-between gap-2.5">
        <p className="m-0 flex min-w-0 items-center gap-2 text-[14.5px] text-encre"><span className="truncate" title={d.titre}>{d.titre || d.nom_fichier || d.deal_id}</span><PointNouveau n={d.fil_non_lus || 0} /></p>
        {ecarte ? <Statut couleur="corail" className="flex-none">{d.statut === "abandonne" ? "Abandonné" : "Écarté"}</Statut> : verdict && <Statut couleur={verdict.statut} className="flex-none">{verdict.libelle}</Statut>}
      </div>
      <p className="m-0 mt-0.5 flex min-w-0 items-center gap-x-1.5 text-[13px] text-ardoise">
        {!ecarte && <span className="flex-none">{FRISE[n - 1].label} ·</span>}
        <span className="truncate">{qui}</span>
        {d.origine === "mandataire" && <Statut couleur="lavande" className="flex-none">K Partners</Statut>}
      </p>
      {d.pourquoi && <p className="m-0 mt-1 flex items-center gap-1.5 text-[12.5px] text-ambre">{d.a_relancer && <Clock className="h-3 w-3" />}{d.pourquoi}</p>}
      <span onClick={(e) => e.stopPropagation()}>{menu}</span>
    </article>
  );
}

/** La Mémoire Klocka (30 oct. 2026) : les fiches des biens gardées, à côté des Mandats. */
function LienMemoire() {
  const { data } = useQuery({ queryKey: ["memoire-compte"], queryFn: () => base44.request("GET", "/api/memoire?limite=1"), staleTime: 60_000, retry: false });
  return (
    <Link to="/Memoire" className={CLASSE_OUTIL}>
      Mémoire{data?.total > 0 && <span className="tabular-nums text-ardoise">{data.total}</span>}
    </Link>
  );
}

/** Les mandats reçus des mandataires (27 oct. 2026) : la page Mandats, avec ce qui attend Klocka. */
function LienMandats() {
  const { data } = useQuery({ queryKey: ["k-mandats"], queryFn: () => base44.request("GET", "/api/mandataire/admin/mandats"), refetchInterval: 60_000 });
  const n = (data?.a_faire || 0);
  return (
    <Link to="/Mandats" className={CLASSE_OUTIL}>
      Mandats{n > 0 && <span className="tabular-nums text-ambre">{n} à traiter</span>}<PointNouveau n={data?.non_lus || 0} />
    </Link>
  );
}

/**
 * Les mandataires qui écrivent à propos d'un bien pas encore transféré : il
 * n'a pas d'analyse, seulement sa conversation. Repliées par défaut : un
 * libellé discret, avec le nombre de non-lus, les ouvre.
 */
function QuestionsMandataires() {
  const { data } = useQuery({ queryKey: ["k-conversations"], queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"), refetchInterval: 20_000 });
  const [ouvert, setOuvert] = useState(false);
  const sansDossier = (data?.conversations || []).filter((c) => !c.deal_id);
  if (!sansDossier.length) return null;
  const nonLus = sansDossier.reduce((s, c) => s + (c.non_lus || 0), 0);
  const quand = (iso) => {
    if (!iso) return "";
    const t = new Date(iso);
    const hier = new Date(Date.now() - 86400000);
    if (t.toDateString() === new Date().toDateString()) return t.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    if (t.toDateString() === hier.toDateString()) return "hier";
    return t.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  };
  const initiales = (n = "") => String(n).split(/[\s.@]+/).filter(Boolean).map((x) => x[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <div className="pt-6">
      <button type="button" onClick={() => setOuvert((v) => !v)} aria-expanded={ouvert}
        className="inline-flex items-center gap-2 border-0 bg-transparent p-0 text-[13px] text-ardoise transition-colors hover:text-encre">
        {ouvert ? "Masquer les dossiers mandataires" : `Voir les dossiers mandataires (${sansDossier.length})`}
        {!ouvert && nonLus > 0 && <PointNouveau n={nonLus} />}
      </button>
      {ouvert && (
      <div className="k-serie k-serie-leve mt-3 grid grid-cols-1 gap-[18px] sm:grid-cols-2 lg:grid-cols-3">
        {sansDossier.map((c) => (
          <Link key={c.id} to={`/Conversations?dossier=${c.id}`}
            className="flex items-center gap-3.5 rounded-[16px] border border-trait k-carte-rail px-4 py-3.5 transition-colors hover:border-bord-doux">
            <span className="grid h-9 w-9 flex-none place-items-center rounded-full bg-relief text-[12px] font-semibold text-craie">{initiales(c.mandataire_nom)}</span>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex justify-between gap-2"><span className="truncate text-[15px] font-medium text-encre">{String(c.bien).replace(/\s*\(.*?\)\s*/g, " ").trim()}</span><span className="flex-none text-[12px] text-brume">{quand(c.activite)}</span></span>
              <span className="truncate text-[13px] text-ardoise">{c.mandataire_nom}{c.dernier?.texte ? ` · ${c.dernier.texte}` : ""}</span>
            </span>
            {c.non_lus > 0 ? <PointNouveau n={c.non_lus} /> : <span className="h-2 w-2 flex-none" />}
          </Link>
        ))}
      </div>
      )}
    </div>
  );
}


/** Un écran assez large pour le chat et le dossier côte à côte. */
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
