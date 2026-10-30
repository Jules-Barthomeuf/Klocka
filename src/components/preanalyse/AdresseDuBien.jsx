import React, { useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
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

  // Sous le message (30 oct. 2026, Jules) : la fiche s'importe ici (elle est rangée dans la boîte « Fiche du bien » et lue
  // pour son adresse), ou l'adresse se tape directement.
  const [adresse, setAdresse] = useState("");
  const [occupe, setOccupe] = useState(null); // fiche · adresse
  const fichier = useRef(null);
  const infos = (corps) => base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/infos-du-bien`, corps ? { body: corps } : undefined);
  const importerFiche = async (f) => {
    if (!f) return;
    setOccupe("fiche");
    try {
      const form = new FormData();
      form.append("fichiers", f); form.append("noms", f.name);
      await base44.request("POST", `/api/preanalyse/dossiers/${encodeURIComponent(dealId)}/analyse-pieces/emplacements/fiche`, { body: form, isForm: true });
      const r = await infos();
      if (r?.champs?.find((c) => c.id === "adresse")?.manque) toast.error("La fiche ne donne pas l'adresse : tapez-la ci-dessous.");
      else toast.success("Adresse trouvée dans la fiche");
      onRefresh?.();
    } catch (e) { toast.error(e?.message || "Import impossible"); }
    setOccupe(null);
  };
  const poserAdresse = async (ev) => {
    ev.preventDefault();
    if (!adresse.trim()) return;
    setOccupe("adresse");
    try { await infos({ champs: { adresse: adresse.trim() } }); setAdresse(""); onRefresh?.(); }
    catch (e) { toast.error(e?.message || "Adresse non enregistrée"); }
    setOccupe(null);
  };

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
      <div className="mt-3 border-t border-trait pt-3">
        <p className="m-0 text-[12.5px] text-ardoise">Ajoutez la fiche du bien : importez-la, ou entrez l'adresse.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input ref={fichier} type="file" className="hidden" onChange={(ev) => { importerFiche(ev.target.files?.[0]); ev.target.value = ""; }} />
          <button type="button" onClick={() => fichier.current?.click()} disabled={!!occupe}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-bord-doux px-4 text-[13px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            {occupe === "fiche" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Importer la fiche
          </button>
          <span className="text-[12.5px] text-brume">ou</span>
          <form onSubmit={poserAdresse} className="flex min-w-[260px] flex-1 items-center gap-2">
            <input value={adresse} onChange={(ev) => setAdresse(ev.target.value)} placeholder="12 rue Foch, 56100 Lorient" aria-label="Adresse du bien" disabled={!!occupe}
              className="h-9 min-w-0 flex-1 rounded-[10px] border border-trait bg-surface px-3 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
            <button type="submit" disabled={!adresse.trim() || !!occupe}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {occupe === "adresse" && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Enregistrer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
