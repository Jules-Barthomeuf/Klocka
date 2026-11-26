import React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import ResolutionsAG from "@/components/preanalyse/ResolutionsAG";

// Les assemblées générales de l'Analyse, dans l'onglet Copropriété du projet (26 nov. 2026, Jules : « les tableaux des PV
// d'AG qui restent dans l'analyse, on les met dans la copropriété ; exactement les mêmes tableaux ; juste le tableau »).
// Le tableau de l'Analyse lui-même (ResolutionsAG), en lecture seule. Dans l'éditeur (`dealId` et `editable`), un œil
// cache une résolution : c'est le réglage de l'Analyse, la même résolution y est cachée (Jules, même jour). Pas de
// « tout réafficher » ici : il rendait aussi celles cachées dans l'Analyse ; on réaffiche dans l'Analyse. Les résolutions cachées n'apparaissent pas au client
// (server/projet-cases.js, assembleesDuProjet).
export default function AssembleesDuDossier({ assemblees = [], onSource = null, dealId = null, projectId = null, editable = false, apercu = false }) {
  const queryClient = useQueryClient();
  const cacher = useMutation({
    mutationFn: ({ cle, cachee }) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/analyse-pieces/resolutions/${encodeURIComponent(cle)}`, { body: { cachee } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases-projet", projectId] });
      queryClient.invalidateQueries({ queryKey: ["analyse-pieces", dealId] });
    },
    onError: (e) => toast.error(e?.message || "La résolution n'a pas été cachée."),
  });
  if (!assemblees.length) return null;
  const peut = editable && !!dealId;
  // Le tableau seul, sans carte ni titre autour (26 nov. 2026, Jules : « je veux vraiment juste que ce soit le tableau »).
  return (
    <div className="mb-5">
      <ResolutionsAG dealId={dealId} assemblees={assemblees} onOuvrir={onSource} lectureSeule apercu={apercu} enCours={cacher.isPending}
        onCacher={peut ? (cle) => cacher.mutate({ cle, cachee: true }) : null} />
    </div>
  );
}
