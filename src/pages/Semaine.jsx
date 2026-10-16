import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La semaine de l'équipe (16 oct. 2026, Jules) : qui est là, ce qu'on a
// manqué. Jules pose les absences (école, congés) ; la veille d'un départ, la
// personne laisse le point sur ses dossiers ; ceux qui restent lisent
// « Pendant l'absence de … » ; au retour, le lundi d'après, un résumé très
// détaillé de la période. Le serveur écrit tout (server/equipe-semaine.js).

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
const TEINTES = { ecole: "bg-menthe/60", conges: "bg-ambre/60", autre: "bg-bord-vif" };
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const lettre = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "narrow", timeZone: "UTC" }).toUpperCase();

/** Un résumé écrit par le serveur : le chapeau, puis ses sections en lignes. */
function Resume({ r, titre, sousTitre }) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!r?.id) return;
    base44.request("POST", `/api/semaine/resumes/${r.id}/vu`, { body: {} }).then(() => qc.invalidateQueries({ queryKey: ["notifications"] })).catch(() => {});
  }, [r?.id, qc]);
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">{titre}</h2>
      {sousTitre && <p className="m-0 mt-1 text-[13px] text-ardoise">{sousTitre}</p>}
      {r.chapeau && <p className="m-0 mt-4 text-[15px] leading-[1.6] text-craie">{r.chapeau}</p>}
      {(r.sections || []).map((s) => (
        <div key={s.titre} className="mt-6">
          <p className={etiq}>{s.titre}</p>
          <ul className="m-0 mt-2 list-none p-0">
            {s.points.map((p, k) => (
              <li key={k} className="border-t border-trait py-2.5 text-[14px] leading-[1.55] text-craie first:border-t-0">
                {p.texte}
                {p.deal_id && <> <Link to={`/Analyse?deal_id=${encodeURIComponent(p.deal_id)}`} className="whitespace-nowrap text-[12.5px] text-ardoise underline decoration-trait underline-offset-2 hover:text-encre">ouvrir le dossier</Link></>}
              </li>
            ))}
            {!s.points.length && <li className="text-[13.5px] text-brume">Rien.</li>}
          </ul>
        </div>
      ))}
      <p className="m-0 mt-6 text-[12px] text-brume">Écrit le {new Date(r.genere_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}, à partir des dossiers, des réunions, de l'Intelligence, de la prospection et des nouveautés de la plateforme.</p>
    </section>
  );
}

/** La veille d'un départ : le point sur ses dossiers, pour ceux qui restent. */
function AvantDePartir({ depart, motifs }) {
  const qc = useQueryClient();
  const p = depart.passation;
  const [texte, setTexte] = useState(p?.texte || "");
  const [notes, setNotes] = useState(() => Object.fromEntries((p?.dossiers || []).map((d) => [d.deal_id, d.note])));
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", "/api/semaine/passation", { body: { du: depart.du, au: depart.au, texte, dossiers: depart.dossiers.map((d) => ({ deal_id: d.deal_id, nom: d.nom, note: notes[d.deal_id] || "" })) } }),
    onSuccess: () => { toast.success("Laissé à l'équipe"); qc.invalidateQueries({ queryKey: ["semaine"] }); },
    onError: (e) => toast.error(e?.message || "Ça n'est pas parti."),
  });
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">Avant de partir</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">
        {motifs[depart.motif] || "Absent"} du {jourLong(depart.du)} au {jourLong(depart.au)}. Quelques lignes par dossier : l'équipe les lira demain matin, et ton résumé de retour en partira.
      </p>
      <p className={`${etiq} mt-5`}>Le point général</p>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={3} className={`${champ} mt-2`} placeholder="Ce qui est en cours, ce que tu attends, qui doit reprendre quoi." />
      <p className={`${etiq} mt-5`}>Tes dossiers</p>
      <ul className="m-0 mt-2 list-none p-0">
        {depart.dossiers.map((d) => (
          <li key={d.deal_id} className="grid grid-cols-[220px_minmax(0,1fr)] items-start gap-3 border-t border-trait py-2.5 first:border-t-0 max-md:grid-cols-1 max-md:gap-1.5">
            <span className="pt-2 text-[14px] text-encre">{d.nom}<span className="block text-[12px] text-brume">{d.statut || ""}</span></span>
            <input value={notes[d.deal_id] || ""} onChange={(e) => setNotes((n) => ({ ...n, [d.deal_id]: e.target.value }))} className={champ} placeholder="Où il en est, ce qu'il faut faire pendant ton absence" />
          </li>
        ))}
        {!depart.dossiers.length && <li className="text-[13.5px] text-brume">Aucun dossier ouvert à ton nom : le point général suffit.</li>}
      </ul>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{p ? "Mettre à jour" : "Laisser à l'équipe"}
        </button>
        {p && <span className="text-[12.5px] text-brume">Laissé le {new Date(p.ecrit_le).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "long", hour: "2-digit", minute: "2-digit" })}</span>}
      </div>
    </section>
  );
}

