// Les réglages de l'extension, partagés par le fond et la fenêtre : allumée ou non, l'adresse de Klocka, et les lieux
// activés (« whatsapp:Paul Dz », « gmail:jules.b@klocka.immo »). Une conversation qui n'y est pas n'est jamais lue.
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;
// L'adresse de Klocka : en ligne depuis la mise en production du 28 nov. 2026. Pour essayer contre le serveur local, poser
// `base: "http://localhost:5173"` dans le stockage de l'extension (outils de développement), rien à l'écran.
export const DEFAUT = { active: true, base: "https://app.klocka.immo", lieux: {} };

export async function reglages() {
  const r = await api.storage.local.get(DEFAUT);
  return { ...DEFAUT, ...r, lieux: r.lieux || {} };
}
