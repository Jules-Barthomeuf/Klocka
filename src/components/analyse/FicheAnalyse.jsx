import React, { useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { CarteLot } from "@/components/preanalyse/DealResultat";
import { cleOutilsDossier, useOutilsDossier } from "@/components/analyse/ControlesHorsDocuments";

// L'onglet Fiche de l'Analyse (13 nov. 2026, Jules : « on est obligé d'aller en pré-analyse remplir une adresse
// valable, puis revenir ») : la fiche du bien de la Pré-analyse, la même, modifiable ici. Ce qu'on y change est la
// fiche de la Pré-analyse ; le Marché lit ses entrées (adresse, locataire, surface, loyer, prix) et marque « À relancer »
// les outils dont une entrée a bougé. La barre du haut, seulement alors, le dit et les relance d'un clic. Sans la
// carte Google Maps de l'emplacement (le même jour).

function BarreMarche({ dealId, apercu }) {
  const queryClient = useQueryClient();
  const q = useOutilsDossier(dealId, 0);
  const lancer = useMutation({
    mutationFn: (outils) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/lots/0/outils`, { body: outils ? { outils } : {} }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dealId, 0) }); toast.success("Le Marché se relit", { duration: 1800 }); },
    onError: (e) => toast.error(e?.data?.error || e?.message || "Les outils n'ont pas pu partir"),
  });
  const outils = q.data?.outils || [];
  const aRelancer = outils.filter((o) => o.a_relancer);
  const enCours = outils.some((o) => o.en_cours);
  const e = q.data?.entrees || {};
  // Rien à relancer : pas de barre (13 nov. 2026, Jules : « ne mets pas Le Marché lit cette fiche »).
  if (!aRelancer.length && !enCours && !lancer.isPending) return null;
  return (
    <div className="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[12px] border border-trait px-4 py-2">
      <p className="m-0 min-w-0 text-[13px] text-ardoise">
        {enCours || !aRelancer.length ? "Le Marché se relit…"
          : <><span className="text-menthe">{aRelancer.length === 1 ? "1 outil du Marché à relancer" : `${aRelancer.length} outils du Marché à relancer`}</span> : {aRelancer.map((o) => o.nom).join(", ")}</>}
      </p>
      {!apercu && aRelancer.length > 0 && (
        <button type="button" onClick={() => lancer.mutate(aRelancer.length ? aRelancer.map((o) => o.cle) : null)} disabled={lancer.isPending || enCours || (!e.adresse && !e.locataire)}
          className="inline-flex h-8 flex-none items-center gap-1.5 rounded-full bg-menthe px-3.5 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {lancer.isPending || enCours ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCw className="h-3.5 w-3.5" />}
          {aRelancer.length === 1 ? `Relancer ${aRelancer[0].nom}` : "Relancer ces outils"}
        </button>
      )}
    </div>
  );
}

export default function FicheAnalyse({ dossier, onSaisie, onRefresh, enCours, apercu }) {
  const queryClient = useQueryClient();
  const lot = dossier?.lots?.[0];
  // La fiche a bougé (une saisie enregistrée, recalculée) : l'état du Marché se relit pour dire ce qui est à relancer.
  const signature = JSON.stringify(lot?.donnees || lot || null);
  useEffect(() => {
    if (dossier?.deal_id) queryClient.invalidateQueries({ queryKey: cleOutilsDossier(dossier.deal_id, 0) });
  }, [signature, dossier?.deal_id, queryClient]);
  if (!lot) return <p className="m-0 rounded-[12px] border border-trait px-5 py-8 text-center text-[13.5px] text-ardoise">Ce dossier n'a pas encore de fiche : déposez-la en Pré-analyse.</p>;
  return (
    <div className="space-y-4">
      {dossier.deal_id && <BarreMarche dealId={dossier.deal_id} apercu={apercu} />}
      {dossier.lots.map((l) => (
        <CarteLot key={l.index} sansSimulateur sansCarte lot={l} dossier={dossier} onSaisie={(saisie) => onSaisie?.(l.index, saisie)} onRefresh={onRefresh} enCours={enCours} apercu={apercu} />
      ))}
    </div>
  );
}
