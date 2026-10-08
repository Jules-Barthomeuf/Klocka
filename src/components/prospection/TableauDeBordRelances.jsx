import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// Le tableau de bord des relances (onglet Tableau de bord, 8 oct. 2026),
// visible par toute l'équipe : le total, les mails de relance à valider (rien
// ne part sans un clic), l'activité et le pilotage. Les motifs, qui filtrent,
// sont passés dans l'onglet Liste.

const etiquette = "m-0 text-[11px] tracking-[.14em] text-brume";
const pl = (n, mot, mots = `${mot}s`) => `${n} ${n > 1 ? mots : mot}`;

/** Un mail de relance préparé : aperçu, Envoyer, Modifier, Ignorer. */
function MailAValider({ m }) {
  const queryClient = useQueryClient();
  const [ouvert, setOuvert] = useState(false);
  const [edition, setEdition] = useState(null); // { objet, corps }
  const maj = () => queryClient.invalidateQueries({ queryKey: ["relances"] });
  const envoyer = useMutation({
    mutationFn: async () => {
      if (edition) await base44.request("POST", `/api/prospection/relances/mails/${m.id}`, { body: edition });
      return base44.request("POST", `/api/prospection/relances/mails/${m.id}/envoyer`);
    },
    onSuccess: (r) => { toast.success(r.simule ? "Aucune boîte connectée : envoi simulé" : `Mail envoyé à ${m.a}`); maj(); },
    onError: (e) => toast.error(e?.message || "Le mail n'est pas parti"),
  });
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/relances/mails/${m.id}`, { body: edition }),
    onSuccess: () => { toast.success("Mail modifié"); setEdition(null); maj(); },
    onError: (e) => toast.error(e?.message || "Modification impossible"),
  });
  const ignorer = useMutation({
    mutationFn: () => base44.request("POST", `/api/prospection/relances/mails/${m.id}/ignorer`),
    onSuccess: () => { toast.success("Mail ignoré"); maj(); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const occupe = envoyer.isPending || ignorer.isPending || enregistrer.isPending;
  const champ = "w-full rounded-champ border border-trait bg-fond px-3 py-2 text-[14px] text-encre outline-none focus:border-menthe max-md:text-[16px]";
  return (
    <div className="flex flex-col gap-2 border-t border-trait py-3 first:border-t-0">
      <button type="button" onClick={() => setOuvert((x) => !x)} aria-expanded={ouvert} className="flex flex-col items-start gap-0.5 p-0 text-left" style={{ background: "transparent" }}>
        <span className="text-[12.5px] text-ambre">{m.motif}</span>
        <span className="text-[14.5px] text-encre">{[m.nom, m.agence].filter(Boolean).join(" · ")}</span>
        <span className="text-[13px] text-ardoise">À {m.a} · {m.objet}</span>
      </button>
      {ouvert && !edition && <p className="m-0 whitespace-pre-line rounded-[12px] border border-trait bg-fond p-3 text-[13px] leading-[1.55] text-craie">{m.corps}</p>}
      {edition && (
        <div className="flex flex-col gap-2">
          <input value={edition.objet} onChange={(e) => setEdition((x) => ({ ...x, objet: e.target.value }))} aria-label="Objet" className={champ} />
          <textarea value={edition.corps} onChange={(e) => setEdition((x) => ({ ...x, corps: e.target.value }))} rows={7} aria-label="Message" className={champ} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => envoyer.mutate()} disabled={occupe} className="h-9 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">Envoyer</button>
        {edition
          ? <button type="button" onClick={() => enregistrer.mutate()} disabled={occupe} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Enregistrer</button>
          : <button type="button" onClick={() => { setEdition({ objet: m.objet, corps: m.corps }); setOuvert(true); }} disabled={occupe} className="h-9 rounded-full border border-trait px-4 text-[13px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Modifier</button>}
        <button type="button" onClick={() => (edition ? setEdition(null) : ignorer.mutate())} disabled={occupe} className="h-9 rounded-full px-3 text-[13px] text-ardoise hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>{edition ? "Annuler" : "Ignorer"}</button>
      </div>
    </div>
  );
}

export default function TableauDeBordRelances({ data }) {
  const act = data.activite;
  const pil = data.pilotage;
  const bloc = "flex min-w-0 flex-col gap-3 rounded-[16px] border border-trait p-5 max-md:p-4";
  return (
    <section className="flex flex-col gap-4">
      <p className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre max-md:text-[19px]">
        {pl(data.total, "relance")} à faire{data.retard > 0 && <span className="text-ambre"> · {data.retard} en retard</span>}
      </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
          <div className={bloc}>
            <p className={etiquette}>MAILS À VALIDER · {data.mails.length}</p>
            {data.mails.length ? <div className="flex flex-col">{data.mails.map((m) => <MailAValider key={m.id} m={m} />)}</div>
              : <p className="m-0 text-[13.5px] text-brume">Aucun mail en attente. Ils se préparent seuls : fiche non reçue à J+3, après trois appels sans réponse.</p>}
          </div>

          <div className={bloc}>
            <p className={etiquette}>ACTIVITÉ</p>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-5 gap-y-1.5 text-[14px]">
              <span className="text-[12.5px] text-ardoise">Appels</span><span className="text-right text-[12.5px] text-ardoise">Aujourd'hui</span><span className="text-right text-[12.5px] text-ardoise">Semaine</span>
              {act.analystes.map((x) => (
                <React.Fragment key={x.email}>
                  <span className="truncate text-craie">{x.prenom}</span><span className="text-right tabular-nums text-encre">{x.jour}</span><span className="text-right tabular-nums text-encre">{x.semaine}</span>
                </React.Fragment>
              ))}
              <span className="border-t border-trait pt-1.5 text-encre">Équipe</span><span className="border-t border-trait pt-1.5 text-right tabular-nums text-encre">{act.equipe.jour}</span><span className="border-t border-trait pt-1.5 text-right tabular-nums text-encre">{act.equipe.semaine}</span>
            </div>
            {act.issues.length > 0 && <p className="m-0 text-[13px] leading-[1.6] text-ardoise">{act.issues.map((x) => `${x.libelle} ${x.n}`).join(" · ")}</p>}
            <p className="m-0 text-[13.5px] text-craie">Fiches reçues : <span className="tabular-nums text-encre">{act.fiches_recues.jour}</span> aujourd'hui · <span className="tabular-nums text-encre">{act.fiches_recues.semaine}</span> cette semaine</p>
          </div>

          <div className={bloc}>
            <p className={etiquette}>PILOTAGE</p>
            <div className="flex flex-col gap-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="text-[14px] text-craie">Agents contactés sur 30 jours</span>
                <span className={`text-[18px] tabular-nums ${pil.contactes.part >= pil.contactes.cible ? "text-menthe" : "text-ambre"}`}>{pil.contactes.part} %</span>
              </span>
              <span className="relative block h-[5px] overflow-hidden rounded-full bg-encre/[0.12]">
                <span className="block h-full rounded-full bg-menthe" style={{ width: `${Math.min(100, pil.contactes.part)}%` }} />
                <span className="absolute inset-y-0 w-px bg-encre" style={{ left: `${pil.contactes.cible}%` }} aria-hidden />
              </span>
              <span className="text-[12.5px] text-ardoise">{pil.contactes.n} sur {pil.contactes.sur} suivis · cible {pil.contactes.cible} %</span>
            </div>
            <span className="flex items-baseline justify-between gap-3 border-t border-trait pt-3">
              <span className="text-[14px] text-craie">Relances en retard</span>
              <span className={`text-[18px] tabular-nums ${pil.retard ? "text-ambre" : "text-encre"}`}>{pil.retard}</span>
            </span>
            <span className="flex items-baseline justify-between gap-3 border-t border-trait pt-3">
              <span className="text-[14px] text-craie">Biens reçus ce mois-ci</span>
              <span className="text-[18px] tabular-nums text-encre">{pil.biens_du_mois}</span>
            </span>
          </div>
        </div>
    </section>
  );
}
