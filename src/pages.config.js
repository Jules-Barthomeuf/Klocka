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
import AdminAnalyse from './pages/AdminAnalyse';
import AdminClients from './pages/AdminClients';
import AdminProjets from './pages/AdminProjets';
import AdminRessources from './pages/AdminRessources';
import AdminSignup from './pages/AdminSignup';
import AdminSuggestions from './pages/AdminSuggestions';
import BaseDonneesMarche from './pages/BaseDonneesMarche';
import CRM from './pages/CRM';
import CRMAgents from './pages/CRMAgents';
import CRMClients from './pages/CRMClients';
import CRMProprietes from './pages/CRMProprietes';
import CRMProspects from './pages/CRMProspects';
import CRMTransactions from './pages/CRMTransactions';
import Comparateur from './pages/Comparateur';
import Contacts from './pages/Contacts';
import Dashboard from './pages/Dashboard';
import ExportClients from './pages/ExportClients';
import ExportProjects from './pages/ExportProjects';
import Famille from './pages/Famille';
import Familles from './pages/Familles';
import Feedback from './pages/Feedback';
import Home from './pages/Home';
import KlockAI from './pages/KlockAI';
import Leads from './pages/Leads';
import MandataireClients from './pages/MandataireClients';
import MandataireOutils from './pages/MandataireOutils';
import MandataireRessources from './pages/MandataireRessources';
import MesProjets from './pages/MesProjets';
import MonCompte from './pages/MonCompte';
import ProjectAssistant from './pages/ProjectAssistant';
import ProjetDetail from './pages/ProjetDetail';
import Questionnaire from './pages/Questionnaire';
import Ressources from './pages/Ressources';
import SimulateurRentabilite from './pages/SimulateurRentabilite';
import TableauProjection from './pages/TableauProjection';
import Vision from './pages/Vision';
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
    "CRMClients": CRMClients,
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