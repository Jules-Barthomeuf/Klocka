import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import About from './pages/About';
import Legal from './pages/Legal';
import { LOGIN_URL } from '@/lib/format';

// Le simulateur tire recharts : chargé à part, l'accueil reste léger.
const Simulateur = lazy(() => import('./pages/Simulateur'));

// Sur klocka.immo le site est à la racine ; sur la plateforme, sous /klocka.immo/ (comme /kpartners/).
const PREFIXE = '/klocka.immo';
const BASENAME = window.location.pathname.startsWith(PREFIXE) ? PREFIXE : '';

function ScrollToHash() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const t = setTimeout(() => {
      const el = document.querySelector(hash);
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
    }, 80);
    return () => clearTimeout(t);
  }, [pathname, hash]);
  return null;
}

// Une adresse que le site ne connaît pas appartient à la plateforme (klocka.immo/Bienvenue des mails) :
// le serveur la renvoie déjà vers app.klocka.immo, ceci couvre une navigation faite dans la page.
function VersPlateforme() {
  const { pathname, search } = useLocation();
  useEffect(() => { window.location.replace(new URL(pathname + search, LOGIN_URL).href); }, [pathname, search]);
  return null;
}

export default function App() {
  return (
    <Router basename={BASENAME}>
      <ScrollToHash />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/qui-sommes-nous" element={<About />} />
        <Route path="/equipe" element={<About />} />
        <Route path="/simulateur" element={<Suspense fallback={null}><Simulateur /></Suspense>} />
        <Route path="/legal" element={<Legal />} />
        <Route path="*" element={<VersPlateforme />} />
      </Routes>
    </Router>
  );
}
