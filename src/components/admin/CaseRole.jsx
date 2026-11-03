import React from "react";
import { Check } from "lucide-react";

// La case d'un rôle (3 nov. 2026, Jules : « on coche juste des cases ») : Admin ou Mandataire, sur la ligne d'un
// utilisateur et dans l'invitation. Cochée en menthe, vide en filet ; sans case cochée, le compte est un client.
export default function CaseRole({ coche, onChange, desactive = false, libelle, mot = null }) {
  const caseSeule = (
    <button type="button" role="checkbox" aria-checked={coche} aria-label={libelle} disabled={desactive} onClick={() => onChange(!coche)}
      className={`grid h-6 w-6 flex-none place-items-center rounded-[7px] border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${coche ? "border-menthe bg-menthe text-sur-menthe" : "border-bord-vif text-transparent hover:border-menthe"}`}
      style={coche ? undefined : { background: "transparent" }}>
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
  if (!mot) return caseSeule;
  return <span className={`inline-flex items-center gap-2 text-[13px] ${coche ? "text-encre" : "text-ardoise"}`}>{caseSeule}{mot}</span>;
}

/** Les deux cases d'un compte, et ce qu'elles valent pour le serveur (`/api/admin/equipe/:email/roles`). */
export const rolesDuCompte = (u) => ({ admin: u?.role === "admin", mandataire: u?.role === "mandataire" || !!u?.aussi_mandataire });
