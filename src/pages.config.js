/**
 * pages.config.js - Page routing configuration
 * 
 * This file is AUTO-GENERATED. Do not add imports or modify PAGES manually.
 * Pages are auto-registered when you create files in the ./pages/ folder.
 * 
 * THE ONLY EDITABLE VALUE: mainPage
 * This controls which page is the landing page (shown when users visit the app).
 * 
 * Example file structure:
 * 
 *   import HomePage from './pages/HomePage';
 *   import Dashboard from './pages/Dashboard';
 *   import Settings from './pages/Settings';
 *   
 *   export const PAGES = {
 *       "HomePage": HomePage,
 *       "Dashboard": Dashboard,
 *       "Settings": Settings,
 *   }
 *   
 *   export const pagesConfig = {
 *       mainPage: "HomePage",
 *       Pages: PAGES,
 *   };
 * 
 * Example with Layout (wraps all pages):
 *
 *   import Home from './pages/Home';
 *   import Settings from './pages/Settings';
 *   import __Layout from './Layout.jsx';
 *
 *   export const PAGES = {
 *       "Home": Home,
 *       "Settings": Settings,
 *   }
 *
 *   export const pagesConfig = {
 *       mainPage: "Home",
 *       Pages: PAGES,
 *       Layout: __Layout,
 *   };
 *
 * To change the main page from HomePage to Dashboard, use find_replace:
 *   Old: mainPage: "HomePage",
 *   New: mainPage: "Dashboard",
 *
 * The mainPage value must match a key in the PAGES object exactly.
 */
// Chaque page est chargée à son ouverture, pas au démarrage. Sans cela les
// trente-cinq pages — l'administration, le CRM, les cartes, les graphiques —
// partaient dans un seul fichier de plusieurs mégaoctets qu'un client devait
// télécharger en entier pour voir son tableau de bord.
import { lazy } from 'react';

const ALX = lazy(() => import('./pages/ALX'));
const ALXVilles = lazy(() => import('./pages/ALXVilles'));
const ALXCible = lazy(() => import('./pages/ALXCible'));
const ALXBilan = lazy(() => import('./pages/ALXBilan'));
const ALXEntrainement = lazy(() => import('./pages/ALXEntrainement'));
const AdminClients = lazy(() => import('./pages/AdminClients'));
const AdminProjets = lazy(() => import('./pages/AdminProjets'));
const AdminRessources = lazy(() => import('./pages/AdminRessources'));
const AdminSignup = lazy(() => import('./pages/AdminSignup'));
const AdminSuggestions = lazy(() => import('./pages/AdminSuggestions'));
const BaseDonneesMarche = lazy(() => import('./pages/BaseDonneesMarche'));
const Comparateur = lazy(() => import('./pages/Comparateur'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Famille = lazy(() => import('./pages/Famille'));
const Familles = lazy(() => import('./pages/Familles'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Home = lazy(() => import('./pages/Home'));
const MonAssistant = lazy(() => import('./pages/MonAssistant'));
const FichesCommerciales = lazy(() => import('./pages/FichesCommerciales'));
const KData = lazy(() => import('./pages/KData'));
const KZoning = lazy(() => import('./pages/KZoning'));
const KExpertise = lazy(() => import('./pages/KExpertise'));
const KEstimation = lazy(() => import('./pages/KEstimation'));
const ValeurLocative = lazy(() => import('./pages/ValeurLocative'));
const KFoncier = lazy(() => import('./pages/KFoncier'));
const KProspective = lazy(() => import('./pages/KProspective'));
const AdminLeadMagnets = lazy(() => import('./pages/AdminLeadMagnets'));
const KTransactions = lazy(() => import('./pages/KTransactions'));
const KVacance = lazy(() => import('./pages/KVacance'));
const MesProjets = lazy(() => import('./pages/MesProjets'));
const MonCompte = lazy(() => import('./pages/MonCompte'));
const ProjetDetail = lazy(() => import('./pages/ProjetDetail'));
const Questionnaire = lazy(() => import('./pages/Questionnaire'));
const Ressources = lazy(() => import('./pages/Ressources'));
const SimulateurRentabilite = lazy(() => import('./pages/SimulateurRentabilite'));
const TableauProjection = lazy(() => import('./pages/TableauProjection'));
const Vision = lazy(() => import('./pages/Vision'));
import __Layout from './Layout.jsx';


export const PAGES = {
    "ALX": ALX,
    "ALXVilles": ALXVilles,
    "ALXCible": ALXCible,
    "ALXBilan": ALXBilan,
    "ALXEntrainement": ALXEntrainement,
    "AdminClients": AdminClients,
    "AdminProjets": AdminProjets,
    "AdminRessources": AdminRessources,
    "AdminSignup": AdminSignup,
    "AdminSuggestions": AdminSuggestions,
    "BaseDonneesMarche": BaseDonneesMarche,
    "Comparateur": Comparateur,
    "Dashboard": Dashboard,
    "Famille": Famille,
    "Familles": Familles,
    "Feedback": Feedback,
    "Home": Home,
    "MonAssistant": MonAssistant,
    "FichesCommerciales": FichesCommerciales,
    "KData": KData,
    "KZoning": KZoning,
    "KExpertise": KExpertise,
    "KEstimation": KEstimation,
    "ValeurLocative": ValeurLocative,
    "KFoncier": KFoncier,
    "KProspective": KProspective,
    "AdminLeadMagnets": AdminLeadMagnets,
    "KTransactions": KTransactions,
    "KVacance": KVacance,
    "MesProjets": MesProjets,
    "MonCompte": MonCompte,
    "ProjetDetail": ProjetDetail,
    "Questionnaire": Questionnaire,
    "Ressources": Ressources,
    "SimulateurRentabilite": SimulateurRentabilite,
    "TableauProjection": TableauProjection,
    "Vision": Vision,
}

export const pagesConfig = {
    mainPage: "Home",
    Pages: PAGES,
    Layout: __Layout,
};