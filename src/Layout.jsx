import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import BottomTabs from "@/components/mobile/BottomTabs";
import NotificationsApp from "@/components/NotificationsApp";
import AccueilMandataire from "@/components/mandataire/AccueilMandataire";
import {
  LayoutDashboard,
  LayoutGrid,
  Magnet,
  Building2,
  Calculator,
  BookOpen,
  Users,
  LogOut,
  Brain,
  ClipboardCheck,
  Eye,
  FileText,
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
  ExternalLink,
  Upload, Mic, Compass, Sun, Moon, Home, Inbox, PhoneCall, Palette, Folder, Phone, PanelLeft, MapPin, FileSignature, SquarePen, CircleUser, MessagesSquare } from "lucide-react";
import RechercheRapide from "@/components/RechercheRapide";
import { MODULES_KDATA, PAGES_KDATA } from "@/lib/kdata-modules";
import { usePersonnalisation } from "@/components/providers/PersonnalisationProvider";
import { CLAIR, themeEffectif } from "@/lib/personnalisation";
import { ENTREES_ADMIN, ENTREES_AUTRE, ENTREES_CLIENT, ENTREES_MANDATAIRE, repartir } from "@/lib/menu";
import { apercuAdmin, choisirApercu } from "@/lib/vue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { Switch } from "@/components/ui/switch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserProvider, useUser } from "@/components/providers/UserProvider";
import VeilleAlx from "@/components/alx/VeilleAlx";
import AssistantFlottant from "@/components/AssistantFlottant";
import FeedbackSurvol from "@/components/FeedbackSurvol";
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
function LienRail({ details, replie, onNaviguer, e, cle = e.cle, to, icon, label = e.label, actif, badge = null, badgeColor }) {
  const d = details[cle] || {};
  const Icone = icon || d.icon;
  const ici = actif ?? d.actif;
  const pastille = badge ?? d.badge;
  if (!Icone) return null;
  return (
    <Link
      to={to || d.to}
      onClick={onNaviguer}
      data-actif={ici ? "1" : undefined}
      title={replie ? label : undefined}
      aria-label={label}
      className={`relative flex items-center rounded-[10px] transition-colors ${replie ? "mx-auto h-9 w-9 justify-center" : "gap-2.5 px-3 py-[7px]"} ${ici ? "bg-rail-actif text-encre" : "text-ardoise hover:bg-rail-actif hover:text-encre"}`}
    >
      <Icone className="h-[17px] w-[17px] flex-none" strokeWidth={1.7} />
      {!replie && <span className="flex-1 truncate text-[15px]">{label}</span>}
      {pastille ? (
        replie
          ? <span className={`k-rail-pastille ${badgeColor || d.badgeColor || "bg-rail-actif text-craie"}`}>{pastille}</span>
          : <span className={`ml-auto rounded-full px-1.5 py-px text-[11px] font-medium tabular-nums ${badgeColor || d.badgeColor || "bg-rail-actif text-craie"}`}>{pastille}</span>
      ) : null}
    </Link>
  );
}

function BasculeKData({ enKData, onChanger }) {
  return (
    <div className="flex flex-1 items-center justify-between gap-2">
      <span className={`text-[12.5px] transition-colors ${enKData ? "text-brume" : "font-medium text-encre"}`}>Klocka</span>
      <Switch checked={enKData} onCheckedChange={onChanger} className="flex-shrink-0" aria-label="Basculer entre Klocka et K-Data" />
      <span className={`text-[12.5px] transition-colors ${enKData ? "font-medium text-encre" : "text-brume"}`}>K-Data</span>
    </div>
  );
}

