import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, PhoneCall, X } from "lucide-react";
import jetons from "@/design/jetons.json";
import { RENDEZ_VOUS_URL } from "@/lib/rendezVous";

// Le simulateur public et les newsletters (9 oct. 2026). Le lien personnel
// d'un mail ({{lien_simulateur}}) porte le jeton du contact (k) et la source
// (s) : la page sait qui l'utilise, range ses valeurs dans sa fiche (une
// session par demi-heure) et, quand il réserve un créneau avec le fondateur
// dans la fenêtre Calendly, le marque « Call pris » : il sort des newsletters.
// Sans jeton, le bouton marche pareil et rien n'est noté.

const CLE = "klocka.simulateur.visiteur";
const sansDiese = (h) => String(h || "").replace("#", "");

/** Le jeton et la source : ceux du lien, gardés le temps de la visite. */
function lireVisite() {
  try {
    const p = new URLSearchParams(window.location.search);
    const k = p.get("k");
    if (k) { const v = { k, s: p.get("s") || null }; sessionStorage.setItem(CLE, JSON.stringify(v)); return v; }
    return JSON.parse(sessionStorage.getItem(CLE) || "null");
  } catch { return null; }
}

const noter = (visite, type, valeurs = null) => {
  if (!visite?.k) return Promise.resolve();
  return fetch("/api/emailing/activite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ k: visite.k, s: visite.s, type, valeurs }), keepalive: true }).catch(() => {});
};

/**
 * Le suivi du simulateur : les valeurs au premier affichage, puis six secondes
 * après chaque changement. Rend le visiteur (prénom, adresse) pour préremplir
 * le rendez-vous.
 */
export function useVisiteSimulateur(valeurs) {
  const visite = useRef(lireVisite());
  const [qui, setQui] = useState(null);
  const minuteur = useRef(null);
  const premier = useRef(true);
  useEffect(() => {
    if (!visite.current?.k) return;
    fetch(`/api/emailing/visiteur?k=${encodeURIComponent(visite.current.k)}`).then((r) => r.json()).then((d) => { if (d?.ok) setQui(d); }).catch(() => {});
  }, []);
  const cle = JSON.stringify(valeurs);
  useEffect(() => {
    if (!visite.current?.k) return undefined;
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(() => { noter(visite.current, "simulateur", valeurs); }, premier.current ? 1500 : 6000);
    premier.current = false;
    return () => clearTimeout(minuteur.current);
  }, [cle]);
  return { visite: visite.current, qui };
}

/** Le bouton « Parler au fondateur » et sa fenêtre Calendly. */
export default function RendezVousFondateur({ visite, qui }) {
  const [ouvert, setOuvert] = useState(false);
  const [pris, setPris] = useState(!!qui?.call_pris);
  useEffect(() => { if (qui?.call_pris) setPris(true); }, [qui?.call_pris]);
  useEffect(() => {
    if (!ouvert) return undefined;
    // Calendly prévient la page qui l'embarque quand un créneau est réservé.
    const ecoute = (e) => {
      if (!/calendly\.com$/.test(new URL(e.origin || "https://x").hostname)) return;
      if (e.data?.event === "calendly.event_scheduled") { setPris(true); noter(visite, "call_pris"); }
    };
    const echap = (e) => e.key === "Escape" && setOuvert(false);
    window.addEventListener("message", ecoute);
    window.addEventListener("keydown", echap);
    return () => { window.removeEventListener("message", ecoute); window.removeEventListener("keydown", echap); };
  }, [ouvert, visite]);
  const c = jetons.couleurs;
  const url = `${RENDEZ_VOUS_URL}?embed_domain=${encodeURIComponent(window.location.hostname)}&embed_type=Inline&hide_gdpr_banner=1`
    + `&background_color=${sansDiese(c["surface-pleine"])}&text_color=${sansDiese(c.encre)}&primary_color=${sansDiese(c.menthe)}`
    + `${qui?.email ? `&email=${encodeURIComponent(qui.email)}` : ""}${qui?.prenom || qui?.nom ? `&name=${encodeURIComponent([qui.prenom, qui.nom].filter(Boolean).join(" "))}` : ""}`;
  return (
    <>
      <button type="button" onClick={() => { setOuvert(true); noter(visite, "clic_call"); }}
        className="flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 text-xs font-medium text-sur-menthe transition-colors hover:bg-menthe-survol">
        {pris ? <Check className="h-3.5 w-3.5" /> : <PhoneCall className="h-3.5 w-3.5" />}{pris ? "Call réservé" : "Parler au fondateur"}
      </button>
      {ouvert && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 duration-200 animate-in fade-in max-md:p-0" onClick={() => setOuvert(false)}>
          <div className="flex h-[86vh] w-full max-w-[900px] flex-col overflow-hidden rounded-[18px] border border-trait bg-surface-pleine max-md:h-[100dvh] max-md:max-w-none max-md:rounded-none max-md:border-0" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-trait px-5 py-3">
              <span className="text-[14px] text-encre">{pris ? "Votre call est réservé" : "Un créneau avec le fondateur de Klocka"}</span>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre"><X className="h-4 w-4" /></button>
            </div>
            <iframe title="Prendre rendez-vous" src={url} className="min-h-0 w-full flex-1 border-0" />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
