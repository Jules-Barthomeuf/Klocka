import React, { useEffect, useState } from "react";
import { ArrowUp, Sparkles, X } from "lucide-react";
import ChatDashboard from "@/components/dashboard/ChatDashboard";

// L'Assistant du dossier (2 nov. 2026, Jules, après l'avis produit : « pouvoir interroger l'IA sur le dossier ») : un
// panneau qui glisse à droite, ouvert à la demande, sur le dossier ouvert. C'est le chat du dossier
// (espace « dossier », server/ak/app.js) : il sait le dossier, l'étape et l'onglet de l'Analyse, cite ses sources.
// Fermé, il reste monté : la conversation se retrouve en le rouvrant, tant que le dossier est ouvert.
// On l'appelle par une barre toujours visible en bas du dossier (même jour, Jules : « faire appel à l'assistant, c'est
// trop compliqué à voir ») : écrire et envoyer ouvre le panneau avec la réponse ; un clic sans texte l'ouvre seul.

// Trois questions toutes prêtes, selon l'onglet : elles remplissent le champ, la personne envoie.
const QUESTIONS = {
  data_room: ["Qu'est-ce qui manque dans la Data Room ?", "Résume les pièces reçues", "Quelle pièce lire en premier ?"],
  bail: ["Les risques de ce bail", "Résume le bail", "Le loyer des quittances colle-t-il au bail ?"],
  quittances: ["Le locataire paie-t-il à l'heure ?", "Le loyer des quittances colle-t-il au bail ?", "Résume le dossier"],
  copropriete: ["Les travaux votés ou à venir", "Les charges de copropriété", "Ce qu'il faut vérifier dans les PV"],
  diagnostics: ["Les diagnostics manquants ou périmés", "Ce que disent les diagnostics", "Résume le dossier"],
  marche: ["Le prix est-il dans le marché ?", "Le loyer est-il dans le marché ?", "Résume le dossier"],
};
const PAR_DEFAUT = ["Résume le dossier", "Qu'est-ce qui manque ?", "Les risques du bail"];

export default function PanneauAssistant({ ouvert, onFermer, dealId, etape, onglet = null, sur = null, onReponse = null }) {
  const [conversation, setConversation] = useState(false);
  useEffect(() => {
    if (!ouvert) return undefined;
    const echap = (e) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", echap);
    return () => window.removeEventListener("keydown", echap);
  }, [ouvert, onFermer]);
  const questions = QUESTIONS[onglet] || PAR_DEFAUT;
  const poser = (texte) => window.dispatchEvent(new CustomEvent("klocka:composer", { detail: { texte } }));
  return (
    <aside role="dialog" aria-label="Assistant du dossier" aria-hidden={!ouvert}
      className={`fixed inset-y-0 right-0 z-[60] flex w-[440px] flex-col border-l border-trait bg-fond shadow-[-24px_0_60px_rgb(0_0_0/0.35)] transition-transform duration-300 ease-out max-md:w-full max-md:border-l-0 ${ouvert ? "translate-x-0" : "pointer-events-none translate-x-full"}`}>
      <header className="flex h-14 flex-none items-center justify-between gap-3 border-b border-trait pl-5 pr-3">
        <p className="m-0 min-w-0 truncate text-[15px] text-encre">Assistant{sur ? <span className="text-[13px] text-ardoise"> · sur {sur}</span> : null}</p>
        <button type="button" onClick={onFermer} aria-label="Fermer l'assistant" className="grid h-9 w-9 flex-none place-items-center rounded-full text-ardoise hover:bg-relief hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
      </header>
      {!conversation && (
        <div className="flex min-h-0 flex-1 flex-col justify-end gap-2 overflow-y-auto px-5 pb-4">
          <p className="m-0 mb-1 text-[15px] text-encre">Une question sur ce dossier ?</p>
          {questions.map((q) => (
            <button key={q} type="button" onClick={() => poser(q)} className="w-full rounded-[14px] border border-trait bg-rail px-4 py-2.5 text-left text-[13.5px] text-craie hover:border-bord-vif hover:text-encre">{q}</button>
          ))}
        </div>
      )}
      <div className={`${conversation ? "min-h-0 flex-1" : "flex-none"} px-4 pb-4`} style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
        <ChatDashboard key={dealId} espace="dossier" lueur={false} sansBarreHaut onConversation={setConversation} contexte={{ deal_id: dealId, etape, onglet }} onReponse={onReponse} />
      </div>
    </aside>
  );
}

/** La barre d'appel, en bas du dossier : la saisie du chat, flottante, au centre de la page. */
export function BarreAssistant({ onOuvrir }) {
  const [texte, setTexte] = useState("");
  const envoyer = (e) => { e.preventDefault(); onOuvrir(texte.trim()); setTexte(""); };
  return (
    <form onSubmit={envoyer} className="fixed bottom-6 left-1/2 z-[44] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 md:ml-[calc(var(--k-barre-largeur,0px)/2)] max-md:bottom-4" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      <div className="flex items-center gap-3 rounded-[20px] border border-trait bg-barre py-2 pl-4 pr-2 shadow-[0_12px_32px_rgb(0_0_0/0.18)] focus-within:border-bord-vif">
        <Sparkles className="h-4 w-4 flex-none text-menthe" />
        <input value={texte} onChange={(e) => setTexte(e.target.value)} onFocus={() => { if (!texte) onOuvrir(""); }} placeholder="Une question sur ce dossier ? Demandez à l'assistant"
          aria-label="Demander à l'assistant" className="h-10 min-w-0 flex-1 bg-transparent text-[14.5px] text-encre outline-none placeholder:text-brume max-md:text-[16px]" />
        <button type="submit" aria-label="Envoyer" className="grid h-9 w-9 flex-none place-items-center rounded-full text-encre transition-colors hover:text-menthe" style={{ background: "transparent" }}><ArrowUp className="h-[18px] w-[18px]" strokeWidth={2} /></button>
      </div>
    </form>
  );
}
