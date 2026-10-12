import { useEffect } from 'react';
import { pageDeChemin } from './adresses';
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
    AdminPortail: "Gestion des Portails",
    AdminBrouillons: "Double Check",
    AdminBanque: "Gestion Bancaire",
    SimulateurRentabilite: "Simulateur de Rentabilité",
    SimulateurPublic: "Simulateur Public",
    QuizInvestisseur: "Quiz investisseur",
    VisionRetraite: "Vision retraite",
    OutilInvestisseur: "Outils de l'investisseur",
    Comparateur: "Comparateur de Projets",
    Ressources: "Ressources & Formation",
    Vision: "Vision Patrimoniale",
    Banque: "Dossier Bancaire",
    MonCompte: "Mon Compte",
    Questionnaire: "Questionnaire",
    Familles: "Familles",
    Famille: "Détail Famille",
    Feedback: "Feedback",
    Portail: "Portail de Démarrage",
    Home: "Accueil",
    Analyse: "Dossiers",
    Monitoring: "Suivi de l'usage",
    TableauProjection: "Tableau de Projection",
    QuizImmo: "Quiz Immobilier",
};

// Les dernières erreurs de la page (exceptions, promesses rejetées, console.error),
// gardées en mémoire pour l'agent testeur : il part de ce que Jules a vu.
const ERREURS = [];
const noterErreur = (type, texte) => { ERREURS.push({ le: new Date().toISOString(), type, texte: String(texte || '').slice(0, 300) }); if (ERREURS.length > 40) ERREURS.shift(); };
if (typeof window !== 'undefined' && !window.__klockaErreursBranchees) {
    window.__klockaErreursBranchees = true;
    window.addEventListener('error', (e) => noterErreur('exception', e?.message || e?.error?.message));
    window.addEventListener('unhandledrejection', (e) => noterErreur('promesse', e?.reason?.message || e?.reason));
    const original = console.error.bind(console);
    console.error = (...args) => { noterErreur('console', args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)?.slice(0, 120))).join(' ')); original(...args); };
}
/** Les erreurs des dernières minutes, pour le contexte d'un audit. */
export const erreursRecentes = (minutes = 10) => ERREURS.filter((e) => Date.now() - Date.parse(e.le) < minutes * 60000);

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
        const pageName = pageDeChemin(location.pathname) || mainPageKey;
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
            // Le nom interne, que l'adresse soit la française ou l'ancienne :
            // le suivi d'usage garde ainsi ses séries d'avant.
            pageName = pageDeChemin(pathname) || null;
        }

        if (isAuthenticated && pageName) {
            base44.appLogs.logUserInApp(pageName).catch(() => {
                // Silently fail - logging shouldn't break the app
            });
        }
    }, [location, isAuthenticated, Pages, mainPageKey]);

    return null;
}