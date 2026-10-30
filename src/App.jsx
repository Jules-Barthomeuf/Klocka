import './App.css'
import { lazy, Suspense, useEffect, useState } from 'react'
import { appliquerPrefs, lirePrefs } from '@/lib/personnalisation'
import { adresseDe, pageDeChemin } from '@/lib/adresses'
import { createPageUrl } from '@/utils'
import BarriereErreur from '@/components/BarriereErreur'
import { Toaster as AvisToaster } from "@/components/ui/avis"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import VisualEditAgent from '@/lib/VisualEditAgent'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate, Outlet, useLocation } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
const AdminPortail = lazy(() => import('@/pages/AdminPortail'));

const AdminBrouillons = lazy(() => import('@/pages/AdminBrouillons'));
const AdminBanque = lazy(() => import('@/pages/AdminBanque'));
const Banque = lazy(() => import('@/pages/Banque'));

const Portail = lazy(() => import('@/pages/Portail'));
const Bienvenue = lazy(() => import('@/pages/Bienvenue'));
const Installer = lazy(() => import('@/pages/Installer'));
const Alexis = lazy(() => import('@/pages/Alexis'));

// Ce qu'un client peut ouvrir : son parcours, ses projets, ses outils. Tout le
// reste appartient à l'équipe.
const PAGES_CLIENT = new Set([
  'Home', 'Dashboard', 'Questionnaire', 'MesProjets', 'ProjetDetail',
  'SimulateurRentabilite', 'TableauProjection', 'Ressources', 'Vision', 'Comparateur',
  'MonCompte', 'Feedback', 'Famille', 'Familles', 'Personnalisation', 'MesPresentations',
]);
const Portail2Fois = lazy(() => import('@/pages/Portail2Fois'));
const SimulateurPublic = lazy(() => import('@/pages/SimulateurPublic'));
const ProjetPublic = lazy(() => import('@/pages/ProjetPublic'));
const FeuilleDeRoute = lazy(() => import('@/pages/FeuilleDeRoute'));
const QuizInvestisseur = lazy(() => import('@/pages/QuizInvestisseur'));
const NotreOffre = lazy(() => import('@/pages/NotreOffre'));
const VisionRetraite = lazy(() => import('@/pages/VisionRetraite'));
const OutilInvestisseur = lazy(() => import('@/pages/OutilInvestisseur'));
const Analyse = lazy(() => import('@/pages/Analyse'));
const Monitoring = lazy(() => import('@/pages/Monitoring'));
const CoutsIA = lazy(() => import('@/pages/CoutsIA'));
const SuiviAppels = lazy(() => import('@/pages/SuiviAppels'));
const SuiviAudience = lazy(() => import('@/pages/SuiviAudience'));
const SuiviMandataires = lazy(() => import('@/pages/SuiviMandataires'));
const SuiviTesteur = lazy(() => import('@/pages/SuiviTesteur'));
const ImpressionPresentation = lazy(() => import('@/pages/ImpressionPresentation'));
const ImpressionAvis = lazy(() => import('@/pages/ImpressionAvis'));
const DepotVendeur = lazy(() => import('@/pages/DepotVendeur'));
const ImpressionTeaser = lazy(() => import('@/pages/ImpressionTeaser'));
const ImpressionLoi = lazy(() => import('@/pages/ImpressionLoi'));
const SuiviChat = lazy(() => import('@/pages/SuiviChat'));
// Haka (17 oct. 2026) : la file À valider, et son Suivi.
const AValider = lazy(() => import('@/pages/AValider'));
const SuiviHaka = lazy(() => import('@/pages/SuiviHaka'));
const Automatismes = lazy(() => import('@/pages/Automatismes'));
// Modèles (26 oct. 2026) : les documents de Klocka et de K Partners, dans Administration.
const AdminModeles = lazy(() => import('@/pages/AdminModeles'));
const SuiviReunion = lazy(() => import('@/pages/SuiviReunion'));
const Semaine = lazy(() => import('@/pages/Semaine'));
const AdminModeleZone = lazy(() => import('@/pages/AdminModeleZone'));
const AdminPresentations = lazy(() => import('@/pages/AdminPresentations'));
import { useCurrentUser } from '@/components/hooks/useCurrentUser';
import { MENU_ADMIN, MENU_MANDATAIRE } from '@/lib/menu';
import { prechargerEnFond } from '@/lib/precharger';
import { PersonnalisationProvider, usePersonnalisation } from '@/components/providers/PersonnalisationProvider';
import Chargement from "@/components/ui/Chargement";

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : <></>;

