import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode>
  <App />
  // </React.StrictMode>,
)

// Chaque page arrive dans son propre fragment, téléchargé à sa première
// ouverture : c'est ce qui se sent en changeant de menu, surtout sur une
// connexion lente. Une fois l'application posée et le navigateur au repos, on
// va chercher les fragments des pages les plus ouvertes. Ce sont les mêmes
// imports que ceux des routes : le navigateur ne télécharge chaque fragment
// qu'une fois, et le clic n'attend plus rien.
const PAGES_A_PRECHAUFFER = [
  () => import('@/pages/Dashboard'),
  () => import('@/pages/AdminProjets'),
  () => import('@/pages/Analyse'),
  () => import('@/pages/ALX'),
  () => import('@/pages/SimulateurRentabilite'),
  () => import('@/pages/AdminClients'),
  () => import('@/pages/AdminSuggestions'),
  () => import('@/pages/MesProjets'),
];
if (navigator.connection?.saveData !== true) {
  const prechauffer = () => { for (const charger of PAGES_A_PRECHAUFFER) charger().catch(() => {}); };
  if ('requestIdleCallback' in window) window.requestIdleCallback(prechauffer, { timeout: 5000 });
  else setTimeout(prechauffer, 2500);
}

// Un déploiement remplace les fragments de l'application, chacun nommé par une
// empreinte. Un onglet resté ouvert garde l'ancienne liste et demande un
// fichier qui n'existe plus : la page refuse alors de s'ouvrir, avec « error
// loading dynamically imported module ». On recharge une fois, ce qui va
// chercher la nouvelle liste. L'horodatage évite la boucle si le fichier
// manque vraiment.
const CLE_FRAGMENT = 'klocka_fragment_recharge';
window.addEventListener('vite:preloadError', (e) => {
  const dernier = Number(sessionStorage.getItem(CLE_FRAGMENT) || 0);
  if (Date.now() - dernier < 30000) return;
  e.preventDefault();
  sessionStorage.setItem(CLE_FRAGMENT, String(Date.now()));
  window.location.reload();
});

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}

// Installable : le service worker n'intercepte rien, il rend seulement
// l'application éligible à « Ajouter à l'écran d'accueil » partout.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
