import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import BottomTabs from "@/components/mobile/BottomTabs";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  Calculator,
  BookOpen,
  Users,
  LogOut,
  Brain,
  ClipboardCheck,
  TrendingUp,
  Eye,
  FileText,
  MessageSquare,
  Lightbulb,
  UserPlus,
  Scale,
  Search,
  Sparkles,
  Activity,
  Presentation,
  Menu,
  X,
  ChevronLeft,
  ChevronDown,
  ExternalLink,
  Pin,
  PinOff,
  Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { useQuery } from "@tanstack/react-query";
import { UserProvider, useUser } from "@/components/providers/UserProvider";
import AssistantFlottant from "@/components/AssistantFlottant";

const globalTooltipStyles = `
  [role="tooltip"],
  [data-state="delayed-open"],
  [data-radix-popper-content-wrapper] [role="tooltip"],
  .recharts-tooltip-wrapper {
    --tooltip-bg: #1a1a1a !important;
    --tooltip-text: #fff !important;
  }
  [role="tooltip"] {
    background-color: #1a1a1a !important;
    color: #fff !important;
    border: 1px solid #374151 !important;
  }
  [data-radix-popper-content-wrapper] {
    z-index: 50;
  }
  .recharts-tooltip-wrapper .recharts-default-tooltip {
    background-color: #1a1a1a !important;
    border: 1px solid #374151 !important;
    border-radius: 8px !important;
  }
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-label,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item-name,
  .recharts-tooltip-wrapper .recharts-default-tooltip .recharts-tooltip-item-value {
    color: #fff !important;
  }
`;

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
      <span className="text-[13px] tracking-[0.3em] text-[#edeae5]">KLOCKA</span>
    </span>
  );
}

