// L'enregistrement d'écran d'un appel (14 oct. 2026) : rrweb enregistre la page
// pendant l'appel ; à la validation, l'enregistrement part compressé au
// serveur, rattaché à l'appel. Les champs de mot de passe sont masqués. Plafond :
// 25 minutes ou 40 000 événements, au-delà l'enregistrement s'arrête seul.

const MAX_MS = 25 * 60 * 1000;
const MAX_EVENEMENTS = 40000;

let courant = null;

/** Lance l'enregistrement (rien si un enregistrement tourne déjà). */
export async function demarrer() {
  if (courant) return true;
  try {
    const { record } = await import("rrweb");
    const evenements = [];
    const debut = new Date().toISOString();
    const etat = { evenements, debut, arret: null };
    etat.arret = record({
      emit(e) {
        evenements.push(e);
        if (evenements.length >= MAX_EVENEMENTS) arreterSeul();
      },
      maskInputOptions: { password: true },
      sampling: { mousemove: 80, scroll: 150, input: "last" },
      recordCanvas: false,
      collectFonts: false,
    });
    etat.minuterie = setTimeout(arreterSeul, MAX_MS);
    courant = etat;
    return true;
  } catch {
    courant = null;
    return false;
  }
}

function arreterSeul() {
  if (!courant?.arret) return;
  try { courant.arret(); } catch { /* déjà arrêté */ }
  courant.arret = null;
  courant.fin = new Date().toISOString();
}

export const enCours = () => !!courant;

/** Arrête sans rien envoyer (appel annulé). */
export function abandonner() {
  arreterSeul();
  clearTimeout(courant?.minuterie);
  courant = null;
}

/** Arrête et envoie l'enregistrement, rattaché à l'appel. Ne lève jamais : un enregistrement perdu ne gêne pas l'appel. */
export async function terminer({ appel_id = null, agence_id = null, agent = null } = {}) {
  const etat = courant;
  if (!etat) return null;
  arreterSeul();
  clearTimeout(etat.minuterie);
  courant = null;
  if (etat.evenements.length < 3) return null;
  try {
    const brut = new Blob([JSON.stringify(etat.evenements)], { type: "application/json" });
    const compresse = await new Response(brut.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    const qs = new URLSearchParams({ debut: etat.debut, fin: etat.fin || new Date().toISOString(), evenements: String(etat.evenements.length), ...(appel_id ? { appel_id } : {}), ...(agence_id ? { agence_id } : {}), ...(agent ? { agent } : {}) });
    const r = await fetch(`/api/journal/ecran?${qs}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/octet-stream" }, body: compresse });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}
