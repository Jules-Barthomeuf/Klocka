// Les analyses tournent en tâche de fond : on quitte la page, et on veut être
// prévenu quand c'est fini. Deux voies, l'une après l'autre :
//   - la notification du système, si la personne l'a autorisée ;
//   - à défaut, un message dans l'application, qui ramène sur la page.
//
// Rien n'est demandé au premier chargement : l'autorisation se demande au
// moment où une analyse part, c'est-à-dire quand elle a un sens.

import { toast } from "sonner";

const SUPPORTE = typeof window !== "undefined" && "Notification" in window;

/** Demande l'autorisation, une seule fois, sans insister. */
export async function demanderNotifications() {
  if (!SUPPORTE || Notification.permission !== "default") return;
  try { await Notification.requestPermission(); } catch { /* refus : le message dans l'application suffit */ }
}

/**
 * Prévient que quelque chose est terminé.
 * @param {string} titre   « Analyse terminée »
 * @param {string} corps   ce qui a été fait
 * @param {string} lien    la page à rouvrir (chemin de l'application)
 */
export function prevenir(titre, corps, lien = null) {
  const ouvrir = () => { if (lien) window.location.assign(lien); };
  // Page au premier plan : le message dans l'application se voit, pas besoin
  // d'une notification système par-dessus.
  const cachee = typeof document !== "undefined" && document.visibilityState === "hidden";
  if (SUPPORTE && Notification.permission === "granted" && cachee) {
    try {
      const n = new Notification(titre, { body: corps, icon: "/icones/apple-touch-icon.png", tag: lien || titre });
      n.onclick = () => { window.focus(); ouvrir(); n.close(); };
      return;
    } catch { /* le navigateur a refusé : on retombe sur le message */ }
  }
  toast.success(titre, {
    description: corps,
    duration: 12000,
    ...(lien ? { action: { label: "Ouvrir", onClick: ouvrir } } : {}),
  });
}
