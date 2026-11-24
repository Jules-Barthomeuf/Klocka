import React, { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { dateCourte, enRetard } from "@/lib/fiche-dossier";
import { ICONE_ACTION } from "@/components/fiche-dossier/ActionApercu";
import { useNavigate } from "react-router-dom";
import { ouvrirCompteRendu } from "@/lib/compte-rendu-transfert";

// « À faire », en haut à droite de l'accueil, à la place de l'Agenda et des boîtes mail (20 nov. 2026, Jules : « on
// passe la souris dessus, on a les choses à faire, on clique et on revient à la conversation, la fiche avec les
// questions à droite, le chat à gauche »). Même pilule que celle des boîtes : un point (ambre s'il y a du dû, menthe
// sinon), le nombre ; au survol, ses actions ouvertes, le retard et le jour d'abord. Un clic envoie l'action au chat,
// qui rouvre sa conversation et pose l'action à droite.

export default function PastilleAFaire() {
  const [ouvert, setOuvert] = useState(false);
  const fermer = useRef(null);
  const boite = useRef(null);
  const { data, refetch } = useQuery({ queryKey: ["fiche-dossier-mes-actions"], queryFn: () => base44.request("GET", "/api/fiche-dossier/mes-actions"), staleTime: 20_000, retry: false });
  const actions = data?.actions || [];
  const dues = data?.dues || 0;
  const entrer = () => { clearTimeout(fermer.current); if (!ouvert) refetch(); setOuvert(true); };
  const sortir = () => { clearTimeout(fermer.current); fermer.current = setTimeout(() => setOuvert(false), 180); };
  useEffect(() => {
    if (!ouvert) return undefined;
    const dehors = (e) => { if (!boite.current?.contains(e.target)) setOuvert(false); };
    document.addEventListener("pointerdown", dehors);
    return () => document.removeEventListener("pointerdown", dehors);
  }, [ouvert]);
  const navigate = useNavigate();
  // Un compte rendu de transfert fermé sans être ouvert (23 nov. 2026) : un clic ouvre sa conversation.
  const reprendre = (a) => {
    setOuvert(false);
    if (a.genre === "transfert") { ouvrirCompteRendu(a.cr, navigate, a.conversation_id).then(() => refetch()); return; }
    if (a.genre === "notification") {
      base44.request("POST", `/api/notifications/${encodeURIComponent(a.notification)}/lue`).catch(() => {}).then(() => refetch());
      if (a.lien) { if (/^https?:/.test(a.lien)) window.location.assign(a.lien); else navigate(a.lien); }
      return;
    }
    window.dispatchEvent(new CustomEvent("klocka:reprendre-action", { detail: { action: a } }));
  };

  return (
    <div ref={boite} className="relative" onMouseEnter={entrer} onMouseLeave={sortir}>
      <button type="button" onClick={entrer} aria-expanded={ouvert} aria-haspopup="menu"
        className="inline-flex items-center gap-2 rounded-full border border-trait bg-surface-pleine px-3.5 py-2 text-[13.5px] text-encre transition-colors hover:border-bord-doux">
        <span className={`h-[7px] w-[7px] rounded-full ${dues ? "bg-ambre" : "bg-menthe"}`} />
        À faire{actions.length ? <span className="text-ardoise"> · {actions.length}</span> : null}
        <ChevronDown className={`h-3.5 w-3.5 text-ardoise transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`} />
      </button>
      {ouvert && (
        <div role="menu" aria-label="Choses à faire"
          className="animate-in fade-in slide-in-from-top-1 absolute right-0 top-[calc(100%+8px)] z-40 w-[420px] max-w-[calc(100vw-32px)] rounded-[16px] border border-trait bg-surface-pleine py-2 shadow-[0_18px_48px_rgb(0_0_0/0.14)] duration-150">
          <p className="m-0 px-4 pb-1.5 pt-2 text-[13px] text-craie">À faire{dues ? <span className="text-ambre"> · {dues} pour aujourd'hui</span> : null}</p>
          <div className="max-h-[min(520px,70vh)] overflow-y-auto">
            {!actions.length ? <p className="m-0 px-4 py-2 text-[13px] leading-[1.5] text-ardoise">Rien à faire : les actions de tes notes viendront ici.</p> : (
              <ul className="m-0 list-none p-0">
                {actions.map((a) => {
                  const I = ICONE_ACTION[a.genre] || ICONE_ACTION.tache;
                  const retard = enRetard(a.echeance);
                  return (
                    <li key={a.id}>
                      <button type="button" role="menuitem" onClick={() => reprendre(a)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-relief" style={{ background: "transparent" }}>
                        <I className={`mt-0.5 h-4 w-4 flex-none ${a.du ? "text-ambre" : "text-ardoise"}`} strokeWidth={1.7} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[14px] leading-[1.4] text-encre">{a.titre}</span>
                          <span className="mt-0.5 block truncate text-[12.5px] text-ardoise">
                            {a.genre === "transfert" ? (a.resume || "Compte rendu à lire") : a.genre === "notification" ? (a.resume || "Notification à relire") : [a.echeance ? (retard ? `en retard, prévu ${dateCourte(a.echeance)}` : dateCourte(a.echeance)) : "sans date", a.contexte?.length ? `${a.contexte.length} question${a.contexte.length > 1 ? "s" : ""}` : null, (a.fiches || []).map((f) => f.nom).filter(Boolean).join(", ")].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
