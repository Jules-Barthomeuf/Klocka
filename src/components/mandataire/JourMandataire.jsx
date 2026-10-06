import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Check, Pencil, Phone, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { telLisible } from "@/components/dashboard/CeQuiVousAttend";

// Sous le chat : les rappels (relances du jour, et celles en retard en rouge)
// et ce qu'il y a à faire aujourd'hui (les rendez-vous). Chaque ligne a ses
// gestes : appeler, fait, reporter (au jour choisi), renommer, supprimer.
// À la souris, les gestes n'apparaissent qu'au survol de la ligne ; au doigt,
// ils restent visibles. Tout vient des relances et rendez-vous notés par l'agent.

const quand = (l) => {
  if (l.heure && l.dans === 0) return `aujourd'hui à ${l.heure}`;
  if (l.dans < -1) return `en retard de ${-l.dans} jours`;
  if (l.dans === -1) return "en retard d'un jour";
  if (l.dans === 0) return "aujourd'hui";
  if (l.dans === 1) return l.heure ? `demain à ${l.heure}` : "demain";
  return new Date(l.echeance).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }) + (l.heure ? ` à ${l.heure}` : "");
};

const jourLocal = (decalage = 0) => {
  const d = new Date(Date.now() + decalage * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function JourMandataire() {
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: ["mandataire-jour"],
    queryFn: () => base44.request("GET", "/api/mandataire/jour"),
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });
  const agir = useMutation({
    mutationFn: ({ id, geste, corps = null }) => base44.request("POST", `/api/mandataire/rappels/${encodeURIComponent(id)}/${geste}`, corps ? { body: corps } : {}),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["mandataire-jour"] }),
    onError: (e) => toast.error(e?.message || "Impossible"),
  });

  const rappels = data?.rappels || [];
  const aFaire = data?.a_faire || [];
  const aVenir = data?.a_venir || [];

  return (
    <div className="grid gap-x-12 gap-y-8 md:grid-cols-2">
      <Bloc titre="Rappels" compte={data?.en_retard ? <span className="text-alerte"> · {data.en_retard} en retard</span> : null} vide="Aucune relance pour aujourd'hui." lignes={rappels} agir={agir} />
      <Bloc titre="À faire" vide="Aucun rendez-vous aujourd'hui." lignes={aFaire} agir={agir} />
      {aVenir.length > 0 && (
        <div className="md:col-span-2">
          <Bloc titre="À venir" lignes={aVenir} agir={agir} discret />
        </div>
      )}
    </div>
  );
}

