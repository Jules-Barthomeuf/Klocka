// L'application K Partners à installer (14 nov. 2026, Jules : « une PWA pour KP ») : la même page que Klocka, mais
// sur app.kpartners.immo elle porte le nom, l'icône et le manifeste de K Partners. Ainsi « Ajouter à l'écran
// d'accueil » pose « K Partners » et son « kp » chez le mandataire, jamais « Klocka ». Le service worker (/sw.js)
// reste le même : il n'intercepte rien. Les icônes sont celles du kit de marque K Partners v2 (kp-avatar-1024 réduit,
// kp-apple-touch-180, kp-favicon-32), fond nuit #0e0e10 ; le logo tient dans le cercle d'Android, d'où l'avatar aussi en « maskable ».
//
// Appelée par le serveur (server/index.js, en ligne) et par Vite (vite.config.js, en local) : rien d'autre ici.

const I = '/icones/kpartners';

/** Pure : la page de l'application, habillée K Partners. */
export function pageKpartners(html) {
  return String(html)
    .replace('<meta name="theme-color" content="#000000">', '<meta name="theme-color" content="#0e0e10">')
    .replace('href="/manifest.webmanifest"', 'href="/manifest-kpartners.webmanifest"')
    .replace(/<link rel="apple-touch-icon" href="[^"]*">/, `<link rel="apple-touch-icon" href="${I}/apple-touch-icon.png">\n    <meta name="apple-mobile-web-app-title" content="K Partners">`)
    .replace(/<link rel="icon" type="image\/svg\+xml" href="[^"]*" \/>\s*/, '')
    .replace(/<link rel="icon" type="image\/png" sizes="192x192" href="[^"]*" \/>/, `<link rel="icon" type="image/png" sizes="32x32" href="${I}/favicon-32.png" />\n    <link rel="icon" type="image/png" sizes="192x192" href="${I}/icone-192.png" />`)
    .replace(/<meta property="og:site_name" content="[^"]*" \/>/, '<meta property="og:site_name" content="K Partners" />')
    .replace(/<meta property="og:title" content="[^"]*" \/>/, '<meta property="og:title" content="K Partners" />')
    .replace(/<meta property="og:description" content="[^"]*" \/>/, '<meta property="og:description" content="L\'espace des mandataires K Partners." />')
    .replace(/<meta property="og:image" content="[^"]*" \/>\s*<meta property="og:image:width" content="[^"]*" \/>\s*<meta property="og:image:height" content="[^"]*" \/>\s*/, '')
    .replace(/<meta name="twitter:card" content="[^"]*" \/>\s*<meta name="twitter:image" content="[^"]*" \/>\s*/, '')
    .replace('<title>Klocka</title>', '<title>K Partners</title>');
}

/** Pure : une demande de page (pas un fichier, pas l'API) qui doit recevoir index.html. */
export const demandeDePage = (methode, chemin) =>
  (methode === 'GET' || methode === 'HEAD')
  && !/^\/(api|uploads)(\/|$)/.test(chemin)
  && (chemin === '/' || chemin === '/index.html' || !/\.[a-z0-9]+$/i.test(chemin));
