import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import BottomTabs from "@/components/mobile/BottomTabs";
import {
  LayoutDashboard,
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
  Upload, Mic, Compass, Database, Sun, Moon } from "lucide-react";
import { MODULES_KDATA, PAGES_KDATA } from "@/lib/kdata-modules";
import { useTheme } from "@/lib/theme";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { useQuery } from "@tanstack/react-query";
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

// La pilule de verre : une seule, posée sous le lien de la page où l'on est,
// qui glisse jusqu'au suivant quand on change de page. Elle se mesure sur le
// lien marqué data-actif, dans la piste qui contient les liens.
function PiluleNav({ piste, cles }) {
  const [pos, setPos] = useState(null);
  const premier = useRef(true);
  // Le tableau de clés change à chaque rendu ; sa version texte, non.
  const cle = cles.join("|");
  // Un effet passif, pas de mise en page : la pilule est l'enfant de la piste,
  // et son effet de mise en page partirait avant que la ref de la piste soit
  // posée.
  useEffect(() => {
    const cont = piste.current;
    if (!cont) return;
    const mesurer = () => {
      const el = cont.querySelector('[data-actif="1"]');
      if (!el) { setPos(null); return; }
      const a = el.getBoundingClientRect();
      const c = cont.getBoundingClientRect();
      const suite = { top: a.top - c.top + cont.scrollTop, left: a.left - c.left + cont.scrollLeft, width: a.width, height: a.height };
      setPos((p) => (p && p.top === suite.top && p.left === suite.left && p.width === suite.width && p.height === suite.height ? p : suite));
    };
    mesurer();
    // La pilule doit suivre le lien même quand la piste, elle, ne change pas
    // de taille : la police d'écriture arrive après le premier rendu et
    // décale les liens de quelques pixels, une pastille apparaît, un groupe
    // s'ouvre. Sans ces trois guets, la pilule reste où elle a été mesurée et
    // le mot ne tombe plus en son milieu.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(mesurer) : null;
    ro?.observe(cont);
    const mo = typeof MutationObserver !== "undefined" ? new MutationObserver(mesurer) : null;
    mo?.observe(cont, { childList: true, subtree: true, attributes: true });
    window.addEventListener("resize", mesurer);
    document.fonts?.ready?.then(mesurer);
    return () => { ro?.disconnect(); mo?.disconnect(); window.removeEventListener("resize", mesurer); };
  }, [piste, cle]);
  useEffect(() => { if (pos) premier.current = false; }, [pos]);
  if (!pos) return null;
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute z-0 !mt-0 rounded-full border border-encre/[0.10] bg-encre/[0.07] shadow-[0_8px_24px_rgba(0,0,0,0.28)] backdrop-blur-md"
      style={{
        top: pos.top, left: pos.left, width: pos.width, height: pos.height,
        transition: premier.current ? "none" : "top 380ms cubic-bezier(.22,1,.36,1), height 380ms cubic-bezier(.22,1,.36,1), left 300ms ease, width 300ms ease",
      }}
    />
  );
}

