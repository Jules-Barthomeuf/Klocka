import React, { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Minus, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useUser } from "@/components/providers/UserProvider";

// L'agent qui rentre le projet, vu d'ici (13 nov. 2026, Jules : « on le voit travailler en bas à gauche ; on ouvre le
// petit truc et on voit son raisonnement, ce qu'il fait ; il nous dit ce qu'il a besoin pour terminer ; une fois fini,
// "le projet est prêt", voir, et ça ouvre le projet »). Le serveur fait le travail (server/deal/agent-projet.js) ; la
// carte le suit d'une page à l'autre, au motif de la veille d'ALX : en bas à gauche, une carte par travail.

const CLE = ["agents-projet"];
const AUCUN = [];

/** Les agents de la journée lancés par soi ; interrogés vite tant que l'un travaille, sinon à la demande. */
export function useAgentsProjet() {
  const user = useUser();
  const equipe = !!user && user.role === "admin";
  const { data } = useQuery({
    queryKey: CLE,
    queryFn: () => base44.request("GET", "/api/preanalyse/agents-projet"),
    enabled: equipe,
    refetchInterval: (q) => ((q.state.data?.agents || []).some((a) => a.etat === "en_cours") ? 1500 : false),
  });
  return { equipe, agents: data?.agents || AUCUN };
}

/**
 * « Créer le projet » lance l'agent et rend la main (le bouton de la Pré-analyse et de l'Analyse). `onFini` : le
 * dossier se relit une fois le projet né, pour que le bouton devienne « Voir le projet ».
 */
