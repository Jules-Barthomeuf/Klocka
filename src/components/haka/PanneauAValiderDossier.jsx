import React from "react";
import CarteProposition from "@/components/haka/CarteProposition";
import { useGestesHaka, usePropositionsDossier } from "@/components/haka/useFileHaka";
import { useUser } from "@/components/providers/UserProvider";

// Dans un dossier ouvert (17 oct. 2026) : ce que Haka propose pour ce dossier,
// en tête de la colonne de droite. Rien si rien n'attend.

export function useAValiderDossier(dealId) {
  const q = usePropositionsDossier(dealId);
  return q.data?.propositions || [];
}

export default function PanneauAValiderDossier({ dealId, onFait = null }) {
  const user = useUser();
  const propositions = useAValiderDossier(dealId);
  const gestes = useGestesHaka({ onFait });
  if (!propositions.length) return null;
  return (
    <section id="a-valider-dossier" aria-label="À valider" className="flex flex-col gap-3">
      <p className="m-0 text-[11px] uppercase tracking-[.16em] text-menthe">À valider · {propositions.length}</p>
      {propositions.map((p) => (
        <CarteProposition key={p.id} proposition={p} compacte moi={String(user?.email || "").toLowerCase()} enCours={gestes.enCours(p.id)}
          onValider={({ charge = null, choix = null } = {}) => gestes.valider.mutate({ id: p.id, charge, choix })}
          onRejeter={(motif) => gestes.rejeter.mutate({ id: p.id, motif })}
          onPrendre={!p.pour ? () => gestes.prendre.mutate({ id: p.id }) : null} />
      ))}
    </section>
  );
}
