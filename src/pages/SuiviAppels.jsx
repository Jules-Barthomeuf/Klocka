import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import OngletsSuivi from "@/components/OngletsSuivi";

// Le Suivi des appels (9 oct. 2026) : l'usage de chacun en Prospection, en
// Relances et au Rappel, pour voir qui appelle, combien, comment, et faire en
// sorte que l'outil serve de plus en plus. L'équipe d'abord, puis chaque
// analyste, la courbe par jour, les heures, les issues, et le journal de
// chaque appel (résumé, phrases exactes, ce qui a été compris, notes,
// validation, corrections d'AK, reçu).

const PERIODES = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"]];
const VUES = [["ensemble", "Vue d'ensemble"], ["analystes", "Par analyste"], ["journal", "Journal des appels"]];
const MODES = [["", "Tout"], ["prospection", "Prospection"], ["relances", "Relances"], ["rappel", "Rappel"], ["essai", "Essai"]];
const titreCase = "m-0 mb-3 text-[11px] tracking-[.16em] uppercase text-menthe font-normal";
const filtre = (actif) => `px-3 py-1.5 rounded-md text-[12.5px] border transition-colors ${actif ? "border-menthe text-menthe bg-menthe/[0.1]" : "border-bord text-ardoise hover:text-encre hover:border-bord-vif"}`;
const dureeLisible = (s) => (s == null ? "—" : s < 60 ? `${s} s` : s < 3600 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 3600)} h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`);
const p100 = (v) => (v == null ? "—" : `${v} %`);
const quand = (iso) => (iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const SOURCES = { prospection: "Prospection", relances: "Relances", rappel: "Rappel", essai: "Essai", carnet: "Ancien carnet" };

function Chiffre({ valeur, libelle, note = null }) {
  return (
    <div className="rounded-md border border-trait bg-surface px-4 py-3.5">
      <p className="m-0 text-[11px] uppercase tracking-[.14em] text-ardoise">{libelle}</p>
      <p className="m-0 mt-2 text-[24px] font-light tabular-nums text-encre">{valeur}</p>
      {note && <p className="m-0 mt-0.5 text-[12px] text-brume">{note}</p>}
    </div>
  );
}

// Les colonnes du tableau par analyste : [clé, titre, mise en forme].
const COLONNES = [
  ["appels", "Appels", (v) => v],
  ["par_jour_actif", "Par jour actif", (v) => v ?? "—"],
  ["joints_pct", "Joints", p100],
  ["enregistres_pct", "Enregistrés", p100],
  ["notes_pct", "Avec notes", p100],
  ["duree_moyenne_s", "Durée moy.", dureeLisible],
  ["duree_totale_s", "Au téléphone", dureeLisible],
  ["temps_mode_appel_s", "En mode appel", dureeLisible],
  ["valides", "Validés", (v) => v],
  ["oublies", "Non validés", (v) => v],
  ["fenetre_pct", "Validés depuis la fenêtre", p100],
  ["etapes_vues_pct", "Étapes ouvertes", p100],
  ["sans_correction_pct", "Sans correction AK", p100],
  ["issue_changee", "Issue changée", (v) => v],
  ["annulations", "Annulations", (v) => v],
  ["mails_partis", "Mails partis", (v) => v],
  ["biens", "Biens", (v) => v],
  ["nouvelles_agences", "Agences appelées", (v) => v],
  ["envoyees_en_relance", "Envoyées en relance", (v) => v],
  ["dernier", "Dernier appel", quand],
];

function DetailAppel({ x }) {
  const ligne = "grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-4 border-t border-trait py-2.5 text-[13px] max-md:grid-cols-1 max-md:gap-1";
  const v = x.validation;
  const m = x.mesure_ak;
  return (
    <div className="flex flex-col bg-relief/30 px-4 pb-3 pt-1">
      <div className={ligne}><span className="text-ardoise">Résumé</span><span className="text-encre">{x.resume || "—"}</span></div>
      {x.issue_proposee && x.issue_proposee !== x.issue && <div className={ligne}><span className="text-ardoise">Issue</span><span className="text-encre">AK proposait « {x.issue_proposee} », changée en « {x.issue} »</span></div>}
      {x.citations.length > 0 && (
        <div className={ligne}><span className="text-ardoise">Phrases exactes</span>
          <span className="flex flex-col gap-1">{x.citations.map((c) => <span key={c.cle} className="text-craie"><span className="text-brume">{c.cle} · </span>« {c.phrase} »</span>)}</span>
        </div>
      )}
      {Object.entries(x.champs).filter(([, val]) => val).length > 0 && (
        <div className={ligne}><span className="text-ardoise">Compris</span>
          <span className="flex flex-wrap gap-x-4 gap-y-1">{Object.entries(x.champs).filter(([, val]) => val).map(([k, val]) => <span key={k} className="text-craie"><span className="text-brume">{k} : </span>{String(val)}</span>)}</span>
        </div>
      )}
      {x.pourquoi_relance && <div className={ligne}><span className="text-ardoise">Pourquoi la relance</span><span className="text-craie">{x.pourquoi_relance}</span></div>}
      {x.notes && <div className={ligne}><span className="text-ardoise">Notes tapées</span><span className="whitespace-pre-line text-craie">{x.notes}</span></div>}
      <div className={ligne}><span className="text-ardoise">Enregistrement</span>
        <span className="text-craie">{x.enregistre == null ? "Non mesuré (avant le 9 oct.)" : x.enregistre ? "Enregistré" : "Sans enregistrement"}{x.duree_s ? ` · ${dureeLisible(x.duree_s)}` : ""}{x.lecture_ms ? ` · lu par AK en ${(x.lecture_ms / 1000).toFixed(1)} s` : ""}. La transcription n'est pas gardée (RGPD).</span>
      </div>
      {v && <div className={ligne}><span className="text-ardoise">Validation</span><span className="text-craie">{v.depuis_fenetre ? "Depuis la fenêtre des actions" : "Depuis la page"} · {v.vues ?? "?"} étape{(v.vues || 0) > 1 ? "s" : ""} ouverte{(v.vues || 0) > 1 ? "s" : ""} sur {v.etapes}{v.retirees?.length ? ` · retirées : ${v.retirees.join(", ")}` : ""}{v.ajoutees?.length ? ` · ajoutées : ${v.ajoutees.join(", ")}` : ""}{x.annulations ? ` · annulé ${x.annulations} fois` : ""}</span></div>}
      {m && <div className={ligne}><span className="text-ardoise">Corrections d'AK</span><span className="text-craie">{!m.propose_par_ak ? "Issue tapée à la main : AK n'a rien proposé" : !m.corrige ? "Aucune" : [m.issue && "issue changée", m.champs?.length && `champs : ${m.champs.join(", ")}`, m.date && "date retouchée", m.mail && "mail retouché"].filter(Boolean).join(" · ")}</span></div>}
      {x.recu && <div className={ligne}><span className="text-ardoise">Reçu</span><span className="flex flex-col gap-0.5 text-craie">{x.recu.monday && <span>Monday : {x.recu.monday.texte}</span>}{x.recu.mail && <span>Mail : {x.recu.mail.texte}</span>}{x.recu.relance && <span>{x.recu.relance}</span>}</span></div>}
    </div>
  );
}

// La courbe par jour : une colonne par jour, pleine pour les appels joints,
// pâle pour les sans réponse ; l'échelle arrondie, le chiffre au-dessus de
// chaque barre, les jours sans appel marqués d'un trait, les week-ends
// teintés, une date par semaine ; au survol, le détail du jour par personne.
const echelleRonde = (n) => { const pas = n <= 5 ? 1 : n <= 10 ? 2 : n <= 25 ? 5 : n <= 50 ? 10 : 20; return Math.max(pas * 2, Math.ceil(n / pas) * pas); };
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function CourbeJours({ parJour, analystes }) {
  const [survol, setSurvol] = useState(null);
  const haut = echelleRonde(Math.max(1, ...parJour.map((j) => j.appels)));
  const total = parJour.reduce((t, j) => t + j.appels, 0);
  const actifs = parJour.filter((j) => j.appels);
  const record = actifs.reduce((m, j) => (!m || j.appels > m.appels ? j : m), null);
  const aujourdhui = parJour.at(-1)?.jour;
  const jour = survol ? parJour.find((j) => j.jour === survol) : null;
  const pas = parJour.length > 31 ? 14 : 7;
  return (
    <div className="flex flex-col rounded-md border border-trait p-4">
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h2 className={`${titreCase} mb-0`}>Appels par jour</h2>
        <div className="flex items-center gap-4 text-[12px] text-ardoise">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-menthe" />Joints</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-menthe/30" />Sans réponse</span>
        </div>
      </div>
      <p className="m-0 mb-4 min-h-[19px] text-[13px] text-craie">
        {jour ? (
          <><span className="text-encre">{jourLong(jour.jour)}</span> · {jour.appels} appel{jour.appels > 1 ? "s" : ""}{jour.appels ? `, ${jour.aboutis} joint${jour.aboutis > 1 ? "s" : ""}` : ""}{Object.entries(jour.par).filter(([, n]) => n).map(([em, n]) => ` · ${analystes.find((a) => a.email === em)?.prenom || em} ${n}`).join("")}</>
        ) : total ? (
          <>{total} appel{total > 1 ? "s" : ""} sur {actifs.length} jour{actifs.length > 1 ? "s" : ""} actif{actifs.length > 1 ? "s" : ""} · {Math.round((total / actifs.length) * 10) / 10} par jour actif · record {record.appels} le {jourCourt(record.jour)}</>
        ) : <span className="text-brume">Aucun appel sur la période.</span>}
      </p>
      <div className="grid min-h-[220px] flex-1 grid-cols-[24px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto] gap-x-2">
        <div className="relative mt-5 text-right text-[11px] tabular-nums text-brume">
          {[1, 0.5, 0].map((f) => <span key={f} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - f) * 100}%` }}>{Math.round(haut * f)}</span>)}
        </div>
        <div className="relative mt-5" onMouseLeave={() => setSurvol(null)}>
          {[1, 0.5].map((f) => <div key={f} className="pointer-events-none absolute inset-x-0 border-t border-dashed border-trait" style={{ top: `${(1 - f) * 100}%` }} />)}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-bord" />
          <div className="absolute inset-0 flex gap-[3px]">
            {parJour.map((j) => {
              const d = new Date(`${j.jour}T12:00:00Z`).getUTCDay();
              const fin = d === 0 || d === 6;
              const sansRep = j.appels - j.aboutis;
              return (
                <div key={j.jour} onMouseEnter={() => setSurvol(j.jour)} className={`relative flex h-full min-w-0 flex-1 flex-col justify-end rounded-t-[3px] transition-colors ${survol === j.jour ? "bg-encre/[0.06]" : fin ? "bg-encre/[0.025]" : ""}`}>
                  {j.appels > 0 ? (
                    <div className="relative mx-auto flex w-full max-w-[38px] flex-col" style={{ height: `${(j.appels / haut) * 100}%` }}>
                      <span className={`absolute inset-x-0 -top-[18px] text-center text-[11px] tabular-nums ${survol === j.jour ? "text-encre" : "text-ardoise"}`}>{j.appels}</span>
                      {sansRep > 0 && <div className="rounded-t-[3px] bg-menthe/30" style={{ flexGrow: sansRep }} />}
                      {j.aboutis > 0 && <div className={`bg-menthe ${sansRep ? "" : "rounded-t-[3px]"}`} style={{ flexGrow: j.aboutis }} />}
                    </div>
                  ) : <div className="mx-auto h-[2px] w-full max-w-[38px] rounded-full bg-encre/[0.08]" />}
                </div>
              );
            })}
          </div>
        </div>
        <span />
        <div className="relative mt-2 flex h-4 gap-[3px] text-[11px] text-brume">
          {parJour.map((j, i) => (
            <span key={j.jour} className="relative min-w-0 flex-1">
              {(j.jour === aujourdhui || (parJour.length - 1 - i) % pas === 0) && (
                <span className={`absolute whitespace-nowrap ${j.jour === aujourdhui ? "right-0 text-menthe" : "left-1/2 -translate-x-1/2"}`}>{j.jour === aujourdhui ? "Aujourd'hui" : jourCourt(j.jour)}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SuiviAppels() {
  const [jours, setJours] = useState(30);
  const [mode, setMode] = useState("");
  const [ouvert, setOuvert] = useState(null);
  const [qui, setQui] = useState("");
  const [vue, setVue] = useState("ensemble");
  const voirJournalDe = (prenom) => { setQui(prenom); setVue("journal"); };
  // Remettre à zéro (9 oct. 2026) : le suivi compte à partir de maintenant ; rien ne s'efface, « Tout afficher » revient en arrière.
  const queryClient = useQueryClient();
  const zero = useMutation({
    mutationFn: (quoi) => base44.request("POST", `/api/monitoring/appels/${quoi}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["suivi-appels"] }),
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ["suivi-appels", jours, mode],
    queryFn: () => base44.request("GET", `/api/monitoring/appels?jours=${jours}${mode ? `&source=${mode}` : ""}`),
    placeholderData: (prev) => prev,
    refetchOnWindowFocus: true,
  });
  if (error) return <div className="p-8"><p className="text-[13.5px] text-ardoise">{error.message || "Accès réservé."}</p></div>;
  const e = data?.equipe;
  const heures = (data?.heures || []).filter((h) => h.heure >= 7 && h.heure <= 21);
  const maxHeure = Math.max(1, ...heures.map((h) => h.appels));
  const issues = Object.entries(e?.issues || {}).sort((a, b) => b[1] - a[1]);
  const journal = (data?.journal || []).filter((x) => !qui || x.par === qui);

  return (
    <div className="min-h-screen text-encre">
      <div className="mx-auto max-w-[1300px] px-4 py-8 md:px-8 md:py-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <OngletsSuivi className="mb-3.5" />
            <h1 className="m-0 text-[34px] font-light tracking-[-.02em] max-md:text-[24px]">Appels et relances</h1>
          </div>
          {/* md:pr-14 : la marge du bouton Rappel, fixé dans le coin. */}
          <div className="flex flex-col items-end gap-2 md:pr-14">
            <div className="flex flex-wrap gap-1.5">{PERIODES.map(([j, mot]) => <button key={j} type="button" onClick={() => setJours(j)} className={filtre(jours === j)}>{mot}</button>)}</div>
            <div className="flex flex-wrap gap-1.5">{MODES.map(([k, mot]) => <button key={k || "tout"} type="button" onClick={() => setMode(k)} className={filtre(mode === k)}>{mot}</button>)}</div>
            <button type="button" disabled={zero.isPending} onClick={() => { if (window.confirm("Remettre le suivi des appels à zéro ? Il comptera à partir de maintenant. Rien n'est effacé : « Tout afficher » revient en arrière.")) zero.mutate("remettre-a-zero"); }}
              className="h-8 rounded-full border border-trait px-3.5 text-[12.5px] text-craie hover:border-bord-vif hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>Remettre à zéro</button>
          </div>
        </div>

        {data?.remise_a_zero && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-trait px-4 py-2.5">
            <span className="text-[13.5px] text-craie">Compté depuis la remise à zéro du {new Date(data.remise_a_zero.le).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}{data.remise_a_zero.par ? ` par ${data.remise_a_zero.par.split("@")[0].split(".")[0].replace(/^./, (c) => c.toUpperCase())}` : ""}.</span>
            <button type="button" disabled={zero.isPending} onClick={() => zero.mutate("tout-afficher")} className="p-0 text-[13px] text-menthe underline-offset-4 hover:underline disabled:opacity-50" style={{ background: "transparent" }}>Tout afficher</button>
          </div>
        )}

        <div className="mb-6 flex gap-5 border-b border-trait">
          {VUES.map(([k, mot]) => (
            <button key={k} type="button" onClick={() => setVue(k)} className={`-mb-px border-b-[1.5px] pb-2 text-[13.5px] transition-colors ${vue === k ? "border-menthe text-encre" : "border-transparent text-ardoise hover:text-encre"}`} style={{ background: "transparent" }}>{mot}</button>
          ))}
        </div>

        {isLoading || !data ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-ardoise" /></div> : (
          <>
            {vue === "ensemble" && <div className="k-monte">
            <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <Chiffre valeur={e.appels} libelle="Appels" note={`${e.jours_actifs} jour${e.jours_actifs > 1 ? "s" : ""} actif${e.jours_actifs > 1 ? "s" : ""}`} />
              <Chiffre valeur={p100(e.joints_pct)} libelle="Joints" note={`${e.aboutis} conversation${e.aboutis > 1 ? "s" : ""}`} />
              <Chiffre valeur={p100(e.enregistres_pct)} libelle="Enregistrés" note="depuis le 9 oct." />
              <Chiffre valeur={dureeLisible(e.duree_moyenne_s)} libelle="Durée moyenne" note={`${dureeLisible(e.duree_totale_s)} au téléphone`} />
              <Chiffre valeur={p100(e.sans_correction_pct)} libelle="Sans correction AK" note={`${e.issue_changee} issue${e.issue_changee > 1 ? "s" : ""} changée${e.issue_changee > 1 ? "s" : ""}`} />
              <Chiffre valeur={e.oublies} libelle="Non validés" note="plus d'une heure après l'appel" />
            </div>

            </div>}

            {vue === "analystes" && <div className="mb-8 rounded-md border border-trait p-4 k-monte">
              <h2 className={titreCase}>Par analyste</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1500px] border-collapse text-[13px]">
                  <thead>
                    <tr className="border-b border-bord">
                      <th className="sticky left-0 bg-fond py-2 pr-3 text-left text-[11px] font-normal uppercase tracking-[.14em] text-brume">Analyste</th>
                      {COLONNES.map(([k, t]) => <th key={k} className="px-2 py-2 text-right text-[11px] font-normal uppercase tracking-[.1em] text-brume">{t}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {data.analystes.map((a) => (
                      <tr key={a.email} onClick={() => voirJournalDe(a.prenom)} className="cursor-pointer border-b border-trait hover:bg-relief/30" title="Voir les appels de cette personne">
                        <td className="sticky left-0 bg-fond py-2.5 pr-3 text-encre">{a.prenom}</td>
                        {COLONNES.map(([k, , f]) => <td key={k} className={`px-2 py-2.5 text-right tabular-nums ${a.appels ? "text-craie" : "text-brume"}`}>{f(a[k])}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="m-0 mt-3 text-[12px] text-brume">Durée, enregistrement, notes, validation depuis la fenêtre, étapes ouvertes et corrections d'AK sont mesurés depuis le 9 octobre 2026 : avant, « — ». Un clic sur une personne ouvre ses appels.</p>
            </div>}

            {vue === "ensemble" && <div className="k-monte">
            <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <CourbeJours parJour={data.par_jour} analystes={data.analystes} />
              <div className="rounded-md border border-trait p-4">
                <h2 className={titreCase}>Heures d'appel</h2>
                <div className="flex flex-col gap-1">
                  {heures.map((h) => (
                    <div key={h.heure} className="grid grid-cols-[34px_minmax(0,1fr)_28px] items-center gap-2 text-[12px]">
                      <span className="text-brume">{h.heure} h</span>
                      <span className="h-1.5 overflow-hidden rounded-full bg-encre/[0.06]"><span className="block h-full rounded-full bg-menthe" style={{ width: `${(h.appels / maxHeure) * 100}%` }} /></span>
                      <span className="text-right tabular-nums text-craie">{h.appels}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-8 grid grid-cols-1 gap-5 lg:grid-cols-3">
              <div className="rounded-md border border-trait p-4">
                <h2 className={titreCase}>Issues</h2>
                {issues.length ? issues.map(([k, n]) => <div key={k} className="flex justify-between border-t border-trait py-2 text-[13px] first:border-t-0"><span className="text-craie">{({ pas_de_reponse: "Pas de réponse", repondeur: "Répondeur", pas_de_murs: "Pas de bien pour l'instant", a_des_murs: "A un bien", pas_interesse: "Pas intéressé", agent_prevenu: "Agent prévenu", rien_de_nouveau: "Rien de nouveau" })[k] || k}</span><span className="tabular-nums text-encre">{n}</span></div>) : <p className="m-0 text-[12.5px] text-brume">Aucun appel sur la période.</p>}
              </div>
              <div className="rounded-md border border-trait p-4">
                <h2 className={titreCase}>Par mode</h2>
                {data.sources.map((s0) => <div key={s0.cle} className="flex justify-between border-t border-trait py-2 text-[13px] first:border-t-0"><span className="text-craie">{s0.libelle}</span><span className="tabular-nums text-encre">{s0.appels}</span></div>)}
              </div>
              <div className="rounded-md border border-trait p-4">
                <h2 className={titreCase}>Rappels entrants</h2>
                {[["Reçus", data.rappels.total], ["Terminés", data.rappels.termines], ["Abandonnés", data.rappels.abandonnes], ["À terminer", data.rappels.en_cours]].map(([t, n]) => <div key={t} className="flex justify-between border-t border-trait py-2 text-[13px] first:border-t-0"><span className="text-craie">{t}</span><span className="tabular-nums text-encre">{n}</span></div>)}
                <p className="m-0 mt-2 text-[12px] text-brume">Mails partis : {e.mails_partis} · Monday écrit : {e.monday_ok} · lecture AK moyenne : {e.lecture_moyenne_ms ? `${(e.lecture_moyenne_ms / 1000).toFixed(1)} s` : "—"}</p>
              </div>
            </div>

            </div>}

            {vue === "journal" && <div className="rounded-md border border-trait p-4 k-monte">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className={`${titreCase} mb-0`}>Journal des appels</h2>
                <div className="flex flex-wrap gap-1.5">{["", ...data.analystes.filter((a) => a.appels).map((a) => a.prenom)].map((p) => <button key={p || "tous"} type="button" onClick={() => setQui(p)} className={filtre(qui === p)}>{p || "Tout le monde"}</button>)}</div>
                <span className="text-[12px] text-brume">{journal.length} appel{journal.length > 1 ? "s" : ""}</span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[980px]">
                  <div className="grid grid-cols-[110px_80px_100px_minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_110px_110px_20px] gap-3 border-b border-bord py-2 text-[11px] uppercase tracking-[.1em] text-brume">
                    <span>Quand</span><span>Qui</span><span>Mode</span><span>Agence</span><span>Issue</span><span>Durée</span><span>Enreg.</span><span>Validation</span><span>AK</span><span />
                  </div>
                  {journal.map((x) => (
                    <div key={x.id} className="border-b border-trait">
                      <button type="button" onClick={() => setOuvert(ouvert === x.id ? null : x.id)} className="grid w-full grid-cols-[110px_80px_100px_minmax(0,1.4fr)_minmax(0,1fr)_70px_80px_110px_110px_20px] items-center gap-3 py-2.5 text-left text-[13px] hover:bg-relief/30" style={{ background: "transparent" }}>
                        <span className="tabular-nums text-ardoise">{quand(x.le)}</span>
                        <span className="text-craie">{x.par}</span>
                        <span className="text-ardoise">{SOURCES[x.source] || x.source}</span>
                        <span className="min-w-0 truncate text-encre">{x.agence || "—"}{x.ville ? <span className="text-brume"> · {x.ville}</span> : null}</span>
                        <span className="min-w-0 truncate text-craie">{x.issue}{x.issue_proposee && x.issue_proposee !== x.issue ? <span className="text-ambre"> (changée)</span> : null}</span>
                        <span className="tabular-nums text-ardoise">{x.duree_s ? dureeLisible(x.duree_s) : "—"}</span>
                        <span className="text-ardoise">{x.enregistre == null ? "—" : x.enregistre ? "Oui" : "Non"}{x.notes ? " · notes" : ""}</span>
                        <span className={x.etat === "valide" ? "text-craie" : "text-ambre"}>{x.etat === "valide" ? (x.validation ? (x.validation.depuis_fenetre ? "Fenêtre" : "Page") : "Validé") : "Pas validé"}</span>
                        <span className="text-ardoise">{!x.mesure_ak ? "—" : !x.mesure_ak.propose_par_ak ? "Tapée" : x.mesure_ak.corrige ? <span className="text-ambre">Corrigé</span> : "Juste"}</span>
                        <ChevronDown className={`h-3.5 w-3.5 text-brume transition-transform ${ouvert === x.id ? "rotate-180" : ""}`} />
                      </button>
                      {ouvert === x.id && <DetailAppel x={x} />}
                    </div>
                  ))}
                  {!journal.length && <p className="m-0 py-8 text-center text-[13px] text-brume">Aucun appel sur la période.</p>}
                </div>
              </div>
            </div>}
          </>
        )}
      </div>
    </div>
  );
}
