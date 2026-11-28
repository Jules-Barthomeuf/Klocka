// La page posée à la place d'un site bloqué : quand vient la pause, elle propose de rouvrir la page demandée.
import { enTravail, prochainePause } from "./journee.js";
// Firefox et Safari parlent `browser`, Chrome `chrome` : le même code pour les trois.
const api = globalThis.browser ?? globalThis.chrome;

const depuis = window.location.href.split("?depuis=")[1] || "";
const retour = document.getElementById("retour");
if (depuis) retour.href = depuis;

async function montrer() {
  const { planning } = await api.storage.local.get("planning");
  if (enTravail(planning)) {
    const p = prochainePause(planning);
    document.getElementById("etiquette").textContent = "Temps de travail";
    document.getElementById("titre").textContent = "Ce site attend la pause.";
    document.getElementById("phrase").textContent = p
      ? `Prochaine pause à ${p.heure}, dans ${p.dans} minute${p.dans > 1 ? "s" : ""}.`
      : `Plus de pause aujourd'hui : le site rouvre à ${planning.fin}.`;
    retour.style.display = "none";
  } else {
    document.getElementById("etiquette").textContent = "Pause";
    document.getElementById("titre").textContent = "Le site est ouvert.";
    document.getElementById("phrase").textContent = "";
    retour.style.display = depuis ? "inline-block" : "none";
  }
}
montrer();
setInterval(montrer, 15000);
