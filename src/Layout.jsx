import Cloche, { ouvrirCloche, useNonLuesMandataire } from "@/components/haka/Cloche";
import PopupFicheRecue from "@/components/haka/PopupFicheRecue";
import { precharger } from "@/lib/precharger";
import MarqueKlocka from "@/components/MarqueKlocka";
import LogoKP from "@/components/mandataire/LogoKP";
import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import BottomTabs from "@/components/mobile/BottomTabs";
import NotificationsApp from "@/components/NotificationsApp";
import {
  BookUser,
  Contact,
  LayoutDashboard,
  Wrench,
  Workflow,
  LayoutTemplate,
  Magnet,
  Building2,
  Calculator,
  BookOpen,
  Users,
  LogOut,
  Brain,
  ClipboardCheck,
  Eye,
  MessageSquare,
  Lightbulb,
  UserPlus,
  Search,
  Sparkles,
  Activity,
  Presentation,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  Globe,
  Mic, Compass, Smartphone, Lock, PhoneCall, Palette, Settings, Handshake, ShieldCheck, Folder, Phone, PanelLeft, MapPin, FileSignature, CircleUser, MessagesSquare, Mail, Radar, CalendarDays, Landmark, Bell, LibraryBig, ChartColumn, FileSpreadsheet } from "lucide-react";
import RechercheRapide from "@/components/RechercheRapide";
import ApercuTelephone, { estApercuTelephone } from "@/components/ApercuTelephone";
import { PAGES_KDATA } from "@/lib/kdata-modules";
import CadreOutils from "@/components/kdata/CadreOutils";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, definirEspace, themeEffectif } from "@/lib/personnalisation";
import { ENTREES_ADMIN, ENTREES_AUTRE, ENTREES_CLIENT, ENTREES_MANDATAIRE, groupeDe, masquesDe, menuAdmin, menuMandataire, repartir } from "@/lib/menu";
import { allerAuBonDomaine, apercuInitial, choisirApercu } from "@/lib/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProvider, useUser } from "@/components/providers/UserProvider";
import VeilleAlx from "@/components/alx/VeilleAlx";
import AssistantFlottant from "@/components/AssistantFlottant";
import FeedbackSurvol from "@/components/FeedbackSurvol";
import RappelEntrant, { BoutonRappel } from "@/components/RappelEntrant";
import { BoutonTesteur } from "@/components/AgentTesteur";
import FondHalo from "@/components/projet/FondHalo";

const globalTooltipStyles = `
  [role="tooltip"],
  [data-state="delayed-open"],
  [data-radix-popper-content-wrapper] [role="tooltip"],
  .recharts-tooltip-wrapper {
    --tooltip-bg: rgb(var(--k-surface-pleine-rgb)) !important;
    --tooltip-text: rgb(var(--k-encre-rgb)) !important;
  }
  [role="tooltip"] {
    background-color: rgb(var(--k-surface-pleine-rgb)) !important;
    color: rgb(var(--k-encre-rgb)) !important;
    border: 1px solid var(--k-bord) !important;
  }
  [data-radix-popper-content-wrapper] {
    z-index: 50;
  }
  .recharts-tooltip-wrapper .recharts-default-tooltip {
    background-color: rgb(var(--k-surface-pleine-rgb)) !important;
    border: 1px solid var(--k-bord) !important;
    border-radius: 8px !important;
  }
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-label,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item-name,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item-value {
    color: rgb(var(--k-encre-rgb)) !important;
  }
`;

/**
 * La bascule du thème. Klocka s'ouvre en sombre ; ce bouton passe au clair et
 * s'en souvient. Il ne touche qu'un attribut sur <html> : tout le reste suit
 * par les variables de couleur.
 */
/**
 * Un lien du rail. Au niveau du module, pas dans le rendu : un type stable,
 * React ne remonte plus chaque lien à chaque rendu, et les transitions de
 * survol et de page active jouent au lieu d'être coupées net.
 */
/** Une page fermée : on sait qu'elle existe, et à qui la demander. */
function AccesReserve() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full border border-trait text-ardoise"><Lock className="h-5 w-5" strokeWidth={1.7} /></span>
      <p className="m-0 text-[18px] text-encre">Accès réservé</p>
      <p className="m-0 max-w-[380px] text-[14px] text-ardoise">Cette page ne vous est pas ouverte pour l'instant. Demandez à Jules s'il vous la faut.</p>
    </div>
  );
}

