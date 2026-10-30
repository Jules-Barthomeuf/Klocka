// Ce qui fait monter la mémoire (30 oct. 2026, Jules : « réglez la cause une bonne fois pour toutes »). Les relevés
// [memoire] montraient Node à 1,9 Go pour un tas de 50 à 200 Mo, sans rien dire de ce qui tournait : le journal ne
// trace que les écritures. Ici, chaque appel à l'API note ce que la mémoire de Node a pris pendant qu'il tournait ;
// le relevé d'un pic cite les routes qui ont le plus pris depuis le relevé d'avant.

const MAX_ROUTES = 300;
let routes = new Map();

/** Pure : une route sans ses identifiants, pour que cent dossiers fassent une seule ligne. */
export const normaliser = (chemin) => String(chemin || '').split('?')[0]
  .split('/')
  .map((s) => (/\d/.test(s) && s.length >= 6 ? ':id' : s))
  .join('/');

export function suivreMemoire(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  const avant = process.memoryUsage.rss();
  const debut = Date.now();
  res.on('finish', () => {
    const cle = `${req.method} ${normaliser(req.path)}`;
    const r = routes.get(cle) || { n: 0, pris_max: 0, pris: 0, duree_max: 0 };
    const pris = process.memoryUsage.rss() - avant;
    r.n += 1;
    r.pris += Math.max(0, pris);
    r.pris_max = Math.max(r.pris_max, pris);
    r.duree_max = Math.max(r.duree_max, Date.now() - debut);
    routes.set(cle, r);
    // Borné : une rafale de routes inconnues ne doit pas devenir elle-même une fuite.
    if (routes.size > MAX_ROUTES) routes.delete(routes.keys().next().value);
  });
  next();
}

/** Les routes qui ont le plus pris depuis le dernier appel, en une ligne ; le compte repart de zéro. */
export function resumerEtRepartir(n = 6) {
  const mo = (x) => `${Math.round(x / 1e6)} Mo`;
  const tri = [...routes.entries()].sort((a, b) => b[1].pris - a[1].pris).slice(0, n);
  routes = new Map();
  return tri.filter(([, r]) => r.pris > 5e6)
    .map(([cle, r]) => `${cle} ×${r.n} +${mo(r.pris)} (max +${mo(r.pris_max)}, ${Math.round(r.duree_max / 1000)} s)`)
    .join(' · ');
}
