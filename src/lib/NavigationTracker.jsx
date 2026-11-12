import { useEffect } from 'react';
import { pageDeChemin } from './adresses';
import { vueDe } from './vue';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { base44 } from '@/api/base44Client';
import { pagesConfig } from '@/pages.config';
import { queryClientInstance } from '@/lib/query-client';

const PAGE_TITLES = {
    Dashboard: "Tableau de Bord",
    ProjetDetail: "Détail de votre Projet",
    MesProjets: "Mes Projets",
    MesPresentations: "Mes Présentations",
    AdminProjets: "Gestion des Projets",
    AdminClients: "Clients",
    AdminUtilisateurs: "Utilisateurs",
    Agents: "Agents",
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

// Plus de mesure d'audience (6 nov. 2026, Jules : « Audience, complètement, supprime tout ») : rien ne part plus vers
// /api/visites.

// Le temps de chargement d'une page (11 nov. 2026, Jules : « mesurer le temps de chargement au fur et à mesure ») :
// de l'ouverture (le début du chargement du site pour la première page) jusqu'à ce que plus aucune donnée ne soit en
// route depuis 400 ms, une page qui ne demande rien comptant pour son seul affichage. Une page quittée avant, ou
// cachée pendant, ne compte pas. Envoyé au serveur (server/temps-chargement.js), lu dans Suivi > Usage.
let premiere = true;
function chronometrer(page) {
    const premier = premiere;
    const debut = premier ? 0 : performance.now();
    let calmeDepuis = null;
    let finie = false;
    const minuteur = setInterval(() => {
        const t = performance.now();
        if (document.visibilityState !== 'visible' || t - debut > 60_000) return arreter();
        if (queryClientInstance.isFetching() > 0) { calmeDepuis = null; return undefined; }
        calmeDepuis ??= t;
        if (t - calmeDepuis < 400) return undefined;
        arreter();
        premiere = false;
        base44.request('POST', '/api/journal/chargement', { body: { page, ms: Math.round(calmeDepuis - debut), premier } }).catch(() => {});
        return undefined;
    }, 50);
    function arreter() { if (!finie) { finie = true; clearInterval(minuteur); } }
    return arreter;
}

export default function NavigationTracker() {
    const location = useLocation();
    const { isAuthenticated, user } = useAuth();
    // K Partners et Klocka sont deux entreprises (28 oct. 2026, Jules) : en vue mandataire, la fenêtre dit K Partners.
    const marque = vueDe(user) === 'mandataire' ? 'K Partners' : 'Klocka';
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
        document.title = title ? `${title} — ${marque}` : marque;
    }, [location, mainPageKey, marque]);

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

    // Le temps de chargement de la page ouverte (un changement d'adresse sans changer de page ne compte pas).
    useEffect(() => {
        const pageName = location.pathname === '/' || location.pathname === '' ? mainPageKey : pageDeChemin(location.pathname) || null;
        if (!isAuthenticated || !pageName) return undefined;
        return chronometrer(pageName);
    }, [location.pathname, isAuthenticated, mainPageKey]);

    return null;
}