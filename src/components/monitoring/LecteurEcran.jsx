import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, X } from "lucide-react";
import "rrweb-player/dist/style.css";
import Chargement from "@/components/ui/Chargement";

// Rejouer l'écran d'un analyste pendant un appel (14 oct. 2026, Jules) : la
// page telle qu'il l'a vue et utilisée, de l'appel décroché à sa validation.
// Gardé 30 jours. Le lecteur est aussi dans le Dashboard de l'analyste, pour
// les questions d'AK sur ses appels (16 oct. 2026).
//
// « Enregistrement illisible » (16 oct. 2026) : chaque mise en ligne coupe le
// service environ une minute (le disque de Render empêche un déploiement sans
// coupure), et le serveur répond alors 502 en HTML. Le lecteur ne conclut plus
// « illisible » : il réessaie (six fois, de plus en plus lentement), dit que le
// serveur redémarre, et offre « Réessayer ». Un enregistrement vraiment effacé
// ou refusé dit pourquoi.

const PAUSES = [3000, 5000, 8000, 12000, 15000];
const TEMPORAIRES = new Set([502, 503, 504]);
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Va chercher l'enregistrement ; réessaie quand le serveur redémarre ou que le fichier arrive coupé. */
async function recuperer(url, { vivant, surEssai }) {
  let derniere = "Le serveur ne répond pas.";
  for (let k = 0; k <= PAUSES.length; k += 1) {
    if (!vivant()) return null;
    try {
      const r = await fetch(url, { credentials: "include" });
      if (r.ok) return await r.json();
      if (!TEMPORAIRES.has(r.status)) {
        const corps = await r.json().catch(() => null);
        const e = new Error(corps?.error || `Le serveur a répondu ${r.status}.`);
        e.definitif = true;
        throw e;
      }
      derniere = "Le serveur redémarre (une mise à jour vient d'être mise en ligne).";
    } catch (e) {
      if (e.definitif) throw e;
      derniere = e instanceof SyntaxError ? "Le fichier est arrivé coupé." : "Le serveur ne répond pas (mise à jour en cours ?).";
    }
    if (k < PAUSES.length) { surEssai?.({ essai: k + 2, sur: PAUSES.length + 1, raison: derniere }); await attendre(PAUSES[k]); }
  }
  throw new Error(`${derniere} L'enregistrement n'est pas perdu : réessayez dans une minute.`);
}

/** Le lecteur, posé dans la page (ou dans la fenêtre ci-dessous). `url` : où lire l'enregistrement gzip. */
export function EcranRejoue({ url, rapport = 0.56, className = "" }) {
  const zone = useRef(null);
  const lecteur = useRef(null);
  const [etat, setEtat] = useState({ attente: true, erreur: null, essai: null });
  const [tentative, setTentative] = useState(0);
  useEffect(() => {
    let vivant = true;
    setEtat({ attente: true, erreur: null, essai: null });
    (async () => {
      try {
        const evenements = await recuperer(url, { vivant: () => vivant, surEssai: (essai) => vivant && setEtat((s) => ({ ...s, essai })) });
        if (!vivant) return;
        const { default: Player } = await import("rrweb-player");
        if (!vivant || !zone.current) return;
        zone.current.innerHTML = "";
        const largeur = Math.max(280, Math.min(zone.current.clientWidth, 1400));
        lecteur.current = new Player({ target: zone.current, props: { events: evenements, width: largeur, height: Math.round(largeur * rapport), autoPlay: true, skipInactive: true, speedOption: [1, 2, 4, 8] } });
        setEtat({ attente: false, erreur: null, essai: null });
      } catch (e) {
        if (vivant) setEtat({ attente: false, erreur: e?.message || "Lecture impossible", essai: null });
      }
    })();
    return () => { vivant = false; try { lecteur.current?.$destroy?.(); } catch { /* déjà détruit */ } lecteur.current = null; };
  }, [url, tentative, rapport]);
  return (
    <div className={className}>
      {etat.attente && (
        <>
          <Chargement taille="moyen" titre={etat.essai ? "Le serveur redémarre" : "Un instant"} />
          {etat.essai && <p className="m-0 pb-2 text-center text-[12.5px] text-brume">Nouvel essai {etat.essai.essai} sur {etat.essai.sur}. {etat.essai.raison}</p>}
        </>
      )}
      {etat.erreur && (
        <div className="py-10 text-center">
          <p className="m-0 text-[14px] text-brume">{etat.erreur}</p>
          <button type="button" onClick={() => setTentative((n) => n + 1)} className="mt-3 inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}><RefreshCw className="h-3.5 w-3.5" />Réessayer</button>
        </div>
      )}
      <div ref={zone} className="k-lecteur-ecran w-full" />
    </div>
  );
}

export default function LecteurEcran({ id, titre = "Écran pendant l'appel", onFermer, url = null }) {
  useEffect(() => {
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [onFermer]);
  return createPortal(
    <div className="fixed inset-0 z-[80] grid place-items-center bg-fond/80 p-4 backdrop-blur-sm" onMouseDown={onFermer}>
      <div className="flex max-h-[94vh] w-full max-w-[1460px] flex-col overflow-hidden rounded-[14px] border border-bord-vif bg-surface-pleine shadow-[0_18px_40px_rgb(0_0_0/0.18)]" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3.5">
          <span className="min-w-0 truncate text-[14.5px] text-encre">{titre}</span>
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <EcranRejoue url={url || `/api/monitoring/enregistrements/${id}`} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
