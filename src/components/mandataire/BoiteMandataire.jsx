import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Mail } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { useConnexionGmail } from "@/components/mails/ConnexionGmail";

// La boîte du mandataire, sur son tableau de bord (28 oct. 2026, Jules : « ma boîte est connectée, je veux envoyer
// direct depuis le chat »). Sa propre boîte Gmail seulement : Haka y envoie ce que le mandataire a validé (le mail au
// vendeur, ses relances) ; sans elle, les mails s'ouvrent dans sa messagerie.

export default function BoiteMandataire({ className = "" }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["m-boite"], queryFn: () => base44.request("GET", "/api/mandataire/boite"), staleTime: 60_000 });
  const { connecter, enCours } = useConnexionGmail(() => queryClient.invalidateQueries({ queryKey: ["m-boite"] }));
  if (isLoading) return null;
  const boite = data?.boite;
  return (
    <div className={`flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[13px] text-ardoise ${className}`}>
      <Mail className="h-4 w-4 flex-none" />
      {boite ? (
        <>
          <span>Boîte connectée : <span className="text-encre">{boite.email}</span>. L'Assistant KPartners envoie d'ici ce que vous validez.</span>
          <button type="button" onClick={connecter} disabled={enCours} className="text-menthe hover:underline" style={{ background: "transparent" }}>Changer</button>
        </>
      ) : (
        <>
          <span>Aucune boîte connectée : les mails de l'Assistant KPartners s'ouvrent dans votre messagerie.</span>
          <button type="button" onClick={connecter} disabled={enCours} className="inline-flex items-center gap-1.5 text-menthe hover:underline" style={{ background: "transparent" }}>
            {enCours && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Connecter ma boîte Gmail
          </button>
        </>
      )}
    </div>
  );
}
