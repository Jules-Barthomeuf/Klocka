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
    MesPresentations: "Mes Présentations",
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

// L'audience hors équipe (14 oct. 2026) : chaque page ouverte, connecté ou non (les pages publiques),
// avec un identifiant de navigateur tiré au hasard, la provenance, la largeur d'écran, le fuseau horaire.
// Un battement toutes les 30 s tant que la page est visible, et à sa fermeture, mesure la durée de la visite.
const CLE_VISITEUR = "klocka.visiteur";
function visiteurId() {
    try {
        let v = localStorage.getItem(CLE_VISITEUR);
        if (!v) { v = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem(CLE_VISITEUR, v); }
        return v;
    } catch { return null; }
}
let provenanceEnvoyee = false;
function signalerPassage(page) {
    const visiteur = visiteurId();
    if (!visiteur || !page) return;
    const corps = {
        visiteur, page, url: window.location.pathname,
        // La page d'où l'on vient, une seule fois : les suivantes viennent de la plateforme.
        referrer: provenanceEnvoyee ? null : document.referrer || null,
        largeur: window.innerWidth, fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone || null, langue: navigator.language || null,
    };
    provenanceEnvoyee = true;
    fetch("/api/visites/passage", { method: "POST", credentials: "include", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }).catch(() => {});
}
if (typeof window !== "undefined" && !window.__klockaBattement) {
    window.__klockaBattement = true;
    const battre = () => { const visiteur = visiteurId(); if (visiteur) navigator.sendBeacon?.("/api/visites/battement", new Blob([JSON.stringify({ visiteur })], { type: "text/plain" })); };
    setInterval(() => { if (document.visibilityState === "visible") battre(); }, 30000);
    window.addEventListener("pagehide", battre);
}

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

        signalerPassage(pageName);
        if (isAuthenticated && pageName) {
            base44.appLogs.logUserInApp(pageName).catch(() => {
                // Silently fail - logging shouldn't break the app
            });
        }
    }, [location, isAuthenticated, Pages, mainPageKey]);

    return null;
}