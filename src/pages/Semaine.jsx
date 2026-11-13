import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";

// L'Agenda de l'équipe (16 oct. 2026, Jules ; « Semaine » jusqu'au même jour).
// Jules pose les absences (école, congés). Les briefings déjà écrits se lisent
// ici, le jour dit ; on n'en écrit plus depuis un jour des Présences (6 nov.
// 2026). Aucun mail (server/equipe-semaine.js).

const bloc = "k-verre px-6 py-5 max-md:px-4";
const titreBloc = "m-0 text-[22px] font-normal tracking-[-0.01em] text-encre";
const TEINTES = { ecole: "bg-menthe/60", conges: "bg-ambre/60", autre: "bg-bord-vif" };
const jourLong = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const jourCourt = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });
const lettre = (j) => new Date(`${j}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "narrow", timeZone: "UTC" }).toUpperCase();
const listeNoms = (n) => (n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} et ${n[n.length - 1]}`);

/** Mon résumé, relu par Jules, paru le matin de mon retour. */
function RetourRecu({ r, moi }) {
  return (
    <section className={bloc}>
      <h2 className={titreBloc}>Bon retour{moi ? `, ${moi}` : ""}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">{r.objet} · du {jourLong(r.du)} au {jourLong(r.au)}, relu par Jules.</p>
      <div className="mt-4 whitespace-pre-line text-[15px] leading-[1.65] text-craie">{r.texte}</div>
    </section>
  );
}

