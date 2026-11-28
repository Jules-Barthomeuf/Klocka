// Sur Klocka seulement : la page Productivité envoie la journée (heures, pauses, sites), on la garde pour le bloqueur
// et on répond, pour que la page sache que l'extension est là.
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data || e.data.source !== "klocka-productivite") return;
  api.storage.local.set({ planning: e.data.planning, recu_le: Date.now() });
  window.postMessage({ source: "klocka-bloqueur", recu: true }, window.location.origin);
});
window.postMessage({ source: "klocka-bloqueur", pret: true }, window.location.origin);
