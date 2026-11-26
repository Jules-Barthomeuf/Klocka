import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Briefcase, Eye, Loader2, PencilLine, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { useLancerAgentProjet } from "@/components/projet/AgentProjet";
import ProjetContent from "@/components/projet/ProjetContent";

// L'étape Projet d'un dossier (26 nov. 2026, Jules : « projets et dossiers dans le même truc ; le projet, c'est une
// étape après notre analyse ») : la page que voit le client, dans le dossier, après l'Analyse. Elle suit l'analyse
// toute seule (server/deal/projet.js, projetSuitLeDossier) ; ce qu'on a changé pour le client se voit ici, avec
// « Revenir à l'analyse ». La modification se fait dans l'éditeur du projet (« Modifier le projet »).

const BOUTON = "inline-flex h-9 items-center gap-2 rounded-full border border-bord-doux px-4 text-[13.5px] text-encre transition-colors hover:border-bord-vif";

const valeurLisible = (v) => (v == null || v === "" ? "vide" : typeof v === "number" ? v.toLocaleString("fr-FR") : String(v));

/** Sans projet : ce qu'est l'étape, et le geste qui le crée. */
function SansProjet({ dossier, onRefresh, apercu }) {
  const agent = useLancerAgentProjet(dossier, { onFini: onRefresh });
  return (
    <div className="k-entree k-verre flex flex-col items-start gap-3 p-6 max-md:p-5">
      <p className="m-0 text-[17px] text-encre">Le projet n'est pas encore créé</p>
      <p className="m-0 max-w-[560px] text-[14.5px] leading-[1.6] text-ardoise">
        Le projet est la page que voit le client. Il se remplit avec l'analyse du dossier, puis la suit : une pièce lue, une case corrigée, et il se met à jour.
      </p>
      <button type="button" onClick={agent.lancer} disabled={apercu || agent.enCours}
        className="mt-1 inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe transition-colors hover:bg-menthe-survol disabled:opacity-60">
        {agent.enCours ? <Loader2 className="h-4 w-4 animate-spin" /> : <Briefcase className="h-4 w-4" />}
        {agent.enCours ? "Le projet se remplit…" : "Créer le projet"}
      </button>
      {agent.enCours && <p className="m-0 text-[13px] text-ardoise">L'agent relit le dossier et remplit le projet : suivez-le en bas à gauche.</p>}
    </div>
  );
}

/** Les cases changées pour le client qui ne disent plus ce que dit l'analyse (en tête de l'éditeur du projet). */
export function Ecarts({ dealId, onRevenu }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["projet-ecarts", dealId],
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/projet/ecarts`),
    staleTime: 10_000,
  });
  const revenir = useMutation({
    mutationFn: (champ) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/projet/revenir`, { body: { champ } }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["projet-ecarts", dealId] }); onRevenu?.(); },
    onError: (e) => toast.error(e?.message || "La case n'a pas repris l'analyse."),
  });
  const ecarts = data?.ecarts || [];
  if (!ecarts.length) return null;
  return (
    <div className="k-entree">
      <p className="m-0 mb-2 text-[13.5px] text-ardoise">Modifié pour le client, différent de l'analyse</p>
      <ul className="k-verre m-0 list-none overflow-hidden p-0">
        {ecarts.map((e) => (
          <li key={e.champ} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-trait px-5 py-3.5 first:border-t-0 max-md:px-4">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] text-encre">{e.libelle}</span>
              <span className="mt-0.5 block text-[13px] text-ardoise">
                Projet : <span className="text-craie">{valeurLisible(e.projet)}</span> · Analyse : <span className="text-craie">{valeurLisible(e.dossier)}</span>
              </span>
            </span>
            <button type="button" onClick={() => revenir.mutate(e.champ)} disabled={revenir.isPending}
              className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] text-craie transition-colors hover:bg-relief hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
              {revenir.isPending && revenir.variables === e.champ ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}Revenir à l'analyse
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EtapeProjet({ dossier, onRefresh, apercu = false }) {
  const [commeClient, setCommeClient] = useState(false);
  const projetId = dossier?.projet_id || null;
  const { data: projet, isLoading, isError, refetch } = useQuery({
    queryKey: ["project", projetId],
    queryFn: () => base44.entities.Project.get(projetId),
    enabled: !!projetId,
    staleTime: 10_000,
  });
  if (!projetId) return <SansProjet dossier={dossier} onRefresh={onRefresh} apercu={apercu} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 max-w-[620px] text-[14px] leading-[1.55] text-ardoise">La page que voit le client. Elle suit l'analyse toute seule ; ce que tu changes pour le client reste tel quel.</p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setCommeClient((c) => !c)} aria-pressed={commeClient}
            className={`${BOUTON} ${commeClient ? "!border-menthe/60 text-menthe" : ""}`} style={{ background: "transparent" }}>
            <Eye className="h-4 w-4" strokeWidth={1.8} />{commeClient ? "Vue de l'équipe" : "Voir comme le client"}
          </button>
          <Link to={`/Projets?id=${projetId}`} className={BOUTON}><PencilLine className="h-4 w-4" strokeWidth={1.8} />Modifier le projet</Link>
        </div>
      </div>
      {!apercu && <Ecarts dealId={dossier.deal_id} onRevenu={() => refetch()} />}
      {isLoading ? (
        <div className="k-verre h-[420px] animate-pulse" aria-hidden />
      ) : isError || !projet ? (
        <p className="m-0 text-[14px] text-ardoise">Le projet ne s'est pas chargé. Il s'ouvre quand même avec « Modifier le projet ».</p>
      ) : (
        <div className="k-entree min-w-0">
          <ProjetContent key={commeClient ? "client" : "equipe"} project={projet} isAdmin showAsClient={commeClient} ongletsCollants={false} />
        </div>
      )}
    </div>
  );
}