function Bloc({ titre, compte = null, vide = null, lignes, agir, discret = false }) {
  // Trois lignes d'abord ; « Voir les N autres » déplie le reste.
  const [tout, setTout] = useState(false);
  const visibles = tout ? lignes : lignes.slice(0, 3);
  const cachees = lignes.length - visibles.length;
  // Une seule ligne en édition à la fois : { id, mode: "date" | "titre", valeur }.
  const [edition, setEdition] = useState(null);
  const fermer = () => setEdition(null);
  const valider = () => {
    if (!edition) return;
    const { id, mode, valeur } = edition;
    fermer();
    if (!valeur?.trim?.() && mode === "titre") return;
    if (mode === "date" && !valeur) return;
    agir.mutate(mode === "date" ? { id, geste: "reporter", corps: { date: valeur } } : { id, geste: "renommer", corps: { titre: valeur } });
  };

  return (
    <section>
      <div className="mb-1 border-b border-bord pb-2.5">
        <p className="m-0 text-[13.5px] text-craie">{titre}{compte}</p>
      </div>
      {!lignes.length && vide && <p className="m-0 py-3 text-[13.5px] text-brume">{vide}</p>}
      {visibles.map((l) => {
        const enEdition = edition?.id === l.id ? edition : null;
        return (
          <div key={l.id} className="group flex items-center gap-3 border-t border-trait py-3 first:border-t-0 max-md:flex-wrap max-md:gap-y-1">
            <span className={`h-[7px] w-[7px] flex-none rounded-full ${l.dans < 0 ? "bg-alerte" : l.genre === "rdv" ? "bg-ambre" : "bg-menthe"}`} />
            {/* Au téléphone, le titre prend la ligne ; les gestes passent dessous, à droite. */}
            <div className="min-w-0 flex-1 max-md:basis-[calc(100%-19px)]">
              {enEdition?.mode === "titre" ? (
                <form onSubmit={(e) => { e.preventDefault(); valider(); }}>
                  <input autoFocus value={enEdition.valeur} maxLength={120} onChange={(e) => setEdition({ ...enEdition, valeur: e.target.value })}
                    onBlur={valider} onKeyDown={(e) => { if (e.key === "Escape") fermer(); }} aria-label="Renommer"
                    className="w-full rounded-champ border border-menthe bg-surface px-2.5 py-1 text-[14.5px] text-encre outline-none max-md:text-[16px]" />
                </form>
              ) : (
                <p className={`m-0 text-[14.5px] leading-[1.45] ${discret ? "text-craie" : "text-encre"}`}>{l.titre}</p>
              )}
              <p className={`m-0 mt-0.5 truncate text-[13px] ${l.dans < 0 ? "text-alerte" : "text-ardoise"}`}>
                {quand(l)}{l.note ? <span className="text-ardoise"> · {l.note}</span> : null}
              </p>
            </div>
            {enEdition?.mode === "date" ? (
              <div className="flex flex-none items-center gap-1.5 max-md:ml-auto">
                <input autoFocus type="date" value={enEdition.valeur} min={jourLocal()} aria-label="Reporter au"
                  onChange={(e) => setEdition({ ...enEdition, valeur: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Escape") fermer(); if (e.key === "Enter") valider(); }}
                  className="rounded-champ border border-menthe bg-surface px-2.5 py-1.5 text-[13.5px] text-encre outline-none max-md:text-[16px]" />
                <button type="button" onClick={valider} disabled={!enEdition.valeur} aria-label="Reporter" title="Reporter"
                  className="grid h-9 w-9 place-items-center rounded-full bg-menthe text-fond disabled:opacity-40"><Check className="h-4 w-4" /></button>
                <button type="button" onClick={fermer} aria-label="Annuler" title="Annuler"
                  className="grid h-9 w-9 place-items-center rounded-full text-brume hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
              </div>
            ) : (
              // À la souris, les gestes attendent le survol ; au doigt (pas de
              // survol), ils restent visibles. Le clavier les retrouve au focus.
              <div className="flex flex-none items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:-my-1 max-md:ml-auto max-md:opacity-100">
                {l.telephone && (
                  <a href={`tel:${String(l.telephone).replace(/[^\d+]/g, "")}`} aria-label={`Appeler ${telLisible(l.telephone)}`} title={`Appeler ${telLisible(l.telephone)}`} className="grid h-10 w-10 place-items-center rounded-full text-menthe hover:bg-encre/[0.05]">
                    <Phone className="h-4 w-4" />
                  </a>
                )}
                <button onClick={() => agir.mutate({ id: l.id, geste: "fait" })} disabled={agir.isPending} aria-label="Fait" title="Fait" className="grid h-10 w-10 place-items-center rounded-full text-ardoise hover:bg-encre/[0.05] hover:text-menthe disabled:opacity-40" style={{ background: "transparent" }}>
                  <Check className="h-4 w-4" />
                </button>
                <button onClick={() => setEdition({ id: l.id, mode: "date", valeur: jourLocal(1) })} disabled={agir.isPending} aria-label="Reporter à une date" title="Reporter" className="grid h-10 w-10 place-items-center rounded-full text-ardoise hover:bg-encre/[0.05] hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                  <CalendarClock className="h-4 w-4" />
                </button>
                <button onClick={() => setEdition({ id: l.id, mode: "titre", valeur: l.genre === "appel" ? "" : l.titre })} disabled={agir.isPending} aria-label="Renommer" title="Renommer" className="grid h-10 w-10 place-items-center rounded-full text-ardoise hover:bg-encre/[0.05] hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>
                  <Pencil className="h-4 w-4" />
                </button>
                <button onClick={() => { if (window.confirm("Supprimer ce rappel ?")) agir.mutate({ id: l.id, geste: "supprimer" }); }} disabled={agir.isPending} aria-label="Supprimer" title="Supprimer" className="grid h-10 w-10 place-items-center rounded-full text-brume hover:bg-encre/[0.05] hover:text-alerte disabled:opacity-40" style={{ background: "transparent" }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}
      {(cachees > 0 || tout) && lignes.length > 3 && (
        <button type="button" onClick={() => setTout((v) => !v)}
          className="mt-1 border-t border-trait pt-2.5 text-[13px] text-ardoise transition-colors hover:text-encre"
          style={{ background: "transparent" }}>
          {tout ? "Réduire" : `Voir ${cachees > 1 ? `les ${cachees} autres` : "l'autre"}`}
        </button>
      )}
    </section>
  );
}
