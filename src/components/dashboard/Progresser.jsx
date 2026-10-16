import React, { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "@/components/ui/avis";
import Chargement from "@/components/ui/Chargement";

// Pour progresser (16 oct. 2026, Jules) : le tuto ultra-ciblé de deux minutes
// après un blocage (une objection non levée, ou « Sur quoi as-tu bloqué ? »),
// et le lendemain, « Je t'ai préparé un petit quiz ! ». Sur le Dashboard,
// seulement ce qui attend : le quiz du jour, les tutos pas encore lus.

function Fenetre({ children, onFermer, label }) {
  return createPortal(
    <div className="fixed inset-0 z-[85] flex items-center justify-center bg-fond/70 p-6 backdrop-blur-xl duration-300 animate-in fade-in-0 md:left-[var(--k-barre-largeur,0px)] max-md:p-3" role="dialog" aria-modal="true" aria-label={label}>
      <div className="relative flex max-h-[92dvh] w-full max-w-[680px] flex-col overflow-y-auto rounded-[28px] border border-trait bg-fond px-10 pb-9 pt-10 shadow-[0_18px_40px_rgb(0_0_0/0.18)] max-md:px-5">
        <button type="button" onClick={onFermer} aria-label="Fermer" className="absolute right-5 top-5 grid h-9 w-9 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}><X className="h-4 w-4" /></button>
        {children}
      </div>
    </div>,
    document.body,
  );
}

function Article({ t, onFermer }) {
  const queryClient = useQueryClient();
  const lu = useMutation({
    mutationFn: () => base44.request("POST", `/api/coaching/${t.id}/lu`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["coaching"] }); onFermer(); toast("Bien lu", { description: t.quiz?.length ? "Demain matin, trois questions pour vérifier que c'est acquis." : null }); },
  });
  return (
    <Fenetre onFermer={onFermer} label={t.titre}>
      <span className="k-monte text-[11px] tracking-[.16em] text-brume">TUTO · 2 MINUTES</span>
      <p className="k-reflet m-0 mt-2 text-[28px] font-normal leading-[1.15] tracking-[-0.02em] max-md:text-[24px]">{t.titre}</p>
      {t.accroche && <p className="k-monte m-0 mt-3 text-[16px] leading-[1.55] text-craie" style={{ animationDelay: ".6s" }}>{t.accroche}</p>}
      <div className="k-monte mt-6 flex flex-col gap-5" style={{ animationDelay: ".9s" }}>
        {t.etapes.map((e, i) => (
          <div key={e.titre} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
            <span className="grid h-7 w-7 place-items-center rounded-full border border-encre/25 text-[13px] tabular-nums text-encre">{i + 1}</span>
            <div className="flex flex-col gap-1"><span className="text-[16px] text-encre">{e.titre}</span><span className="text-[15px] leading-[1.6] text-craie">{e.texte}</span></div>
          </div>
        ))}
      </div>
      {t.phrases?.length > 0 && (
        <div className="k-monte mt-7 flex flex-col gap-2 rounded-[16px] border border-trait px-5 py-4" style={{ animationDelay: "1.1s" }}>
          <span className="text-[11px] tracking-[.16em] text-brume">À DIRE, MOT POUR MOT</span>
          {t.phrases.map((p) => <p key={p} className="m-0 text-[15px] leading-[1.55] text-encre">« {p} »</p>)}
        </div>
      )}
      {t.piege && <p className="k-monte m-0 mt-5 text-[14.5px] leading-[1.55] text-ambre" style={{ animationDelay: "1.2s" }}>Le piège : {t.piege}</p>}
      <button type="button" onClick={() => lu.mutate()} disabled={lu.isPending} className="k-monte mt-8 h-14 self-center rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90 disabled:opacity-60" style={{ animationDelay: "1.4s" }}>C'est noté →</button>
    </Fenetre>
  );
}

