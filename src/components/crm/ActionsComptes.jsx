import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import InviterClient from "@/components/admin/InviterClient";
import FamillesClients from "@/components/admin/FamillesClients";

// Inviter et Familles en haut à droite d'Utilisateurs et de Clients dans le CRM, comme sur l'ancienne page
// Utilisateurs (10 nov. 2026, Jules : « remets tout bien »). Un formulaire ouvert prend toute la ligne, sous le titre.
export default function ActionsComptes({ singulier }) {
  const queryClient = useQueryClient();
  const [familles, setFamilles] = useState(false);
  const { data: users = [] } = useQuery({
    queryKey: ["all-users"],
    queryFn: () => base44.entities.User.list("-created_date"),
    enabled: familles,
  });
  const relire = () => queryClient.invalidateQueries({ queryKey: ["crm-page", singulier] });
  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2 has-[>div]:ml-0 has-[>div]:basis-full has-[>div]:pb-3">
      <button
        type="button"
        onClick={() => setFamilles((f) => !f)}
        className={`inline-flex h-8 items-center gap-2 rounded-full border px-4 text-[14px] transition-colors ${familles ? "border-transparent bg-rail-actif text-encre" : "border-trait text-craie hover:text-encre"}`}
        style={familles ? undefined : { background: "transparent" }}
      >
        {familles ? <X className="h-4 w-4" /> : <Users className="h-4 w-4" />} Familles
      </button>
      <InviterClient compact onCree={relire} />
      {familles && (
        <div className="w-full rounded-[16px] border border-trait bg-rail p-5">
          <FamillesClients users={users} />
        </div>
      )}
    </div>
  );
}