/** Les présences : une ligne par personne, un carré par jour ouvré. Jules clique pour poser ou retirer une absence. */
function Presences() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["semaine-presences"], queryFn: () => base44.request("GET", "/api/semaine/presences?semaines=5") });
  const [motif, setMotif] = useState("ecole");
  const poser = useMutation({
    mutationFn: (b) => base44.request("POST", "/api/semaine/absences", { body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["semaine-presences"] }); qc.invalidateQueries({ queryKey: ["semaine"] }); },
    onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  const d = q.data;
  const semaines = useMemo(() => {
    const s = [];
    for (const j of d?.jours || []) { const n = Math.floor(d.jours.indexOf(j) / 5); (s[n] = s[n] || []).push(j); }
    return s;
  }, [d]);
  if (q.isLoading || !d) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>;
  const cliquer = (p, j, st) => {
    if (!d.modifiable || st.source === "agenda") return;
    poser.mutate({ email: p.email, jours: [j], motif: st.present ? motif : null });
  };
  const semaineEntiere = (p, sem) => {
    if (!d.modifiable) return;
    const tousAbsents = sem.every((j) => !p.jours[j].present && p.jours[j].source === "jules");
    poser.mutate({ email: p.email, jours: sem, motif: tousAbsents ? null : motif });
  };
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">Présences</h2>
        {d.modifiable && (
          <div className="inline-flex rounded-full bg-rail-actif p-1" role="radiogroup" aria-label="Motif posé au clic">
            {Object.entries(d.motifs).map(([k, mot]) => (
              <button key={k} type="button" role="radio" aria-checked={motif === k} onClick={() => setMotif(k)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ${motif === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={motif === k ? undefined : { background: "transparent" }}>
                <span className={`h-2 w-2 rounded-full ${TEINTES[k]}`} />{mot}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="m-0 mt-1 text-[13px] text-ardoise">
        {d.modifiable ? "Un clic sur un jour pose ou retire l'absence, avec le motif choisi ; Maj + clic pose ou retire la semaine entière." : "Jules dit qui est là. Les agendas Google s'y ajoutent quand ils sont lisibles."}
      </p>
      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[90px]" />
              {semaines.map((sem) => (
                <th key={sem[0]} colSpan={sem.length} className="px-2 pb-1 text-left text-[11.5px] font-normal text-brume">
                  semaine du {jourCourt(sem[0])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.equipe.map((p) => (
              <tr key={p.email}>
                <td className="pr-3 text-[13.5px] text-encre">{p.nom}</td>
                {semaines.map((sem) => sem.map((j, k) => {
                  const st = p.jours[j];
                  const auj = j === d.aujourdhui;
                  const titre = `${p.nom}, ${jourLong(j)} : ${st.present ? "là" : `${d.motifs[st.motif] || "absent"}${st.source === "agenda" ? " (agenda)" : ""}${st.note ? `, ${st.note}` : ""}`}`;
                  return (
                    <td key={j} className={`py-1 ${k === 0 ? "pl-2" : ""} ${k === sem.length - 1 ? "pr-2" : ""}`}>
                      <button type="button" onClick={(e) => (e.shiftKey ? semaineEntiere(p, sem) : cliquer(p, j, st))} title={titre} aria-label={titre} disabled={!d.modifiable || st.source === "agenda" || poser.isPending}
                        className={`grid h-7 w-7 place-items-center rounded-[7px] text-[10.5px] tabular-nums transition-colors ${st.present ? "bg-encre/[0.07] text-brume" : `${TEINTES[st.motif] || TEINTES.autre} text-encre`} ${st.source === "agenda" ? "ring-1 ring-inset ring-encre/30" : ""} ${auj ? "outline outline-1 outline-offset-1 outline-menthe" : ""} ${d.modifiable && st.source !== "agenda" ? "cursor-pointer hover:brightness-125" : "cursor-default"}`}>
                        {lettre(j)}
                      </button>
                    </td>
                  );
                }))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-ardoise">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] bg-encre/[0.07]" />Là</span>
        {Object.entries(d.motifs).map(([k, mot]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-[3px] ${TEINTES[k]}`} />{mot}</span>)}
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-encre/30" />Lu dans l'agenda</span>
        {d.modifiable && <span>Maj + clic : la semaine entière</span>}
      </div>
      {d.modifiable && d.agenda.etat !== "ok" && (
        <p className="m-0 mt-3 text-[12.5px] text-ambre">
          {d.agenda.etat === "api_desactivee" ? "Agendas Google non lus : l'API Google Calendar n'est pas activée dans le projet Google Cloud de Klocka. Une fois activée, les absences des agendas s'ajoutent seules." : d.agenda.etat === "non_connecte" ? "Aucun agenda Google connecté (Compte, « Connecter mon agenda »)." : `Agendas lus en partie. ${d.agenda.detail || ""}`}
        </p>
      )}
    </section>
  );
}

export default function Semaine() {
  const motifs = { ecole: "École", conges: "Congés", autre: "Absent" };
  const q = useQuery({ queryKey: ["semaine"], queryFn: () => base44.request("GET", "/api/semaine"), staleTime: 60000 });
  const d = q.data;
  const s = d?.semaine;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-8 md:px-8">
      <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">La semaine</h1>
      {s && (
        <p className="m-0 mt-1.5 text-[14px] text-ardoise">
          Aujourd'hui : {s.la.join(", ") || "personne"}.{s.absents.length ? ` ${s.absents.map((a) => `${a.nom} ${a.motif === "ecole" ? "à l'école" : a.motif === "conges" ? "en congés" : "absent"} jusqu'au ${jourLong(a.au)}`).join(" ; ")}.` : ""}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-5">
        {q.isLoading && (
          <div className="flex items-center gap-2 rounded-[14px] border border-trait bg-rail px-6 py-5 text-[13.5px] text-ardoise">
            <Loader2 className="h-4 w-4 animate-spin" />Lecture de la semaine. Un résumé de retour s'écrit en une minute environ.
          </div>
        )}
        {q.error && <p className="m-0 text-[13.5px] text-alerte">{q.error.message || "La semaine ne se charge pas."}</p>}
        {d?.retour && <Resume r={d.retour} titre={`Bon retour${d.moi ? `, ${d.moi}` : ""}`} sousTitre={`Ce qui s'est passé du ${jourLong(d.retour.du)} au ${jourLong(d.retour.au)}.`} />}
        {d?.depart && <AvantDePartir key={d.depart.du} depart={d.depart} motifs={motifs} />}
        {(d?.passations || []).map((r) => {
          const nom = r.sur.split("@")[0].split(".")[0].replace(/^./, (c) => c.toUpperCase());
          return <Resume key={r.id} r={r} titre={`Pendant l'absence de ${nom}`} sousTitre={`Jusqu'au ${jourLong(r.au)}.${r.avec_passation ? ` À partir de ce que ${nom} a laissé.` : ` ${nom} n'a rien laissé : écrit à partir de ses dossiers.`}`} />;
        })}
        <Presences />
      </div>
    </div>
  );
}
