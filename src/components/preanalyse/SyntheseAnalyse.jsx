import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleAlert, Loader2, Mail, OctagonX } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// L'onglet Synthèse du module d'analyse (spec du 17 oct. 2026, Jules) : l'écran d'arrivée. Quatre blocs,
// de haut en bas : verdict et documents, croisements entre sources, signalements à traiter, validation.
// Rien n'y est calculé : le serveur rassemble ce que les autres onglets ont trouvé (synthese-analyse.js).
// L'analyste tranche : la valeur retenue d'un croisement, Accepter / Négocier / Écarter, puis Valider.

const cadre = "k-points relative overflow-hidden rounded-[16px] border border-trait bg-rail";
const titreBloc = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const MOTS = { accepter: "Accepté", negocier: "À négocier", ecarter: "Écarté" };

/** Les comptes de signalements non traités par onglet, pour les titres des onglets. */
export function useSyntheseAnalyse(dealId, { enabled = true } = {}) {
  return useQuery({ queryKey: ["synthese-analyse", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/synthese`), enabled: !!dealId && enabled, staleTime: 30_000, retry: false });
}

function Signalement({ s, onDecider, onRetenir, enCours }) {
  const [ecarter, setEcarter] = useState(false);
  const [motif, setMotif] = useState("");
  const bloquant = s.niveau === "bloquant";
  return (
    <div className="flex flex-col gap-2 border-t border-trait px-5 py-3.5 first:border-t-0">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <span className={`mt-0.5 flex-none ${bloquant ? "text-alerte" : "text-ambre"}`}>{bloquant ? <OctagonX className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}</span>
        <div className="min-w-0 flex-1">
          <p className="m-0 text-[14.5px] text-encre">{s.ligne}{s.valeur ? <span className="text-craie"> · {String(s.valeur).slice(0, 160)}</span> : null}</p>
          {s.motif && <p className="m-0 mt-0.5 text-[13px] text-ardoise">{s.motif}</p>}
          {s.source && <p className="m-0 mt-0.5 text-[12px] text-brume">{s.source}</p>}
        </div>
        {bloquant ? (
          <span className="flex-none rounded-full border border-alerte/50 px-2.5 py-0.5 text-[12px] text-alerte">Bloquant · à corriger ou arrêter</span>
        ) : s.choix?.length ? (
          <span className="flex flex-none flex-wrap gap-1.5">
            {s.choix.map((c) => (
              <button key={c.valeur} type="button" disabled={enCours} onClick={() => onRetenir(c)} title={c.source ? `Source : ${c.source}` : undefined}
                className="h-8 rounded-full border border-trait px-3 text-[12.5px] text-craie transition-colors hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Retenir {c.valeur}</button>
            ))}
          </span>
        ) : s.decision ? (
          <span className="flex flex-none items-center gap-2 text-[12.5px] text-craie">
            <Check className="h-3.5 w-3.5 text-menthe" />{MOTS[s.decision.decision]}{s.decision.motif ? ` · ${s.decision.motif}` : ""}
            <button type="button" onClick={() => onDecider({ decision: null })} className="text-brume underline-offset-4 hover:text-encre hover:underline" style={{ background: "transparent" }}>Revenir</button>
          </span>
        ) : (
          <span className="flex flex-none flex-wrap gap-1.5">
            {[["accepter", "Accepter"], ["negocier", "Négocier"]].map(([k, mot]) => (
              <button key={k} type="button" disabled={enCours} onClick={() => onDecider({ decision: k })}
                className="h-8 rounded-full border border-trait px-3 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>{mot}</button>
            ))}
            <button type="button" disabled={enCours} onClick={() => setEcarter((e) => !e)} aria-expanded={ecarter}
              className="h-8 rounded-full border border-trait px-3 text-[12.5px] text-craie transition-colors hover:border-bord-vif hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Écarter</button>
          </span>
        )}
      </div>
      {ecarter && !s.decision && (
        <form onSubmit={(e) => { e.preventDefault(); if (motif.trim()) onDecider({ decision: "ecarter", motif }); }} className="ml-7 flex flex-wrap gap-2">
          <input autoFocus value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Le motif : « le vendeur prend la toiture à sa charge »"
            className="h-9 min-w-[260px] flex-1 rounded-[10px] border border-trait bg-surface px-3 text-[13.5px] text-encre outline-none focus:border-menthe max-md:text-[16px]" />
          <button type="submit" disabled={!motif.trim()} className="h-9 rounded-full bg-menthe px-4 text-[13px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">Écarter</button>
        </form>
      )}
    </div>
  );
}

const COLONNES = [["fiche", "Fiche"], ["bail", "Bail"], ["quittances", "Quittances"], ["copropriete", "Copropriété"], ["diagnostics", "Diagnostics"], ["bien", "Bien (Kbis, avis, Pappers)"]];

function Croisements({ s, retenir, apercu }) {
  const [ouverte, setOuverte] = useState(null);
  return (
    <section className={cadre}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
        <p className={titreBloc}>Croisements entre sources</p>
        <p className="m-0 text-[12.5px] text-brume">Les informations présentes dans plusieurs onglets, côte à côte. Cliquez une ligne pour voir les citations.</p>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-left text-[13.5px]">
          <thead>
            <tr className="text-[12.5px] text-ardoise">
              <th className="px-5 py-2 font-normal">Information</th>
              {COLONNES.map(([k, mot]) => <th key={k} className="px-3 py-2 font-normal">{mot}</th>)}
              <th className="px-5 py-2 font-normal">Retenu</th>
            </tr>
          </thead>
          <tbody>
            {s.croisements.map((c) => (
              <React.Fragment key={c.cle}>
                <tr onClick={() => setOuverte(ouverte === c.cle ? null : c.cle)} className="cursor-pointer border-t border-trait align-top transition-colors hover:bg-encre/[0.03]">
                  <td className="px-5 py-3 text-craie">{c.information}</td>
                  {COLONNES.map(([k]) => <td key={k} className="max-w-[200px] px-3 py-3 text-encre"><span className="line-clamp-2">{c.colonnes[k]?.valeur ?? <span className="text-brume">·</span>}</span></td>)}
                  <td className={`px-5 py-3 ${c.retenue ? "text-menthe" : c.ecart ? (c.bloquant ? "text-alerte" : "text-ambre") : "text-craie"}`}>{c.resume}</td>
                </tr>
                {ouverte === c.cle && (
                  <tr className="border-t border-trait bg-surface-pleine/40">
                    <td colSpan={COLONNES.length + 2} className="px-5 py-3">
                      <div className="flex flex-col gap-2">
                        {c.sources.map((src) => (
                          <div key={src.colonne} className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
                            <span className="w-[220px] flex-none text-brume">{src.nom}</span>
                            <span className="min-w-0 flex-1 text-encre">{src.valeur}{src.citation ? <span className="block text-[12.5px] text-ardoise">« {String(src.citation).slice(0, 240)} »</span> : null}</span>
                            {c.ecart && !c.bloquant && (
                              <button type="button" disabled={apercu || retenir.isPending} onClick={(e) => { e.stopPropagation(); retenir.mutate({ cle: c.cle, valeur: c.retenue?.source === src.nom ? "" : src.valeur, source: src.nom }); }}
                                className="text-[12.5px] text-menthe hover:underline disabled:opacity-40" style={{ background: "transparent" }}>{c.retenue?.source === src.nom ? "Ne plus retenir" : "Retenir"}</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function SyntheseAnalyse({ dossier, apercu = false, onOnglet = null }) {
  const dealId = dossier?.deal_id;
  const qc = useQueryClient();
  const q = useSyntheseAnalyse(dealId, { enabled: !apercu });
  const raf = () => { qc.invalidateQueries({ queryKey: ["synthese-analyse", dealId] }); qc.invalidateQueries({ queryKey: ["historique-analyse", dealId] }); };
  const useGeste = (chemin) => useMutation({ mutationFn: (body) => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/synthese/${chemin}`, { body }), onSuccess: raf, onError: (e) => toast.error(e?.message || "Impossible") });
  const decider = useGeste("decider");
  const retenir = useGeste("retenir");
  const demander = useGeste("demander");
  const valider = useMutation({
    mutationFn: () => base44.request("POST", `/api/preanalyse/dossiers/${dealId}/synthese/valider`, { body: {} }),
    onSuccess: () => { toast.success("Analyse validée : la fiche deal est produite"); raf(); qc.invalidateQueries({ queryKey: ["preanalyse-pipeline"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const s = q.data;
  if (!s) return q.isError ? <p className="m-0 py-8 text-[13.5px] text-brume">La synthèse n'est pas lisible pour ce dossier.</p> : null;
  const v = s.verdict;
  const parOnglet = s.signalements.reduce((acc, x) => { (acc[x.onglet_titre] = acc[x.onglet_titre] || []).push(x); return acc; }, {});

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Verdict et documents */}
      <section className={`${cadre} px-5 py-4`}>
        <p className="m-0 text-[18px] tracking-[-0.01em] text-encre">
          <span className={v.bloquants ? "text-alerte" : ""}>{v.bloquants} bloquant{v.bloquants > 1 ? "s" : ""}</span>
          <span className="text-ardoise"> · </span>{v.signalements} signalement{v.signalements > 1 ? "s" : ""}
          <span className="text-ardoise"> · </span>{v.traites} traité{v.traites > 1 ? "s" : ""}
          {v.rendement != null && <span className="text-ardoise"> · rendement brut <span className={v.rendement < 5 ? "text-alerte" : "text-encre"}>{String(v.rendement).replace(".", ",")} %</span></span>}
        </p>
        {s.validee && <p className="m-0 mt-1 text-[13px] text-menthe">Analyse validée le {new Date(s.validee.le).toLocaleDateString("fr-FR")}{s.validee.par ? ` par ${s.validee.par.split("@")[0]}` : ""}.</p>}
        <div className="mt-4 flex items-baseline justify-between">
          <p className={titreBloc}>Documents · {s.documents.recus} sur {s.documents.total} reçus</p>
          {s.documents.obligatoires_manquants > 0 && <p className="m-0 text-[12.5px] text-ambre">{s.documents.obligatoires_manquants} obligatoire{s.documents.obligatoires_manquants > 1 ? "s" : ""} manquant{s.documents.obligatoires_manquants > 1 ? "s" : ""}</p>}
        </div>
        <div className="mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-3">
          {s.documents.liste.map((d) => (
            <div key={d.cle} className="flex items-center gap-2.5 border-t border-trait py-2 text-[13.5px]">
              <span className={`grid h-4 w-4 flex-none place-items-center rounded-full ${d.recu ? "bg-menthe text-sur-menthe" : "border border-bord-vif"}`}>{d.recu && <Check className="h-2.5 w-2.5" strokeWidth={3} />}</span>
              <span className={`min-w-0 flex-1 truncate ${d.recu ? "text-encre" : "text-ardoise"}`} title={d.documents.join(", ")}>{d.nom}{!d.obligatoire && <span className="text-brume"> · facultatif</span>}</span>
              {!d.recu && (d.demande
                ? <span className="flex-none text-[12px] text-brume">demandé</span>
                : <button type="button" onClick={() => demander.mutate({ cle: d.cle })} disabled={apercu || demander.isPending} title="L'ajouter à la relance de l'agent"
                    className="inline-flex flex-none items-center gap-1 text-[12px] text-menthe hover:underline disabled:opacity-40" style={{ background: "transparent" }}><Mail className="h-3 w-3" />Demander à l'agent</button>)}
            </div>
          ))}
        </div>
      </section>

      {/* 2. Croisements, en tableau (maquette de Jules, 18 oct. 2026) : une ligne par information, une colonne par onglet, ce qui est retenu. */}
      {s.croisements.length > 0 && <Croisements s={s} retenir={retenir} apercu={apercu} />}

      {/* 3. Signalements à traiter */}
      <section className={cadre}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 pt-4">
          <p className={titreBloc}>Signalements à traiter · {v.signalements - v.traites + v.bloquants}</p>
          <p className="m-0 text-[12.5px] text-brume">Accepter : risque pris tel quel. Négocier : condition de la LOI et scénario du Simulateur. Écarter : avec un motif.</p>
        </div>
        {!s.signalements.length ? <p className="m-0 px-5 pb-5 pt-3 text-[13.5px] text-brume">Rien de signalé dans les pièces lues.</p> : (
          <div className="mt-2">
            {Object.entries(parOnglet).map(([onglet, liste]) => (
              <div key={onglet}>
                <p className="m-0 flex items-baseline justify-between border-t border-trait bg-surface-pleine/40 px-5 py-1.5 text-[12px] text-ardoise">
                  {onglet}
                  {onOnglet && liste[0].onglet !== "synthese" && <button type="button" onClick={() => onOnglet(liste[0].onglet)} className="text-[12px] text-menthe hover:underline" style={{ background: "transparent" }}>Ouvrir l'onglet ›</button>}
                </p>
                {liste.map((x) => <Signalement key={x.cle} s={x} enCours={decider.isPending || retenir.isPending || apercu} onDecider={(d) => decider.mutate({ cle: x.cle, ...d })} onRetenir={(c) => retenir.mutate({ cle: x.croisement, valeur: c.valeur, source: c.source })} />)}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 4. Validation */}
      <section className={`${cadre} flex flex-wrap items-center justify-between gap-3 px-5 py-4`}>
        <p className="m-0 text-[13.5px] text-craie">
          {v.bloquants ? "Un bloquant reste : il se corrige (valeur fausse) ou il arrête le dossier." : s.validable ? "Tout est traité : l'analyse peut être validée. La fiche deal sera produite." : `${v.signalements - v.traites} signalement${v.signalements - v.traites > 1 ? "s" : ""} encore à traiter.`}
        </p>
        <button type="button" onClick={() => valider.mutate()} disabled={apercu || !s.validable || valider.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-40">
          {valider.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Valider l'analyse
        </button>
      </section>
    </div>
  );
}

/** L'historique de l'analyse : documents, corrections, décisions, validation ; rien ne s'y efface. */
export function HistoriqueAnalyse({ dealId }) {
  const q = useQuery({ queryKey: ["historique-analyse", dealId], queryFn: () => base44.request("GET", `/api/preanalyse/dossiers/${dealId}/historique-analyse`), enabled: !!dealId, retry: false });
  const [filtre, setFiltre] = useState(null);
  const entrees = (q.data?.entrees || []).filter((e) => !filtre || e.type === filtre);
  const TYPES = [["document", "Documents"], ["correction", "Corrections"], ["decision", "Décisions"], ["validation", "Validation"]];
  if (!(q.data?.entrees || []).length) return null;
  return (
    <section className={cadre}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
        <p className={titreBloc}>Historique de l'analyse</p>
        <span className="flex flex-wrap gap-1.5">
          {TYPES.map(([k, mot]) => <button key={k} type="button" onClick={() => setFiltre(filtre === k ? null : k)} aria-pressed={filtre === k}
            className={`h-7 rounded-full border px-3 text-[12px] transition-colors ${filtre === k ? "border-menthe/60 bg-menthe/10 text-encre" : "border-trait text-craie hover:text-encre"}`} style={filtre === k ? undefined : { background: "transparent" }}>{mot}</button>)}
        </span>
      </div>
      <div className="mt-2">
        {entrees.map((e, i) => (
          <div key={`${e.le}-${i}`} className="flex gap-3 border-t border-trait px-5 py-2.5 text-[13.5px]">
            <span className="w-[120px] flex-none text-[12.5px] tabular-nums text-brume">{new Date(e.le).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            <span className="min-w-0 flex-1 text-craie">{e.texte}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