export function useLancerAgentProjet(dossier, { onFini = null } = {}) {
  const queryClient = useQueryClient();
  const { agents } = useAgentsProjet();
  const agent = agents.find((a) => a.deal_id === dossier?.deal_id) || null;
  const lancer = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dossier.deal_id}/lots/0/agent-projet`),
    onSuccess: (a) => queryClient.setQueryData(CLE, (d) => ({ agents: [a, ...((d?.agents || []).filter((x) => x.id !== a.id))] })),
    // Un projet déjà là : le dossier se relit et le bouton devient « Voir le projet ».
    onError: () => onFini?.(),
  });
  const avant = useRef(agent?.etat);
  useEffect(() => {
    if (avant.current === "en_cours" && agent && agent.etat !== "en_cours") onFini?.();
    avant.current = agent?.etat;
  }, [agent, onFini]);
  return { lancer: () => lancer.mutate(), enCours: lancer.isPending || agent?.etat === "en_cours", erreur: lancer.error?.message || null };
}

function IconeEtape({ etat }) {
  if (etat === "en_cours") return <Loader2 className="h-3.5 w-3.5 animate-spin text-ardoise" />;
  if (etat === "fait") return <Check className="h-3.5 w-3.5 text-menthe" />;
  if (etat === "echec") return <X className="h-3.5 w-3.5 text-alerte" />;
  return <Minus className="h-3.5 w-3.5 text-brume" />;
}

function CarteAgent({ agent, onFermer }) {
  const [ouvert, setOuvert] = useState(false);
  const enCours = agent.etat === "en_cours";
  const erreur = agent.etat === "erreur";
  const nom = agent.titre || agent.nom || "Le projet";
  const courante = [...(agent.etapes || [])].reverse().find((e) => e.etat === "en_cours");
  const titre = enCours ? `${agent.nom || nom} · je rentre le projet` : erreur ? `${agent.nom || nom} : arrêté` : `Le projet ${nom} est prêt`;
  const n = (agent.questions || []).length;
  const detail = enCours
    ? (courante?.texte || "Je commence")
    : erreur ? agent.erreur
      : n ? `${n} chose${n > 1 ? "s" : ""} à me donner pour finir` : "Rien ne manque";
  const voir = () => window.open(`/Projets?id=${agent.project_id}`, "_blank", "noopener");
  return (
    <div className="alx-entree w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-[16px] border border-trait bg-surface-pleine text-encre shadow-[0_18px_40px_rgb(0_0_0/0.18)]">
      <div className="flex items-center gap-3 px-4 py-3">
        {enCours ? (
          <span className="alx-pouls h-2.5 w-2.5 flex-none rounded-full bg-ardoise" />
        ) : (
          <span className={`grid h-[22px] w-[22px] flex-none place-items-center rounded-full ${erreur ? "bg-alerte text-fond" : "bg-menthe text-sur-menthe"}`}>
            {erreur ? <span className="text-[12.5px] leading-none">!</span> : <Check className="h-3.5 w-3.5" />}
          </span>
        )}
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-expanded={ouvert} title={ouvert ? "Replier" : "Voir ce qu'il fait"}
          className="min-w-0 flex-1 text-left" style={{ background: "transparent" }}>
          <span className="block truncate text-[14.5px] text-encre">{titre}</span>
          <span className="mt-0.5 block truncate text-[12.5px] text-ardoise">{detail}</span>
        </button>
        {agent.project_id && !enCours && (
          <button type="button" onClick={voir} className="h-8 flex-none rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol">Voir</button>
        )}
        <button type="button" onClick={() => setOuvert((o) => !o)} aria-label={ouvert ? "Replier" : "Déplier"}
          className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
          <ChevronDown className={`h-4 w-4 transition-transform ${ouvert ? "rotate-180" : ""}`} />
        </button>
        {!enCours && (
          <button type="button" onClick={onFermer} aria-label="Fermer" title="Fermer"
            className="grid h-7 w-7 flex-none place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {ouvert && (
        <div className="max-h-[52vh] overflow-y-auto border-t border-trait px-4 pb-4 pt-3">
          <ol className="m-0 list-none space-y-3 p-0">
            {(agent.etapes || []).map((e, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-[3px] flex-none"><IconeEtape etat={e.etat} /></span>
                <div className="min-w-0">
                  <p className="m-0 text-[13.5px] text-encre">{e.texte}</p>
                  {(e.lignes || []).map((l, k) => <p key={k} className="m-0 mt-0.5 text-[12.5px] leading-[1.45] text-ardoise">{l}</p>)}
                </div>
              </li>
            ))}
          </ol>
          {!enCours && n > 0 && (
            <div className="mt-4 border-t border-trait pt-3">
              <p className="m-0 text-[13.5px] text-encre">Pour finir, il me faut :</p>
              <ul className="m-0 mt-1.5 list-disc space-y-1 pl-5">
                {agent.questions.map((q, k) => <li key={k} className="text-[12.5px] leading-[1.45] text-ardoise">{q}</li>)}
              </ul>
              {agent.project_id && <p className="m-0 mt-2 text-[12.5px] text-brume">Donnez-le dans le chat du projet, même en vrac : je le range.</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Les cartes, en bas à gauche de toutes les pages de l'équipe. Sur la page du projet lui-même, sa carte se tait. */
export default function AgentProjet() {
  const { equipe, agents } = useAgentsProjet();
  const queryClient = useQueryClient();
  const { pathname, search } = useLocation();
  if (!equipe || !agents.length) return null;
  const projetOuvert = /^\/projets$/i.test(pathname) ? new URLSearchParams(search).get("id") : null;
  const cartes = agents.filter((a) => !(projetOuvert && a.project_id === projetOuvert));
  if (!cartes.length) return null;
  const fermer = (id) => {
    queryClient.setQueryData(CLE, (d) => ({ agents: (d?.agents || []).filter((x) => x.id !== id) }));
    base44.request("POST", `/api/preanalyse/agents-projet/${id}/fermer`).catch(() => {});
  };
  return (
    <div className="fixed bottom-7 left-[34px] z-40 flex flex-col items-start gap-2.5 max-md:bottom-[calc(16px+env(safe-area-inset-bottom))] max-md:left-4">
      {cartes.map((a) => <CarteAgent key={a.id} agent={a} onFermer={() => fermer(a.id)} />)}
    </div>
  );
}
