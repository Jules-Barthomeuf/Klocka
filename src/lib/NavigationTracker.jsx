import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { base44 } from '@/api/base44Client';
import { pagesConfig } from '@/pages.config';

const PAGE_TITLES = {
    Dashboard: "Tableau de Bord",
    ProjetDetail: "Détail de votre Projet",
    MesProjets: "Mes Projets",
    AdminProjets: "Gestion des Projets",
    AdminClients: "Gestion des Clients",
    AdminRessources: "Gestion des Ressources",
    AdminSuggestions: "Suggestions & Feedback",
    AdminAnalyse: "Analyse de Documents",
    AdminPortail: "Gestion des Portails",
    AdminBrouillons: "Double Check",
    AdminBanque: "Gestion Bancaire",
    SimulateurRentabilite: "Simulateur de Rentabilité",
    SimulateurPublic: "Simulateur Public",
    Comparateur: "Comparateur de Projets",
    Ressources: "Ressources & Formation",
    Vision: "Vision Patrimoniale",
    Banque: "Dossier Bancaire",
    MonCompte: "Mon Compte",
    Questionnaire: "Questionnaire",
    ProjectAssistant: "Assistant IA",
    KlockAI: "Klock AI",
    Familles: "Familles",
    Famille: "Détail Famille",
    Leads: "Leads",
    Feedback: "Feedback",
    Recherche: "Recherche",
    Investisseurs: "Investisseurs",
    Portail: "Portail de Démarrage",
    Home: "Accueil",
    Analyse: "Dossiers",
    Assistant: "Assistant",
    Monitoring: "Suivi de l'usage",
    TableauProjection: "Tableau de Projection",
    QuizImmo: "Quiz Immobilier",
};

export default function NavigationTracker() {
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const { Pages, mainPage } = pagesConfig;
    const mainPageKey = mainPage ?? Object.keys(Pages)[0];

    // Post navigation changes to parent window
    useEffect(() => {
        window.parent?.postMessage({
            type: "app_changed_url",
            url: window.location.href
        }, '*');
    }, [location]);

    // Set document title based on current page
    useEffect(() => {
        const pathname = location.pathname;
        let pageName;
        if (pathname === '/' || pathname === '') {
            pageName = mainPageKey;
        } else {
            pageName = pathname.replace(/^\//, '').split('/')[0];
        }
        const title = PAGE_TITLES[pageName];
        document.title = title ? `${title} — Klocka` : 'Klocka';
    }, [location, mainPageKey]);

    // Log user activity when navigating to a page
    useEffect(() => {
        // Extract page name from pathname
        const pathname = location.pathname;
        let pageName;
        
        if (pathname === '/' || pathname === '') {
            pageName = mainPageKey;
        } else {
            // Remove leading slash and get the first segment
            const pathSegment = pathname.replace(/^\//, '').split('/')[0];
            
            // Correspondance insensible à la casse dans la configuration.
            const pageKeys = Object.keys(Pages);
            const matchedKey = pageKeys.find(
                key => key.toLowerCase() === pathSegment.toLowerCase()
            );

            // Plusieurs pages sont déclarées en routes manuelles (Dossiers,
            // Assistant, Suivi…) : s'en tenir à la configuration les rendait
            // invisibles au suivi. Le segment d'URL fait alors office de nom.
            pageName = matchedKey || pathSegment || null;
        }

        if (isAuthenticated && pageName) {
            base44.appLogs.logUserInApp(pageName).catch(() => {
                // Silently fail - logging shouldn't break the app
            });
        }
    }, [location, isAuthenticated, Pages, mainPageKey]);

    return null;
}