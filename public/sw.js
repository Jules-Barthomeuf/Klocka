// Le service worker minimal qui rend l'application installable.
//
// Il ne met rien en cache : une version périmée qui survivrait à un déploiement
// ferait plus de mal que l'absence de mode hors-ligne. Il existe parce que
// certains navigateurs exigent un gestionnaire « fetch » pour proposer
// l'installation — et pour rien d'autre.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {
  /* réseau, toujours : rien n'est intercepté */
});
