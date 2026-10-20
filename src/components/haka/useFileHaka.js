import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La file « À valider » de Haka, côté écran (17 oct. 2026) : lire, compter, et
// les trois gestes. Toutes les vues qui la montrent (page, dossier, Dashboard)
// passent par ici pour se rafraîchir ensemble.

const CLES = [["haka"], ["haka-compte"], ["haka-dossier"], ["notifications"], ["preanalyse-pipeline"]];

export function useCompteHaka() {
  return useQuery({ queryKey: ["haka-compte"], queryFn: () => base44.request("GET", "/api/haka/propositions/compte"), refetchInterval: 60_000, retry: false });
}

export function usePropositions(vue) {
  return useQuery({ queryKey: ["haka", vue], queryFn: () => base44.request("GET", `/api/haka/propositions?vue=${vue}`), refetchInterval: 60_000, retry: false });
}

export function usePropositionsDossier(dealId) {
  return useQuery({ queryKey: ["haka-dossier", dealId], queryFn: () => base44.request("GET", `/api/haka/propositions/dossier/${dealId}`), enabled: !!dealId, refetchInterval: 60_000, retry: false });
}

/** Les gestes : valider (tel quel, retouché, ou un choix), rejeter (motif), prendre. */
export function useGestesHaka({ onFait } = {}) {
  const qc = useQueryClient();
  const raf = () => { CLES.forEach((k) => qc.invalidateQueries({ queryKey: k })); onFait?.(); };
  const valider = useMutation({
    mutationFn: ({ id, charge = null, choix = null, motif = null, categorie = null }) => base44.request("POST", `/api/haka/propositions/${id}/valider`, { body: { charge, choix, motif, categorie } }),
    onSuccess: (r) => {
      const res = r?.resultat || {};
      toast.success(res.simule ? "Validé (envoi simulé)" : res.envoye ? "Envoyé" : "Validé");
      raf();
    },
    onError: (e) => { toast.error(e?.message || "L'action n'est pas partie"); raf(); },
  });
  const rejeter = useMutation({
    mutationFn: ({ id, motif }) => base44.request("POST", `/api/haka/propositions/${id}/rejeter`, { body: { motif } }),
    onSuccess: () => { toast.success("Rejetée"); raf(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const prendre = useMutation({
    mutationFn: ({ id }) => base44.request("POST", `/api/haka/propositions/${id}/prendre`, { body: {} }),
    onSuccess: () => { toast.success("À vous"); raf(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return { valider, rejeter, prendre, enCours: (id) => (valider.isPending && valider.variables?.id === id) || (rejeter.isPending && rejeter.variables?.id === id) };
}
