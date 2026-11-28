// Le bloqueur : toutes les 30 secondes, et dès que la page Productivité envoie une nouvelle journée, il pose ou retire
// les règles qui renvoient les sites choisis vers bloque.html. Pendant le travail, un onglet déjà ouvert sur l'un d'eux
// passe aussi sur bloque.html.
import { enTravail, estBloque } from "./journee.js";
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;

const PAGE = api.runtime.getURL("bloque.html");
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function appliquer() {
  const { planning } = await api.storage.local.get("planning");
  const actif = enTravail(planning);
  const sites = actif ? planning.sites || [] : [];
  const anciennes = await api.declarativeNetRequest.getDynamicRules();
  await api.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: anciennes.map((r) => r.id),
    addRules: sites.map((s, i) => ({
      id: i + 1,
      priority: 1,
      action: { type: "redirect", redirect: { regexSubstitution: `${PAGE}?depuis=\\0` } },
      condition: { regexFilter: `^https?://([a-z0-9-]+\\.)*${echapper(s)}(:[0-9]+)?([/?#].*)?$`, resourceTypes: ["main_frame"] },
    })),
  });
  if (!sites.length) return;
  const onglets = await api.tabs.query({});
  for (const o of onglets) {
    if (o.url && estBloque(o.url, sites)) api.tabs.update(o.id, { url: `${PAGE}?depuis=${o.url}` });
  }
}

api.runtime.onInstalled.addListener(() => { api.alarms.create("tour", { periodInMinutes: 0.5 }); appliquer(); });
api.runtime.onStartup.addListener(() => { api.alarms.create("tour", { periodInMinutes: 0.5 }); appliquer(); });
api.alarms.onAlarm.addListener(appliquer);
api.storage.onChanged.addListener((changes) => { if (changes.planning) appliquer(); });