// Le temps qu'une page arrive. Même signe que les autres attentes de
// l'application : on ne change pas de vocabulaire selon ce qu'on attend.
// Entre deux pages, la même animation que partout (16 oct. 2026, Jules : « harmonise »).
const EnChargement = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-fond">
    <Chargement taille="grand" titre="Klocka s'ouvre" etats={["Je prépare la page", "Je rassemble vos données", "J'affiche"]} />
  </div>
);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

// L'attente d'une page, dans la page seulement (21 oct. 2026, Jules : « naviguer est super lent ») : la barre et le
// cadre restent, et rien ne s'affiche les 300 premières millisecondes, pour ne pas faire clignoter un chargement court.
const PageEnChargement = () => {
  const [voir, setVoir] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVoir(true), 300); return () => clearTimeout(t); }, []);
  return voir ? <div className="flex min-h-[60vh] items-center justify-center"><Chargement titre="Je prépare la page" /></div> : null;
};

// Le cadre (barre latérale, cloche, fenêtres) monté une fois pour toutes les pages : il ne se reconstruit plus à
// chaque clic, et ses requêtes ne repartent plus. La page change dans l'Outlet ; on remonte en haut à chaque page.
const CadrePersistant = () => {
  const location = useLocation();
  const page = pageDeChemin(location.pathname) || mainPageKey;
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  // Les pages du menu se téléchargent en fond, une fois l'application ouverte : le premier clic n'attend plus.
  const { data: moi } = useCurrentUser();
  useEffect(() => {
    if (!moi?.role) return undefined;
    const menu = moi.role === 'mandataire' ? MENU_MANDATAIRE : moi.role === 'admin' ? MENU_ADMIN : [];
    return prechargerEnFond(menu.flatMap((x) => [x.cle, ...(x.entrees || []).flatMap((e) => [e.cle, ...(e.aussi || [])])]));
  }, [moi?.role]);
  return (
    <LayoutWrapper currentPageName={page}>
      <Suspense fallback={<PageEnChargement />}><Outlet /></Suspense>
    </LayoutWrapper>
  );
};

// La page d'ouverture : celle que la personne a choisie dans Personnalisation,
// sinon la page principale. Elle ne vaut que pour la racine : un lien direct
// vers une page reste un lien direct.
const PageDOuverture = () => {
  const { prefs } = usePersonnalisation();
  // Une page d'ouverture qui n'existe plus (Fiches, Import de projets, Validations, retirées le 14 oct. 2026) est ignorée.
  if (prefs.accueil && prefs.accueil !== mainPageKey && (Pages[prefs.accueil] || PAGES_MANUELLES[prefs.accueil])) return <Navigate to={createPageUrl(prefs.accueil)} replace />;
  return <MainPage />;
};

// Une ancienne adresse (/Dashboard, /Preanalyse…) renvoie à la nouvelle, en
// gardant la suite (?deal_id=, #session=) : les liens déjà envoyés marchent.
const VersAdresse = ({ page }) => {
  const location = useLocation();
  return <Navigate to={`${createPageUrl(page)}${location.search}${location.hash}`} replace />;
};

// Les routes d'une page : son adresse française, et son ancien nom qui y
// renvoie quand les deux diffèrent (voir src/lib/adresses.js).
const routesDe = (page, element) => {
  const routes = [<Route key={page} path={`/${adresseDe(page)}`} element={element} />];
  if (page.toLowerCase() !== adresseDe(page).toLowerCase()) routes.push(<Route key={`${page}-ancienne`} path={`/${page}`} element={<VersAdresse page={page} />} />);
  return routes;
};

// Les pages publiques : liens de paiement, projets partagés, invitations.
const PAGES_PUBLIQUES = {
  Bienvenue: <Bienvenue />,
  Installer: <Installer />,
  Portail: <Portail />,
  Portail2Fois: <Portail2Fois />,
  SimulateurPublic: <SimulateurPublic />,
  ProjetPublic: <ProjetPublic />,
  FeuilleDeRoute: <FeuilleDeRoute />,
  QuizInvestisseur: <QuizInvestisseur />,
  // L'offre Klocka, publique (30 oct. 2026, Jules).
  NotreOffre: <NotreOffre />,
  VisionRetraite: <VisionRetraite />,
  OutilInvestisseur: <OutilInvestisseur />,
  // Ouverte par le navigateur du serveur pour tirer le PDF d'une présentation (12 oct. 2026).
  ImpressionPresentation: <ImpressionPresentation />,
  ImpressionAvis: <ImpressionAvis />,
  DepotVendeur: <DepotVendeur />,
  ImpressionTeaser: <ImpressionTeaser />,
  ImpressionLoi: <ImpressionLoi />,
};

