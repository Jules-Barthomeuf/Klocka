import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import Deck from "@/components/presentations/Deck";
import EditeurPresentation from "@/components/presentations/EditeurPresentation";
import { NoteDesign } from "@/components/presentations/ChatClient";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { useQueryClient } from "@tanstack/react-query";
import Chargement from "@/components/ui/Chargement";

// Présentations, côté client (13 oct. 2026, Jules) : les dossiers bancaires
// que l'équipe Klocka lui a envoyés. Une présentation ouverte prend toute la
// page : depuis le 16 oct. 2026 (Jules), le même écran que l'équipe, le chat d'AK
// à gauche et l'éditeur à droite (édition, lecture, sources, plein écran), et en
// bas à droite la note du design, en étoiles, qui arrive dans le Feedback ;
// ses retouches enregistrées d'elles-mêmes, et « Une question » qui arrive dans
// le Feedback de l'équipe. L'équipe, en vue client, les voit toutes dès leur
// création, avec leurs destinataires ou « pas encore envoyée ». La liste : la
// première diapositive en grand, un clic l'ouvre (13 oct. 2026, Jules).

export default function MesPresentations() {
  const [params, setParams] = useSearchParams();
  const ouverte = params.get("presentation");
  const ouvrir = (id) => setParams((p) => { const n = new URLSearchParams(p); if (id) n.set("presentation", id); else n.delete("presentation"); return n; });
  const { data: user } = useCurrentUser();
  const equipe = user?.role === "admin";
  const { data, isLoading } = useQuery({ queryKey: ["presentations-client"], queryFn: () => base44.request("GET", "/api/client/presentations") });
  const presentations = data?.presentations || [];

  // Ouverte, elle prend l'écran entier : la barre latérale s'efface, comme pour un éditeur.
  useEffect(() => {
    if (!ouverte) return undefined;
    document.documentElement.classList.add("k-sans-barre");
    return () => document.documentElement.classList.remove("k-sans-barre");
  }, [ouverte]);

  if (ouverte) return <VueClient id={ouverte} onFermer={() => ouvrir(null)} />;

  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 py-6 md:px-10 md:py-9">
      <header className="flex flex-col items-center pt-[6vh] text-center max-md:pt-4">
        <h1 className="m-0 font-normal leading-[1.15] tracking-[-0.02em] text-encre" style={{ fontSize: "clamp(22px, 2.1vw, 30px)" }}>Vos présentations</h1>
        <p className="m-0 mt-2 max-w-[56ch] text-[14px] text-ardoise">Les dossiers de financement préparés par Klocka : relisez-les, retouchez-les, vérifiez chaque chiffre et présentez-les depuis l'application.</p>
      </header>
      <div className="mt-[6vh]">
        {isLoading ? (
          <Chargement taille="grand" />
        ) : !presentations.length ? (
          <p className="py-16 text-center text-[14px] text-brume">{equipe ? "Aucune présentation pour l'instant : elles apparaissent ici dès leur création." : "Aucune présentation pour l'instant : Klocka vous l'enverra ici dès qu'elle sera prête."}</p>
        ) : (
          <div className="mx-auto flex max-w-[960px] flex-col gap-10">
            {presentations.map((p) => (
              <div key={p.id}>
                <button type="button" onClick={() => ouvrir(p.id)} aria-label={`Ouvrir ${p.titre}`}
                  className="group relative block aspect-[16/9] w-full overflow-hidden rounded-[18px] border border-trait bg-rail text-left transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-bord-vif" style={{ padding: 0 }}>
                  {p.premiere ? (
                    <div className="pb-apercu pointer-events-none absolute inset-0">
                      <Deck diapos={[p.premiere]} courante={p.premiere.id} onCourante={() => {}} mode="lecture" relief={0} onChange={() => {}} onPhoto={() => {}} />
                    </div>
                  ) : (
                    <span className="grid h-full place-items-center text-[14px] text-brume">{p.titre}</span>
                  )}
                </button>
                <div className="mt-3 flex items-baseline justify-between gap-4 px-1">
                  <span className="min-w-0 truncate text-[15px] text-encre">{p.titre}</span>
                  <span className="flex-none text-[12.5px] text-ardoise">{equipe ? (p.envoye_a?.length ? `envoyée à ${p.envoye_a.join(", ")}` : "pas encore envoyée") : `${p.diapos} diapositive${p.diapos > 1 ? "s" : ""}`}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Une présentation ouverte, côté client : l'écran de l'équipe, à l'identique (16 oct. 2026, Jules) —
 * le chat de l'assistant dans sa colonne à gauche (la même, redimensionnable), l'éditeur en carte à droite,
 * le fond sobre ; au téléphone, l'éditeur en plein écran et « Demander à l'assistant ».
 */
function VueClient({ id, onFermer }) {
  const queryClient = useQueryClient();
  // Le chat s'ouvre déjà en fil, comme chez l'équipe une présentation ouverte : la saisie en bas (Jules, 16 oct. 2026).
  const [, setConversation] = useState(true);
  const [large, setLarge] = useState(() => typeof window === "undefined" || window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const m = window.matchMedia("(min-width: 1024px)");
    const f = () => setLarge(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  useEffect(() => {
    document.documentElement.classList.add("k-sans-barre", "k-sobre");
    window.scrollTo(0, 0);
    return () => document.documentElement.classList.remove("k-sans-barre", "k-sobre");
  }, []);
  const CLE_LARGEUR = "klocka.presentations-client.largeur-chat";
  const LARGEUR_DEFAUT = 420;
  const borner = (l) => Math.round(Math.min(Math.max(l, 300), Math.max(320, window.innerWidth - 560)));
  const [largeurChat, setLargeurChat] = useState(() => { try { const v = Number(localStorage.getItem(CLE_LARGEUR)); return v ? borner(v) : LARGEUR_DEFAUT; } catch { return LARGEUR_DEFAUT; } });
  const [tire, setTire] = useState(false);
  const tirer = (e) => {
    e.preventDefault();
    setTire(true);
    let derniere = largeurChat;
    const bouger = (ev) => { derniere = borner(ev.clientX); setLargeurChat(derniere); };
    const lacher = () => {
      setTire(false);
      try { localStorage.setItem(CLE_LARGEUR, String(derniere)); } catch { /* navigation privée */ }
      window.removeEventListener("pointermove", bouger);
      window.removeEventListener("pointerup", lacher);
    };
    window.addEventListener("pointermove", bouger);
    window.addEventListener("pointerup", lacher);
  };
  const remettre = () => { setLargeurChat(LARGEUR_DEFAUT); try { localStorage.removeItem(CLE_LARGEUR); } catch { /* rien */ } };
  const surReponse = (r) => { if (r?.presentation_modifiee) queryClient.invalidateQueries({ queryKey: ["presentation-bancaire", id, "client"] }); };
  const chat = <ChatDashboard espace="presentation_client" onConversation={setConversation} onReponse={surReponse} barreApercu={large} filVide="Que voulez-vous changer ? Un texte, un titre, une diapositive : dites-le, l'assistant le fait." contexte={{ presentation_id: id }} />;
  const editeur = <EditeurPresentation key={id} id={id} client onFermer={onFermer} />;
  if (!large) {
    return (
      <div className="h-[100dvh] w-full">
        {editeur}
        <ChatMobile>{chat}</ChatMobile>
        <NoteDesign id={id} />
      </div>
    );
  }
  return (
    <div className="k-page-presentation relative min-h-screen w-full max-w-full overflow-x-hidden text-encre">
      <div className={`relative grid h-[100dvh] overflow-hidden ${tire ? "select-none" : ""}`} style={{ gridTemplateColumns: `${largeurChat}px minmax(0,1fr)` }}>
        <div className="k-colonne-chat h-[100dvh] min-h-0 min-w-0 overflow-hidden px-5">
          <header className="flex flex-col"><div className="w-full">{chat}</div></header>
        </div>
        <div className="h-[100dvh] min-h-0 min-w-0 py-2 pr-2">
          <div className="h-full min-h-0 overflow-hidden border-l border-trait">{editeur}</div>
        </div>
        <div role="separator" aria-orientation="vertical" aria-label="Largeur du chat" title="Tirer pour élargir ou réduire le chat ; double-clic pour revenir"
          onPointerDown={tirer} onDoubleClick={remettre}
          className="group absolute inset-y-0 z-20 flex w-3 cursor-col-resize justify-center" style={{ left: largeurChat - 6 }}>
          <span className={`my-auto h-10 w-[3px] rounded-full transition-colors ${tire ? "bg-menthe" : "bg-transparent group-hover:bg-bord-vif"}`} />
        </div>
      </div>
      <NoteDesign id={id} />
    </div>
  );
}

/** Au téléphone : « Demander à l'assistant » ouvre le chat en plein écran, par-dessus la présentation. */
function ChatMobile({ children }) {
  const [ouvert, setOuvert] = React.useState(false);
  return (
    <div className="lg:hidden">
      {!ouvert && <button type="button" onClick={() => setOuvert(true)} className="fixed bottom-5 left-3 z-[75] h-11 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe shadow-[0_18px_40px_rgb(0_0_0/0.18)]">Demander à l'assistant</button>}
      {ouvert && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-fond">
          <button type="button" onClick={() => setOuvert(false)} className="flex-none border-b border-trait px-5 py-3 text-left text-[14px] text-craie" style={{ background: "transparent" }}>← Revenir à la présentation</button>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}