function NavItem({ to, icon: Icon, label, badge, badgeColor, isActive, onClick, collapsed }) {
  return (
    <Link to={to} onClick={onClick} title={collapsed ? label : undefined} data-actif={isActive ? "1" : undefined} className="relative z-[1] block rounded-full">
      <div className={`relative flex items-center gap-2 px-3 py-[7px] text-[11px] uppercase tracking-[0.14em] transition-colors duration-200 group
        ${isActive ? "text-encre" : "text-ardoise hover:text-encre"}
        ${collapsed ? "justify-center px-0 py-2" : ""}
      `}>
        {collapsed ? (
          <Icon className={`w-[17px] h-[17px] flex-shrink-0 transition-colors ${isActive ? "text-menthe" : "text-brume group-hover:text-craie"}`} />
        ) : (
          <>
            <Icon className={`w-[15px] h-[15px] flex-shrink-0 transition-colors ${isActive ? "text-menthe" : "text-brume group-hover:text-craie"}`} />
            <span className="truncate">{label}</span>
            {badge && (
              <Badge className={`${badgeColor || "bg-transparent text-menthe-clair"} absolute right-2 top-1/2 -translate-y-1/2 text-[11px] tracking-[0.12em] px-1.5 py-0 border-0`}>
                {badge}
              </Badge>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

// Bascule du groupe secondaire « Autre » : même typographie qu'un lien.
function AutreToggle({ open, onClick, collapsed }) {
  return (
    <button onClick={onClick} aria-label="Autre" title="Autre"
      className={`w-full relative flex items-center gap-2 px-3 py-[7px] text-[11px] uppercase tracking-[0.14em] transition-colors duration-200 group text-brume hover:text-encre ${collapsed ? "justify-center px-0 py-2" : ""}`}>
      {collapsed ? (
        <ChevronDown className={`w-[17px] h-[17px] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      ) : (
        <>
          <span>Autre</span>
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
        </>
      )}
    </button>
  );
}

// Les intitulés de section ne sont plus affichés et les groupes ne créent plus
// d'espacement propre : le composant ne sert qu'à garder la structure lisible
// dans le code. L'écart entre deux liens est identique partout, donné par le
// `space-y` du conteneur de navigation.
function NavSection({ children }) {
  return <>{children}</>;
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
      <Link to={createPageUrl("Dashboard")} className="flex flex-shrink-0 items-center gap-2 pr-3" title="Revenir à Klocka">
        <img src="/logo-klocka.svg" alt="" className="h-6 w-6 rounded-[5px]" draggable={false} />
        <ChevronLeft className="h-3.5 w-3.5 text-brume" />
      </Link>
      <div className="mr-2 h-5 w-px flex-shrink-0 bg-encre/[0.1]" />

      <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto whitespace-nowrap">
        <Link
          to={createPageUrl("KData")}
          data-actif={isActivePage("KData") ? "1" : undefined}
          className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${isActivePage("KData") ? "bg-encre/[0.07] text-encre" : "text-ardoise hover:text-encre"}`}
        >
          K-Data
        </Link>
        {MODULES_KDATA.map((m) => {
          const actif = isActivePage(m.pageName);
          const ouvrable = !!m.chemin;
          const Icone = m.icone;
          const classes = `flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${
            actif ? "bg-encre/[0.07] text-encre" : ouvrable ? "text-ardoise hover:text-encre" : "cursor-default text-brume/50"
          }`;
          return ouvrable ? (
            <Link key={m.cle} to={m.chemin} data-actif={actif ? "1" : undefined} className={classes}>
              <Icone className="h-3.5 w-3.5" />{m.nom}
            </Link>
          ) : (
            <span key={m.cle} className={classes} title={m.etat}>
              <Icone className="h-3.5 w-3.5" />{m.nom}
            </span>
          );
        })}
      </nav>

      <div className="ml-2 flex flex-shrink-0 items-center gap-2">
        <BasculeTheme clair={clair} onBasculer={onBasculerTheme} />
        <div className="hidden h-7 w-7 items-center justify-center rounded-full border border-menthe/40 md:flex" title={user?.full_name || user?.email}>
          <span className="text-[11px] text-menthe tracking-[0.06em]">{(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => base44.auth.logout(window.location.origin + '/Home')}
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  // La barre latérale est ouverte à chaque chargement ; le chevron la replie
  // le temps de la session, et rien ne s'en souvient.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { clair, basculer } = useTheme();
  const [previewClientMode, setPreviewClientMode] = useState(() => localStorage.getItem('previewClientMode') === 'true');
  const [autreOpen, setAutreOpen] = useState(false);
  const isChildPage = CHILD_PAGES.includes(currentPageName);

  // Alexis : la page secrète se visite sans barre latérale — rien ne doit y mener.
  const pagesWithoutNavbar = ['Questionnaire', 'Home', 'Alexis'];

  useEffect(() => { localStorage.setItem('previewClientMode', previewClientMode); }, [previewClientMode]);

  const isAdmin = user?.role === "admin";
  // Ce qui est en retard suit l'admin de page en page : sans ce compteur, un
  // rappel dû n'existe que si l'on retourne au tableau de bord.
  const { data: attend } = useQuery({
    queryKey: ["ce-qui-attend"],
    queryFn: () => base44.request("GET", "/api/assistant/attend"),
    enabled: isAdmin,
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
  const enRetard = attend?.en_retard || 0;
  // ALX suit de même : les cibles à appeler cette semaine, en pastille.
  const { data: alx } = useQuery({
    queryKey: ["alx-etat"],
    queryFn: () => base44.request("GET", "/api/alx/etat"),
    enabled: isAdmin,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60 * 1000,
  });
  const alxAFaire = alx?.a_faire?.a_appeler || 0;
  const showClientView = !isAdmin || previewClientMode;
  const hideNavbar = pagesWithoutNavbar.includes(currentPageName);
  // Le halo : le fond de l'application, posé ici une fois derrière toutes
  // les pages, dont les surfaces sont du verre. La nav s'efface pour le
  // laisser passer, floutant ce qui défile derrière elle.
  //
  // Deux exceptions. ALX garde son noir sur son accueil, qui fait tenir ses
  // cartes ; la carte d'un investisseur et la page d'une ville sont des pages
  // de travail comme les autres, et reçoivent le halo. Le dashboard admin
  // garde les nappes menthe du plan de travail : deux halos l'un sur l'autre
  // ne font pas un fond.
  const fondHalo = !hideNavbar
    && !(currentPageName === "Dashboard" && !showClientView)
    && !(currentPageName === "ALX" && !["carte", "ville"].some((c) => new URLSearchParams(location.search).has(c)));

  // Les chemins se comparent sans la casse : « /Analyse » et « /analyse »
  // sont la même page, et le lien Dossiers pointe sur le premier.
  const isActivePage = (pageName) => {
    const pageUrl = createPageUrl(pageName);
    const ici = location.pathname.toLowerCase();
    return ici === pageUrl || ici === pageUrl + '/';
  };

  const closeMobile = () => setIsMobileMenuOpen(false);
  const pisteBureau = useRef(null);
  const pisteMobile = useRef(null);

  // On est dans K-Data dès que la page ouverte est son tableau de bord ou
  // l'un de ses modules. Ce n'est pas un lien de plus dans le menu : c'est un
  // autre espace, qui échange la barre latérale de Klocka contre sa propre
  // barre du haut.
  const enKData = PAGES_KDATA.some((p) => isActivePage(p));
  const modoKData = enKData && isAdmin && !hideNavbar;

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Marque */}
      <div className={`flex items-center h-[60px] flex-shrink-0 ${sidebarCollapsed && !isMobile ? "justify-center" : "px-3.5"}`}>
        <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center">
          <Wordmark collapsed={sidebarCollapsed && !isMobile} />
        </Link>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={closeMobile} className="ml-auto text-ardoise hover:text-encre">
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>
      <div className={`h-px bg-gradient-to-r from-transparent via-menthe/25 to-transparent ${sidebarCollapsed && !isMobile ? "mx-2" : "mx-3.5"}`} />

      {/* Bascule Klocka / K-Data : deux espaces, un compte. Choisir K-Data
          quitte cette barre latérale pour la barre du haut de K-Data — ce
          n'est pas un lien de plus, c'est un autre côté de l'application. */}
      {isAdmin && !(sidebarCollapsed && !isMobile) && (
        <div className="px-3.5 pt-3 pb-1">
          <div className="flex items-center gap-2 border-b border-encre/[0.06] pb-1">
            <Database className="w-3.5 h-3.5 text-brume" />
            <AnimatedDropdown
              value={enKData ? "kdata" : "klocka"}
              onChange={(v) => {
                if (isMobile) closeMobile();
                navigate(v === "kdata" ? createPageUrl("KData") : createPageUrl("Dashboard"));
              }}
              options={[
                { value: "klocka", label: "Klocka" },
                { value: "kdata", label: "K-Data" },
              ]}
              className="flex-1"
              triggerClassName="bg-transparent border-none text-encre h-7 px-0 hover:bg-transparent hover:text-encre"
            />
          </div>
        </div>
      )}

      {/* Admin view switcher */}
      {isAdmin && !(sidebarCollapsed && !isMobile) && (
        <div className="px-3.5 pt-3 pb-1">
          <div className="flex items-center gap-2 border-b border-encre/[0.06] pb-1">
            <Eye className="w-3.5 h-3.5 text-brume" />
            <AnimatedDropdown
              value={previewClientMode ? 'client' : 'admin'}
              onChange={(v) => setPreviewClientMode(v === 'client')}
              options={[
                { value: 'admin', label: 'Vue Admin' },
                { value: 'client', label: 'Vue Client' },
              ]}
              className="flex-1"
              triggerClassName="bg-transparent border-none text-encre h-7 px-0 hover:bg-transparent hover:text-encre"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div ref={isMobile ? pisteMobile : pisteBureau} className="relative flex-1 overflow-y-auto px-2 pt-4 pb-4 space-y-1">
        {showClientView ? (
          <>
            <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} badge={enRetard || null} badgeColor="bg-alerte/20 text-alerte" />
            <NavItem to={createPageUrl("MesProjets")} icon={Building2} label="Mes projets" isActive={isActivePage("MesProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("Ressources")} icon={BookOpen} label="Ressources" isActive={isActivePage("Ressources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />

          </>
        ) : isAdmin && !previewClientMode ? (
          <>
            <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} badge={enRetard || null} badgeColor="bg-alerte/20 text-alerte" />
            <NavItem to={createPageUrl("AdminProjets")} icon={Building2} label="Projets" isActive={isActivePage("AdminProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to="/Analyse" icon={Search} label="Dossiers" isActive={isActivePage("Analyse")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to="/ALX" icon={Compass} label="ALX" isActive={isActivePage("ALX") || isActivePage("ALXVilles") || isActivePage("ALXCible") || isActivePage("ALXBilan")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} badge={alxAFaire || null} badgeColor="bg-alerte/20 text-alerte" />
            {/* Suivi : l'usage de la plateforme et ce que coûte chaque geste,
                deux onglets d'une même page. */}
            <NavItem to="/Monitoring" icon={Activity} label="Suivi" isActive={isActivePage("Monitoring") || isActivePage("CoutsIA")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <FeedbackSurvol>
              <NavItem to={createPageUrl("AdminSuggestions")} icon={Lightbulb} label="Feedback" isActive={isActivePage("AdminSuggestions")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </FeedbackSurvol>
            <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("AdminClients")} icon={Users} label="Clients" isActive={isActivePage("AdminClients")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />

            <div className="pt-3">
              <AutreToggle open={autreOpen} onClick={() => setAutreOpen(v => !v)} collapsed={sidebarCollapsed && !isMobile} />
              {autreOpen && (
                <div className="space-y-px">
                  <NavItem to="/AdminPresentations" icon={Presentation} label="Présentations" isActive={isActivePage("AdminPresentations")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  {AFFICHER_DOUBLE_CHECK && (
                    <NavItem to={createPageUrl("AdminBrouillons")} icon={ClipboardCheck} label="Double Check" isActive={isActivePage("AdminBrouillons")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  )}
                  <NavItem to={createPageUrl("AdminRessources")} icon={BookOpen} label="Ressources" isActive={isActivePage("AdminRessources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("AdminPortail")} icon={UserPlus} label="Portails" isActive={isActivePage("AdminPortail")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                </div>
              )}
            </div>
          </>
        ) : null}
        <PiluleNav piste={isMobile ? pisteMobile : pisteBureau} cles={[location.pathname, autreOpen, sidebarCollapsed, showClientView, isMobile]} />
      </div>

      {/* User & Logout */}
      <div className="px-3.5 py-3.5 border-t border-encre/[0.06]">
        {!(sidebarCollapsed && !isMobile) ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-menthe/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] text-menthe tracking-[0.06em]">
                {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12.5px] text-encre truncate">{user?.full_name || user?.email?.split('@')[0]}</p>
              <p className="text-[11px] text-brume truncate">{user?.email}</p>
            </div>
            <BasculeTheme clair={clair} onBasculer={basculer} />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => base44.auth.fenetre.ouvrir()}
              className="text-brume hover:text-encre hover:bg-transparent h-8 w-8 flex-shrink-0"
              title="Ouvrir un autre compte dans cette fenêtre — celui-ci reste connecté dans les autres"
            >
              <Users className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => base44.auth.logout(window.location.origin + '/Home')}
              className="text-brume hover:text-encre hover:bg-transparent h-8 w-8 flex-shrink-0"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => base44.auth.logout(window.location.origin + '/Home')}
            className="text-ardoise hover:text-encre hover:bg-encre/5 h-8 w-8 mx-auto block"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    // `overflow-x-clip` plutôt que `hidden` : `hidden` créerait un conteneur de
    // défilement qui casserait les positions `sticky` des pages.
    <div className="min-h-screen flex w-full bg-fond relative overflow-x-clip">
      <style>{globalTooltipStyles}</style>
      {fondHalo && <FondHalo />}

      {modoKData ? (
        /* K-Data n'a pas de barre latérale : sa barre du haut, seule, sur
           bureau comme sur mobile — c'est elle qui fait sentir qu'on a
           changé de côté de l'application. */
        <BarreKData user={user} isActivePage={isActivePage} clair={clair} onBasculerTheme={basculer} />
      ) : (
        <>
          {/* Desktop Sidebar */}
          {!hideNavbar && (
            <aside
              className={`hidden md:flex flex-col fixed top-0 left-0 h-screen z-40 backdrop-blur-xl transition-all duration-300 ${sidebarCollapsed ? "w-[52px]" : "w-[172px]"}`}
              style={{
                paddingTop: "env(safe-area-inset-top)",
                background: "rgb(var(--k-fond-halo-rgb) / 0.42)",
                backdropFilter: "blur(16px) saturate(1.15)",
                WebkitBackdropFilter: "blur(16px) saturate(1.15)",
                boxShadow: "inset -1px 0 0 rgb(var(--k-encre-rgb) / 0.08)",
              }}
            >
              {sidebarContent(false)}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden md:flex absolute -right-3 top-[60px] z-50 w-6 h-6 rounded-full bg-fond border border-encre/10 items-center justify-center text-ardoise hover:text-encre hover:border-menthe/50 transition-colors"
                aria-label={sidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"} title={sidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
              >
                <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`} />
              </button>
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
              <div className="md:hidden fixed inset-0 bg-fond/60 z-40" onClick={closeMobile} />
              <aside className="md:hidden fixed top-0 left-0 h-screen w-[220px] z-50 bg-fond/80 backdrop-blur-xl" style={{ boxShadow: "inset -1px 0 0 rgb(var(--k-encre-rgb) / 0.08)" }}>
                {sidebarContent(true)}
              </aside>
            </>
          )}
        </>
      )}

      {/* Main Content */}
      <main
        className={`relative z-10 flex-1 min-w-0 max-w-full max-md:overflow-x-hidden ${
          modoKData ? "" : !hideNavbar ? (sidebarCollapsed ? "md:ml-[52px]" : "md:ml-[172px]") : ""
        } ${
          modoKData
            ? "pt-14"
            : !hideNavbar
              ? (isAdmin && currentPageName !== "Note" ? "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom)+4.5rem)] md:pb-0" : "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0")
              : ""
        }`}
      >
        {/* Entrée animée en CSS, sans animation de sortie : une sortie qui
            n'aboutit pas (framer-motion + layoutId) laissait l'écran noir. */}
        <div key={location.pathname} className="min-h-screen animate-in fade-in slide-in-from-right-4 duration-300 ease-out">
          {children}
        </div>
      </main>

      {/* Signaler quelque chose sans quitter la page : l'icône reste en haut à
          droite, le panneau s'ouvre dessous et la remarque part de là. */}

      {/* L'assistant suit l'admin de page en page, côté Klocka seulement :
          K-Data répond à une question de marché, pas à un dossier client. */}
      {/* La page Note est déjà l'assistant, en grand : pas de pilule en double. */}
      {/* La pilule flottante se tait sur le dashboard : le chat y est déjà. */}
      {isAdmin && !hideNavbar && !modoKData && !["Dashboard", "Analyse"].includes(currentPageName) && <AssistantFlottant />}

      {/* Barre d'onglets mobile */}
      {!hideNavbar && showClientView && <BottomTabs />}
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