// Les pages déclarées à la main, hors de pages.config.
const PAGES_MANUELLES = { Automatismes, AdminModeles, AdminPortail, AdminBrouillons, AdminBanque, Banque, Analyse, Monitoring, CoutsIA, SuiviAppels, SuiviAudience, SuiviMandataires, SuiviTesteur, SuiviChat, AValider, SuiviHaka, SuiviReunion, Semaine, Alexis, AdminPresentations, AdminModeleZone };

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin, checkAppState } = useAuth();
  const { data: currentUser, isLoading: isLoadingUser } = useCurrentUser();
  const location = useLocation();
  // La connexion garde le style par défaut, les autres pages ceux de la
  // personne : à chaque page, on réapplique (appliquerPrefs sait laquelle).
  useEffect(() => { appliquerPrefs(lirePrefs()); }, [location.pathname]);

  // Le nom interne de la page ouverte, que l'adresse soit la française ou l'ancienne.
  const pageOuverte = pageDeChemin(location.pathname);
  const isHomePage = pageOuverte === '' || pageOuverte === 'Home';

  // Public pages accessible sans authentification (paiement, liens publics)
  if (PAGES_PUBLIQUES[pageOuverte]) {
    return (
      <Suspense fallback={<EnChargement />}>
      <Routes>
        {Object.entries(PAGES_PUBLIQUES).flatMap(([page, element]) => routesDe(page, element))}
      </Routes>
      </Suspense>
    );
  }

  // Show loading spinner while checking app public settings or auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-fond">
        <Chargement taille="grand" titre="Klocka s'ouvre" etats={["Je vérifie votre session", "Je prépare la page", "J'affiche"]} />
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      if (!isHomePage) {
        return <Navigate to={createPageUrl('Home')} replace />;
      }
    } else if (authError.type === 'serveur_injoignable') {
      // Le serveur n'a pas répondu : la session est peut-être intacte. On ne
      // renvoie personne à la connexion — on attend, et on réessaie.
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-fond px-6">
          <div className="max-w-sm text-center">
            <div className="w-10 h-0.5 bg-menthe mx-auto mb-8 rounded-full" />
            <h1 className="m-0 text-[24px] font-light tracking-[-.02em] text-encre">Le serveur ne répond pas</h1>
            <p className="m-0 mt-4 text-[13.5px] leading-[1.7] text-ardoise">
              Il démarre peut-être. Votre session est conservée : réessayez dans un instant.
            </p>
            <button
              onClick={() => checkAppState()}
              className="mt-8 px-5 py-2.5 border border-menthe/50 text-[11px] tracking-[.16em] uppercase text-menthe hover:bg-menthe/[0.08] transition-colors"
            >
              Réessayer
            </button>
          </div>
        </div>
      );
    }
  }

  // Un client ne voit que l'espace client. Les pages d'équipe ne s'ouvrent
  // pas en tapant leur adresse : le serveur refuse déjà leurs données, mais
  // une coquille vide en dit encore trop. Seuls les admins ont le choix de vue.
  if (isAuthenticated && !isLoadingUser && currentUser && currentUser.role !== 'admin') {
    // La garde lit le nom interne : l'adresse française et l'ancienne mènent au même.
    const autorisee =
      pageOuverte === '' ||
      PAGES_CLIENT.has(pageOuverte) ||
      (currentUser.role === 'mandataire' && pageOuverte.toLowerCase().startsWith('mandataire'));
    if (!autorisee) return <Navigate to={createPageUrl('Dashboard')} replace />;
  }

  // Render the main app
  return (
    <Suspense fallback={<EnChargement />}>
    <Routes>
      <Route element={<CadrePersistant />}>
        <Route path="/" element={<PageDOuverture />} />
        {Object.entries(Pages).flatMap(([page, Page]) => routesDe(page, <Page />))}
        {Object.entries(PAGES_MANUELLES).flatMap(([page, Page]) => routesDe(page, <Page />))}
      </Route>
      {Object.entries(PAGES_PUBLIQUES).flatMap(([page, element]) => routesDe(page, element))}
      {/* Préanalyse est devenue Dossiers. */}
      <Route path="/Preanalyse" element={<VersAdresse page="Analyse" />} />
      {/* Tapée à la main, avec ou sans accent, au singulier : la page des présentations. */}
      {["/presentation", "/présentation", "/présentations"].map((p) => <Route key={p} path={p} element={<VersAdresse page="AdminPresentations" />} />)}

      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </Suspense>
  );
};


function App() {

  return (
    <BarriereErreur>
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <NavigationTracker />
          <PersonnalisationProvider>
            <AuthenticatedApp />
          </PersonnalisationProvider>
        </Router>
        <AvisToaster />
        <VisualEditAgent />
      </QueryClientProvider>
    </AuthProvider>
    </BarriereErreur>
  )
}

export default App