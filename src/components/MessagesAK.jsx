import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import ChatDashboard from "@/components/dashboard/ChatDashboard";

// Les messages d'AK, en bas à gauche (16 oct. 2026, Jules : « quand une fiche
// commerciale arrive, l'agent fait la pré-analyse et nous met un message en
// bas à gauche ; on clique, c'est une discussion, et on peut discuter avec
// lui »). Le petit portrait d'AK, le nombre de messages pas vus, l'aperçu du
// dernier ; au clic, la conversation de l'assistant Klocka dans le vrai chat d'AK (nommé « Assistant Klocka » à l'écran).

const CLE_APERCU = "klocka.messages-ak.apercu-vu";

export default function MessagesAK() {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["messages-ak"], queryFn: () => base44.request("GET", "/api/messages-ak"), refetchInterval: 30_000, refetchOnWindowFocus: true });
  const [ouvert, setOuvert] = useState(false);
  const [apercuVu, setApercuVu] = useState(() => { try { return localStorage.getItem(CLE_APERCU) || ""; } catch { return ""; } });
  const nonLus = data?.non_lus || 0;
  const dernier = data?.dernier || null;
  // Un nouveau message d'AK ouvre la discussion d'elle-même, une fois (16 oct. 2026, Jules).
  const montrerApercu = false;
  useEffect(() => { if (!ouvert && nonLus > 0 && dernier && dernier.le !== apercuVu) setOuvert(true); }, [dernier?.le, nonLus]);
  // L'entrée d'AK se pose dans le bas de la barre de navigation (#k-ak-slot) ; sans barre (téléphone), elle flotte en bas à gauche.
  const [slot, setSlot] = useState(null);
  const [replie, setReplie] = useState(false);
  useEffect(() => {
    const voir = () => {
      const el = document.getElementById("k-ak-slot");
      setSlot(el && el.offsetParent !== null ? el : null);
      setReplie(el?.dataset?.replie === "1");
    };
    voir();
    const t = setInterval(voir, 1000);
    return () => clearInterval(t);
  }, []);
  const fermerApercu = () => { setApercuVu(dernier?.le || ""); try { localStorage.setItem(CLE_APERCU, dernier?.le || ""); } catch { /* sans stockage */ } };

  // À l'ouverture : la conversation se charge dans le chat du panneau, et tout est vu.
  const charge = useRef(false);
  useEffect(() => {
    if (!ouvert || !data?.id) return undefined;
    const t = setTimeout(() => {
      window.dispatchEvent(new CustomEvent("klocka:ouvrir-conversation", { detail: { id: data.id, api: "/api/assistant", qs: "", cible: "ak" } }));
      charge.current = true;
    }, 60);
    base44.request("POST", "/api/messages-ak/lus").then(() => queryClient.invalidateQueries({ queryKey: ["messages-ak"] })).catch(() => {});
    fermerApercu();
    return () => clearTimeout(t);
  }, [ouvert, data?.id]);
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [ouvert]);

  const entree = (
    <button type="button" onClick={() => setOuvert((o) => !o)} aria-label={nonLus ? `Discuter avec l'assistant Klocka, ${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}` : "Discuter avec l'assistant Klocka"} title="Discuter avec l'assistant Klocka"
      className={`flex min-w-0 items-center gap-2.5 rounded-[12px] py-1.5 text-left text-craie hover:bg-encre/[0.06] hover:text-encre ${replie ? "px-1" : "w-full px-2"}`} style={{ background: "transparent" }}>
      <span className="relative flex-none">
        {nonLus > 0 && <span aria-hidden className="k-ak-anneau absolute -inset-[3px] rounded-full" />}
        <img src="/avatars/ak.png" alt="" className="h-8 w-8 rounded-full object-cover" />
        {nonLus > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-menthe px-1 text-[10.5px] tabular-nums text-sur-menthe">{nonLus}</span>}
      </span>
      <span className={`flex min-w-0 flex-col leading-tight ${replie ? "hidden" : ""}`}>
        <span className="truncate text-[14px] text-encre">Assistant Klocka</span>
        <span className="truncate text-[12px] text-ardoise">{nonLus ? `${nonLus} nouveau${nonLus > 1 ? "x" : ""} message${nonLus > 1 ? "s" : ""}` : "Discuter"}</span>
      </span>
    </button>
  );
  // Le panneau passe par-dessus la barre, collé à gauche (16 oct. 2026, Jules).
  const position = { left: "12px" };
  // La taille de la fenêtre se tire par son coin en haut à droite (16 oct. 2026, Jules) ; gardée dans ce navigateur.
  const CLE_TAILLE = "klocka.assistant.taille";
  const borner = ({ w, h }) => ({ w: Math.round(Math.min(Math.max(w, 340), window.innerWidth - 24)), h: Math.round(Math.min(Math.max(h, 360), window.innerHeight - 24)) });
  const [taille, setTaille] = useState(() => { try { const t = JSON.parse(localStorage.getItem(CLE_TAILLE)); return t?.w && t?.h ? t : { w: 420, h: 640 }; } catch { return { w: 420, h: 640 }; } });
  const tirer = (e) => {
    e.preventDefault();
    const x0 = e.clientX; const y0 = e.clientY; const t0 = taille;
    let derniere = t0;
    const bouger = (ev) => { derniere = borner({ w: t0.w + (ev.clientX - x0), h: t0.h - (ev.clientY - y0) }); setTaille(derniere); };
    const lacher = () => {
      try { localStorage.setItem(CLE_TAILLE, JSON.stringify(derniere)); } catch { /* sans stockage */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const tailleVue = borner(taille);
  return createPortal(
    <>
      {ouvert && (
        <div role="dialog" aria-label="Assistant Klocka" style={{ ...position, width: tailleVue.w, height: tailleVue.h }}
          className="group/fenetre fixed bottom-3 z-[75] flex max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[20px] border border-trait bg-fond shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 max-md:!left-3">
          {/* Le coin à tirer, en haut à droite : il se montre au survol. */}
          <div role="separator" aria-label="Redimensionner l'assistant" title="Tirer pour agrandir ou réduire" onPointerDown={tirer}
            className="absolute right-0 top-0 z-10 h-5 w-5 cursor-nesw-resize opacity-0 transition-opacity group-hover/fenetre:opacity-100">
            <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-tr-[6px] border-r-2 border-t-2 border-bord-vif" />
          </div>
          {/* La barre du haut, de la couleur de la barre de navigation (16 oct. 2026, Jules). */}
          {/* Le dessin de Jules (16 oct. 2026) : la photo d'AK et sa pastille, le nom seul, la croix. */}
          <div className="flex flex-none items-center gap-3.5 border-b border-trait bg-rail px-5 py-4">
            <span className="relative h-11 w-11 flex-none">
              <img src="/avatars/ak.png" alt="" className="h-11 w-11 rounded-full object-cover" />
              <span aria-hidden className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-rail bg-menthe" />
            </span>
            <span className="min-w-0 flex-1 truncate text-[18px] font-medium text-encre">Assistant Klocka</span>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-5 w-5" /></button>
          </div>
          <div className="min-h-0 flex-1 px-5">
            <ChatDashboard espace="admin" cible="ak" compact sansBarreHaut onHistorique={() => {}} onConversation={() => {}} filVide="L'assistant Klocka t'écrit ici quand une fiche arrive et qu'il l'a pré-analysée." />
          </div>
        </div>
      )}
      {slot && createPortal(entree, slot)}
      {!ouvert && !slot && (
        <div style={position} className="fixed bottom-5 z-[75] flex items-end gap-3 max-md:!left-3">
          <button type="button" onClick={() => setOuvert(true)} aria-label={nonLus ? `Assistant Klocka, ${nonLus} non lu${nonLus > 1 ? "s" : ""}` : "Assistant Klocka"} title="Assistant Klocka"
            className="relative grid h-[54px] w-[54px] flex-none place-items-center rounded-full border border-trait bg-fond p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)] transition-transform hover:scale-105">
            {nonLus > 0 && <span aria-hidden className="k-ak-anneau absolute inset-0 rounded-full" />}
            <img src="/avatars/ak.png" alt="" className="h-[44px] w-[44px] rounded-full object-cover" />
            {nonLus > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-menthe px-1 text-[11px] tabular-nums text-sur-menthe">{nonLus}</span>}
          </button>
          {montrerApercu && (
            <div className="relative mb-1 w-[300px] rounded-[16px] rounded-bl-[4px] border border-trait bg-fond px-4 py-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-300 animate-in fade-in-0 slide-in-from-left-2">
              <button type="button" onClick={fermerApercu} aria-label="Masquer l'aperçu" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setOuvert(true)} className="block w-full p-0 pr-5 text-left" style={{ background: "transparent" }}>
                <span className="text-[12.5px] text-menthe">Assistant Klocka</span>
                <span className="mt-0.5 line-clamp-3 block text-[14px] leading-[1.45] text-encre">{dernier.contenu}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </>,
    document.body,
  );
}
