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
  Landmark,
  Search,
  Mail,
  Sparkles,
  Presentation,
  Menu,
  X,
  ChevronLeft,
  ExternalLink,
  Pin,
  PinOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AnimatedDropdown } from "@/components/ui/animated-dropdown";
import { useQuery } from "@tanstack/react-query";
import { UserProvider, useUser } from "@/components/providers/UserProvider";

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

function NavItem({ to, icon: Icon, label, badge, badgeColor, isActive, onClick, collapsed }) {
  return (
    <Link to={to} onClick={onClick}>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-200 group
        ${isActive 
          ? "bg-[#33d6c0]/15 text-white border border-[#33d6c0]/30" 
          : "text-[#93aca7] hover:text-white hover:bg-white/5"
        }
        ${collapsed ? "justify-center px-2" : ""}
      `}>
        <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${isActive ? "text-[#33d6c0]" : "text-[#7f9995] group-hover:text-[#c4d5d1]"}`} />
        {!collapsed && (
          <>
            <span className="flex-1 truncate">{label}</span>
            {badge && (
              <Badge className={`${badgeColor || "bg-[#33d6c0]/20 text-[#5ee7d4]"} text-[9px] px-1.5 py-0 border-0`}>
                {badge}
              </Badge>
            )}
          </>
        )}
      </div>
    </Link>
  );
}

