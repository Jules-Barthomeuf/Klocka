import React, { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RotateCcw } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";
import { VERRE } from "@/lib/verre";
import { Groupe } from "./Reglages";

// Compte > Mails (13 oct. 2026, Jules) : chacun part des mails de l'équipe et
// les réécrit à sa façon ; après un appel, la plateforme lui propose sa
// version. « Revenir au modèle de l'équipe » efface la sienne.

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-trait bg-transparent px-3.5 py-2.5 text-[14.5px] leading-[1.55] text-encre outline-none focus:border-bord-vif max-md:text-[16px]";

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
  // L'éditeur du mail choisi, à droite de la liste (25 nov. 2026, Jules : « pas tout sur une seule colonne »).
  return (
    <div key={m.slug} className="flex min-w-0 flex-col gap-4 p-5 duration-200 animate-in fade-in-0 max-md:p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-[16px] text-encre">{m.titre}</p>
          {m.description && <p className="m-0 mt-0.5 text-[12.5px] leading-[1.5] text-ardoise">{m.description}</p>}
        </div>
        <Etat perso={!!m.perso} />
      </div>
      <label className="flex flex-col gap-1.5"><span className={etiq}>Objet</span><input value={objet} onChange={(e) => setObjet(e.target.value)} className={champ} style={{ background: "transparent" }} /></label>
      <label className="flex flex-col gap-1.5"><span className={etiq}>Message</span><textarea value={contenu} onChange={(e) => setContenu(e.target.value)} rows={16} className={`${champ} resize-y`} style={{ background: "transparent" }} /></label>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => enregistrer.mutate()} disabled={!change || enregistrer.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
          {enregistrer.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Enregistrer ma version
        </button>
        {change && <button type="button" onClick={() => { setObjet(source.objet); setContenu(source.contenu); }} className="text-[13px] text-ardoise hover:text-encre" style={{ background: "transparent" }}>Annuler les changements</button>}
        {m.perso && (
          <button type="button" onClick={() => revenir.mutate()} disabled={revenir.isPending} className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
            <RotateCcw className="h-3.5 w-3.5" />Revenir au modèle de l'équipe
          </button>
        )}
      </div>
    </div>
  );
}

function Etat({ perso }) {
  return <span className={`flex-none rounded-full px-2.5 py-0.5 text-[12px] ${perso ? "bg-menthe/15 text-menthe" : "bg-relief text-ardoise"}`}>{perso ? "Votre version" : "Modèle de l'équipe"}</span>;
}

export default function MesMails() {
  const { data, isLoading, error } = useQuery({ queryKey: ["mes-mails"], queryFn: () => base44.request("GET", "/api/mes-mails") });
  const mails = data?.mails || [];
  const [choisi, setChoisi] = useState(null);
  const m = mails.find((x) => x.slug === choisi) || mails[0];
  return (
    <Groupe nu titre="Mails après un appel"
      note={<>Réécrivez les mails de l'équipe à votre façon : après vos appels, la plateforme propose votre version. Les variables restent : {"{{salutation}}"}, {"{{type_bien}}"}, {"{{ville}}"} et {"{{signature}}"}.</>}>
      {isLoading ? <div className={`${VERRE} px-5 py-4`}><Chargement /></div>
        : error ? <p className={`${VERRE} m-0 px-5 py-4 text-[13.5px] text-alerte`}>{error.message || "Les mails ne se chargent pas."}</p>
          : (
            // La liste des mails à gauche, l'éditeur du mail choisi à droite.
            <div className={`${VERRE} grid overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)]`}>
              <ul className="m-0 flex list-none flex-col gap-0.5 border-trait p-2 max-lg:border-b lg:border-r">
                {mails.map((x) => {
                  const actif = x.slug === m?.slug;
                  return (
                    <li key={x.slug}>
                      <button type="button" onClick={() => setChoisi(x.slug)} aria-pressed={actif}
                        className={`flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors ${actif ? "bg-relief" : "hover:bg-relief/60"}`}
                        style={actif ? undefined : { background: "transparent" }}>
                        <span className={`text-[14px] leading-[1.35] ${actif ? "text-encre" : "text-craie"}`}>{x.titre.replace(/^Suite à notre échange\s*[–-]\s*/i, "")}</span>
                        <span className={`text-[12px] ${x.perso ? "text-menthe" : "text-brume"}`}>{x.perso ? "Votre version" : "Modèle de l'équipe"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {m ? <UnMail key={m.slug} m={m} /> : <p className="m-0 p-5 text-[13.5px] text-ardoise">Aucun mail à réécrire.</p>}
            </div>
          )}
    </Groupe>
  );
}