function NavItem({ to, icon: Icon, label, badge, badgeColor, isActive, onClick, collapsed }) {
  return (
    <Link to={to} onClick={onClick} title={collapsed ? label : undefined}>
      <div className={`relative flex items-center gap-2 pl-3.5 pr-2.5 py-[7px] text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-200 group
        ${isActive ? "text-[#edeae5]" : "text-[#9aa19e] hover:text-[#edeae5]"}
        ${collapsed ? "justify-center px-0 py-2" : ""}
      `}>
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-200
          ${isActive ? "h-5 bg-[#35a79b]" : "h-0 bg-transparent group-hover:h-3 group-hover:bg-[#edeae5]/20"}`} />
        {collapsed ? (
          <Icon className={`w-[17px] h-[17px] flex-shrink-0 transition-colors ${isActive ? "text-[#35a79b]" : "text-[#6b7270] group-hover:text-[#d3d8d6]"}`} />
        ) : (
          <>
            <Icon className={`w-[15px] h-[15px] flex-shrink-0 transition-colors ${isActive ? "text-[#35a79b]" : "text-[#6b7270] group-hover:text-[#d3d8d6]"}`} />
            <span className="flex-1 truncate">{label}</span>
            {badge && (
              <Badge className={`${badgeColor || "bg-transparent text-[#7fd3c9]"} text-[9px] tracking-[0.12em] px-1.5 py-0 border-0`}>
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
    <button onClick={onClick} title="Autre"
      className={`w-full relative flex items-center gap-2 pl-3.5 pr-2.5 py-[7px] text-[10.5px] uppercase tracking-[0.14em] transition-colors duration-200 group text-[#6b7270] hover:text-[#edeae5] ${collapsed ? "justify-center px-0 py-2" : ""}`}>
      {collapsed ? (
        <ChevronDown className={`w-[17px] h-[17px] flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      ) : (
        <>
          <span className="flex-1 text-left">Autre</span>
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

// Pages that are "child" pages (show back button on mobile)
const CHILD_PAGES = ['ProjetDetail', 'MonCompte', 'Questionnaire', 'ProjectAssistant', 'Vision', 'SimulateurRentabilite', 'Comparateur', 'Ressources', 'KlockAI'];

function LayoutContent({ children, currentPageName }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useUser();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(() => localStorage.getItem('sidebarPinned') === 'true');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => localStorage.getItem('sidebarPinned') !== 'true');
  const [previewClientMode, setPreviewClientMode] = useState(() => localStorage.getItem('previewClientMode') === 'true');
  const [autreOpen, setAutreOpen] = useState(false);
  const isChildPage = CHILD_PAGES.includes(currentPageName);

  const isNewUser = user && user.role !== 'admin' && (user.etape_actuelle ?? 0) === 0;
  const pagesWithoutNavbar = ['Questionnaire', 'Home'];

  useEffect(() => { localStorage.setItem('previewClientMode', previewClientMode); }, [previewClientMode]);
  useEffect(() => {
    localStorage.setItem('sidebarPinned', sidebarPinned);
    if (sidebarPinned) setSidebarCollapsed(false);
  }, [sidebarPinned]);

  const isAdmin = user?.role === "admin";
  const showClientView = !isAdmin || previewClientMode;
  const hideNavbar = pagesWithoutNavbar.includes(currentPageName) || isNewUser;

  const isActivePage = (pageName) => {
    const pageUrl = createPageUrl(pageName);
    return location.pathname === pageUrl || location.pathname === pageUrl + '/';
  };

  const closeMobile = () => setIsMobileMenuOpen(false);

  const sidebarContent = (isMobile = false) => (
    <div className="flex flex-col h-full">
      {/* Marque */}
      <div className={`flex items-center h-[60px] flex-shrink-0 ${sidebarCollapsed && !isMobile ? "justify-center" : "px-3.5"}`}>
        <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center">
          <Wordmark collapsed={sidebarCollapsed && !isMobile} />
        </Link>
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={closeMobile} className="ml-auto text-[#9aa19e] hover:text-[#edeae5]">
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>
      <div className={`h-px bg-gradient-to-r from-transparent via-[#35a79b]/25 to-transparent ${sidebarCollapsed && !isMobile ? "mx-2" : "mx-3.5"}`} />

      {/* Toggle rester ouvert (desktop uniquement, sidebar ouverte) */}
      {!isMobile && !sidebarCollapsed && (
        <div className="px-3.5 pt-3.5">
          <button
            onClick={() => setSidebarPinned((v) => !v)}
            className={`w-full flex items-center gap-2 py-1.5 transition-colors text-[11px] tracking-[0.08em]
              ${sidebarPinned ? "text-[#35a79b]" : "text-[#6b7270] hover:text-[#d3d8d6]"}`}
            title={sidebarPinned ? "La barre reste ouverte" : "Garder la barre ouverte"}
          >
            {sidebarPinned ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
            <span className="flex-1 text-left">Rester ouvert</span>
            <span className={`w-7 h-3.5 rounded-full relative transition-colors flex-shrink-0 ${sidebarPinned ? "bg-[#35a79b]" : "bg-[#edeae5]/10"}`}>
              <span className={`absolute top-0.5 w-2.5 h-2.5 rounded-full transition-all ${sidebarPinned ? "left-4 bg-[#0a0c0c]" : "left-0.5 bg-[#edeae5]/70"}`} />
            </span>
          </button>
        </div>
      )}

      {/* Admin view switcher */}
      {isAdmin && !(sidebarCollapsed && !isMobile) && (
        <div className="px-3.5 pt-3 pb-1">
          <div className="flex items-center gap-2 border-b border-[#edeae5]/[0.06] pb-1">
            <Eye className="w-3.5 h-3.5 text-[#6b7270]" />
            <AnimatedDropdown
              value={previewClientMode ? 'client' : 'admin'}
              onChange={(v) => setPreviewClientMode(v === 'client')}
              options={[
                { value: 'admin', label: 'Vue Admin' },
                { value: 'client', label: 'Vue Client' },
              ]}
              className="flex-1"
              triggerClassName="bg-transparent border-none text-[#edeae5] h-7 px-0 hover:bg-transparent hover:text-[#edeae5]"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto pl-0 pr-1.5 pt-4 pb-4 space-y-1">
        {showClientView ? (
          <>
            <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("MesProjets")} icon={Building2} label="Mes projets" isActive={isActivePage("MesProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("Ressources")} icon={BookOpen} label="Ressources" isActive={isActivePage("Ressources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />

            <div className="pt-3">
              <AutreToggle open={autreOpen} onClick={() => setAutreOpen(v => !v)} collapsed={sidebarCollapsed && !isMobile} />
              {autreOpen && (
                <div className="space-y-px">
                  <NavItem to={createPageUrl("Vision")} icon={TrendingUp} label="Vision" isActive={isActivePage("Vision")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("Comparateur")} icon={Scale} label="Comparateur" isActive={isActivePage("Comparateur")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                </div>
              )}
            </div>
          </>
        ) : isAdmin && !previewClientMode ? (
          <>
            <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("AdminProjets")} icon={Building2} label="Projets" isActive={isActivePage("AdminProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to="/Analyse" icon={Search} label="Dossiers" isActive={isActivePage("Analyse")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to="/Assistant" icon={Sparkles} label="Assistant" isActive={isActivePage("Assistant")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to="/Monitoring" icon={Activity} label="Suivi" isActive={isActivePage("Monitoring")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            <NavItem to={createPageUrl("AdminClients")} icon={Users} label="Clients" isActive={isActivePage("AdminClients")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />

            <div className="pt-3">
              <AutreToggle open={autreOpen} onClick={() => setAutreOpen(v => !v)} collapsed={sidebarCollapsed && !isMobile} />
              {autreOpen && (
                <div className="space-y-px">
                  <NavItem to="/AdminPresentations" icon={Presentation} label="Présentations" isActive={isActivePage("AdminPresentations")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("KlockAI")} icon={Brain} label="KlockAI" badge="IA" badgeColor="bg-[#35a79b]/20 text-[#35a79b]" isActive={isActivePage("KlockAI")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("Vision")} icon={TrendingUp} label="Vision" isActive={isActivePage("Vision")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("Comparateur")} icon={Scale} label="Comparateur" isActive={isActivePage("Comparateur")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  {AFFICHER_DOUBLE_CHECK && (
                    <NavItem to={createPageUrl("AdminBrouillons")} icon={ClipboardCheck} label="Double Check" isActive={isActivePage("AdminBrouillons")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  )}
                  <NavItem to="/AdminNotes" icon={FileText} label="Notes" isActive={isActivePage("AdminNotes")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("Familles")} icon={Users} label="Familles" isActive={isActivePage("Familles")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("AdminRessources")} icon={BookOpen} label="Ressources" isActive={isActivePage("AdminRessources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("AdminSuggestions")} icon={Lightbulb} label="Feedback" isActive={isActivePage("AdminSuggestions")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to={createPageUrl("AdminPortail")} icon={UserPlus} label="Portails" isActive={isActivePage("AdminPortail")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to="/ImportProjects" icon={Upload} label="Import projets" isActive={isActivePage("ImportProjects")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                  <NavItem to="/ImportClients" icon={Upload} label="Import clients" isActive={isActivePage("ImportClients")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* User & Logout */}
      <div className="px-3.5 py-3.5 border-t border-[#edeae5]/[0.06]">
        {!(sidebarCollapsed && !isMobile) ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full border border-[#35a79b]/40 flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] text-[#35a79b] tracking-[0.06em]">
                {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] text-[#edeae5] truncate">{user?.full_name || user?.email?.split('@')[0]}</p>
              <p className="text-[10px] text-[#6b7270] truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => base44.auth.logout(window.location.origin + '/Home')}
              className="text-[#6b7270] hover:text-[#edeae5] hover:bg-transparent h-8 w-8 flex-shrink-0"
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
            className="text-[#8b9391] hover:text-[#edeae5] hover:bg-[#edeae5]/5 h-8 w-8 mx-auto block"
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
    <div className="min-h-screen flex w-full bg-[#0a0c0c] relative overflow-x-clip">
      <style>{globalTooltipStyles}</style>

      {/* Desktop Sidebar */}
      {!hideNavbar && (
        <aside
          className={`hidden md:flex flex-col fixed top-0 left-0 h-screen z-40 backdrop-blur-xl transition-all duration-300 ${sidebarCollapsed ? "w-[52px]" : "w-[172px]"}`}
          style={{
            paddingTop: "env(safe-area-inset-top)",
            background: "linear-gradient(180deg, #070b0a 0%, #0a0c0c 55%, #040605 100%)",
            boxShadow: "inset -1px 0 0 rgba(237,234,229,0.06)",
          }}
        >
          {sidebarContent(false)}
          <button
            onClick={() => { if (!sidebarPinned) setSidebarCollapsed(!sidebarCollapsed); }}
            disabled={sidebarPinned}
            className={`hidden md:flex absolute -right-3 top-[60px] z-50 w-6 h-6 rounded-full bg-[#0a0c0c] border border-[#edeae5]/10 items-center justify-center text-[#8b9391] hover:text-[#edeae5] hover:border-[#35a79b]/50 transition-colors ${sidebarPinned ? "opacity-40 cursor-not-allowed" : ""}`}
            title={sidebarPinned ? "Désépinglez pour fermer" : sidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
          >
            <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`} />
          </button>
        </aside>
      )}

      {/* Mobile Top Bar */}
      {!hideNavbar && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#0a0c0c]/80 backdrop-blur-xl border-b border-[#242726] flex items-center justify-between px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {isChildPage ? (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-[#edeae5] -ml-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          ) : (
            <Link to={createPageUrl("Dashboard")} className="flex items-center">
              <Wordmark />
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-[#edeae5]">
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && !hideNavbar && (
        <>
          <div className="md:hidden fixed inset-0 bg-[#0a0c0c]/60 z-40" onClick={closeMobile} />
          <aside className="md:hidden fixed top-0 left-0 h-screen w-[220px] z-50 bg-[#0a0c0c]" style={{ boxShadow: "inset -1px 0 0 rgba(237,234,229,0.06)" }}>
            {sidebarContent(true)}
          </aside>
        </>
      )}



      {/* Main Content */}
      <main
        className={`flex-1 ${!hideNavbar ? (sidebarCollapsed ? "md:ml-[52px]" : "md:ml-[172px]") : ""} ${!hideNavbar ? "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -18 }}
            transition={{ duration: 0.22, ease: "easeInOut" }}
            className="min-h-screen"
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* L'assistant suit l'admin de page en page. */}
      {isAdmin && !hideNavbar && <AssistantFlottant />}

      {/* Barre d'onglets mobile */}
      {!hideNavbar && showClientView && <BottomTabs />}
    </div>
  );
}

export default function Layout(props) {
  return (
    <UserProvider>
      <LayoutContent {...props} />
    </UserProvider>
  );
}