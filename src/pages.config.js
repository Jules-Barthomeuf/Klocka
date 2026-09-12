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

const AdminAnalyse = lazy(() => import('./pages/AdminAnalyse'));
const AdminClients = lazy(() => import('./pages/AdminClients'));
const AdminProjets = lazy(() => import('./pages/AdminProjets'));
const AdminRessources = lazy(() => import('./pages/AdminRessources'));
const AdminSignup = lazy(() => import('./pages/AdminSignup'));
const AdminSuggestions = lazy(() => import('./pages/AdminSuggestions'));
const BaseDonneesMarche = lazy(() => import('./pages/BaseDonneesMarche'));
const CRM = lazy(() => import('./pages/CRM'));
const CRMAgents = lazy(() => import('./pages/CRMAgents'));
const CRMProprietes = lazy(() => import('./pages/CRMProprietes'));
const CRMProspects = lazy(() => import('./pages/CRMProspects'));
const CRMTransactions = lazy(() => import('./pages/CRMTransactions'));
const Comparateur = lazy(() => import('./pages/Comparateur'));
const Contacts = lazy(() => import('./pages/Contacts'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ExportClients = lazy(() => import('./pages/ExportClients'));
const ExportProjects = lazy(() => import('./pages/ExportProjects'));
const Famille = lazy(() => import('./pages/Famille'));
const Familles = lazy(() => import('./pages/Familles'));
const Feedback = lazy(() => import('./pages/Feedback'));
const Home = lazy(() => import('./pages/Home'));
const KlockAI = lazy(() => import('./pages/KlockAI'));
const Leads = lazy(() => import('./pages/Leads'));
const MandataireClients = lazy(() => import('./pages/MandataireClients'));
const MandataireOutils = lazy(() => import('./pages/MandataireOutils'));
const MandataireRessources = lazy(() => import('./pages/MandataireRessources'));
const MesProjets = lazy(() => import('./pages/MesProjets'));
const MonCompte = lazy(() => import('./pages/MonCompte'));
const ProjectAssistant = lazy(() => import('./pages/ProjectAssistant'));
const ProjetDetail = lazy(() => import('./pages/ProjetDetail'));
const Questionnaire = lazy(() => import('./pages/Questionnaire'));
const Ressources = lazy(() => import('./pages/Ressources'));
const SimulateurRentabilite = lazy(() => import('./pages/SimulateurRentabilite'));
const TableauProjection = lazy(() => import('./pages/TableauProjection'));
const Vision = lazy(() => import('./pages/Vision'));
import __Layout from './Layout.jsx';


export const PAGES = {
    "AdminAnalyse": AdminAnalyse,
    "AdminClients": AdminClients,
    "AdminProjets": AdminProjets,
    "AdminRessources": AdminRessources,
    "AdminSignup": AdminSignup,
    "AdminSuggestions": AdminSuggestions,
    "BaseDonneesMarche": BaseDonneesMarche,
    "CRM": CRM,
    "CRMAgents": CRMAgents,
    "CRMProprietes": CRMProprietes,
    "CRMProspects": CRMProspects,
    "CRMTransactions": CRMTransactions,
    "Comparateur": Comparateur,
    "Contacts": Contacts,
    "Dashboard": Dashboard,
    "ExportClients": ExportClients,
    "ExportProjects": ExportProjects,
    "Famille": Famille,
    "Familles": Familles,
    "Feedback": Feedback,
    "Home": Home,
    "KlockAI": KlockAI,
    "Leads": Leads,
    "MandataireClients": MandataireClients,
    "MandataireOutils": MandataireOutils,
    "MandataireRessources": MandataireRessources,
    "MesProjets": MesProjets,
    "MonCompte": MonCompte,
    "ProjectAssistant": ProjectAssistant,
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