function BasculeTheme({ clair, onBasculer }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={onBasculer}
      className="text-brume hover:text-encre hover:bg-transparent h-8 w-8 flex-shrink-0"
      title={clair ? "Passer en mode sombre" : "Passer en mode clair"}
      aria-label={clair ? "Passer en mode sombre" : "Passer en mode clair"}
    >
      {clair ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
    </Button>
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

function MenuApps({ isActivePage }) {
  const [ouvert, setOuvert] = useState(false);
  const minuterie = useRef(null);
  const ouvrir = () => { clearTimeout(minuterie.current); setOuvert(true); };
  const fermer = () => { minuterie.current = setTimeout(() => setOuvert(false), 180); };
  useEffect(() => () => clearTimeout(minuterie.current), []);

  // Le nom de l'application ouverte reste affiché : sans lui, la barre ne dirait
  // plus où l'on se trouve.
  const actif = MODULES_KDATA.find((m) => isActivePage(m.pageName));

  return (
    <div className="relative" onMouseEnter={ouvrir} onMouseLeave={fermer} onFocus={ouvrir} onBlur={fermer}>
      <button
        type="button"
        onClick={() => (ouvert ? fermer() : ouvrir())}
        aria-expanded={ouvert}
        className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${ouvert || actif ? "bg-encre/[0.07] text-encre" : "text-ardoise hover:text-encre"}`}
      >
        <LayoutGrid className="h-3.5 w-3.5" />
        Apps
        {actif && <span className="text-menthe-texte">· {actif.nom}</span>}
      </button>

      {ouvert && (
        <div className="animate-in fade-in slide-in-from-top-1 duration-150 absolute left-1/2 top-[calc(100%+8px)] z-50 w-[560px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-[18px] border border-trait bg-surface-pleine p-2 shadow-[0_24px_60px_rgba(0,0,0,0.45)]">
          <Link
            to={createPageUrl("KData")}
            onClick={() => setOuvert(false)}
            className="mb-1 flex items-center gap-3 rounded-[12px] px-3 py-2.5 hover:bg-relief"
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border border-trait bg-relief">
              <LayoutGrid className="h-4 w-4 text-menthe" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-encre">K-Data</span>
              <span className="block truncate text-[11.5px] text-ardoise">Le tableau de bord des six modules.</span>
            </span>
          </Link>
          <div className="grid grid-cols-2 gap-1 max-sm:grid-cols-1">
            {MODULES_KDATA.map((m) => {
              const Icone = m.icone;
              const contenu = (
                <>
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] border border-trait bg-relief">
                    <Icone className={`h-4 w-4 ${m.chemin ? "text-encre" : "text-brume"}`} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-medium ${m.chemin ? "text-encre" : "text-brume"}`}>{m.nom}</span>
                    <span className="block truncate text-[11.5px] text-ardoise">{m.chemin ? m.phrase : m.etat}</span>
                  </span>
                </>
              );
              const habit = "flex items-center gap-3 rounded-[12px] px-3 py-2.5";
              return m.chemin ? (
                <Link key={m.cle} to={m.chemin} onClick={() => setOuvert(false)}
                  className={`${habit} ${isActivePage(m.pageName) ? "bg-encre/[0.07]" : "hover:bg-relief"}`}>
                  {contenu}
                </Link>
              ) : (
                <span key={m.cle} className={`${habit} cursor-default`}>{contenu}</span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// La barre du haut de K-Data : le logo ramène à Klocka, le menu ouvre les
// six applications. Elle remplace la barre latérale entière — K-Data n'a pas
// de sidebar, il a sa propre barre, pour se sentir comme un autre onglet de
// l'application plutôt que comme une page de plus dans Klocka.
function BarreKData({ user, isActivePage, clair, onBasculerTheme }) {
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center gap-1 border-b border-trait px-3 md:px-5"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        background: "rgb(var(--k-fond-halo-rgb) / 0.42)",
        backdropFilter: "blur(16px) saturate(1.15)",
        WebkitBackdropFilter: "blur(16px) saturate(1.15)",
      }}
    >
      <Link to={createPageUrl("Dashboard")} className="flex flex-shrink-0 items-center pr-3" title="Revenir à Klocka">
        <img src="/logo-klocka.svg" alt="Klocka" className="h-9 w-9 rounded-[7px]" draggable={false} />
      </Link>
      <div className="mr-2 h-5 w-px flex-shrink-0 bg-encre/[0.1]" />

      <nav className="flex flex-1 items-center justify-center">
        <MenuApps isActivePage={isActivePage} />
      </nav>

      <div className="ml-2 flex flex-shrink-0 items-center gap-2">
        <Link
          to={createPageUrl("KData")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-brume transition-colors hover:bg-encre/[0.06] hover:text-encre"
          title="Tableau de bord K-Data"
        >
          <Home className="h-4 w-4" />
        </Link>
        <BasculeTheme clair={clair} onBasculer={onBasculerTheme} />
        <div className="hidden h-7 w-7 items-center justify-center rounded-full border border-menthe/40 md:flex" title={user?.full_name || user?.email}>
          <span className="text-[11px] text-menthe tracking-[0.06em]">{(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => base44.auth.logout(window.location.origin + '/Connexion')}
          className="h-8 w-8 text-brume hover:bg-transparent hover:text-encre"
          title="Déconnexion"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
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
  const { prefs, changer } = usePersonnalisation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // La barre latérale s'ouvre comme Personnalisation le dit ; le bouton du
  // haut la replie en rail d'icônes, le temps de la session.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => prefs.barre === "repliee");
  useEffect(() => { setSidebarCollapsed(prefs.barre === "repliee"); }, [prefs.barre]);
  // La recherche (⌘K) : projets et dossiers, de n'importe quelle page.
  const [rechercheOuverte, setRechercheOuverte] = useState(false);
  useEffect(() => {
    const clavier = (e) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setRechercheOuverte((v) => !v); } };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, []);
  // La largeur de la barre, dite à la page : la bulle de l'assistant posée à
  // gauche (Personnalisation) se place à côté de la barre, pas dessus.
  const largeurBarre = sidebarCollapsed ? "64px" : "228px";
  useEffect(() => {
    document.documentElement.style.setProperty("--k-barre-largeur", largeurBarre);
    return () => document.documentElement.style.removeProperty("--k-barre-largeur");
  }, [largeurBarre]);
  // La vue choisie par un admin : la sienne, celle d'un client, celle d'un mandataire.
  const [apercu, setApercu] = useState(apercuAdmin);
  const [autreOpen, setAutreOpen] = useState(false);
  const isChildPage = CHILD_PAGES.includes(currentPageName);

  // Alexis : la page secrète se visite sans barre latérale — rien ne doit y mener.
  const pagesWithoutNavbar = ['Questionnaire', 'Home', 'Alexis'];

  useEffect(() => { choisirApercu(apercu); }, [apercu]);
  // Passer en vue mandataire, c'est aussi le devenir : l'admin cumule les deux
  // rôles, reçoit un secteur et prospecte pour de vrai. Idempotent.
  const queryClientVue = useQueryClient();
  useEffect(() => {
    if (apercu !== "mandataire" || user?.role !== "admin") return;
    base44.request("POST", "/api/mandataire/admin/moi", { body: { actif: true } })
      .then(() => queryClientVue.invalidateQueries({ queryKey: ["admin-mandataires"] }))
      .catch(() => { /* la vue s'affiche quand même ; l'onglet Mandataires permet de réessayer */ });
  }, [apercu, user?.role, queryClientVue]);

  const isAdmin = user?.role === "admin";
  const vue = isAdmin ? apercu : user?.role === "mandataire" ? "mandataire" : "client";
  // Ce qui relève de l'équipe (relances, dossiers, assistant, recherche) ne
  // suit que la vue admin : un admin qui regarde la vue mandataire ou client
  // voit exactement ce que voit un mandataire ou un client.
  const vueAdmin = vue === "admin";
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
  // de la prospection off-market a le même fond que Prospection. Le dashboard admin
  // garde les nappes menthe du plan de travail : deux halos l'un sur l'autre
  // ne font pas un fond.
  //
  // En clair, pas de halo du tout : le fond est blanc, sans dégradé. En
  // sombre, Personnalisation peut l'éteindre. La bascule du thème est dans la
  // barre latérale et dans la barre du haut de K-Data ; elle écrit la
  // préférence, qui suit le compte.
  const clair = themeEffectif(prefs) === CLAIR;
  const basculer = () => changer({ mode: clair ? "sombre" : "clair" });
  const fondHalo = !hideNavbar
    && !clair
    && prefs.halo
    && !(currentPageName === "Dashboard" && !showClientView)
    && !(currentPageName === "ALXAtelier" && !["carte", "ville"].some((c) => new URLSearchParams(location.search).has(c)));

  // Les chemins se comparent sans la casse : « /Analyse » et « /analyse »
  // sont la même page, et le lien Dossiers pointe sur le premier.
  const isActivePage = (pageName) => {
    const pageUrl = createPageUrl(pageName).toLowerCase();
    const ici = location.pathname.toLowerCase();
    return ici === pageUrl || ici === pageUrl + '/';
  };

  const closeMobile = () => setIsMobileMenuOpen(false);

  // On est dans K-Data dès que la page ouverte est son tableau de bord ou
  // l'un de ses modules. Ce n'est pas un lien de plus dans le menu : c'est un
  // autre espace, qui échange la barre latérale de Klocka contre sa propre
  // barre du haut.
  const enKData = PAGES_KDATA.some((p) => isActivePage(p));
  // Une page K-Data ouverte dans un cadre — la fenêtre de lecture d'un
  // dossier — ne montre que l'analyse : ni barre du haut, ni déconnexion,
  // ni menu des applications, qui n'ont aucun sens dans une fenêtre qu'on
  // regarde puis qu'on ferme.
  const enCadre = typeof window !== "undefined" && window.self !== window.top;
  const modoKData = enKData && vueAdmin && !hideNavbar;


  // Ce que chaque entrée du menu dessine : son lien, son icône, sa pastille.
  // La liste et son ordre d'origine vivent dans src/lib/menu.js ; l'ordre
  // et les masques choisis dans Personnalisation s'appliquent au rendu.
  const DETAILS = {
    Dashboard: { to: createPageUrl("Dashboard"), icon: LayoutDashboard, actif: isActivePage("Dashboard"), badge: enRetard || null, badgeColor: "bg-alerte text-white" },
    AdminProjets: { to: createPageUrl("AdminProjets"), icon: Building2, actif: isActivePage("AdminProjets") },
    Analyse: { to: "/Dossiers", icon: Folder, actif: isActivePage("Analyse") || isActivePage("ConversationsMandataires"), badge: nonLusKlocka || null, badgeColor: "bg-menthe text-sur-menthe" },
    FichesCommerciales: { to: createPageUrl("FichesCommerciales"), icon: Inbox, actif: isActivePage("FichesCommerciales") },
    Prospection: { to: createPageUrl("Prospection"), icon: Phone, actif: isActivePage("Prospection") },
    ALX: { to: "/ALX", icon: Compass, actif: isActivePage("ALX") || isActivePage("ALXAtelier") || isActivePage("ALXVilles") || isActivePage("ALXCible") || isActivePage("ALXBilan"), badge: alxAFaire || null, badgeColor: "bg-rail-actif text-craie" },
    // Suivi : l'usage de la plateforme et ce que coûte chaque geste, deux onglets d'une même page.
    Monitoring: { to: "/Suivi", icon: Activity, actif: isActivePage("Monitoring") || isActivePage("CoutsIA") },
    AdminSuggestions: { to: createPageUrl("AdminSuggestions"), icon: Lightbulb, actif: isActivePage("AdminSuggestions") },
    Feedback: { to: createPageUrl("Feedback"), icon: Lightbulb, actif: isActivePage("Feedback") },
    SimulateurRentabilite: { to: createPageUrl("SimulateurRentabilite"), icon: Calculator, actif: isActivePage("SimulateurRentabilite") },
    AdminClients: { to: createPageUrl("AdminClients"), icon: Users, actif: isActivePage("AdminClients") },
    // Offres : les lettres d'intention d'achat, rédigées au chat.
    Offres: { to: createPageUrl("Offres"), icon: FileSignature, actif: isActivePage("Offres") },
    AdminPresentations: { to: "/Presentations", icon: Presentation, actif: isActivePage("AdminPresentations") },
    AdminLeadMagnets: { to: createPageUrl("AdminLeadMagnets"), icon: Magnet, actif: isActivePage("AdminLeadMagnets") },
    AdminRessources: { to: createPageUrl("AdminRessources"), icon: BookOpen, actif: isActivePage("AdminRessources") },
    AdminPortail: { to: createPageUrl("AdminPortail"), icon: UserPlus, actif: isActivePage("AdminPortail") },
    AdminMandataires: { to: createPageUrl("AdminMandataires"), icon: MapPin, actif: isActivePage("AdminMandataires") },
    MandataireProspection: { to: createPageUrl("MandataireProspection"), icon: MapPin, actif: isActivePage("MandataireProspection") },
    MandataireClients: { to: createPageUrl("MandataireClients"), icon: Users, actif: isActivePage("MandataireClients") },
    MandataireEstimation: { to: createPageUrl("MandataireEstimation"), icon: Calculator, actif: isActivePage("MandataireEstimation") },
    MandataireMandat: { to: createPageUrl("MandataireMandat"), icon: FileSignature, actif: isActivePage("MandataireMandat") },
    MandataireDossier: { to: createPageUrl("MandataireDossier"), icon: Folder, actif: isActivePage("MandataireDossier"), badge: nonLusMandataire || null, badgeColor: "bg-menthe text-sur-menthe" },
    ConversationsMandataires: { to: createPageUrl("ConversationsMandataires"), icon: MessagesSquare, actif: isActivePage("ConversationsMandataires"), badge: nonLusKlocka || null, badgeColor: "bg-menthe text-sur-menthe" },
    MandataireMarche: { to: createPageUrl("MandataireMarche"), icon: Presentation, actif: isActivePage("MandataireMarche") },
    MandataireProjets: { to: createPageUrl("MandataireProjets"), icon: Building2, actif: isActivePage("MandataireProjets") },
    AdminValidations: { to: createPageUrl("AdminValidations"), icon: ClipboardCheck, actif: isActivePage("AdminValidations") },
    Personnalisation: { to: createPageUrl("Personnalisation"), icon: user?.role === "admin" || user?.role === "mandataire" ? CircleUser : Palette, actif: isActivePage("Personnalisation") },
    ImportProjets: { to: createPageUrl("ImportProjets"), icon: Upload, actif: isActivePage("ImportProjets") },
    MesProjets: { to: createPageUrl("MesProjets"), icon: Building2, actif: isActivePage("MesProjets") },
    Vision: { to: createPageUrl("Vision"), icon: Eye, actif: isActivePage("Vision") },
    Ressources: { to: createPageUrl("Ressources"), icon: BookOpen, actif: isActivePage("Ressources") },
  };

  // La barre latérale (maquette du 28 septembre 2026) : la marque et le
  // repli ; Klocka | K-Data ; la vue ; les pages avec leur nom ; « Autre » ;
  // en bas le compte, l'autre compte, le thème, la déconnexion. Repliée,
  // elle devient un rail d'icônes. Sur mobile, la même chose dans un tiroir.
  const sidebarContent = (isMobile = false) => {
    const replie = sidebarCollapsed && !isMobile;
    // Le menu principal et « Autre », tels que la personne les a rangés dans
    // Personnalisation (glisser-déposer d'un groupe à l'autre).
    const { principal: entrees, autre: autres } = repartir(
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
    const bouton = "grid h-8 w-8 place-items-center rounded-[8px] text-ardoise transition-colors hover:bg-rail-actif hover:text-encre";
    return (
      <div className="flex h-full flex-col">
        {/* La marque, et le repli. */}
        <div className={`flex h-[56px] flex-shrink-0 items-center ${replie ? "justify-center" : "gap-2.5 pl-4 pr-2.5"}`}>
          <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center gap-2.5" title="Klocka">
            <img src="/logo-klocka.svg" alt="Klocka" className="h-6 w-6 rounded-[6px]" draggable={false} />
            {!replie && <span className="text-[17px] font-semibold tracking-[-0.01em] text-encre">Klocka</span>}
          </Link>
          {!isMobile && !replie && (
            <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Replier le menu" title="Replier le menu" className={`ml-auto ${bouton}`} style={{ background: "transparent" }}>
              <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
            </button>
          )}
          {isMobile && (
            <Button variant="ghost" size="icon" onClick={closeMobile} className="ml-auto text-ardoise hover:text-encre">
              <X className="w-5 h-5" />
            </Button>
          )}
        </div>
        {replie && (
          <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Déplier le menu" title="Déplier le menu" className={`mx-auto ${bouton}`} style={{ background: "transparent" }}>
            <PanelLeft className="h-4 w-4" strokeWidth={1.7} />
          </button>
        )}

        {/* Klocka | K-Data : deux espaces, un compte. Choisir K-Data quitte
            cette barre pour la barre du haut de K-Data. Un client n'a pas
            K-Data : la vue client ne le propose pas. */}
        {isAdmin && !showClientView && !replie && (
          <div className="mx-3 mt-1 grid grid-cols-2 rounded-[12px] bg-rail-actif p-1">
            {[["klocka", "Klocka"], ["kdata", "K-Data"]].map(([k, mot]) => {
              const actif = k === "kdata" ? enKData : !enKData;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { if (isMobile) closeMobile(); navigate(k === "kdata" ? createPageUrl("KData") : createPageUrl("Dashboard")); }}
                  aria-pressed={actif}
                  className={`rounded-[9px] py-1 text-[14px] transition-colors ${actif ? "bg-surface-pleine text-encre shadow-[0_1px_3px_rgb(0_0_0/0.08)]" : "text-ardoise hover:text-encre"}`}
                  style={actif ? undefined : { background: "transparent" }}
                >
                  {mot}
                </button>
              );
            })}
          </div>
        )}

        {/* La vue : admin, ou comme un client. */}
        {isAdmin && !replie && (
          <div className="mx-3 mt-2.5 flex items-center gap-2.5 px-2">
            <Eye className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />
            <AnimatedDropdown
              value={apercu}
              onChange={(v) => { choisirApercu(v); setApercu(v); }}
              options={[
                { value: 'admin', label: 'Vue Admin' },
                { value: 'client', label: 'Vue Client' },
                { value: 'mandataire', label: 'Vue Mandataire' },
              ]}
              className="flex-1"
              triggerClassName="bg-transparent border-none text-encre text-[14.5px] h-7 px-0 hover:bg-transparent hover:text-encre"
            />
          </div>
        )}

        {/* Nouveau chat : retour au tableau de bord de départ (le fil se ferme,
            la conversation reste dans l'Historique). */}
        {(vue === "admin" || vue === "mandataire") && (
          <div className={`mt-3 ${replie ? "flex justify-center" : "px-3"}`}>
            <button type="button" onClick={() => { if (isMobile) closeMobile(); navigate(createPageUrl("Dashboard")); }}
              aria-label="Nouveau chat" title="Nouveau chat"
              className={replie
                ? "grid h-9 w-9 place-items-center rounded-full border border-trait text-craie hover:text-encre"
                : "flex w-full items-center gap-2.5 rounded-[10px] border border-trait px-3 py-2 text-[14px] text-encre transition-colors hover:bg-rail-actif"}
              style={{ background: "transparent" }}>
              <SquarePen className="h-4 w-4 flex-none text-ardoise" strokeWidth={1.7} />
              {!replie && "Nouveau chat"}
            </button>
          </div>
        )}

        {/* Les pages. */}
        <div className="mt-3 flex-1 overflow-y-auto px-3 pb-4">
          <div className="flex flex-col gap-0.5">
            {entrees.map((e) => {
              const lien = <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} key={e.cle} e={e} />;
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
                className={`flex items-center rounded-[10px] text-ardoise transition-colors hover:text-encre ${replie ? "mx-auto h-9 w-9 justify-center" : "gap-1.5 px-3 py-[6px] text-[15px]"}`}
                style={{ background: "transparent" }}
              >
                {!replie && <span>Autre</span>}
                <ChevronDown className={`h-4 w-4 transition-transform ${autreOpen ? "rotate-180" : ""}`} />
              </button>
              {autreOpen && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-150 mt-0.5 flex flex-col gap-0.5">
                  {autres.map((e) => {
              const lien = <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} key={e.cle} e={e} />;
              // Feedback : au survol, le panneau s'ouvre à côté du menu, sans quitter la page.
              return ["AdminSuggestions", "Feedback"].includes(e.cle) && !isMobile ? <FeedbackSurvol key={e.cle}>{lien}</FeedbackSurvol> : lien;
            })}
                  {AFFICHER_DOUBLE_CHECK && isAdmin && !showClientView && <LienRail details={DETAILS} replie={replie} onNaviguer={isMobile ? closeMobile : undefined} e={{ cle: "AdminBrouillons", label: "Double Check" }} to={createPageUrl("AdminBrouillons")} icon={ClipboardCheck} actif={isActivePage("AdminBrouillons")} />}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Le compte. */}
        <div className={`mt-auto flex-shrink-0 border-t border-trait ${replie ? "flex flex-col items-center gap-1 py-3" : "flex items-center gap-2 px-3 py-3"}`}>
          {/* Sa photo (déposée sur la page Compte, ou celle de Google), sinon son initiale.
              Le clic ouvre la page Compte ; un client garde « Mon compte ». */}
          <Link to={createPageUrl(user?.role === "admin" || user?.role === "mandataire" ? "Personnalisation" : "MonCompte")} onClick={isMobile ? closeMobile : undefined} title={user?.full_name || user?.email} className="grid h-9 w-9 flex-none place-items-center overflow-hidden rounded-full bg-menthe text-[14px] font-medium text-sur-menthe">
            {user?.picture ? <img src={user.picture} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : initiale}
          </Link>
          {!replie && <span className="min-w-0 flex-1 truncate text-[14px] text-encre">{nomCourt}</span>}
          <div className={`flex items-center ${replie ? "flex-col gap-1" : "gap-0"}`}>
            {!replie && (
              <button type="button" onClick={() => base44.auth.fenetre.ouvrir()} aria-label="Ouvrir un autre compte dans cette fenêtre" title="Ouvrir un autre compte dans cette fenêtre — celui-ci reste connecté dans les autres" className={bouton} style={{ background: "transparent" }}>
                <Users className="h-4 w-4" strokeWidth={1.7} />
              </button>
            )}
            <button type="button" onClick={basculer} aria-label={clair ? "Passer en mode sombre" : "Passer en mode clair"} title={clair ? "Passer en mode sombre" : "Passer en mode clair"} className={bouton} style={{ background: "transparent" }}>
              {clair ? <Moon className="h-4 w-4" strokeWidth={1.7} /> : <Sun className="h-4 w-4" strokeWidth={1.7} />}
            </button>
            <button type="button" onClick={() => base44.auth.logout(window.location.origin + '/Connexion')} aria-label="Déconnexion" title="Déconnexion" className={bouton} style={{ background: "transparent" }}>
              <LogOut className="h-4 w-4" strokeWidth={1.7} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    // `overflow-x-clip` plutôt que `hidden` : `hidden` créerait un conteneur de
    // défilement qui casserait les positions `sticky` des pages.
    <div className="min-h-screen flex w-full bg-fond relative overflow-x-clip">
      <style>{globalTooltipStyles}</style>
      {fondHalo && <FondHalo />}

      {modoKData ? (
        /* K-Data n'a pas de barre latérale : sa barre du haut, seule, sur
           bureau comme sur mobile — c'est elle qui fait sentir qu'on a
           changé de côté de l'application. Dans un cadre, rien du tout. */
        !enCadre && <BarreKData user={user} isActivePage={isActivePage} clair={clair} onBasculerTheme={basculer} />
      ) : (
        <>
          {/* La barre latérale de bureau ; repliée, un rail d'icônes. */}
          {!hideNavbar && (
            <aside
              data-zone="barre"
              className={`k-points k-barre-laterale hidden md:flex fixed left-0 top-0 z-40 h-screen flex-col border-r border-trait bg-rail transition-[width] duration-200 ${sidebarCollapsed ? "w-[64px]" : "w-[228px]"}`}
              style={{ paddingTop: "env(safe-area-inset-top)" }}
            >
              {sidebarContent(false)}
            </aside>
          )}

          {/* Mobile Top Bar */}
          {!hideNavbar && (
            <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-fond/80 backdrop-blur-xl border-b border-trait flex items-center justify-between px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
              {isChildPage ? (
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-encre -ml-2">
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              ) : (
                <Link to={createPageUrl("Dashboard")} className="flex items-center">
                  <Wordmark />
                </Link>
              )}
              <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-encre">
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          )}

          {/* Mobile Sidebar Overlay */}
          {isMobileMenuOpen && !hideNavbar && (
            <>
              <div className="md:hidden fixed inset-0 bg-fond/60 z-40 animate-in fade-in duration-200" onClick={closeMobile} />
              <aside data-zone="barre" className="k-points md:hidden fixed top-0 left-0 h-screen w-[248px] z-50 bg-rail animate-in slide-in-from-left duration-200 ease-out" style={{ boxShadow: "inset -1px 0 0 rgb(var(--k-encre-rgb) / 0.08)" }}>
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
        className={`k-points k-contenu relative z-10 flex-1 min-w-0 max-w-full max-md:overflow-x-hidden ${
          modoKData ? "" : !hideNavbar ? (sidebarCollapsed ? "md:ml-[64px] md:transition-[margin-left] md:duration-200" : "md:ml-[228px] md:transition-[margin-left] md:duration-200") : ""
        } ${
          modoKData
            ? (enCadre ? "" : "pt-14")
            : !hideNavbar
              ? (vueAdmin && currentPageName !== "Note" ? "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom)+4.5rem)] md:pb-0" : "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0")
              : ""
        }`}
      >
        {/* Entrée animée en CSS, sans animation de sortie : une sortie qui
            n'aboutit pas (framer-motion + layoutId) laissait l'écran noir. */}
        {/* `main` porte 56px de padding en haut sous la barre de K-Data : une
            hauteur minimale d'un écran plein y ajoutait 56px de vide en bas,
            sous les cartes qui, elles, tombent juste. */}
        <div key={`${location.pathname}|${vue}`} className={`animate-in fade-in slide-in-from-right-4 duration-300 ease-out ${modoKData ? (enCadre ? "min-h-[100dvh]" : "min-h-[calc(100dvh-3.5rem)]") : "min-h-screen"}`}>
          {children}
        </div>
      </main>

      {/* Signaler quelque chose sans quitter la page : l'icône reste en haut à
          droite, le panneau s'ouvre dessous et la remarque part de là. */}

      {/* L'assistant suit l'admin de page en page, côté Klocka seulement :
          K-Data répond à une question de marché, pas à un dossier client. */}
      {/* La page Note est déjà l'assistant, en grand : pas de pilule en double. */}
      {/* La pilule flottante se tait sur le dashboard : le chat y est déjà. */}
      {vueAdmin && !hideNavbar && !modoKData && !["Dashboard", "Analyse"].includes(currentPageName) && <AssistantFlottant />}

      {/* La recherche du rail, et ⌘K. */}
      {vueAdmin && <RechercheRapide ouvert={rechercheOuverte} onFermer={() => setRechercheOuverte(false)} />}
      {(vue === "admin" || vue === "mandataire") && <NotificationsApp />}
      {/* L'accueil du mandataire : ses réglages à l'arrivée, tant qu'ils ne sont pas validés. */}
      {vue === "mandataire" && !hideNavbar && <AccueilMandataire />}

      {/* Barre d'onglets mobile */}
      {!hideNavbar && showClientView && <BottomTabs vue={vue} />}
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