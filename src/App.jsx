import './App.css'
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "sonner"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import NewUserWelcome from '@/pages/NewUserWelcome';
import AdminPortail from '@/pages/AdminPortail';

import AdminBrouillons from '@/pages/AdminBrouillons';
import AdminBanque from '@/pages/AdminBanque';
import Banque from '@/pages/Banque';

import Portail from '@/pages/Portail';
import Bienvenue from "./pages/Bienvenue";
import Alexis from "./pages/Alexis";

// Ce qu'un client peut ouvrir : son parcours, ses projets, ses outils. Tout le
// reste appartient à l'équipe.
const PAGES_CLIENT = new Set([
  'Home', 'Dashboard', 'NewUserWelcome', 'Questionnaire', 'MesProjets', 'ProjetDetail',
  'SimulateurRentabilite', 'TableauProjection', 'Ressources', 'Vision', 'Comparateur',
  'KlockAI', 'MonCompte', 'Feedback', 'Famille', 'Familles',
]);
import Portail2Fois from '@/pages/Portail2Fois';
import SimulateurPublic from '@/pages/SimulateurPublic';
import ProjetPublic from '@/pages/ProjetPublic';
import Recherche from '@/pages/Recherche';
import Investisseurs from '@/pages/Investisseurs';
import AdminNotes from '@/pages/AdminNotes';
import Analyse from '@/pages/Analyse';
import Assistant from '@/pages/Assistant';
import Monitoring from '@/pages/Monitoring';
import Engagements from "./pages/Engagements";
import AssistantExterne from '@/pages/AssistantExterne';
import AdminPresentations from '@/pages/AdminPresentations';
import ImportProjects from '@/pages/ImportProjects';
import ImportClients from '@/pages/ImportClients';
import { useCurrentUser } from '@/components/hooks/useCurrentUser';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// /Preanalyse → /Analyse en conservant la query (?deal_id=, ?tab=).
const RedirectionAnalyse = () => {
  const location = useLocation();
  return <Navigate to={`/Analyse${location.search}`} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const location = useLocation();

  const isHomePage = location.pathname === '/' || location.pathname === '/Home';
  const isNewUserPage = location.pathname === '/NewUserWelcome';

  // Public pages accessible sans authentification (paiement, liens publics)
  const publicPaths = ['/Portail', '/Portail2Fois', '/SimulateurPublic', '/ProjetPublic', '/Bienvenue'];
  if (publicPaths.includes(location.pathname)) {
    return (
      <Routes>
        <Route path="/Bienvenue" element={<Bienvenue />} />
        <Route path="/Portail" element={<Portail />} />
        <Route path="/Portail2Fois" element={<Portail2Fois />} />
        <Route path="/SimulateurPublic" element={<SimulateurPublic />} />
        <Route path="/ProjetPublic" element={<ProjetPublic />} />
      </Routes>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#0a0c0c]">
        <div className="w-8 h-8 border-4 border-[#35a79b]/30 border-t-[#35a79b] rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (!isHomePage) {
        return <Navigate to="/Home" replace />;
      }
    }
  }

  // Redirect new users (etape 0) to NewUserWelcome, except if already there
  if (isAuthenticated && !isLoadingUser && currentUser && !isNewUserPage) {
    const etape = currentUser.etape_actuelle ?? 0;
    if (etape === 0 && currentUser.role !== 'admin') {
      return <Navigate to="/NewUserWelcome" replace />;
    }
  }

  // Un client ne voit que l'espace client. Les pages d'équipe ne s'ouvrent
  // pas en tapant leur adresse : le serveur refuse déjà leurs données, mais
  // une coquille vide en dit encore trop. Seuls les admins ont le choix de vue.
  if (isAuthenticated && !isLoadingUser && currentUser && currentUser.role !== 'admin') {
    const page = location.pathname.replace(/^\/+|\/+$/g, '');
    const autorisee =
      page === '' ||
      PAGES_CLIENT.has(page) ||
      (currentUser.role === 'mandataire' && page.startsWith('Mandataire'));
    if (!autorisee) return <Navigate to="/Dashboard" replace />;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="/NewUserWelcome" element={<NewUserWelcome />} />
      <Route path="/AdminPortail" element={<LayoutWrapper currentPageName="AdminPortail"><AdminPortail /></LayoutWrapper>} />
      <Route path="/AdminBrouillons" element={<LayoutWrapper currentPageName="AdminBrouillons"><AdminBrouillons /></LayoutWrapper>} />
      <Route path="/AdminBanque" element={<LayoutWrapper currentPageName="AdminBanque"><AdminBanque /></LayoutWrapper>} />
      <Route path="/Banque" element={<LayoutWrapper currentPageName="Banque"><Banque /></LayoutWrapper>} />

      <Route path="/Portail" element={<Portail />} />
      <Route path="/Portail2Fois" element={<Portail2Fois />} />
      <Route path="/SimulateurPublic" element={<SimulateurPublic />} />
      <Route path="/ProjetPublic" element={<ProjetPublic />} />
      <Route path="/Recherche" element={<LayoutWrapper currentPageName="Recherche"><Recherche /></LayoutWrapper>} />
      <Route path="/Investisseurs" element={<LayoutWrapper currentPageName="Investisseurs"><Investisseurs /></LayoutWrapper>} />
      <Route path="/AdminNotes" element={<LayoutWrapper currentPageName="AdminNotes"><AdminNotes /></LayoutWrapper>} />
      <Route path="/Analyse" element={<LayoutWrapper currentPageName="Analyse"><Analyse /></LayoutWrapper>} />
      <Route path="/Assistant" element={<LayoutWrapper currentPageName="Assistant"><Assistant /></LayoutWrapper>} />
      <Route path="/Monitoring" element={<LayoutWrapper currentPageName="Monitoring"><Monitoring /></LayoutWrapper>} />
      <Route path="/Engagements" element={<LayoutWrapper currentPageName="Engagements"><Engagements /></LayoutWrapper>} />
      {/* Anciennes URL : Préanalyse est devenue Analyse ; l'onglet Documents d'Alexis a disparu. */}
      <Route path="/Preanalyse" element={<RedirectionAnalyse />} />
      {/* La page secrète. L'ancienne redirection vers Analyse cède la place. */}
      <Route path="/Alexis" element={<LayoutWrapper currentPageName="Alexis"><Alexis /></LayoutWrapper>} />
      <Route path="/AssistantExterne" element={<LayoutWrapper currentPageName="AssistantExterne"><AssistantExterne /></LayoutWrapper>} />
      <Route path="/AdminPresentations" element={<LayoutWrapper currentPageName="AdminPresentations"><AdminPresentations /></LayoutWrapper>} />
      <Route path="/ImportProjects" element={<LayoutWrapper currentPageName="ImportProjects"><ImportProjects /></LayoutWrapper>} />
      <Route path="/ImportClients" element={<LayoutWrapper currentPageName="ImportClients"><ImportClients /></LayoutWrapper>} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <AuthenticatedApp />
        </Router>
        <Toaster />
        <SonnerToaster position="top-center" richColors closeButton />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App