function NavSection({ title, children, collapsed }) {
  if (collapsed) return <div className="space-y-1 py-1">{children}</div>;
  return (
    <div className="mb-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-[#5e7672] px-3 mb-2 font-medium">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
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
      {/* Logo */}
      <div className={`flex items-center ${sidebarCollapsed && !isMobile ? "justify-center py-5" : "gap-3 px-4 py-5"} border-b border-[#16201f]`}>
        {!(sidebarCollapsed && !isMobile) && (
          <Link to={createPageUrl("Dashboard")} onClick={isMobile ? closeMobile : undefined} className="flex items-center gap-2">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
              alt="Klocka"
              className="h-8 w-auto object-contain"
            />
          </Link>
        )}
        {isMobile && (
          <Button variant="ghost" size="icon" onClick={closeMobile} className="ml-auto text-[#93aca7] hover:text-white">
            <X className="w-5 h-5" />
          </Button>
        )}
      </div>

      {/* Toggle rester ouvert (desktop uniquement, sidebar ouverte) */}
      {!isMobile && !sidebarCollapsed && (
        <div className="px-3 pt-4 pb-1">
          <button
            onClick={() => setSidebarPinned((v) => !v)}
            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border transition-all text-xs
              ${sidebarPinned
                ? "bg-[#33d6c0]/15 border-[#33d6c0]/30 text-[#33d6c0]"
                : "bg-white/[0.03] border-[#16201f] text-[#93aca7] hover:text-white"}`}
            title={sidebarPinned ? "La barre reste ouverte" : "Garder la barre ouverte"}
          >
            {sidebarPinned ? <Pin className="w-3.5 h-3.5" /> : <PinOff className="w-3.5 h-3.5" />}
            <span className="flex-1 text-left">Rester ouvert</span>
            <span className={`w-8 h-4 rounded-full relative transition-colors flex-shrink-0 ${sidebarPinned ? "bg-[#33d6c0]" : "bg-white/10"}`}>
              <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${sidebarPinned ? "left-4" : "left-0.5"}`} />
            </span>
          </button>
        </div>
      )}

      {/* Admin view switcher */}
      {isAdmin && !(sidebarCollapsed && !isMobile) && (
        <div className="px-3 pt-4 pb-2">
          <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/[0.03] border border-[#16201f]">
            <Eye className="w-3.5 h-3.5 text-[#7f9995]" />
            <AnimatedDropdown
              value={previewClientMode ? 'client' : 'admin'}
              onChange={(v) => setPreviewClientMode(v === 'client')}
              options={[
                { value: 'admin', label: 'Vue Admin' },
                { value: 'client', label: 'Vue Client' },
              ]}
              className="flex-1"
              triggerClassName="bg-transparent border-none text-white h-7 px-0 hover:bg-transparent hover:text-white"
            />
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-4 space-y-1">
        {showClientView ? (
          <>
            <NavSection title="Principal" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Projets" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("MesProjets")} icon={Building2} label="Mes projets" isActive={isActivePage("MesProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Banque" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Banque")} icon={Landmark} label="Banque" isActive={isActivePage("Banque")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Outils" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Vision")} icon={TrendingUp} label="Vision" isActive={isActivePage("Vision")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("Comparateur")} icon={Scale} label="Comparateur" isActive={isActivePage("Comparateur")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <div className="my-4" />

            <NavSection title="Ressources" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Ressources")} icon={BookOpen} label="Ressources" isActive={isActivePage("Ressources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>
          </>
        ) : isAdmin && !previewClientMode ? (
          <>
            <NavSection title="Principal" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Dashboard")} icon={LayoutDashboard} label="Dashboard" isActive={isActivePage("Dashboard")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to="/Analyse" icon={Search} label="Analyse" isActive={isActivePage("Analyse")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Gestion" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("AdminProjets")} icon={Building2} label="Projets" isActive={isActivePage("AdminProjets")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("AdminClients")} icon={Users} label="Clients" isActive={isActivePage("AdminClients")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Banque" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("AdminBanque")} icon={Landmark} label="Banque" isActive={isActivePage("AdminBanque")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to="/AdminPresentations" icon={Presentation} label="Présentations" isActive={isActivePage("AdminPresentations")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Outils" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("KlockAI")} icon={Brain} label="KlockAI" badge="IA" badgeColor="bg-[#33d6c0]/20 text-[#33d6c0]" isActive={isActivePage("KlockAI")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("SimulateurRentabilite")} icon={Calculator} label="Simulateur" isActive={isActivePage("SimulateurRentabilite")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("Vision")} icon={TrendingUp} label="Vision" isActive={isActivePage("Vision")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("Comparateur")} icon={Scale} label="Comparateur" isActive={isActivePage("Comparateur")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              {/* Double Check — masqué du menu, la page reste accessible via
                  /AdminBrouillons. Repassez AFFICHER_DOUBLE_CHECK à true pour
                  la faire réapparaître. */}
              {AFFICHER_DOUBLE_CHECK && (
                <NavItem to={createPageUrl("AdminBrouillons")} icon={ClipboardCheck} label="Double Check" isActive={isActivePage("AdminBrouillons")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              )}
              <NavItem to="/Mails" icon={Mail} label="Mails" isActive={isActivePage("Mails")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to="/AdminNotes" icon={FileText} label="Notes" isActive={isActivePage("AdminNotes")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>

            <NavSection title="Autre" collapsed={sidebarCollapsed && !isMobile}>
              <NavItem to={createPageUrl("Familles")} icon={Users} label="Familles" isActive={isActivePage("Familles")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("AdminRessources")} icon={BookOpen} label="Ressources" isActive={isActivePage("AdminRessources")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("AdminSuggestions")} icon={Lightbulb} label="Feedback" isActive={isActivePage("AdminSuggestions")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
              <NavItem to={createPageUrl("AdminPortail")} icon={UserPlus} label="Portails" isActive={isActivePage("AdminPortail")} onClick={isMobile ? closeMobile : undefined} collapsed={sidebarCollapsed && !isMobile} />
            </NavSection>
          </>
        ) : null}
      </div>

      {/* User & Logout */}
      <div className="border-t border-[#16201f] px-3 py-3">
        {!(sidebarCollapsed && !isMobile) ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#33d6c0]/20 flex items-center justify-center flex-shrink-0">
              <span className="text-xs text-[#33d6c0] font-medium">
                {(user?.full_name || user?.email || "U").charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white truncate">{user?.full_name || user?.email?.split('@')[0]}</p>
              <p className="text-[10px] text-[#7f9995] truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => base44.auth.logout(window.location.origin + '/Home')}
              className="text-[#7f9995] hover:text-white hover:bg-white/5 h-8 w-8 flex-shrink-0"
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
            className="text-[#7f9995] hover:text-white hover:bg-white/5 h-8 w-8 mx-auto block"
            title="Déconnexion"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex w-full bg-[#0a0f0e] relative overflow-x-hidden">
      <style>{globalTooltipStyles}</style>

      {/* Desktop Sidebar */}
      {!hideNavbar && (
        <aside className={`hidden md:flex flex-col fixed top-0 left-0 h-screen z-40 bg-[#050807]/60 backdrop-blur-xl border-r border-[#16201f] transition-all duration-300 ${sidebarCollapsed ? "w-[56px]" : "w-[200px]"}`} style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {sidebarContent(false)}
          <button
            onClick={() => { if (!sidebarPinned) setSidebarCollapsed(!sidebarCollapsed); }}
            disabled={sidebarPinned}
            className={`hidden md:flex absolute -right-3 top-20 z-50 w-6 h-6 rounded-full bg-[#0c0c0c] border border-[#24312f] items-center justify-center text-[#93aca7] hover:text-white hover:border-white/[0.3] transition-colors ${sidebarPinned ? "opacity-40 cursor-not-allowed" : ""}`}
            title={sidebarPinned ? "Désépinglez pour fermer" : sidebarCollapsed ? "Ouvrir le menu" : "Fermer le menu"}
          >
            <ChevronLeft className={`w-3.5 h-3.5 transition-transform duration-300 ${sidebarCollapsed ? "rotate-180" : ""}`} />
          </button>
        </aside>
      )}

      {/* Mobile Top Bar */}
      {!hideNavbar && (
        <div className="md:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#050807]/80 backdrop-blur-xl border-b border-[#16201f] flex items-center justify-between px-4" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          {isChildPage ? (
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="text-white -ml-2">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          ) : (
            <Link to={createPageUrl("Dashboard")} className="flex items-center">
              <img
                src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
                alt="Klocka"
                className="h-7 w-auto object-contain"
              />
            </Link>
          )}
          <Button variant="ghost" size="icon" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="text-white">
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
        </div>
      )}

      {/* Mobile Sidebar Overlay */}
      {isMobileMenuOpen && !hideNavbar && (
        <>
          <div className="md:hidden fixed inset-0 bg-[#050807]/60 z-40" onClick={closeMobile} />
          <aside className="md:hidden fixed top-0 left-0 h-screen w-[260px] z-50 bg-[#050807] border-r border-[#16201f]">
            {sidebarContent(true)}
          </aside>
        </>
      )}



      {/* Main Content */}
      <main
        className={`flex-1 ${!hideNavbar ? (sidebarCollapsed ? "md:ml-[56px]" : "md:ml-[200px]") : ""} ${!hideNavbar ? "pt-14 md:pt-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0" : ""}`}
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