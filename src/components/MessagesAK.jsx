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
// dernier ; au clic, la conversation « Messages d'AK » dans le vrai chat d'AK.

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
    <button type="button" onClick={() => setOuvert((o) => !o)} aria-label={nonLus ? `Discuter avec AK, ${nonLus} message${nonLus > 1 ? "s" : ""} non lu${nonLus > 1 ? "s" : ""}` : "Discuter avec AK"} title="Discuter avec AK"
      className={`flex min-w-0 items-center gap-2.5 rounded-[12px] py-1.5 text-left text-craie hover:bg-encre/[0.06] hover:text-encre ${replie ? "px-1" : "w-full px-2"}`} style={{ background: "transparent" }}>
      <span className="relative flex-none">
        {nonLus > 0 && <span aria-hidden className="k-ak-anneau absolute -inset-[3px] rounded-full" />}
        <img src="/avatars/ak.png" alt="" className="h-8 w-8 rounded-full object-cover" />
        {nonLus > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-menthe px-1 text-[10.5px] tabular-nums text-sur-menthe">{nonLus}</span>}
      </span>
      <span className={`flex min-w-0 flex-col leading-tight ${replie ? "hidden" : ""}`}>
        <span className="truncate text-[14px] text-encre">AK</span>
        <span className="truncate text-[12px] text-ardoise">{nonLus ? `${nonLus} nouveau${nonLus > 1 ? "x" : ""} message${nonLus > 1 ? "s" : ""}` : "Discuter"}</span>
      </span>
    </button>
  );
  const position = { left: "calc(var(--k-barre-largeur, 0px) + 12px)" };
  return createPortal(
    <>
      {ouvert && (
        <div role="dialog" aria-label="Messages d'AK" style={position}
          className="fixed bottom-3 z-[75] flex h-[min(640px,calc(100dvh-24px))] w-[420px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[20px] border border-trait bg-fond shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-200 animate-in fade-in-0 slide-in-from-bottom-2 max-md:!left-3">
          <div className="flex flex-none items-center gap-3 border-b border-trait px-4 py-3">
            <img src="/avatars/ak.png" alt="" className="h-9 w-9 rounded-full object-cover" />
            <div className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] text-encre">AK</span><span className="text-[12.5px] text-ardoise">Ses messages, et ta réponse</span></div>
            <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1 px-3">
            <ChatDashboard espace="admin" cible="ak" sansBarreHaut onHistorique={() => {}} onConversation={() => {}} filVide="AK t'écrit ici quand une fiche arrive et qu'il l'a pré-analysée." />
          </div>
        </div>
      )}
      {slot && createPortal(entree, slot)}
      {!ouvert && !slot && (
        <div style={position} className="fixed bottom-5 z-[75] flex items-end gap-3 max-md:!left-3">
          <button type="button" onClick={() => setOuvert(true)} aria-label={nonLus ? `Messages d'AK, ${nonLus} non lu${nonLus > 1 ? "s" : ""}` : "Messages d'AK"} title="Messages d'AK"
            className="relative grid h-[54px] w-[54px] flex-none place-items-center rounded-full border border-trait bg-fond p-0 shadow-[0_18px_40px_rgb(0_0_0/0.18)] transition-transform hover:scale-105">
            {nonLus > 0 && <span aria-hidden className="k-ak-anneau absolute inset-0 rounded-full" />}
            <img src="/avatars/ak.png" alt="" className="h-[44px] w-[44px] rounded-full object-cover" />
            {nonLus > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-menthe px-1 text-[11px] tabular-nums text-sur-menthe">{nonLus}</span>}
          </button>
          {montrerApercu && (
            <div className="relative mb-1 w-[300px] rounded-[16px] rounded-bl-[4px] border border-trait bg-fond px-4 py-3 shadow-[0_18px_40px_rgb(0_0_0/0.18)] duration-300 animate-in fade-in-0 slide-in-from-left-2">
              <button type="button" onClick={fermerApercu} aria-label="Masquer l'aperçu" className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-3.5 w-3.5" /></button>
              <button type="button" onClick={() => setOuvert(true)} className="block w-full p-0 pr-5 text-left" style={{ background: "transparent" }}>
                <span className="text-[12.5px] text-menthe">AK</span>
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
