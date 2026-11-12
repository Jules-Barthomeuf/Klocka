import React, { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import ResultatsOutils from "@/components/outils/ResultatsOutils";

// L'onglet Marché d'un dossier (11 nov. 2026, Jules : « un seul onglet Marché, à côté de Data Room ; pas de
// formulaire, tout vient du dossier ; lancé à la création, en arrière-plan ; une pastille quand c'est fini ou qu'un
// signal sort »). Les cinq outils (locataire, loyer, prix, emplacement, ville) dans le composant commun
// outils/ResultatsOutils.jsx ; le calcul et les lancements : server/outils/lancements.js.

export const cleOutilsDossier = (dealId, index = 0) => ["outils-dossier", dealId, index];
const cleVu = (dealId) => `klocka_marche_vu_${dealId}`;

/** L'état des outils d'un dossier, relu toutes les quelques secondes tant qu'un outil tourne. */
export function useOutilsDossier(dealId, index = 0) {
  return useQuery({
    queryKey: cleOutilsDossier(dealId, index),
    queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/outils`),
    enabled: !!dealId,
    // Revenir sur Marché ne relit rien (12 nov. 2026, Jules) : l'état reste frais cinq minutes et en mémoire une demi-heure ;
    // un lancement, une note qui s'écrit ou une relance le rafraîchissent.
    staleTime: 5 * 60000,
    gcTime: 30 * 60000,
    // Relu aussi tant qu'une note de l'IA s'écrit (quelques secondes après la fin d'un outil).
    refetchInterval: (q) => (q.state.data?.en_cours || (q.state.data?.outils || []).some((o) => o.lancement?.statut === "fini" && !o.lancement.resultat?.note_ia && Date.now() - Date.parse(o.lancement.fini_le) < 3 * 60000) ? 3000 : false),
  });
}

/**
 * La pastille de l'onglet : alerte si un outil a sorti une alerte, menthe quand un résultat est arrivé depuis la
 * dernière visite de l'onglet, rien sinon. Pure.
 */
export function pastilleMarche(data, vuLe = null) {
  const ls = (data?.outils || []).map((o) => o.lancement).filter(Boolean);
  if (!ls.length) return null;
  if (ls.some((l) => l.statut === "en_cours")) return "en_cours";
  if (ls.some((l) => l.resultat?.statut === "alerte")) return "alerte";
  const dernier = ls.map((l) => l.fini_le || "").sort().pop();
  return dernier && (!vuLe || dernier > vuLe) ? "nouveau" : null;
}
/** Ce qui est arrivé est vu : la pastille « nouveau » de l'onglet s'éteint. */
export function marquerVu(dealId, data) {
  const dernier = (data?.outils || []).map((o) => o.lancement?.fini_le || "").sort().pop();
  if (dernier) { try { localStorage.setItem(cleVu(dealId), dernier); } catch { /* sans mémoire */ } }
}
export const lireVu = (dealId) => { try { return localStorage.getItem(cleVu(dealId)); } catch { return null; } };

export default function MarcheDossier({ dealId, index = 0, apercu = false }) {
  const queryClient = useQueryClient();
  const q = useOutilsDossier(dealId, index);
  const lancer = useMutation({
    mutationFn: (outils) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/${index}/outils`, { body: outils ? { outils } : {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
    onError: (e) => toast.error(e?.data?.error || e?.message || "Les outils n'ont pas pu partir"),
  });
  const verifier = useMutation({
    mutationFn: ({ id, verifie }) => base44.request("POST", `/api/outils/lancements/${id}/verifier`, { body: { verifie } }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, index) }),
  });

  // Un dossier créé avant les outils n'a jamais été lancé : la première ouverture le fait.
  const lanceUneFois = useRef(false);
  useEffect(() => {
    if (apercu || !q.data || lanceUneFois.current) return;
    if (q.data.outils.some((o) => o.lancement)) return;
    if (!q.data.entrees?.adresse && !q.data.entrees?.locataire) return;
    lanceUneFois.current = true;
    lancer.mutate(null);
  }, [q.data, apercu]);

  // L'onglet ouvert : ce qui est arrivé est vu, la pastille « nouveau » s'éteint.
  useEffect(() => { if (!apercu && q.data) marquerVu(dealId, q.data); }, [q.data, dealId, apercu]);

  if (q.isLoading) return <div className="flex items-center gap-2 py-8 text-[13.5px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div>;
  if (q.isError) return <p className="py-8 text-[13.5px] text-alerte">{q.error?.message || "Les outils ne se lisent pas."}</p>;
  const { outils = [], entrees = {} } = q.data || {};
  const lu = [entrees.adresse, entrees.locataire, entrees.surface ? `${entrees.surface} m²` : null, entrees.loyer ? `loyer ${entrees.loyer.toLocaleString("fr-FR")} €` : null, entrees.prix ? `prix ${entrees.prix.toLocaleString("fr-FR")} €` : null].filter(Boolean);

  return (
    // lg:pr-14 : la colonne des étapes, posée à droite de l'écran, ne recouvre pas le détail.
    <div className="flex flex-col gap-4 lg:pr-14">
      <p className="m-0 text-[12.5px] text-ardoise">{lu.length ? `Lu dans le dossier : ${lu.join(" · ")}` : "Ajoutez l'adresse ou le locataire dans la préanalyse : les outils partiront seuls."}</p>
      <ResultatsOutils outils={outils} onRelancer={(cles) => lancer.mutate(cles)} relance={lancer.isPending} apercu={apercu} onVerifier={(id, v) => verifier.mutate({ id, verifie: v })} />
    </div>
  );
}