function Quiz({ t, onFermer }) {
  const queryClient = useQueryClient();
  const [reponses, setReponses] = useState([]);
  const [resultat, setResultat] = useState(null);
  const envoyer = useMutation({
    mutationFn: () => base44.request("POST", `/api/coaching/${t.id}/quiz`, { body: { reponses } }),
    onSuccess: (r) => { setResultat(r); queryClient.invalidateQueries({ queryKey: ["coaching"] }); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const complet = t.quiz.every((_, i) => Number.isInteger(reponses[i]));
  return (
    <Fenetre onFermer={onFermer} label="Petit quiz">
      <span className="text-[11px] tracking-[.16em] text-brume">PETIT QUIZ · {t.quiz.length} QUESTIONS</span>
      <p className="k-reflet m-0 mt-2 text-[28px] font-normal leading-[1.15] tracking-[-0.02em] max-md:text-[24px]">{resultat ? `${resultat.score} sur ${resultat.sur}` : "Je t'ai préparé un petit quiz !"}</p>
      <p className="m-0 mt-2 text-[15px] text-ardoise">Sur « {t.titre} », lu hier.</p>
      <div className="mt-7 flex flex-col gap-6">
        {t.quiz.map((q, i) => {
          const c = resultat?.corrections?.[i];
          return (
            <div key={q.question} className="flex flex-col gap-2.5">
              <p className="m-0 text-[16px] leading-[1.45] text-encre">{i + 1}. {q.question}</p>
              <div className="flex flex-col gap-2">
                {q.choix.map((x, k) => {
                  const choisi = reponses[i] === k;
                  const bonne = c && c.bonne === k;
                  const fausse = c && choisi && !c.juste;
                  return (
                    <button key={x} type="button" disabled={!!resultat} onClick={() => setReponses((r) => { const n = [...r]; n[i] = k; return n; })}
                      className={`flex items-center justify-between gap-3 rounded-[14px] border px-4 py-2.5 text-left text-[14.5px] transition-colors ${bonne ? "border-menthe bg-menthe/10 text-encre" : fausse ? "border-alerte/60 text-encre" : choisi ? "border-encre text-encre" : "border-trait text-craie hover:border-bord-vif"}`}
                      style={bonne || choisi ? undefined : { background: "transparent" }}>
                      <span>{x}</span>{bonne && <Check className="h-4 w-4 flex-none text-menthe" />}
                    </button>
                  );
                })}
              </div>
              {c?.explication && <p className="m-0 text-[13.5px] leading-[1.5] text-ardoise">{c.explication}</p>}
            </div>
          );
        })}
      </div>
      {resultat ? (
        <button type="button" onClick={onFermer} className="mt-8 h-14 self-center rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90">{resultat.score === resultat.sur ? "Parfait, à demain →" : "Compris →"}</button>
      ) : (
        <button type="button" onClick={() => envoyer.mutate()} disabled={!complet || envoyer.isPending} className="mt-8 h-14 self-center rounded-full bg-encre px-9 text-[17px] text-fond hover:opacity-90 disabled:opacity-40">Vérifier</button>
      )}
    </Fenetre>
  );
}

export default function Progresser({ className = "" }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ["coaching"], queryFn: () => base44.request("GET", "/api/coaching"), refetchInterval: 5 * 60 * 1000 });
  const [lecture, setLecture] = useState(null);
  const [quiz, setQuiz] = useState(null);
  const [sujet, setSujet] = useState("");
  const demander = useMutation({
    mutationFn: () => base44.request("POST", "/api/coaching/tuto", { body: { sujet } }),
    onSuccess: (r) => { setSujet(""); queryClient.invalidateQueries({ queryKey: ["coaching"] }); setLecture(r.tuto); },
    onError: (e) => toast.error(e?.message || "Impossible"),
  });
  const aLire = data?.a_lire || [];
  const quizDuJour = data?.quiz || [];
  return (
    <section className={`rounded-[18px] border border-trait bg-rail px-5 pb-4 pt-4 ${className}`}>
      <p className="m-0 mb-3 text-[11px] tracking-[.16em] text-brume">POUR PROGRESSER</p>
      {quizDuJour.map((t) => (
        <button key={`q-${t.id}`} type="button" onClick={() => setQuiz(t)} className="mb-2 flex w-full items-center justify-between gap-3 rounded-[14px] border border-menthe/40 bg-menthe/[0.08] px-4 py-3 text-left hover:border-menthe">
          <span className="flex min-w-0 flex-col"><span className="text-[15px] text-encre">Je t'ai préparé un petit quiz !</span><span className="truncate text-[13px] text-ardoise">Trois questions sur « {t.titre} »</span></span>
          <span className="flex-none text-[13.5px] text-menthe">Jouer →</span>
        </button>
      ))}
      {aLire.map((t) => (
        <button key={t.id} type="button" onClick={() => setLecture(t)} className="flex w-full items-center justify-between gap-3 border-t border-trait py-3 text-left first:border-t-0" style={{ background: "transparent" }}>
          <span className="flex min-w-0 items-center gap-3"><BookOpen className="h-4 w-4 flex-none text-menthe" /><span className="flex min-w-0 flex-col"><span className="truncate text-[15px] text-encre">{t.titre}</span><span className="text-[12.5px] text-ardoise">{t.source === "objection" ? "Après ton appel" : "Tu l'as demandé"} · 2 minutes</span></span></span>
          <span className="flex-none text-[13.5px] text-craie">Lire →</span>
        </button>
      ))}
      <form onSubmit={(e) => { e.preventDefault(); if (sujet.trim().length >= 4) demander.mutate(); }} className={`flex flex-wrap items-center gap-2 ${aLire.length || quizDuJour.length ? "mt-3 border-t border-trait pt-3" : ""}`}>
        <input value={sujet} onChange={(e) => setSujet(e.target.value)} placeholder="Sur quoi as-tu bloqué ? « négocier avec un DAF »"
          className="h-10 min-w-[220px] flex-1 rounded-full border border-trait bg-transparent px-4 text-[14px] text-encre outline-none placeholder:text-brume focus:border-menthe max-md:text-[16px]" />
        <button type="submit" disabled={sujet.trim().length < 4 || demander.isPending} className="h-10 rounded-full border border-trait px-4 text-[13.5px] text-craie hover:border-menthe hover:text-encre disabled:opacity-40" style={{ background: "transparent" }}>Prépare-moi un tuto</button>
      </form>
      {demander.isPending && <Chargement taille="petit" titre="Ton tuto" etats={["Je cerne le moment qui bloque", "J'écris les phrases à dire", "Je prépare le quiz de demain"]} />}
      {lecture && <Article t={lecture} onFermer={() => setLecture(null)} />}
      {quiz && <Quiz t={quiz} onFermer={() => setQuiz(null)} />}
    </section>
  );
}
