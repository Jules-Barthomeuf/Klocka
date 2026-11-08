import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Apercu, PageTeaser } from "@/components/mandataire/Teaser";
import { BoutonCopier, Publie } from "@/components/mandataire/AnnoncesBien";

// La fiche confrère d'un bien en vente (6 nov. 2026, Jules : « les fiches anonymes de co »). La page du teaser, anonyme,
// avec le co-courtage à la place des points forts (le mandat, le prix honoraires inclus, les honoraires et le partage),
// puis le message aux confrères, à copier. Le partage se choisit d'un clic ; Klocka n'envoie rien. Serveur :
// server/co-courtage.js.

const CLASSES = { murs_loues: "Murs loués", murs_libres: "Murs libres", fonds: "Fonds de commerce", droit_au_bail: "Droit au bail", bureaux: "Bureaux", local_activite: "Local d'activité", entrepot: "Entrepôt logistique" };
const champ = "w-full rounded-[10px] border border-trait bg-transparent px-3 py-2 text-[14px] leading-[1.6] text-encre outline-none focus:border-menthe max-md:text-[16px]";

export default function FicheConfrere({ marcheId }) {
  const qc = useQueryClient();
  const cle = ["m-co", marcheId];
  const url = `/api/mandataire/marches/${encodeURIComponent(marcheId)}/co`;
  const { data, isLoading, isError, error } = useQuery({ queryKey: cle, queryFn: () => base44.request("GET", url) });
  const modifier = useMutation({
    mutationFn: (corps) => base44.request("PATCH", url, { body: corps }),
    onSuccess: (r) => qc.setQueryData(cle, (v) => ({ ...v, co: r.co })),
    onError: (e) => toast.error(e?.message || "Non enregistré"),
  });
  const co = data?.co;
  const [message, setMessage] = useState("");
  useEffect(() => setMessage(co?.message || ""), [co?.message]);
  const [pdf, setPdf] = useState(false);
  const telecharger = async () => {
    setPdf(true);
    try {
      const r = await fetch(`${url}/pdf`, { credentials: "include" });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j?.error || "Le PDF ne s'est pas fait."); }
      const nom = decodeURIComponent((r.headers.get("content-disposition") || "").match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i)?.[1] || "Fiche confrère.pdf");
      const lien = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = lien; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(lien), 4000);
    } catch (e) { toast.error(e?.message || "Le PDF ne s'est pas fait"); } finally { setPdf(false); }
  };

  if (isLoading) return <p className="m-0 flex items-center gap-2 py-10 text-[14px] text-ardoise"><Loader2 className="h-4 w-4 animate-spin" />La fiche confrère se compose depuis le teaser…</p>;
  if (isError || !co) return <p className="m-0 py-10 text-[14px] text-alerte">{error?.message || "La fiche confrère ne se charge pas."}</p>;
  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="mx-auto w-full max-w-[640px]">
        <Apercu><PageTeaser t={data.teaser} signataire={data.signataire} classe={CLASSES[data.teaser.classe] || ""} co={co} /></Apercu>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] text-ardoise">Partage au confrère</span>
          <div className="flex w-fit gap-0.5 rounded-full bg-rail-actif p-1" role="radiogroup" aria-label="Partage des honoraires">
            {(data.partages || [30, 40, 50, 60]).map((n) => (
              <button key={n} type="button" role="radio" aria-checked={co.partage === n} onClick={() => co.partage !== n && modifier.mutate({ partage: n })}
                className={`h-7 rounded-full px-3 text-[13px] tabular-nums ${co.partage === n ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-craie"}`} style={co.partage === n ? undefined : { background: "transparent" }}>{n} %</button>
            ))}
          </div>
        </div>
        <button type="button" onClick={telecharger} disabled={pdf} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3 text-[12.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>
          {pdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}Le PDF
        </button>
      </div>
      <section className="rounded-[14px] bg-rail p-4">
        <div className="flex items-center justify-between gap-3 pb-3">
          <p className="m-0 text-[15px] text-encre">Message aux confrères</p>
          <div className="flex items-center gap-2">
            <Publie le={co.diffusion} onChange={(oui) => modifier.mutate({ envoye: oui })} mot="Envoyée" />
            <BoutonCopier texte={message} libelle="Copier" />
          </div>
        </div>
        <textarea value={message} onChange={(e) => setMessage(e.target.value)} onBlur={() => message !== co.message && modifier.mutate({ message })}
          aria-label="Message aux confrères" rows={Math.min(16, Math.max(6, message.split("\n").length + 1))} className={`${champ} resize-y`} />
        <p className="m-0 mt-2 text-[12.5px] leading-[1.55] text-brume">Envoyez-le avec le PDF aux agences de la ville, depuis votre messagerie. Ni adresse ni nom : ils viennent après l'engagement de confidentialité.</p>
      </section>
    </div>
  );
}
