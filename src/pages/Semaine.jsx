import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import Chargement from "@/components/ui/Chargement";

// L'Agenda de l'équipe (16 oct. 2026, Jules ; « Semaine » jusqu'au même jour).
// Jules pose les absences (école, congés) ; un clic sur un jour ouvre un
// briefing guidé par quelques questions : pour qui revient ce jour-là, ou,
// avant de partir, pour ceux qui restent ; la question sur la réunion se
// remplit avec les réunions enregistrées. Le destinataire le lit ici, le jour
// dit, avec le résumé court que Jules a relu. Aucun mail
// (server/equipe-semaine.js).

const etiq = "m-0 text-[11px] uppercase tracking-[.16em] text-brume";
const champ = "w-full rounded-champ border border-trait bg-surface px-3 py-2 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]";
const bloc = "rounded-[14px] border border-trait bg-rail px-6 py-5 max-md:px-4";
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

/** La fenêtre d'un briefing : pour qui, les questions, les réponses pré-remplies. */
function FenetreBriefing({ jour, onFermer }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agenda-briefing", jour], queryFn: () => base44.request("GET", `/api/semaine/briefing/${jour}`), enabled: !!jour, staleTime: 0 });
  const d = q.data;
  const [pour, setPour] = useState([]);
  const [reponses, setReponses] = useState({});
  useEffect(() => {
    if (!d) return;
    setPour(d.pour || []);
    setReponses(Object.fromEntries(d.questions.map((x) => [x.cle, x.reponse || ""])));
  }, [d]);
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", "/api/semaine/briefing", { body: { jour: d.jour, genre: d.genre, pour, du: d.periode?.du || null, au: d.periode?.au || null, reponses: d.questions.map((x) => ({ cle: x.cle, reponse: reponses[x.cle] || "" })) } }),
    onSuccess: (r) => {
      const noms = d.equipe.filter((x) => pour.includes(x.email)).map((x) => x.nom);
      const auj = new Date().toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" });
      toast.success(r.lu_le <= auj ? `Briefing envoyé à ${listeNoms(noms)}` : `${listeNoms(noms)} le lira ${jourLong(r.lu_le)}`);
      qc.invalidateQueries({ queryKey: ["agenda"] });
      onFermer();
    },
    onError: (e) => toast.error(e?.message || "Ça n'est pas parti."),
  });
  const titre = d ? (d.genre === "depart" ? "Le brief avant ton départ" : `Briefing du ${jourLong(d.jour)}`) : "Briefing";
  const sous = !d ? "" : d.genre === "depart"
    ? `Absent du ${jourLong(d.periode.du)} au ${jourLong(d.periode.au)} : ceux qui restent le liront ${jourLong(d.jour)}.`
    : d.periode ? `Pour qui revient ce jour-là, après une absence du ${jourLong(d.periode.du)} au ${jourLong(d.periode.au)}.` : "Pour qui ? Il le lira ce jour-là.";
  return (
    <Dialog open={!!jour} onOpenChange={(o) => { if (!o) onFermer(); }}>
      <DialogContent className="max-h-[88vh] max-w-[680px] overflow-y-auto">
        <DialogTitle className="text-[20px] font-normal text-encre">{titre}</DialogTitle>
        <DialogDescription className="text-[13px] text-ardoise">{sous}</DialogDescription>
        {q.error ? <p className="m-0 py-6 text-[13.5px] text-alerte">{q.error.message || "Le briefing ne s'ouvre pas."}</p> : q.isLoading || !d ? <Chargement /> : (
          <div className="mt-1">
            <p className={etiq}>Pour</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {d.equipe.map((x) => {
                const pris = pour.includes(x.email);
                return (
                  <button key={x.email} type="button" aria-pressed={pris} onClick={() => setPour((p) => (pris ? p.filter((e) => e !== x.email) : [...p, x.email]))}
                    className={`h-8 rounded-full border px-3.5 text-[13px] ${pris ? "border-menthe bg-menthe/[0.14] text-encre" : "border-trait text-ardoise hover:text-encre"}`} style={pris ? undefined : { background: "transparent" }}>
                    {x.nom}
                  </button>
                );
              })}
            </div>
            {d.questions.map((x) => (
              <label key={x.cle} className="mt-5 block">
                <span className="block text-[14px] text-encre">{x.question}</span>
                <span className="block text-[12.5px] text-brume">{x.aide}</span>
                <textarea value={reponses[x.cle] || ""} onChange={(e) => setReponses((r) => ({ ...r, [x.cle]: e.target.value }))} rows={x.cle === "reunion" || x.cle === "dossiers" ? 5 : 3} className={`${champ} mt-2 leading-[1.55]`} />
              </label>
            ))}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => envoyer.mutate()} disabled={envoyer.isPending || !pour.length}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol disabled:opacity-50">
                {envoyer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{d.deja ? "Mettre à jour le briefing" : "Envoyer le briefing"}
              </button>
              <span className="text-[12.5px] text-brume">Lu dans l'Agenda {jourLong(d.jour)}, avec une notification. Pas de mail.</span>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Un briefing à faire : pour qui revient, ou avant mon départ. */
function AFaire({ a, onOuvrir }) {
  const destinataires = a.noms.filter((n) => n !== "Jules").length ? a.noms.filter((n) => n !== "Jules") : a.noms;
  return (
    <section className={`${bloc} flex flex-wrap items-center justify-between gap-4`}>
      <div>
        <h2 className={titreBloc}>{a.genre === "depart" ? `Tu pars ${jourLong(a.jour)}` : `${a.noms[0]} revient ${jourLong(a.jour)}`}</h2>
        <p className="m-0 mt-1 text-[13px] text-ardoise">
          {a.genre === "depart" ? `Fais le brief à ${listeNoms(destinataires)} : où en sont tes dossiers, ce qu'il faut surveiller.` : "Fais-lui ton briefing : ce qui a avancé, ce qu'on a décidé, ce qui presse."}
          {a.fait ? " C'est fait ; tu peux le revoir." : ""}
        </p>
      </div>
      <button type="button" onClick={() => onOuvrir(a.jour)}
        className={a.fait ? "inline-flex h-10 items-center rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre" : "inline-flex h-10 items-center rounded-full bg-menthe px-5 text-[14px] text-sur-menthe hover:bg-menthe-survol"}
        style={a.fait ? { background: "transparent" } : undefined}>
        {a.fait ? "Revoir mon briefing" : a.genre === "depart" ? "Faire le brief" : "Faire mon briefing"}
      </button>
    </section>
  );
}

/** Jules : les briefings reçus pour la personne, le brouillon, sa correction, sa validation. */
function Relecture({ a }) {
  const qc = useQueryClient();
  const r = a.retour;
  const [objet, setObjet] = useState(r?.objet || "");
  const [texte, setTexte] = useState(r?.texte || "");
  useEffect(() => { setObjet(r?.objet || ""); setTexte(r?.texte || ""); }, [r?.genere_le, r?.objet, r?.texte]);
  const rafraichir = () => qc.invalidateQueries({ queryKey: ["agenda"] });
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
    onSuccess: (x) => { toast.success(x?.retour?.etat === "publie" ? `Paru dans l'Agenda de ${a.nom}` : `Validé : paraît ${jourLong(a.jour_retour)} matin`); rafraichir(); },
    onError: (e) => toast.error(e?.message || "Ça n'a pas pris."),
  });
  const modifie = r && (objet !== (r.objet || "") || texte !== (r.texte || ""));
  return (
    <section className={bloc}>
      <h2 className={titreBloc}>Le résumé pour {a.nom}</h2>
      <p className="m-0 mt-1 text-[13px] text-ardoise">Absent du {jourLong(a.du)} au {jourLong(a.au)} · paraît dans son Agenda {jourLong(a.jour_retour)} matin, une fois validé.</p>

      <p className={`${etiq} mt-5`}>Les briefings de l'équipe</p>
      <ul className="m-0 mt-2 list-none p-0">
        {a.briefings.map((b) => (
          <li key={b.nom} className="border-t border-trait py-2 text-[14px] leading-[1.55] first:border-t-0">
            <span className="text-encre">{b.nom}</span>
            {(b.reponses || []).map((x) => <span key={x.cle} className="block whitespace-pre-line text-craie"><span className="text-brume">{x.question} </span>{x.reponse}</span>)}
          </li>
        ))}
        {!a.briefings.length && <li className="text-[13.5px] text-brume">Personne n'a encore fait son briefing.</li>}
      </ul>
      {a.manquent.length > 0 && <p className="m-0 mt-2 text-[12.5px] text-ardoise">Pas encore fait : {listeNoms(a.manquent)}.</p>}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => brouillon.mutate()} disabled={brouillon.isPending}
          className="inline-flex h-9 items-center gap-2 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-50" style={{ background: "transparent" }}>
          {brouillon.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{r ? "Réécrire avec les derniers briefings" : "Écrire le brouillon"}
        </button>
        <span className="text-[12.5px] text-brume">À partir des briefings, des réunions et décisions, de l'activité de chacun et des nouveautés.</span>
      </div>

      {r && (
        <>
          <p className={`${etiq} mt-5`}>Le résumé</p>
          <input value={objet} onChange={(e) => setObjet(e.target.value)} className={`${champ} mt-2`} aria-label="Titre du résumé" />
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
            <span className="text-[12.5px] text-brume">{r.etat === "valide" ? `Validé : paraît ${jourLong(a.jour_retour)} matin.` : "Brouillon : rien ne paraît sans ta validation."}</span>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Les présences : une ligne par personne, un carré par jour ouvré. Un clic sur
 * un jour ouvre son briefing ; Jules, avec un motif choisi, pose ou retire une
 * absence (Maj + clic : la semaine entière).
 */
function Presences({ onBriefing }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["agenda-presences"], queryFn: () => base44.request("GET", "/api/semaine/presences?semaines=5") });
  const [mode, setMode] = useState("briefing");
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
  const absences = d.modifiable && mode !== "briefing";
  const cliquer = (e, p, j, st, sem) => {
    if (!absences) return onBriefing(j);
    if (st.source === "agenda") return;
    if (e.shiftKey) {
      const tous = sem.every((x) => !p.jours[x].present && p.jours[x].source === "jules");
      return poser.mutate({ email: p.email, jours: sem, motif: tous ? null : mode });
    }
    poser.mutate({ email: p.email, jours: [j], motif: st.present ? mode : null });
  };
  return (
    <section className={bloc}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className={titreBloc}>Présences</h2>
        {d.modifiable && (
          <div className="inline-flex rounded-full bg-rail-actif p-1" role="radiogroup" aria-label="Ce que fait un clic">
            {[["briefing", "Briefing"], ...Object.entries(d.motifs)].map(([k, mot]) => (
              <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12.5px] ${mode === k ? "bg-surface-pleine text-encre" : "text-ardoise hover:text-encre"}`} style={mode === k ? undefined : { background: "transparent" }}>
                {k !== "briefing" && <span className={`h-2 w-2 rounded-full ${TEINTES[k]}`} />}{mot}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="m-0 mt-1 text-[13px] text-ardoise">
        {absences ? `Un clic pose ou retire « ${d.motifs[mode]} » ; Maj + clic, la semaine entière.` : "Un clic sur un jour ouvre son briefing : pour qui revient ce jour-là, ou pour ceux qui restent quand tu pars."}
      </p>
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
                  const titre = `${p.nom}, ${jourLong(j)} : ${etat}${absences ? "" : ". Clic : le briefing de ce jour"}`;
                  return (
                    <td key={j} className={`py-1 ${k === 0 ? "pl-2" : ""} ${k === sem.length - 1 ? "pr-2" : ""}`}>
                      <button type="button" onClick={(e) => cliquer(e, p, j, st, sem)} title={titre} aria-label={titre} disabled={poser.isPending}
                        className={`grid h-7 w-7 cursor-pointer place-items-center rounded-[7px] text-[10.5px] tabular-nums transition-colors hover:brightness-125 ${st.present ? "bg-encre/[0.07] text-brume" : `${TEINTES[st.motif] || TEINTES.autre} text-encre`} ${st.source === "agenda" ? "ring-1 ring-inset ring-encre/30" : ""} ${auj ? "outline outline-1 outline-offset-1 outline-menthe" : ""}`}>
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
  const [briefing, setBriefing] = useState(null);
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
        <Presences onBriefing={setBriefing} />
        {d?.retour && <RetourRecu r={d.retour} moi={d.moi} />}
        {(d?.briefings || []).map((b) => <BriefingRecu key={b.id} b={b} />)}
        {(d?.a_faire || []).map((a) => <AFaire key={`${a.genre}:${a.jour}`} a={a} onOuvrir={setBriefing} />)}
        {(d?.a_relire || []).map((a) => <Relecture key={`${a.pour}:${a.du}`} a={a} />)}
      </div>
      {briefing && <FenetreBriefing key={briefing} jour={briefing} onFermer={() => setBriefing(null)} />}
    </div>
  );
}