/** Un briefing reçu : ses questions et ses réponses. */
function BriefingRecu({ b }) {
  return (
    <section className={bloc}>
      <h2 className={titreBloc}>Briefing de {b.de_nom}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">{b.genre === "depart" ? `Avant son départ · pour ${jourLong(b.jour)}` : `Pour ton retour, ${jourLong(b.jour)}`}</p>
      <dl className="m-0 mt-4">
        {b.reponses.map((r) => (
          <div key={r.cle} className="border-t border-trait py-2.5 first:border-t-0">
            <dt className="text-[12.5px] text-brume">{r.question}</dt>
            <dd className="m-0 mt-0.5 whitespace-pre-line text-[14.5px] leading-[1.6] text-craie">{r.reponse}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// Plus de briefing au clic sur un jour (6 nov. 2026, Jules : « enlève ») : un clic pose ou retire une absence, pour qui peut.
function Presences() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agenda-presences"], queryFn: () => base44.request("GET", "/api/semaine/presences?semaines=5") });
  const [mode, setMode] = useState(null);
  const poser = useMutation({
    mutationFn: (b) => base44.request("POST", "/api/semaine/absences", { body: b }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["agenda-presences"] }); qc.invalidateQueries({ queryKey: ["agenda"] }); },
    onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  const d = q.data;
  const semaines = useMemo(() => {
    const s = [];
    (d?.jours || []).forEach((j, i) => { const n = Math.floor(i / 5); (s[n] = s[n] || []).push(j); });
    return s;
  }, [d]);
  if (q.isLoading || !d) return <Chargement />;
  const motif = mode || Object.keys(d.motifs)[0];
  const absences = d.modifiable;
  const cliquer = (e, p, j, st, sem) => {
    if (!absences) return;
    if (st.source === "agenda") return;
    if (e.shiftKey) {
      const tous = sem.every((x) => !p.jours[x].present && p.jours[x].source === "jules");
      return poser.mutate({ email: p.email, jours: sem, motif: tous ? null : motif });
    }
    poser.mutate({ email: p.email, jours: [j], motif: st.present ? motif : null });
  };
  return (
    <section className={bloc}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={titreBloc}>Présences</h2>
        {d.modifiable && (
          <div className="inline-flex rounded-full bg-rail-actif p-1" role="radiogroup" aria-label="Ce que fait un clic">
            {Object.entries(d.motifs).map(([k, mot]) => (
              <button key={k} type="button" role="radio" aria-checked={motif === k} onClick={() => setMode(k)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ${motif === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={motif === k ? undefined : { background: "transparent" }}>
                <span className={`h-2 w-2 rounded-full ${TEINTES[k]}`} />{mot}
              </button>
            ))}
          </div>
        )}
      </div>
      {absences && <p className="m-0 mt-1 text-[13px] text-ardoise">{`Un clic pose ou retire « ${d.motifs[motif]} » ; Maj + clic, la semaine entière.`}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="w-[90px]" />
              {semaines.map((sem) => <th key={sem[0]} colSpan={sem.length} className="px-2 pb-1 text-left text-[11.5px] font-normal text-brume">semaine du {jourCourt(sem[0])}</th>)}
            </tr>
          </thead>
          <tbody>
            {d.equipe.map((p) => (
              <tr key={p.email}>
                <td className="pr-3 text-[13.5px] text-encre">{p.nom}</td>
                {semaines.map((sem) => sem.map((j, k) => {
                  const st = p.jours[j];
                  const auj = j === d.aujourdhui;
                  const etat = st.present ? "là" : `${d.motifs[st.motif] || "absent"}${st.source === "agenda" ? " (agenda)" : ""}${st.note ? `, ${st.note}` : ""}`;
                  const titre = `${p.nom}, ${jourLong(j)} : ${etat}`;
                  return (
                    <td key={j} className={`py-1 ${k === 0 ? "pl-2" : ""} ${k === sem.length - 1 ? "pr-2" : ""}`}>
                      <button type="button" onClick={(e) => cliquer(e, p, j, st, sem)} title={titre} aria-label={titre} disabled={!absences || poser.isPending}
                        className={`grid h-7 w-7 ${absences ? "cursor-pointer hover:brightness-125" : "cursor-default"} place-items-center rounded-[7px] text-[10.5px] tabular-nums transition-colors ${st.present ? "bg-encre/[0.07] text-brume" : `${TEINTES[st.motif] || TEINTES.autre} text-encre`} ${st.source === "agenda" ? "ring-1 ring-inset ring-encre/30" : ""} ${auj ? "outline outline-1 outline-offset-1 outline-menthe" : ""}`}>
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
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] ring-1 ring-inset ring-encre/30" />Lu dans l'agenda Google</span>
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
  const q = useQuery({ queryKey: ["agenda"], queryFn: () => base44.request("GET", "/api/semaine"), staleTime: 60000 });
  const d = q.data;
  const s = d?.semaine;
  return (
    <div className="mx-auto w-full max-w-[1100px] px-5 pb-16 pt-8 md:px-8">
      <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal tracking-[-0.02em] text-encre">Agenda</h1>
      {s && (
        <p className="m-0 mt-1.5 text-[14px] text-ardoise">
          Aujourd'hui : {listeNoms(s.la) || "personne"}.{s.absents.length ? ` ${s.absents.map((a) => `${a.nom} ${a.motif === "ecole" ? "à l'école" : a.motif === "conges" ? "en congés" : "absent"} jusqu'au ${jourLong(a.au)}`).join(" ; ")}.` : ""}
        </p>
      )}
      <div className="mt-6 flex flex-col gap-5">
        {/* Un seul chargement (16 oct. 2026, Jules) : celui des Présences, plus bas. */}
        {q.error && <p className="m-0 text-[13.5px] text-alerte">{q.error.message || "L'Agenda ne se charge pas."}</p>}
        <Presences />
        {d?.retour && <RetourRecu r={d.retour} moi={d.moi} />}
        {(d?.briefings || []).map((b) => <BriefingRecu key={b.id} b={b} />)}
        {/* Plus de blocs « … revient lundi, fais-lui ton briefing » ni « Le résumé pour … » (6 nov. 2026, Jules) : le
            briefing reste au clic sur un jour des Présences. */}
      </div>
    </div>
  );
}
