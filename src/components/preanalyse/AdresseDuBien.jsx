import React, { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { adresseDe } from "@/components/preanalyse/marche-reel";

// L'adresse de l'onglet Marché (30 oct. 2026, Jules) : au clic sur Marché, sans adresse sur le lot, on la cherche dans la
// fiche du bien de la Data Room (et ce que le dossier sait déjà) ; si elle n'y est pas, on renvoie à la boîte
// « Fiche du bien » de la Data Room, où se remplissent les informations que la fiche ne donne pas.
export default function AdresseDuBien({ dossier, lot, apercu = false, onRefresh, onDataRoom = null }) {
  const dealId = dossier?.deal_id;
  const manque = !adresseDe(lot);
  const [etat, setEtat] = useState("cherche"); // cherche · demande
  const essaye = useRef(null);

  useEffect(() => {
    if (!manque || apercu || !dealId || essaye.current === dealId) return;
    essaye.current = dealId;
    base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/infos-du-bien`)
      .then((r) => { if (r?.champs?.find((c) => c.id === "adresse")?.manque) setEtat("demande"); onRefresh?.(); })
      .catch(() => setEtat("demande"));
  }, [manque, apercu, dealId, onRefresh]);

  if (!manque || apercu) return null;
  if (etat === "cherche") {
    return <p className="m-0 flex items-center gap-2 text-[13px] text-craie"><Loader2 className="h-3.5 w-3.5 animate-spin text-menthe" /> Je cherche l'adresse dans la fiche du bien…</p>;
  }
  return (
    <div className="rounded-[14px] border border-bord-doux p-4">
      <p className="m-0 text-[14px] text-encre">Il manque l'adresse du bien : le marché se lit à partir d'elle.</p>
      <p className="m-0 mt-1 text-[13px] text-ardoise">
        Veuillez compléter l'adresse dans la Data Room, dans la boîte « Fiche du bien ».
        {onDataRoom && <> <button type="button" onClick={onDataRoom} className="text-menthe hover:underline" style={{ background: "transparent" }}>Ouvrir la Data Room</button></>}
      </p>
    </div>
  );
}
