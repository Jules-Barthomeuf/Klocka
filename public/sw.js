// Le service worker de Klocka.
//
// Il rend l'application installable (certains navigateurs exigent un gestionnaire « fetch »), et depuis le
// 26 nov. 2026 (Jules : « au lieu de 502 Bad Gateway, mets le jeu des loyers de la rue ») il remplace l'erreur d'un
// serveur qui redémarre par l'écran d'attente (public/attente.html, avec son jeu).
//
// L'application elle-même n'est jamais mise en cache : une version périmée qui survivrait à un déploiement ferait plus
// de mal que l'absence de mode hors-ligne. Seuls sont gardés de côté l'écran d'attente et la partie qu'il joue
// (/api/jeux/attente, réservée à l'équipe), et ils ne servent que quand le serveur ne répond pas.

const CACHE = 'klocka-attente-v1';
const ECRAN = '/attente.html';
const PARTIE = '/api/jeux/attente';
const RAFRAICHIR_MS = 6 * 3600 * 1000;
let dernierRafraichissement = 0;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.add(new Request(ECRAN, { cache: 'reload' }))).catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((k) => k.startsWith('klocka-attente-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const enPanne = (r) => r && r.status >= 502 && r.status <= 504;

async function ecranDAttente(sinon) {
  const r = await caches.match(ECRAN);
  if (r) return r;
  if (sinon) return sinon;
  return Response.error();
}

// Pendant que tout marche, une fois toutes les six heures : l'écran à jour et une partie neuve. Un compte qui n'y a pas
// droit (401, 403) efface la partie gardée, pour qu'un autre compte du même navigateur ne la retrouve pas.
async function rafraichir() {
  if (Date.now() - dernierRafraichissement < RAFRAICHIR_MS) return;
  dernierRafraichissement = Date.now();
  const c = await caches.open(CACHE);
  try { await c.add(new Request(ECRAN, { cache: 'reload' })); } catch { /* l'ancien reste */ }
  try {
    const r = await fetch(PARTIE, { credentials: 'same-origin', cache: 'no-store' });
    if (r.ok) await c.put(PARTIE, r.clone());
    else if (r.status === 401 || r.status === 403) await c.delete(PARTIE);
  } catch { /* la partie d'avant reste */ }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Une page demandée : le réseau, toujours ; l'écran d'attente seulement si le serveur ne répond pas.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((r) => {
          if (enPanne(r)) return ecranDAttente(r);
          event.waitUntil(rafraichir());
          return r;
        })
        .catch(() => ecranDAttente(null)),
    );
    return;
  }

  // La partie de l'écran d'attente : le réseau d'abord, la partie gardée quand il ne répond pas.
  if (url.pathname === PARTIE) {
    event.respondWith(
      fetch(req)
        .then(async (r) => {
          if (r.ok) { const c = await caches.open(CACHE); await c.put(PARTIE, r.clone()); return r; }
          if (enPanne(r)) return (await caches.match(PARTIE)) || r;
          return r;
        })
        .catch(async () => (await caches.match(PARTIE)) || Response.error()),
    );
  }
  // Tout le reste : réseau, rien n'est intercepté.
});
