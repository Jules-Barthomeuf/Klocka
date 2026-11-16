import React, { useLayoutEffect, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import ChatDashboard from "@/components/dashboard/ChatDashboard";
import { AudioLines } from "lucide-react";
import { demandeRetour } from "@/lib/retour-appel";
import AvatarAK from "@/components/AvatarAK";
import SequenceActions from "@/components/prospection/SequenceActions";

// L'écran d'après l'appel (9 nov. 2026, Jules ; refait le 15 nov. 2026, planche « Après l'appel », version B) : un seul
// chat, celui de l'assistant. Il s'ouvre sur « Voici ce que je propose » et les actions, dans leurs cadres, avec un petit
// Valider à la couleur de l'accent ; puis il propose une précision ou l'analyse de l'appel. Dès qu'on lui a écrit, Valider
// s'épingle au-dessus de la saisie : plus besoin de remonter. Ce qu'on dit à l'assistant change aussitôt les actions.
// La saisie est celle de la page Assistant (même fond, même lumière). La transcription s'ouvre par son bouton.

// L'offre du retour d'AK (15 nov. 2026, Jules) : une précision sur l'appel, ou l'analyse de ce qu'on peut améliorer.
const OUVERTURE = "Une précision sur cet appel ? J'ai aussi repéré quelques petites choses à améliorer dans votre appel. Voulez-vous qu'on regarde ça ensemble ?";
const TITRE = "m-0 text-center text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre";

export function BoutonTranscription({ actif, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={actif}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] transition-colors ${actif ? "border-menthe/60 text-menthe" : "border-bord-doux text-craie hover:border-bord-vif hover:text-encre"}`} style={{ background: "transparent" }}>
      <AudioLines className="h-3.5 w-3.5" />Transcription
    </button>
  );
}

export default function EcranApresAppel({ appel, issue, coches, setCoches, mail, setMail, relanceLe, setRelanceLe, relance2Le, setRelance2Le, edits, setEdits, transcription, voirTranscription = false, enRelecture = false, annonce = null, onRefaire, onLancer, titre = null, sousTitre = null, onTranscription = null, children }) {

  // Une phrase dite pendant que les actions se refont attend la fin : sinon la relecture écraserait ce qu'elle change.
  const vif = useRef(null);
  vif.current = { appel, issue, coches, mail, relanceLe, relance2Le, edits, enRelecture };
  // En haut, le nom de l'appel (15 nov. 2026, Jules, maquette « 1 · Le nom en titre ») : l'agence en titre, centrée,
  // et dessous qui, combien de temps, et le lien Transcription. Le chat occupe la hauteur qui reste dans la fenêtre.
  const cadre = useRef(null);
  const [hauteur, setHauteur] = useState(null);
  useLayoutEffect(() => {
    const mesurer = () => {
      const el = cadre.current;
      if (!el || window.innerWidth < 768) { setHauteur(null); return; }
      // Jusqu'au bas de la fenêtre (Jules : « la saisie plus bas ») : la saisie garde seulement sa marge du chat. Remesuré à
      // chaque rendu : le titre de la page et la ligne des villes s'effacent juste après l'arrivée, le cadre remonte.
      setHauteur(Math.max(520, Math.round(window.innerHeight - el.getBoundingClientRect().top - 2)));
    };
    mesurer();
    window.addEventListener("resize", mesurer);
    return () => window.removeEventListener("resize", mesurer);
  });
  // Les étapes prêtes (compte, noms), pour le Valider épinglé. Il paraît une fois la réponse de l'assistant écrite dans le
  // fil (16 nov. 2026, Jules : « sinon on dit oui et ça apparaît direct »), pas dès l'envoi.
  const [resume, setResume] = useState(null);
  const [aEcrit, setAEcrit] = useState(false);
  // « Plus tard » retiré (16 nov. 2026, Jules) : ne pas toucher « Oui » suffit.
  const repondre = async ({ texte, historique, signal }) => {
    // Le chat s'ouvre dès le raccrochage, avant que l'appel soit noté : un mot dit pendant la lecture attend la fin.
    if (!vif.current.appel) return { reponse: "Un instant : je finis de relire l'appel, puis je m'en occupe." };
    // « Oui » à l'offre, ou une demande d'analyse : le retour d'AK sur l'appel, gardé avec lui (Suivi > Appels).
    if (demandeRetour(texte)) {
      const r = await base44.request("POST", `/api/prospection/mode-appel/appels/${vif.current.appel.id}/retour`, { body: {}, signal });
      return { reponse: r.retour.message };
    }
    for (let i = 0; vif.current.enRelecture && i < 360; i += 1) await new Promise((ok) => setTimeout(ok, 250));
    const v = vif.current;
    const r = await base44.request("POST", `/api/prospection/mode-appel/appels/${v.appel.id}/assistant`, {
      body: { message: texte, historique, etat: { issue: v.issue, coches: [...v.coches], mail: v.mail, relance_le: v.relanceLe, relance2_le: v.relance2Le, passe: v.edits?.passe ?? v.appel.passe ?? null, sans_twenty: !!v.edits?.sans_twenty } }, signal,
    });
    return { reponse: r.decision.reponse, decision: r.decision };
  };
  const appliquer = ({ decision: d }) => {
    // La réponse vient d'être posée dans le fil : le Valider épinglé peut paraître.
    setAEcrit(true);
    if (!d) return;
    if (d.cocher?.length || d.decocher?.length) setCoches((st) => { const n = new Set(st); d.cocher.forEach((id) => n.add(id)); d.decocher.forEach((id) => n.delete(id)); return n; });
    if (d.mail) setMail((m) => ({ ...(m || {}), ...d.mail }));
    if (d.relance_le) setRelanceLe(d.relance_le);
    if (d.relance2_le) setRelance2Le(d.relance2_le);
    const champs = Object.fromEntries(["interlocuteur", "telephone", "email", "passe", "sms"].filter((k) => d[k]).map((k) => [k, d[k]]).concat(typeof d.sans_twenty === "boolean" ? [["sans_twenty", d.sans_twenty]] : []));
    if (Object.keys(champs).length || d.note) setEdits((e) => ({ ...e, ...champs, ...(d.note ? { note: [e?.note, d.note].filter(Boolean).join(" ") } : {}) }));
    if (d.refaire) onRefaire(d.refaire);
    else if (d.valider) onLancer();
  };

  // Les actions dans le fil, au dessin sobre (plus d'ambre, ni phrase au-dessus, Valider petit).
  const actions = React.isValidElement(children) && children.type === SequenceActions ? React.cloneElement(children, { sobre: true, onResume: setResume }) : children;
  const pret = resume && resume.n > 0;
  const epingle = aEcrit && pret ? (
    <div className="mb-2.5 flex items-center justify-between gap-3 px-1 duration-300 animate-in fade-in-0 slide-in-from-bottom-1">
      <span className="min-w-0 truncate text-[13px] text-ardoise">{resume.n} étape{resume.n > 1 ? "s" : ""} prête{resume.n > 1 ? "s" : ""} : {resume.noms.join(", ")}</span>
      <button type="button" onClick={() => onLancer()} disabled={resume.envoi || resume.doute}
        className="inline-flex h-9 flex-none items-center rounded-full bg-menthe px-4 text-[13.5px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-50">
        {resume.envoi ? "Validation…" : `Valider · ${resume.n} étape${resume.n > 1 ? "s" : ""}`}
      </button>
    </div>
  ) : null;
  const debutFil = (
    <div className="flex gap-4">
      <AvatarAK />
      <div className="min-w-0 flex-1 pt-1.5">
        <p className="m-0 mb-3 text-[16px] leading-[1.6] text-encre">{enRelecture ? "Je relis l'appel." : "Voici ce que je propose."}</p>
        {actions}
        {/* La question dans le même message que les actions (15 nov. 2026, Jules : « un message, une photo de profil ») ;
            ses deux réponses d'un clic suivent juste dessous. */}
        {!enRelecture && <p className="m-0 mt-6 text-[16px] leading-[1.6] text-encre">{OUVERTURE}</p>}
      </div>
    </div>
  );

  return (
    <div ref={cadre} className="relative flex w-full min-w-0 flex-col duration-500 animate-in fade-in-0 slide-in-from-bottom-3 max-md:h-[78dvh] md:h-[calc(100dvh-120px)]"
      style={hauteur ? { height: hauteur } : undefined}>
      {/* Le nom de l'appel seul (16 nov. 2026, Jules) : plus de ligne « qui · durée · Transcription » dessous ; la
          transcription s'ouvre par son bouton, à droite du titre. */}
      {(titre || onTranscription) && (
        <div className="relative mx-auto flex w-full max-w-[760px] flex-none items-center justify-center px-2 md:min-h-9">
          {titre && <h2 className="m-0 max-w-full truncate text-center text-[24px] font-normal leading-[1.2] tracking-[-0.01em] text-encre md:px-[130px]">{titre}</h2>}
          {onTranscription && (
            <div className="max-md:mt-2 md:absolute md:right-2 md:top-1/2 md:-translate-y-1/2">
              <BoutonTranscription actif={voirTranscription} onClick={onTranscription} />
            </div>
          )}
        </div>
      )}
      <div className={voirTranscription ? "hidden" : "min-h-0 flex-1"}>
        <ChatDashboard espace="appel" repondre={repondre} annonce={annonce} onConversation={() => {}} onReponse={appliquer}
          debutFil={debutFil} auDessusSaisie={epingle}
          propositions={enRelecture ? null : [{ libelle: "Oui" }]}
          sansSkills epure sansBarreHaut menusVersLeHaut placeholderFil="Dites-moi ce que vous voulez" placeholderAccueil="Dites-moi ce que vous voulez" />
      </div>
      {voirTranscription && (
        <div className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col">
          {!titre && <h2 className={`${TITRE} flex-none`}>Transcription</h2>}
          <div className="min-h-0 flex-1 overflow-y-auto pt-5">{transcription}</div>
        </div>
      )}
    </div>
  );
}