function LienRail({ details, replie, onNaviguer, e, cle = e.cle, to, icon, label = e.label, actif, badge = null, badgeColor, ferme = false }) {
  const d = details[cle] || {};
  const Icone = icon || d.icon;
  const ici = actif ?? d.actif;
  const pastille = badge ?? d.badge;
  if (!Icone) return null;
  // Une entrée externe (le CRM) : un vrai lien, dans un nouvel onglet.
  const Lien = d.href ? "a" : Link;
  const cible = d.href ? { href: d.href, target: "_blank", rel: "noopener noreferrer" } : { to: to || d.to };
  return (
    <Lien
      {...cible}
      onClick={onNaviguer}
      // Au survol, la page se télécharge déjà : le clic l'ouvre sans attendre (21 oct. 2026).
      onMouseEnter={() => precharger(cle)}
      onFocus={() => precharger(cle)}
      data-actif={ici ? "1" : undefined}
      title={ferme ? `${label} : accès réservé` : replie ? label : undefined}
      aria-label={ferme ? `${label}, accès réservé` : label}
      className={`relative flex items-center rounded-[10px] transition-colors ${replie ? "mx-auto h-9 w-9 justify-center" : "h-9 gap-2.5 px-3"} ${ici ? "bg-rail-actif text-encre" : "text-ardoise hover:bg-rail-actif hover:text-encre"}`}
    >
      <Icone className="h-[17px] w-[17px] flex-none" strokeWidth={1.7} />
      {!replie && <span className={`flex-1 truncate text-[15px] ${ferme ? "opacity-60" : ""}`}>{label}</span>}
      {/* Une page que Jules n'a pas ouverte à ce compte : un cadenas à droite du texte. */}
      {ferme && (replie ? <Lock className="absolute -right-0.5 -top-0.5 h-3 w-3 text-brume" strokeWidth={2} /> : <Lock className="h-3.5 w-3.5 flex-none text-brume" strokeWidth={1.8} />)}
      {pastille ? (
        replie
          ? <span className={`k-rail-pastille ${badgeColor || d.badgeColor || "bg-rail-actif text-craie"}`}>{pastille}</span>
          : <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${badgeColor || d.badgeColor || "bg-rail-actif text-craie"}`}>{pastille}</span>
      ) : null}
    </Lien>
  );
}

function BasculeKData({ enKData, onChanger }) {
  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <span className={`text-[12.5px] transition-colors ${enKData ? "text-brume" : "font-medium text-encre"}`}>Klocka</span>
      <Switch checked={enKData} onCheckedChange={onChanger} className="flex-shrink-0" aria-label="Basculer entre Klocka et Outils" />
      <span className={`text-[12.5px] transition-colors ${enKData ? "font-medium text-encre" : "text-brume"}`}>Outils</span>
    </div>
  );
}

// Onglet Double Check masqué du menu. La page /AdminBrouillons reste en place et
// accessible par son URL : passez ce drapeau à true pour la remontrer.
const AFFICHER_DOUBLE_CHECK = false;

// Marque Klocka : monogramme officiel + capitales espacées
function Wordmark({ collapsed = false }) {
  if (collapsed) {
    return <img src="/logo-klocka.svg" alt="Klocka" className="w-7 h-7 rounded-[6px] select-none" draggable={false} />;
  }
  return (
    <span className="flex items-center gap-2.5 select-none">
      <img src="/logo-klocka.svg" alt="" className="w-6 h-6 rounded-[5px]" draggable={false} />
      <span className="text-[12.5px] tracking-[0.3em] text-encre">KLOCKA</span>
    </span>
  );
}

// Pages that are "child" pages (show back button on mobile)
const CHILD_PAGES = ['ProjetDetail', 'MonCompte', 'Questionnaire', 'Vision', 'SimulateurRentabilite', 'Comparateur', 'Ressources'];

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  // Ce que la personne a réglé dans Personnalisation : thème, halo, barre
  // latérale, entrées du menu.
  const { prefs } = usePersonnalisation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // La barre latérale est toujours repliée en rail d'icônes, sur toutes les pages (31 oct. 2026, Jules : « toujours
  // fermée, dès qu'on passe la souris dessus ça s'ouvre »). Plus de réglage ni de bouton pour la déplier.
  const sidebarCollapsed = true;
  // La recherche (⌘K) : projets et dossiers, de n'importe quelle page.
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  useEffect(() => {
    const clavier = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setRechercheOuverte((v) => !v); } };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, []);
  // Repliée, la barre s'ouvre au survol (31 oct. 2026, Jules : « pas besoin de cliquer ») : par-dessus la page, sans la
  // décaler, et se replie quand la souris sort. Un court délai évite qu'elle s'ouvre en passant le long du bord.
  const [survolBarre, setSurvolBarre] = useState(false);
  const minuterieBarre = useRef(null);
  const survolerBarre = (oui) => {
    clearTimeout(minuterieBarre.current);
    minuterieBarre.current = setTimeout(() => setSurvolBarre(oui), oui ? 120 : 200);
  };
  useEffect(() => () => clearTimeout(minuterieBarre.current), []);
  const barreOuverteAuSurvol = sidebarCollapsed && survolBarre;
  // La largeur de la barre, dite à la page : la bulle de l'assistant posée à
  // gauche (Personnalisation) se place à côté de la barre, pas dessus.
  const largeurBarre = sidebarCollapsed ? "64px" : "228px";
  useEffect(() => {
    document.documentElement.style.setProperty("--k-barre-largeur", largeurBarre);
    return () => document.documentElement.style.removeProperty("--k-barre-largeur");
  }, [largeurBarre]);
  // La vue choisie par un admin : la sienne, celle d'un client, celle d'un mandataire.
  const [apercu, setApercu] = useState(apercuInitial);
  const [autreOpen, setAutreOpen] = useState(false);
  const isChildPage = CHILD_PAGES.includes(currentPageName);

  // Alexis : la page secrète se visite sans barre latérale — rien ne doit y mener.
  const pagesWithoutNavbar = ['Questionnaire', 'Home', 'Alexis'];

  useEffect(() => { choisirApercu(apercu); }, [apercu]);
  // La vue mandataire est un aperçu : être mandataire se décide sur la page Équipe (10 oct. 2026), plus par ce menu.

  const isAdmin = user?.role === "admin";
  // Les pages que Jules n'a pas ouvertes à ce compte (acces-pages.js côté serveur).
  const pagesFermees = isAdmin ? user?.pages_fermees || [] : [];
  const vue = isAdmin ? apercu : user?.role === "mandataire" ? "mandataire" : "client";
  // Le bon domaine pour la vue (12 nov. 2026, Jules) : un mandataire, ou un admin en vue mandataire, sur
  // app.kpartners.immo ; le reste sur app.klocka.immo. Le passage garde la connexion et la page (server/domaines.js).
  // Tant que le domaine K Partners n'est pas branché, `domaines.kpartners` est vide et rien ne bouge.
  useEffect(() => { allerAuBonDomaine(user, vue, (...a) => base44.request(...a)); }, [user, vue]);
  // Les notifications non lues du mandataire : sur le hamburger au téléphone (1er nov. 2026, Jules).
  const nonLues = useNonLuesMandataire(vue === "mandataire");
  // La couleur d'accent suit l'espace : K Partners (pervenche) côté mandataire.
  useEffect(() => { definirEspace(vue); }, [vue]);
  // Ce qui relève de l'équipe (relances, dossiers, assistant, recherche) ne
  // suit que la vue admin : un admin qui regarde la vue mandataire ou client
  // voit exactement ce que voit un mandataire ou un client.
  const vueAdmin = vue === "admin";
  // La vue dite à la racine (30 oct. 2026, Jules) : dans le Mandataire, plus de jaune ; `ambre` et `jaune`
  // y prennent le sable des notes de l'IA de l'Analyse (`lu-ia`, index.css), fenêtres et menus compris.
  useEffect(() => {
    document.documentElement.dataset.vue = vue;
    return () => { delete document.documentElement.dataset.vue; };
  }, [vue]);
  // L'agent testeur : un outil de super admin, qu'il peut masquer dans Personnalisation (12 oct. 2026).
  // L'agent testeur retiré de l'écran le 16 oct. 2026 (Jules) : ni bouton, ni onglet dans le Suivi.
  const testeurVisible = false;
  // « Il me rappelle » (8 oct. 2026) : sur chaque page de l'équipe qui prospecte (Prospection ouverte).
  const rappelOuvert = vueAdmin && !pagesFermees.includes("Prospection");
  // Le bouton « Rappel » n'a rien à faire sur la page Analyse (16 oct. 2026, Jules) ; un rappel en cours y reste visible.
  // Plus d'icône Rappel nulle part (10 nov. 2026, Jules) ; l'écran d'appel et le bandeau « Rappel à terminer » restent.
  const boutonRappel = false;
  // Ce qui est en retard suit l'admin de page en page : sans ce compteur, un
  // rappel dû n'existe que si l'on retourne au tableau de bord.
  const { data: attend } = useQuery({
    queryKey: ["ce-qui-attend"],
    queryFn: () => base44.request("GET", "/api/assistant/attend"),
    enabled: vueAdmin,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
  const enRetard = vueAdmin ? attend?.en_retard || 0 : 0;
  // ALX suit de même : les cibles à appeler cette semaine, en pastille.
  const { data: alx } = useQuery({
    queryKey: ["alx-etat"],
    queryFn: () => base44.request("GET", "/api/alx/etat"),
    enabled: vueAdmin,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const alxAFaire = vueAdmin ? alx?.a_faire?.a_appeler || 0 : 0;
  // L'Intelligence : les faits qui attendent la validation, en pastille.
  const { data: layer } = useQuery({
    queryKey: ["layer", "etat"],
    queryFn: () => base44.request("GET", "/api/layer/etat"),
    enabled: vueAdmin,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const layerAValider = vueAdmin ? layer?.a_valider || 0 : 0;
  // Haka (17 oct. 2026) : ce qui attend dans À valider ; l'entrée du menu n'existe que si Haka est allumé.
  const { data: haka } = useQuery({ queryKey: ["haka-compte"], queryFn: () => base44.request("GET", "/api/haka/propositions/compte"), enabled: vueAdmin, refetchInterval: 60 * 1000, staleTime: 30 * 1000, retry: false });
  const hakaActif = !!haka?.actif;
  const hakaAValider = vueAdmin && hakaActif ? (haka?.moi || 0) + (haka?.commun || 0) : 0;
  // Les messages des mandataires qui attendent une réponse, et de l'autre
  // côté ceux de Klocka que le mandataire n'a pas lus.
  const { data: conversations } = useQuery({
    queryKey: ["k-conversations"],
    queryFn: () => base44.request("GET", "/api/mandataire/admin/conversations"),
    enabled: vueAdmin,
    refetchInterval: 60 * 1000,
    staleTime: 20 * 1000,
  });
  const { data: dossiersMandataire } = useQuery({
    queryKey: ["m-dossiers"],
    queryFn: () => base44.request("GET", "/api/mandataire/dossiers"),
    enabled: vue === "mandataire",
    refetchInterval: 60 * 1000,
    staleTime: 20 * 1000,
  });
  const nonLusKlocka = vueAdmin ? conversations?.non_lus || 0 : 0;
  const nonLusMandataire = vue === "mandataire" ? (dossiersMandataire?.dossiers || []).reduce((n, d) => n + (d.fil_non_lus || 0), 0) : 0;
  // Tout ce qui n'est pas la vue admin cache l'arrière-boutique.
  const showClientView = vue !== "admin";
  const hideNavbar = pagesWithoutNavbar.includes(currentPageName);
  // Le halo : le fond de l'application, posé ici une fois derrière toutes
  // les pages, dont les surfaces sont du verre. La nav s'efface pour le
  // laisser passer, floutant ce qui défile derrière elle.
  //
  // Deux exceptions. L'atelier ALX garde son noir sur son accueil, qui fait
  // tenir ses cartes ; la carte d'un investisseur et la page d'une ville sont
  // des pages de travail comme les autres, et reçoivent le halo. La page ALX
  // de la prospection off-market a le même fond que Prospection. Le dashboard
  // admin le reçoit aussi (5 oct.) : sans lui, il restait sur la couleur de
  // base, les halos sauge du salut ne couvrant que le haut de la page.
  //
  // En clair, pas de halo du tout : le fond est blanc, sans dégradé. En
  // sombre, Personnalisation peut l'éteindre. La bascule du thème est dans la
  // barre latérale et dans la barre du haut de K-Data ; elle écrit la
  // préférence, qui suit le compte.
  const clair = themeEffectif(prefs) === CLAIR;
  const fondHalo = !hideNavbar
    && !clair
    && prefs.halo
    && !(currentPageName === "ALXAtelier" && !["carte", "ville"].some((c) => new URLSearchParams(location.search).has(c)));

  // Les chemins se comparent sans la casse : « /Analyse » et « /analyse »
  // sont la même page, et le lien Dossiers pointe sur le premier.
  const isActivePage = (pageName) => {
    const pageUrl = createPageUrl(pageName).toLowerCase();
    const ici = location.pathname.toLowerCase();
    return ici === pageUrl || ici === pageUrl + '/';
  };

  const closeMobile = () => setIsMobileMenuOpen(false);
  // Le tiroir ouvert, la page derrière ne défile plus sous le doigt.
  useEffect(() => {
    if (!isMobileMenuOpen) return undefined;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [isMobileMenuOpen]);
  // Le clavier du téléphone : iOS ne réduit pas la page quand il sort, il la
  // recouvre. Sa hauteur, dite en variable, laisse le chat poser sa barre
  // juste au-dessus. Zéro au bureau, où rien ne la lit.
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return undefined;
    const mesurer = () => {
      // Un zoom au pincement réduit aussi la vue : ce n'est pas le clavier.
      const h = vv.scale > 1.01 ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height));
      document.documentElement.style.setProperty("--k-clavier", `${h > 80 ? h : 0}px`);
    };
    mesurer();
    vv.addEventListener("resize", mesurer);
    return () => { vv.removeEventListener("resize", mesurer); document.documentElement.style.removeProperty("--k-clavier"); };
  }, []);

  // On est dans K-Data dès que la page ouverte est son tableau de bord ou
  // l'un de ses modules. Ce n'est pas un lien de plus dans le menu : c'est un
  // autre espace, qui échange la barre latérale de Klocka contre sa propre
  // barre du haut.
  const enKData = PAGES_KDATA.some((p) => isActivePage(p));
  // Une page K-Data ouverte dans un cadre — la fenêtre de lecture d'un
  // dossier — ne montre que l'analyse : ni barre du haut, ni déconnexion,
  // ni menu des applications, qui n'ont aucun sens dans une fenêtre qu'on
  // regarde puis qu'on ferme.
  // Le mode téléphone ouvre l'app dans un cadre : elle s'y affiche comme sur
  // un vrai téléphone, pas comme une page intégrée ailleurs.
  const dansUnCadre = typeof window !== "undefined" && window.self !== window.top;
  const enCadre = dansUnCadre && !estApercuTelephone();
  const [apercuTelephone, setApercuTelephone] = useState(false);
  // Paramètres › Affichage › Mode téléphone ouvre le cadre (24 oct. 2026).
  useEffect(() => {
    const ouvrir = (e) => setApercuTelephone(e?.detail?.depart || true);
    window.addEventListener("klocka:mode-telephone", ouvrir);
    return () => window.removeEventListener("klocka:mode-telephone", ouvrir);
  }, []);
  // Les Outils gardent la barre de navigation de Klocka (10 nov. 2026, Jules : K-Vacance le matin, tous les outils
  // l'après-midi, planche « Outils dans le cadre du CRM ») : plus de barre du haut à part. Dans la fenêtre d'un dossier,
  // un outil reste seul, sans barre.
  const modoKData = enKData && vueAdmin && !hideNavbar && enCadre;
  // Le cadre de /CRM autour de toutes les pages Outils, K-Vacance comprise (10 nov. 2026, Jules : « toutes les pages »
  // comme le tableau de bord).
  const cadreOutils = enKData && vueAdmin && !hideNavbar && !enCadre;


  // Ce que chaque entrée du menu dessine : son lien, son icône, sa pastille.
  // La liste et son ordre d'origine vivent dans src/lib/menu.js ; l'ordre
  // et les masques choisis dans Personnalisation s'appliquent au rendu.
  const DETAILS = {
    // « Dashboard » ouvre le Dashboard pour tous (16 oct. 2026, Jules : il ne renvoie plus aux Projets, qui ont leur entrée).
    Dashboard: { to: createPageUrl("Dashboard"), icon: LayoutDashboard, actif: isActivePage("Dashboard"), badge: enRetard || null, badgeColor: "bg-alerte text-white" },
    Semaine: { to: createPageUrl("Semaine"), icon: CalendarDays, actif: isActivePage("Semaine") },
    AdminProjets: { to: createPageUrl("AdminProjets"), icon: Building2, actif: isActivePage("AdminProjets") },
    AValider: { to: createPageUrl("AValider"), icon: ClipboardCheck, actif: isActivePage("AValider"), badge: hakaAValider || null, badgeColor: "bg-menthe text-sur-menthe" },
    Analyse: { to: "/Dossiers", icon: Folder, actif: isActivePage("Analyse") || isActivePage("ConversationsMandataires") || isActivePage("MandatsMandataires") || isActivePage("MemoireKlocka"), badge: nonLusKlocka || null, badgeColor: "bg-menthe text-sur-menthe" },
    Prospection: { to: createPageUrl("Prospection"), icon: Phone, actif: isActivePage("Prospection") },
    OffMarket: { to: createPageUrl("OffMarket"), icon: Radar, actif: isActivePage("OffMarket") },
    Cerveau: { to: createPageUrl("Cerveau"), icon: Brain, actif: isActivePage("Cerveau"), badge: layerAValider || null, badgeColor: "bg-rail-actif text-craie" },
    ALX: { to: "/ALX", icon: Compass, actif: isActivePage("ALX") || isActivePage("ALXAtelier") || isActivePage("ALXVilles") || isActivePage("ALXCible") || isActivePage("ALXBilan"), badge: alxAFaire || null, badgeColor: "bg-rail-actif text-craie" },
    // Suivi : l'usage de la plateforme et ce que coûte chaque geste, deux onglets d'une même page.
    SuiviActivite: { to: "/SuiviActivite", icon: ChartColumn, actif: isActivePage("SuiviActivite") },
    MandataireTableauDeBord: { to: createPageUrl("MandataireTableauDeBord"), icon: ChartColumn, actif: isActivePage("MandataireTableauDeBord") },
    Monitoring: { to: "/Suivi", icon: Activity, actif: isActivePage("Monitoring") || isActivePage("SuiviHaka") || isActivePage("CoutsIA") || isActivePage("SuiviAppels") || isActivePage("SuiviMandataires") || isActivePage("SuiviTesteur") || isActivePage("SuiviChat") || isActivePage("SuiviReunion") },
    AdminSuggestions: { to: createPageUrl("AdminSuggestions"), icon: Lightbulb, actif: isActivePage("AdminSuggestions") },
    Feedback: { to: createPageUrl("Feedback"), icon: Lightbulb, actif: isActivePage("Feedback") },
    SimulateurRentabilite: { to: createPageUrl("SimulateurRentabilite"), icon: Calculator, actif: isActivePage("SimulateurRentabilite") },
    AdminClients: { to: createPageUrl("AdminClients"), icon: BookUser, actif: isActivePage("AdminClients") },
    // Le CRM (Twenty), dans Klocka depuis le 5 nov. 2026 : la page /CRM, plus d'onglet dehors.
    KData: { to: createPageUrl("Outils"), icon: Wrench, actif: enKData },
    CRM: { to: createPageUrl("CrmTwenty"), icon: Globe, actif: isActivePage("CrmTwenty") },
    AdminUtilisateurs: { to: createPageUrl("AdminUtilisateurs"), icon: Users, actif: isActivePage("AdminUtilisateurs") },
    Automatismes: { to: createPageUrl("Automatismes"), icon: Workflow, actif: isActivePage("Automatismes") },
    // Modèles (26 oct. 2026) : les documents de Klocka et de K Partners, remplis avec un exemple.
    AdminModeles: { to: createPageUrl("AdminModeles"), icon: LayoutTemplate, actif: isActivePage("AdminModeles") },
    AdminAccesCrm: { to: createPageUrl("AdminAccesCrm"), icon: Lock, actif: isActivePage("AdminAccesCrm") },
    Agents: { to: createPageUrl("Agents"), icon: Contact, actif: isActivePage("Agents") },
    // Offres : les lettres d'intention d'achat, rédigées au chat.
    Offres: { to: createPageUrl("Offres"), icon: FileSignature, actif: isActivePage("Offres") },
    AdminBanque: { to: createPageUrl("AdminBanque"), icon: Landmark, actif: isActivePage("AdminBanque") },
    // Tokimo (6 nov. 2026) : l'analyse des opérations présentées à Tokimo.
    Tokimo: { to: createPageUrl("Tokimo"), icon: FileSpreadsheet, actif: isActivePage("Tokimo") },
    // Emailing : les séquences des leads et les mails de la plateforme (Resend).
    Emailing: { to: createPageUrl("Emailing"), icon: Mail, actif: isActivePage("Emailing") },
    AdminPresentations: { to: "/Presentations", icon: Presentation, actif: isActivePage("AdminPresentations") },
    AdminLeadMagnets: { to: createPageUrl("AdminLeadMagnets"), icon: Magnet, actif: isActivePage("AdminLeadMagnets") },
    AdminRessources: { to: createPageUrl("AdminRessources"), icon: BookOpen, actif: isActivePage("AdminRessources") },
    AdminPortail: { to: createPageUrl("AdminPortail"), icon: UserPlus, actif: isActivePage("AdminPortail") },
    AdminEquipe: { to: createPageUrl("AdminEquipe"), icon: Users, actif: isActivePage("AdminEquipe") },
    AdminMandataires: { to: createPageUrl("AdminMandataires"), icon: MapPin, actif: isActivePage("AdminMandataires") },
    MandataireProspection: { to: createPageUrl("MandataireProspection"), icon: MapPin, actif: isActivePage("MandataireProspection") },
    MandataireClients: { to: createPageUrl("MandataireClients"), icon: Users, actif: isActivePage("MandataireClients") },
    MandataireDocuments: { to: createPageUrl("MandataireDocuments"), icon: LibraryBig, actif: isActivePage("MandataireDocuments") },
    MandataireBiens: { to: createPageUrl("MandataireBiens"), icon: Folder, actif: ["MandataireBiens", "MandataireEstimation", "MandataireMandat", "MandataireDossier", "MandataireMarche"].some(isActivePage), badge: nonLusMandataire || null, badgeColor: "bg-menthe text-sur-menthe" },
    MandataireEstimation: { to: createPageUrl("MandataireEstimation"), icon: Calculator, actif: isActivePage("MandataireEstimation") },
    MandataireMandat: { to: createPageUrl("MandataireMandat"), icon: FileSignature, actif: isActivePage("MandataireMandat") },
    MandataireDossier: { to: createPageUrl("MandataireDossier"), icon: Folder, actif: isActivePage("MandataireDossier"), badge: nonLusMandataire || null, badgeColor: "bg-menthe text-sur-menthe" },
    ConversationsMandataires: { to: createPageUrl("ConversationsMandataires"), icon: MessagesSquare, actif: isActivePage("ConversationsMandataires"), badge: nonLusKlocka || null, badgeColor: "bg-menthe text-sur-menthe" },
    MandataireMarche: { to: createPageUrl("MandataireMarche"), icon: Presentation, actif: isActivePage("MandataireMarche") },
    MandataireOffMarket: { to: createPageUrl("MandataireOffMarket"), icon: Radar, actif: isActivePage("MandataireOffMarket") },
    MandataireProjets: { to: createPageUrl("MandataireProjets"), icon: Building2, actif: isActivePage("MandataireProjets") },
    Personnalisation: { to: createPageUrl("Personnalisation"), icon: user?.role === "admin" || user?.role === "mandataire" ? CircleUser : Palette, actif: isActivePage("Personnalisation") },
    MesProjets: { to: createPageUrl("MesProjets"), icon: Building2, actif: isActivePage("MesProjets") },
    MesPresentations: { to: createPageUrl("MesPresentations"), icon: Presentation, actif: isActivePage("MesPresentations") },
    Vision: { to: createPageUrl("Vision"), icon: Eye, actif: isActivePage("Vision") },
    Ressources: { to: createPageUrl("Ressources"), icon: BookOpen, actif: isActivePage("Ressources") },
  };

  // La barre latérale (maquette du 28 septembre 2026) : la marque et le
  // repli ; Klocka | K-Data ; la vue ; les pages avec leur nom ; « Autre » ;
  // en bas le compte, l'autre compte, le thème, la déconnexion. Repliée,
  // elle devient un rail d'icônes. Sur mobile, la même chose dans un tiroir.
  const sidebarContent = (isMobile = false) => {
    const replie = sidebarCollapsed && !isMobile && !barreOuverteAuSurvol;
    // Le menu principal et « Autre », tels que la personne les a rangés dans
    // Personnalisation (glisser-déposer d'un groupe à l'autre).
    // L'équipe (17 oct. 2026, Jules) : un menu fixe, avec ses groupes Relations et Administration, et Paramètres en bas.
    // Les mandataires (18 oct. 2026, Jules) : la même structure, leur menu à eux.
    const menuEquipe = (vue === "admin" && !showClientView) || vue === "mandataire";
    const { principal: entrees, autre: autres } = vue === "mandataire" ? menuMandataire(prefs.menu_masques || [])
      : menuEquipe ? menuAdmin(prefs.menu_masques || [], { email: user?.email }) : repartir(
      vue === "mandataire" ? ENTREES_MANDATAIRE : showClientView ? ENTREES_CLIENT : ENTREES_ADMIN,
      showClientView ? [] : ENTREES_AUTRE,
      { ordre: prefs.menu_ordre, masques: prefs.menu_masques, menuAutre: prefs.menu_autre },
    );
    const initiale = (user?.full_name || user?.email || "U").charAt(0).toUpperCase();
    const nomCourt = (() => {
      const mots = String(user?.full_name || "").trim().split(/\s+/).filter(Boolean);
      if (mots.length >= 2) return `${mots[0]} ${mots[mots.length - 1].charAt(0).toUpperCase()}.`;
      return mots[0] || user?.email?.split("@")[0] || "";
    })();
    // Au téléphone, 40 px : la taille d'un doigt.
    const bouton = "grid h-8 w-8 place-items-center rounded-[8px] text-ardoise transition-colors hover:bg-rail-actif hover:text-encre max-md:h-10 max-md:w-10";
    return (
      <div className="flex h-full flex-col">
        {/* La marque, et le repli. */}
        <div className={`k-barre-marque flex h-[56px] flex-shrink-0 items-center ${replie ? "justify-center" : "gap-2.5 pl-4 pr-2.5"}`}>
          {["CrmTwenty", "Emailing"].includes(currentPageName) || cadreOutils ? (
            // Sur la page du CRM, la marque laisse la place au logo « crm_ », posé par la page au-dessus de la barre (5 nov. 2026).
            <span aria-hidden="true" className="h-6" />
          ) : vue === "mandataire" ? (
            // Côté mandataire, le logo K Partners à la place de Klocka OS (25 oct. 2026, Jules).
            <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center" title="K Partners">
              <LogoKP fond="theme" className={replie ? "text-[22px]" : "text-[26px]"} />
            </Link>
          ) : (
          <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center gap-2.5" title="Klocka OS">
            {/* La marque de Klocka OS (18 oct. 2026, Jules) : trois losanges, à gauche du nom. */}
            <MarqueKlocka className="h-[22px] w-[22px]" />
            {!replie && (
              <span className="flex items-center gap-2">
                <span className="text-[18px] font-normal tracking-[-0.02em] text-encre">Klocka</span>
                {/* « OS » dans un cadre arrondi (18 oct. 2026, Jules, deux maquettes). */}
                <span className="inline-flex h-[22px] items-center rounded-[7px] border border-encre px-1.5 text-[11.5px] font-semibold leading-none tracking-[.02em] text-encre" aria-label="OS">OS</span>
              </span>
            )}
          </Link>
          )}
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={closeMobile} className="ml-auto text-ardoise hover:text-encre">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>

        {/* Plus de bascule Klocka | Outils (9 nov. 2026, Jules) : Outils est une entrée du menu. Avec elle, les lignes de la
            barre gardaient deux hauteurs, repliée et ouverte, et la souris tombait sur une autre page à l'ouverture. */}
        {/* « Nouveau chat » retiré de la barre le 17 oct. 2026 (Jules). */}

        {/* Les pages. */}
        <div className="mt-7 flex-1 overflow-y-auto px-3 pb-4">
          <div className="flex flex-col gap-0.5">
            {/* Au téléphone, les notifications en tête du menu (1er nov. 2026, Jules) : la cloche n'a plus de bouton. */}
            {isMobile && vue === "mandataire" && (
              <button type="button" onClick={() => { closeMobile(); ouvrirCloche(); }}
                className="mb-2 flex items-center gap-3 rounded-[10px] px-3 py-[7px] text-left text-[15px] text-encre hover:bg-encre/[0.05]" style={{ background: "transparent" }}>
                <Bell className="h-[18px] w-[18px] flex-none text-ardoise" strokeWidth={1.7} />
                <span className="flex-1">Notifications</span>
                {nonLues > 0 && <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-ambre px-1.5 text-[13px] font-medium tabular-nums text-fond">{nonLues}</span>}
              </button>
            )}
            {entrees.map((e) => {
              // Un groupe (Relations, Administration) : une seule entrée, vers sa première page ; actif sur toutes ses pages.
              if (e.groupe) {
                const premiere = e.entrees[0];
                // Plus de projets récents sous « Administration » ni de biens récents sous « Biens » (31 oct. 2026, Jules).
                return <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} key={e.cle} e={e}
                  to={DETAILS[premiere.cle]?.to} icon={{ Relations: Handshake, Prospection: MapPin, Biens: Folder }[e.groupe] || ShieldCheck} actif={e.entrees.some((x) => DETAILS[x.cle]?.actif)}
                  badge={e.entrees.map((x) => DETAILS[x.cle]?.badge).find(Boolean) || null} badgeColor={e.entrees.map((x) => DETAILS[x.cle]?.badge && DETAILS[x.cle]?.badgeColor).find(Boolean)} />;
              }
              const lien = <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} key={e.cle} e={e} ferme={pagesFermees.includes(e.cle)} />;
              // Feedback : au survol, le panneau s'ouvre à côté du menu, sans quitter la page.
              return ["AdminSuggestions", "Feedback"].includes(e.cle) && !isMobile ? <FeedbackSurvol key={e.cle}>{lien}</FeedbackSurvol> : lien;
            })}
          </div>
          {(autres.length > 0 || (isAdmin && !showClientView && AFFICHER_DOUBLE_CHECK)) && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setAutreOpen((v) => !v)}
                aria-expanded={autreOpen}
                aria-label="Autre" title="Autre"
                className={`flex items-center rounded-[10px] text-ardoise transition-colors hover:text-encre ${replie ? "mx-auto h-9 w-9 justify-center" : "h-9 gap-1.5 px-3 text-[15px]"}`}
                style={{ background: "transparent" }}
              >
                {!replie && <span>Autre</span>}
                <ChevronDown className={`h-4 w-4 transition-transform ${autreOpen ? "rotate-180" : ""}`} />
              </button>
              {autreOpen && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-150 mt-0.5 flex flex-col gap-0.5">
                  {autres.map((e) => {
              const lien = <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} key={e.cle} e={e} ferme={pagesFermees.includes(e.cle)} />;
              // Feedback : au survol, le panneau s'ouvre à côté du menu, sans quitter la page.
              return ["AdminSuggestions", "Feedback"].includes(e.cle) && !isMobile ? <FeedbackSurvol key={e.cle}>{lien}</FeedbackSurvol> : lien;
            })}
                  {AFFICHER_DOUBLE_CHECK && isAdmin && !showClientView && <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} e={{ cle: "AdminBrouillons", label: "Double Check" }} to={createPageUrl("AdminBrouillons")} icon={ClipboardCheck} actif={isActivePage("AdminBrouillons")} />}
                </div>
              )}
            </div>
          )}
        </div>

        {/* La vue (18 oct. 2026, Jules) : au-dessus de Paramètres, avec son icône ; un clic passe à la vue suivante
            (Admin, Client, Mandataire), sans menu. Elle vivait en haut de la barre, sous le choix Klocka | Outils. */}
        {isAdmin && (
          <div className={`flex-shrink-0 pb-0.5 ${replie ? "" : "px-3"}`}>
            {(() => {
              const vues = [["admin", "Admin"], ["client", "Client"], ["mandataire", "Mandataire"]];
              const i = Math.max(0, vues.findIndex(([k]) => k === apercu));
              const suivante = vues[(i + 1) % vues.length][0];
              return (
                <button type="button" onClick={() => { choisirApercu(suivante); setApercu(suivante); }}
                  aria-label={`Vue ${vues[i][1]} : passer à la vue ${vues[(i + 1) % vues.length][1]}`} title={`Vue ${vues[i][1]} · cliquer pour passer à ${vues[(i + 1) % vues.length][1]}`}
                  className={`relative flex w-full items-center rounded-[10px] text-ardoise transition-colors hover:bg-rail-actif hover:text-encre ${replie ? "mx-auto h-9 w-9 justify-center" : "h-9 gap-2.5 px-3"}`} style={{ background: "transparent" }}>
                  <Eye className="h-[17px] w-[17px] flex-none" strokeWidth={1.7} />
                  {!replie && <><span className="flex-1 truncate text-left text-[15px]">Vue</span><span className="text-[12.5px] text-brume">{vues[i][1]}</span></>}
                </button>
              );
            })()}
          </div>
        )}
        {/* Paramètres, en bas de la barre (17 oct. 2026, Jules) : l'ancien « Compte », avec le Suivi dedans. */}
        {menuEquipe && (
          <div className={`flex-shrink-0 pb-2 ${replie ? "" : "px-3"}`}>
            <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} e={{ cle: "Personnalisation", label: "Paramètres" }} icon={Settings} />
          </div>
        )}
        {/* Le compte. */}
        <div className={`mt-auto flex-shrink-0 border-t border-trait ${replie ? "flex flex-col items-center gap-1 py-3" : `flex items-center gap-2 py-3 ${isMobile ? "px-3" : "px-4"}`}`}>
          {/* « Assistant Klocka · Discuter » retiré du bas de la barre le 17 oct. 2026 (Jules). */}
          {/* Au bureau, la déconnexion reste sous la souris quand la barre s'ouvre (9 nov. 2026, Jules) ; à droite au téléphone. */}
          {isMobile && <span className="min-w-0 flex-1" />}
          <button type="button" onClick={() => base44.auth.logout(window.location.origin + '/Connexion')} aria-label="Déconnexion" title="Déconnexion" className={bouton} style={{ background: "transparent" }}>
              <LogOut className="h-4 w-4" strokeWidth={1.7} />
            </button>
        </div>
      </div>
    );
  };

  // Ce qui occupe le haut et le bas de l'écran du téléphone, dit en variables :
  // main s'en écarte, et le chat (index.css, .k-chat-hauteur) cale sa barre
  // juste au-dessus. Au bureau, rien ne les lit.
  const ongletsMobile = !hideNavbar && showClientView;
  const assistantVisible = vueAdmin && !hideNavbar && !enKData && !["Dashboard", "Analyse"].includes(currentPageName);
  // Avec la barre du bas (client, mandataire), plus de barre du haut au téléphone (24 oct. 2026, Jules) : il ne reste que l'encoche.
  // Le mandataire garde une bande de 3 rem sous l'encoche, sans barre : le logo kp à gauche, la cloche à droite (25 oct. 2026, Jules).
  const hautMobile = hideNavbar || (modoKData && enCadre) ? "0px" : ongletsMobile ? (vue === "mandataire" ? "calc(3rem + env(safe-area-inset-top))" : "env(safe-area-inset-top)") : "calc(3.5rem + env(safe-area-inset-top))";
  const basMobile = hideNavbar || modoKData
    ? "0px"
    // Le mandataire n'a plus de barre du bas (27 oct. 2026, Jules) : le menu s'ouvre du hamburger, en haut à droite.
    : ongletsMobile && vue !== "mandataire"
      ? "calc(3.5rem + env(safe-area-inset-bottom))"
      : assistantVisible && currentPageName !== "Note"
        ? "calc(4.5rem + env(safe-area-inset-bottom))"
        : "env(safe-area-inset-bottom)";

  return (
    // `overflow-x-clip` plutôt que `hidden` : `hidden` créerait un conteneur de
    // défilement qui casserait les positions `sticky` des pages.
    <div className="min-h-screen flex w-full bg-fond relative overflow-x-clip" style={{ "--k-haut-mobile": hautMobile, "--k-bas-mobile": basMobile }}>
      <style>{globalTooltipStyles}</style>
      {fondHalo && <FondHalo />}
      {apercuTelephone && <ApercuTelephone departInitial={typeof apercuTelephone === "string" ? apercuTelephone : null} onFermer={() => setApercuTelephone(false)} />}

      {modoKData ? null : (
        <>
          {/* La barre latérale de bureau ; repliée, un rail d'icônes. */}
          {!hideNavbar && (
            <aside
              data-zone="barre"
              className={`k-points k-barre-laterale hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col rounded-r-[24px] border-y border-r border-trait bg-rail transition-[width] duration-200 before:rounded-r-[24px] ${sidebarCollapsed && !barreOuverteAuSurvol ? "w-[64px]" : "w-[228px]"} ${barreOuverteAuSurvol ? "shadow-[0_20px_50px_rgb(0_0_0/0.28)]" : ""}`}
              style={{ paddingTop: "env(safe-area-inset-top)" }}
              onMouseEnter={sidebarCollapsed ? () => survolerBarre(true) : undefined}
              onMouseLeave={sidebarCollapsed ? () => survolerBarre(false) : undefined}
            >
              {sidebarContent(false)}
            </aside>
          )}

          {/* Mobile Top Bar : sa hauteur compte l'encoche, comme le haut de main. Seulement pour l'équipe : client et
              mandataire ont le menu dans la barre du bas (24 oct. 2026). */}
          {!hideNavbar && !ongletsMobile && (
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-fond/80 backdrop-blur-xl border-b border-trait flex items-center justify-between gap-2 px-4" style={{ height: "var(--k-haut-mobile)", paddingTop: "env(safe-area-inset-top)" }}>
              {isChildPage ? (
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-encre -ml-2">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              ) : (
                <Link to={createPageUrl("Dashboard")} className="flex items-center">
                  <Wordmark />
                </Link>
              )}
              <div className="flex items-center gap-1">
                {testeurVisible && <BoutonTesteur compact vue={vue} />}
                {boutonRappel && <BoutonRappel compact />}
                {/* La recherche : ⌘K n'existe pas au téléphone. */}
                {vueAdmin && (
                  <Button variant="ghost" size="icon" onClick={() => setRechercheOuverte(true)} className="text-encre" aria-label="Rechercher" title="Rechercher">
                    <Search className="w-5 h-5" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-encre" aria-label={isMobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={isMobileMenuOpen}>
                  {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </Button>
              </div>
            </div>
          )}

          {/* Mobile Sidebar Overlay */}
          {isMobileMenuOpen && !hideNavbar && (
            <>
              <div className="md:hidden fixed inset-0 bg-fond/60 z-40 animate-in fade-in duration-200" onClick={closeMobile} />
              <aside data-zone="barre" className="k-points md:hidden fixed top-0 left-0 h-[100dvh] w-[280px] max-w-[85vw] z-50 bg-rail animate-in slide-in-from-left duration-200 ease-out" style={{ boxShadow: "inset -1px 0 0 rgb(var(--k-encre-rgb) / 0.08)", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
                {sidebarContent(true)}
              </aside>
            </>
          )}
        </>
      )}

      {/* Main Content */}
      <main
        data-zone="fond"
        style={{ "--k-grid-marge": "0px" }}
        className={`k-points k-contenu relative z-10 flex-1 min-w-0 max-w-full max-md:overflow-x-clip ${
          modoKData ? "" : !hideNavbar ? (sidebarCollapsed ? "md:pl-[64px] md:transition-[padding-left] md:duration-200" : "md:pl-[228px] md:transition-[padding-left] md:duration-200") : ""
        } ${
          modoKData
            ? (enCadre ? "" : "pt-[calc(3.5rem+env(safe-area-inset-top))]")
            : !hideNavbar
              ? "pt-[var(--k-haut-mobile)] md:pt-0 pb-[var(--k-bas-mobile)] md:pb-0"
              : ""
        }`}
      >
        {/* Entrée animée en CSS, sans animation de sortie : une sortie qui
            n'aboutit pas (framer-motion + layoutId) laissait l'écran noir. */}
        {/* `main` porte 56px de padding en haut sous la barre de K-Data : une
            hauteur minimale d'un écran plein y ajoutait 56px de vide en bas,
            sous les cartes qui, elles, tombent juste. */}
        <div key={`${location.pathname}|${vue}`} className={`animate-in fade-in slide-in-from-right-4 duration-300 ease-out ${modoKData ? (enCadre ? "min-h-[100dvh]" : "min-h-[calc(100dvh-3.5rem)]") : "min-h-screen"}`}>
          {/* Les pages d'un groupe du menu (Relations, Administration) : leurs onglets en tête, pour passer de l'une à l'autre. */}
          {((vue === "admin" && !showClientView) || vue === "mandataire") && !hideNavbar && groupeDe(currentPageName, vue) && (
            <nav aria-label={groupeDe(currentPageName, vue).groupe} className="flex justify-center px-4 pt-4 max-md:pt-4">
              <div className="inline-flex gap-0.5">
                {groupeDe(currentPageName, vue).entrees.filter((x) => x.cle === currentPageName || !masquesDe(user?.email).includes(x.cle)).map((x) => {
                  const ici = currentPageName === x.cle || DETAILS[x.cle]?.actif;
                  return (
                    <Link key={x.cle} to={DETAILS[x.cle]?.to || createPageUrl(x.cle)} aria-current={ici ? "page" : undefined}
                      className={`inline-flex h-7 items-center rounded-full px-3 text-[13px] transition-colors max-md:h-10 ${ici ? "bg-rail-actif text-encre" : "text-craie hover:bg-relief hover:text-encre"}`}>
                      {x.label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          )}
          {/* L'espace K Partners : chaque écran entre d'un fondu et d'une légère montée (1er nov. 2026, Jules). */}
          {vue === "mandataire"
            ? <div key={location.pathname} className="k-entree-page">{pagesFermees.includes(currentPageName) ? <AccesReserve /> : children}</div>
            : pagesFermees.includes(currentPageName) ? <AccesReserve /> : cadreOutils ? <CadreOutils page={currentPageName}>{children}</CadreOutils> : children}
        </div>
      </main>

      {/* Signaler quelque chose sans quitter la page : l'icône reste en haut à
          droite, le panneau s'ouvre dessous et la remarque part de là. */}

      {/* L'assistant suit l'admin de page en page, côté Klocka seulement :
          K-Data répond à une question de marché, pas à un dossier client. */}
      {/* La page Note est déjà l'assistant, en grand : pas de pilule en double. */}
      {/* La pilule flottante se tait sur le dashboard : le chat y est déjà. */}
      {vueAdmin && !hideNavbar && !enKData && !["Dashboard", "Analyse"].includes(currentPageName) && <AssistantFlottant />}
      {/* Dès l'arrivée, sur n'importe quelle page de l'équipe (16 oct. 2026, Jules) : l'annonce d'AK, une fois ; puis « Quoi de neuf », une fois par jour. */}
      {/* « Quoi de neuf » n'est plus une fenêtre (18 oct. 2026, Jules) : les nouveautés arrivent dans le mail « Ma journée ». */}
      {/* Les messages d'AK, en bas à gauche (16 oct. 2026, Jules) : la fiche pré-analysée, et la discussion. */}
      {/* AK (sa tête en bas à gauche, ses messages) retiré de la barre et de l'écran le 17 oct. 2026 (Jules). */}

      {/* La recherche du rail, et ⌘K. */}
      {vueAdmin && <RechercheRapide ouvert={rechercheOuverte} onFermer={() => setRechercheOuverte(false)} />}
      {(vue === "admin" || vue === "mandataire") && <NotificationsApp />}
      {/* « Il me rappelle » : le bouton en haut à droite (dans la barre au téléphone), l'écran d'appel et le bandeau « Rappel à terminer ». */}
      {/* Le coin en haut à droite, sur ordinateur : ce qu'une page y pose (la pilule des boîtes du Dashboard, par `#k-haut-droite`), et l'icône Rappel, seule, dans la marge du coin, pour ne jamais couvrir le bouton d'un en-tête. */}
      {vueAdmin && !hideNavbar && !modoKData && (
        <>
          <div id="k-haut-droite" className={`k-flottant-haut fixed right-4 top-4 z-40 flex items-center gap-3 empty:hidden max-md:hidden`} />
          {/* L'agent testeur (10 oct. 2026), à gauche du rappel : un clic, et l'IA audite la page ouverte dans un bac à sable. */}
          {testeurVisible && <div className={`k-flottant-haut fixed ${boutonRappel ? "right-[60px]" : "right-3"} top-3 z-40 max-md:hidden`}><BoutonTesteur vue={vue} /></div>}
          {boutonRappel && <div className="k-flottant-haut fixed right-3 top-3 z-40 max-md:hidden"><BoutonRappel /></div>}
          {/* La cloche (17 oct. 2026, Jules) : entre les boîtes connectées et le mode appel, sur toutes les pages de l'équipe. */}
          <Cloche sansBouton className={`k-flottant-haut fixed ${boutonRappel ? "right-[68px]" : "right-4"} top-4 max-md:hidden`} />
          {/* Une fiche commerciale arrivée : « je la rentre ? Oui / Non », en fenêtre, d'elle-même (20 oct. 2026, Jules). */}
          <PopupFicheRecue />
        </>
      )}
      {/* La cloche du mandataire, en haut à droite comme chez l'équipe, au téléphone aussi (25 oct. 2026, Jules). */}
      {/* Au téléphone, plus de bouton cloche (1er nov. 2026, Jules) : le nombre en gros sur le hamburger, « Notifications » en
          tête du menu. */}
      {vue === "mandataire" && !hideNavbar && <Cloche mandataire sansBouton className="k-flottant-haut fixed right-4 top-4" />}
      {/* Au téléphone, le hamburger à droite de la cloche ouvre le menu (27 oct. 2026, Jules : plus d'onglets en bas). */}
      {vue === "mandataire" && !hideNavbar && (
        <button type="button" onClick={() => setIsMobileMenuOpen((o) => !o)} aria-label={isMobileMenuOpen ? "Fermer le menu" : nonLues ? `Ouvrir le menu, ${nonLues} notification${nonLues > 1 ? "s" : ""}` : "Ouvrir le menu"} aria-expanded={isMobileMenuOpen}
          className="fixed right-3 top-[calc(env(safe-area-inset-top)+0.3rem)] z-40 grid h-[38px] w-[38px] place-items-center rounded-full text-encre md:hidden" style={{ background: "transparent" }}>
          {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          {!isMobileMenuOpen && nonLues > 0 && (
            <span aria-hidden className="absolute -right-1.5 -top-1 grid h-[22px] min-w-[22px] place-items-center rounded-full bg-ambre px-1.5 text-[13px] font-medium tabular-nums text-fond">{nonLues > 99 ? "99+" : nonLues}</span>
          )}
        </button>
      )}
      {/* Au téléphone, le logo K Partners en haut à gauche, en face de la cloche (25 oct. 2026, Jules), sur une barre
          comme celle du bas : fond transparent et flou, le logo et la cloche, rien d'autre. */}
      {vue === "mandataire" && !hideNavbar && (
        <div aria-hidden="true" className="fixed inset-x-0 top-0 z-[39] border-b border-trait bg-transparent backdrop-blur-xl md:hidden" style={{ height: "calc(3rem + env(safe-area-inset-top))" }} />
      )}
      {vue === "mandataire" && !hideNavbar && (
        <Link to={createPageUrl("Dashboard")} title="K Partners" className="fixed left-4 top-[calc(env(safe-area-inset-top)+0.3rem)] z-40 flex h-[38px] items-center md:hidden">
          <LogoKP fond="theme" className="text-[24px]" />
        </Link>
      )}
      {rappelOuvert && !hideNavbar && <RappelEntrant />}
      {/* Plus de fenêtre « Klocka arrive sur vos téléphones » (8 nov. 2026, Jules) : on arrive direct sur la plateforme. */}
      {/* Plus d'accueil « Où cherche votre agent » (6 nov. 2026, Jules) : ses villes se posent dans la Prospection. */}

      {/* Barre d'onglets mobile */}
      {!hideNavbar && showClientView && vue !== "mandataire" && <BottomTabs vue={vue} onMenu={() => setIsMobileMenuOpen((o) => !o)} menuOuvert={isMobileMenuOpen} />}
    </div>
  );
}

export default function Layout(props) {
  return (
    <UserProvider>
      <LayoutContent {...props} />
      <VeilleAlx />
    </UserProvider>
  );
}