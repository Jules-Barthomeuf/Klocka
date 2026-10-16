import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";

// La semaine de l'équipe (16 oct. 2026, Jules) : qui est là, ce qu'on a
// manqué. Jules pose les absences (école, congés) ; pendant l'absence de
// quelqu'un, chacun écrit son point de la semaine pour lui ; Jules relit le
// brouillon court qui en sort, le corrige, le valide ; il part par mail le
// matin du retour et s'affiche ici (server/equipe-semaine.js).

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
const TEINTES = { ecole: "bg-menthe/60", conges: "bg-ambre/60", autre: "bg-bord-vif" };
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const lettre = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "narrow", timeZone: "UTC" }).toUpperCase();

/** Mon résumé, reçu le matin de mon retour (relu par Jules, parti aussi par mail). */
function RetourRecu({ r, moi }) {
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">Bon retour{moi ? `, ${moi}` : ""}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">{r.objet} · du {jourLong(r.du)} au {jourLong(r.au)}, relu par Jules.</p>
      <div className="mt-4 whitespace-pre-line text-[15px] leading-[1.65] text-craie">{r.texte}</div>
    </section>
  );
}

/** Mon point de la semaine pour quelqu'un d'absent. */
function MonPoint({ a }) {
  const qc = useQueryClient();
  const [texte, setTexte] = useState(a.mon_point || "");
  const enregistrer = useMutation({
    mutationFn: () => base44.request("POST", "/api/semaine/points", { body: { pour: a.pour, du: a.du, au: a.au, texte } }),
    onSuccess: () => { toast.success(`Point enregistré pour ${a.nom}`); qc.invalidateQueries({ queryKey: ["semaine"] }); },
    onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">{a.nom} revient {jourLong(a.jour_retour)}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Ton point de la semaine, en quelques lignes : ce que tu as fait, ce qu'{a.nom === "Maxime" || a.nom === "Jules" ? "il" : "elle"} doit savoir. Jules relit le tout, et le résumé part par mail le matin du retour.</p>
      <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={4} className={`${champ} mt-3`} placeholder="Ex. : rappelé Durand (deux murs à Antibes, fiches jeudi) ; bail reçu sur Murs Antibes ; on a décidé d'arrêter Libourne." />
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => enregistrer.mutate()} disabled={enregistrer.isPending || texte.trim() === (a.mon_point || "").trim()}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
          {enregistrer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{a.mon_point ? "Mettre à jour" : "Enregistrer mon point"}
        </button>
        {a.mon_point && <span className="text-[12.5px] text-brume">Enregistré.</span>}
      </div>
    </section>
  );
}

/** Jules : les points de chacun, le brouillon, sa correction, sa validation. */
function Relecture({ a }) {
  const qc = useQueryClient();
  const r = a.retour;
  const [objet, setObjet] = useState(r?.objet || "");
  const [texte, setTexte] = useState(r?.texte || "");
  useEffect(() => { setObjet(r?.objet || ""); setTexte(r?.texte || ""); }, [r?.genere_le, r?.objet, r?.texte]);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["semaine"] });
  const brouillon = useMutation({
    mutationFn: () => base44.request("POST", "/api/semaine/retours/brouillon", { body: { pour: a.pour, du: a.du, au: a.au } }),
    onSuccess: rafraichir, onError: (e) => toast.error(e?.message || "Le brouillon ne s'est pas écrit."),
  });
  const corriger = useMutation({
    mutationFn: () => base44.request("POST", `/api/semaine/retours/${r.id}`, { body: { objet, texte } }),
    onSuccess: () => { toast.success("Correction enregistrée"); rafraichir(); }, onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  const valider = useMutation({
    mutationFn: () => base44.request("POST", `/api/semaine/retours/${r.id}/valider`, { body: { objet, texte } }),
    onSuccess: (x) => { toast.success(x?.retour?.etat === "envoye" ? `Envoyé à ${a.nom}` : `Validé : part ${jourLong(a.jour_retour)} matin`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  const modifie = r && (objet !== (r.objet || "") || texte !== (r.texte || ""));
  return (
    <section className="rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4">
      <h2 className="m-0 text-[22px] font-normal tracking-[-0.01em] text-encre">Le résumé pour {a.nom}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Absent du {jourLong(a.du)} au {jourLong(a.au)} · part par mail {jourLong(a.jour_retour)} matin, une fois validé.</p>

      <p className={`${etiq} mt-5`}>Les points de l'équipe</p>
      <ul className="m-0 mt-2 list-none p-0">
        {a.points.map((p) => (
          <li key={p.nom} className="border-t border-trait py-2 text-[14px] leading-[1.55] first:border-t-0">
            <span className="text-encre">{p.nom}</span><span className="text-brume"> · {new Date(p.ecrit_le).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short" })}</span>
            <span className="block whitespace-pre-line text-craie">{p.texte}</span>
          </li>
        ))}
        {!a.points.length && <li className="text-[13.5px] text-brume">Personne n'a encore écrit son point.</li>}
      </ul>
      {a.manquent.length > 0 && <p className="m-0 mt-2 text-[12.5px] text-ardoise">Pas encore écrit : {a.manquent.join(", ")}.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => brouillon.mutate()} disabled={brouillon.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {brouillon.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{r ? "Réécrire avec les derniers points" : "Écrire le brouillon"}
        </button>
        <span className="text-[12.5px] text-brume">À partir des points, des réunions et décisions, de l'activité de chacun et des nouveautés.</span>
      </div>

      {r && (
        <>
          <p className={`${etiq} mt-5`}>Le mail</p>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} className={`${champ} mt-2`} aria-label="Objet du mail" />
          <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={14} className={`${champ} mt-2 leading-[1.6]`} aria-label="Texte du résumé" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => valider.mutate()} disabled={valider.isPending || !texte.trim()}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
              {valider.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{r.etat === "valide" ? "Valider à nouveau" : "Valider"}
            </button>
            {modifie && (
              <button type="button" onClick={() => corriger.mutate()} disabled={corriger.isPending}
                className="inline-flex h-10 items-center rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" style={{ background: "transparent" }}>Enregistrer sans valider</button>
            )}
            <span className="text-[12.5px] text-brume">{r.etat === "valide" ? `Validé : part ${jourLong(a.jour_retour)} matin.` : "Brouillon : rien ne part sans ta validation."}</span>
          </div>
        </>
      )}
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
        {q.isLoading && <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-ardoise" /></div>}
        {q.error && <p className="m-0 text-[13.5px] text-alerte">{q.error.message || "La semaine ne se charge pas."}</p>}
        {d?.retour && <RetourRecu r={d.retour} moi={d.moi} />}
        {(d?.a_ecrire || []).map((a) => <MonPoint key={`${a.pour}:${a.du}`} a={a} />)}
        {(d?.a_relire || []).map((a) => <Relecture key={`${a.pour}:${a.du}`} a={a} />)}
        <Presences />
      </div>
    </div>
  );
}
