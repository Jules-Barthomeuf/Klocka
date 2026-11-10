import React, { useRef } from "react";
import { base44 } from "@/api/base44Client";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { AudioLines } from "lucide-react";

// L'écran d'après l'appel (9 nov. 2026, Jules) : deux colonnes dans la page, un filet entre elles ; à gauche le vrai chat
// (`ChatDashboard`, espace « appel »), à droite les actions proposées, chacune sous son titre. Ce qu'on dit à l'assistant
// change aussitôt les actions. La transcription s'ouvre par un bouton, posé à gauche de « Mode appel ».

const OUVERTURE = "Dites-moi si je dois ajouter quelque chose ou s'il y a un cas particulier.";
const TITRE = "m-0 text-center text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre";

export function BoutonTranscription({ actif, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition-colors ${actif ? "border-menthe/60 text-menthe" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
      <AudioLines className="h-3.5 w-3.5" />Transcription
    </button>
  );
}

export default function EcranApresAppel({ appel, issue, coches, setCoches, mail, setMail, relanceLe, setRelanceLe, relance2Le, setRelance2Le, edits, setEdits, transcription, voirTranscription = false, enRelecture = false, annonce = null, onRefaire, onLancer, children }) {

  // Une phrase dite pendant que les actions se refont attend la fin : sinon la relecture écraserait ce qu'elle change.
  const vif = useRef(null);
  vif.current = { appel, issue, coches, mail, relanceLe, relance2Le, edits, enRelecture };
  const repondre = async ({ texte, historique, signal }) => {
    for (let i = 0; vif.current.enRelecture && i < 360; i += 1) await new Promise((ok) => setTimeout(ok, 250));
    const v = vif.current;
    const r = await base44.request("POST", `/api/prospection/mode-appel/appels/${v.appel.id}/assistant`, {
      body: { message: texte, historique, etat: { issue: v.issue, coches: [...v.coches], mail: v.mail, relance_le: v.relanceLe, relance2_le: v.relance2Le, passe: v.edits?.passe ?? v.appel.passe ?? null, sans_twenty: !!v.edits?.sans_twenty } }, signal,
    });
    return { reponse: r.decision.reponse, decision: r.decision };
  };
  const appliquer = ({ decision: d }) => {
    if (d.cocher?.length || d.decocher?.length) setCoches((st) => { const n = new Set(st); d.cocher.forEach((id) => n.add(id)); d.decocher.forEach((id) => n.delete(id)); return n; });
    if (d.mail) setMail((m) => ({ ...(m || {}), ...d.mail }));
    if (d.relance_le) setRelanceLe(d.relance_le);
    if (d.relance2_le) setRelance2Le(d.relance2_le);
    const champs = Object.fromEntries(["interlocuteur", "telephone", "email", "passe", "sms"].filter((k) => d[k]).map((k) => [k, d[k]]).concat(typeof d.sans_twenty === "boolean" ? [["sans_twenty", d.sans_twenty]] : []));
    if (Object.keys(champs).length || d.note) setEdits((e) => ({ ...e, ...champs, ...(d.note ? { note: [e?.note, d.note].filter(Boolean).join(" ") } : {}) }));
    if (d.refaire) onRefaire(d.refaire);
    else if (d.valider) onLancer();
  };

  return (
    <div className="grid duration-500 animate-in fade-in-0 slide-in-from-bottom-3 md:grid-cols-2 max-md:grid-cols-1 max-md:gap-y-6">
      <div className="min-w-0 md:pr-6 max-md:order-last">
        <div className="flex min-w-0 flex-col max-md:h-[70dvh] md:sticky md:top-4 md:h-[calc(100dvh-190px)] md:min-h-[480px]">
          <h2 className={`${TITRE} flex-none`}>{voirTranscription ? "Transcription" : "Assistant"}</h2>
          <div className={voirTranscription ? "hidden" : "min-h-0 flex-1"}>
            <ChatDashboard espace="appel" repondre={repondre} annonce={annonce} ouverture={OUVERTURE} onConversation={() => {}} onReponse={appliquer}
              sansSkills epure lueur sansBarreHaut menusVersLeHaut placeholderFil="Dites-moi ce que vous voulez" />
          </div>
          {voirTranscription && <div className="min-h-0 flex-1 overflow-y-auto pt-5">{transcription}</div>}
        </div>
      </div>
      <div className="flex w-full min-w-0 flex-col gap-3 md:border-l md:border-bord-doux md:pl-6">
        <h2 className={TITRE}>Actions proposées</h2>
        {children}
      </div>
    </div>
  );
}
