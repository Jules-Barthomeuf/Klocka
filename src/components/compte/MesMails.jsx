import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Compte > Mails (13 oct. 2026, Jules) : chacun part des mails de l'équipe et
// les réécrit à sa façon ; après un appel, la plateforme lui propose sa
// version. « Revenir au modèle de l'équipe » efface la sienne.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-bord-doux bg-transparent px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-encre outline-none focus:border-bord-vif max-md:text-[16px]";

function UnMail({ m }) {
  const queryClient = useQueryClient();
  const source = m.perso || m.equipe;
  const [objet, setObjet] = useState(source.objet);
  const [contenu, setContenu] = useState(source.contenu);
  useEffect(() => { setObjet(source.objet); setContenu(source.contenu); }, [source.objet, source.contenu]);
  const change = objet !== source.objet || contenu !== source.contenu;
  const enregistrer = useMutation({
    mutationFn: () => base44.request("PUT", `/api/mes-mails/${m.slug}`, { body: { objet, contenu } }),
    onSuccess: () => { toast.success("Votre version est enregistrée : elle sera proposée après vos appels"); queryClient.invalidateQueries({ queryKey: ["mes-mails"] }); },
    onError: (e) => toast.error(e?.message || "Pas enregistré"),
  });
  const revenir = useMutation({
    mutationFn: () => base44.request("DELETE", `/api/mes-mails/${m.slug}`),
    onSuccess: () => { toast.success("Retour au modèle de l'équipe"); queryClient.invalidateQueries({ queryKey: ["mes-mails"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  return (
    <div className="flex flex-col gap-3 border-t border-trait py-5 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[15.5px] text-encre">{m.titre}</p>
          {m.description && <p className="m-0 mt-0.5 text-[13px] text-ardoise">{m.description}</p>}
        </div>
        <span className={`flex-none rounded-full px-2.5 py-0.5 text-[12px] ${m.perso ? "bg-menthe/15 text-menthe" : "bg-relief text-craie"}`}>{m.perso ? "Votre version" : "Modèle de l'équipe"}</span>
      </div>
      <label className="flex flex-col gap-1.5"><span className={etiq}>Objet</span><input value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} /></label>
      <label className="flex flex-col gap-1.5"><span className={etiq}>Message</span><textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={14} className={`${champ} resize-y`} /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => enregistrer.mutate()} disabled={!change || enregistrer.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
          {enregistrer.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Enregistrer ma version
        </button>
        {change && <button type="button" onClick={() => { setObjet(source.objet); setContenu(source.contenu); }} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler les changements</button>}
        {m.perso && (
          <button type="button" onClick={() => revenir.mutate()} disabled={revenir.isPending} className="inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" />Revenir au modèle de l'équipe
          </button>
        )}
      </div>
    </div>
  );
}

export default function MesMails() {
  const { data, isLoading, error } = useQuery({ queryKey: ["mes-mails"], queryFn: () => base44.request("GET", "/api/mes-mails") });
  return (
    <section className="rounded-[16px] border border-trait k-grid px-5 py-4 md:px-6">
      <p className={etiq}>Vos mails après un appel</p>
      <p className="m-0 mt-2 max-w-[70ch] text-[13.5px] leading-[1.6] text-craie">
        Partez des mails de l'équipe et réécrivez-les à votre façon : après vos appels, la plateforme vous propose votre version. Les variables restent : {"{{salutation}}"} (« Bonjour Madame Martin, »), {"{{type_bien}}"} et {"{{ville}}"} (dits pendant l'appel), {"{{signature}}"} (votre signature, posée à l'envoi).
      </p>
      {isLoading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>
        : error ? <p className="m-0 py-6 text-[13.5px] text-alerte">{error.message || "Les mails ne se chargent pas."}</p>
          : <div className="mt-2">{(data?.mails || []).map((m) => <UnMail key={m.slug} m={m} />)}</div>}
    </section>
  );
}
