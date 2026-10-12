import React, { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import FondHalo from "@/components/projet/FondHalo";
import RendezVousFondateur, { useVisiteSimulateur } from "@/components/simulator/RendezVousFondateur";
import { PROFILS, QUESTIONS, profilDuQuiz } from "@/lib/outils-investisseur";

// « Quel investisseur en murs êtes-vous ? » (9 oct. 2026) : la page publique
// d'un asset des newsletters. Cinq questions, un profil (prudent, rendement,
// patrimonial). Avec le jeton du lien (k), le profil se range dans la fiche du
// contact (champ type_investisseur) ; sans jeton, rien n'est noté.

const CARTE = "rounded-[18px] border border-trait bg-surface";

export default function QuizInvestisseur() {
  const [reponses, setReponses] = useState([]);
  const fini = reponses.length === QUESTIONS.length;
  const resultat = useMemo(() => (fini ? profilDuQuiz(reponses) : null), [fini, reponses]);
  const { visite, qui } = useVisiteSimulateur(resultat ? { profil: resultat.profil, ...resultat.scores } : null, "quiz");
  const q = QUESTIONS[reponses.length];
  const p = resultat && PROFILS[resultat.profil];
  const k = visite?.k ? `?k=${encodeURIComponent(visite.k)}` : "";

  return (
    <div className="relative min-h-screen">
      <FondHalo />
      <div className="relative z-10 mx-auto max-w-[640px] px-4 pb-24 pt-14 max-md:pt-8">
        <div className="mb-8 text-center">
          <img src="/logo-klocka.svg" alt="Klocka" className="mx-auto mb-6 h-10 w-10 rounded-[8px]" draggable={false} />
          <h1 className="m-0 text-[clamp(22px,2.1vw,30px)] font-normal leading-[1.2] tracking-[-0.02em] text-encre">
            {p ? p.nom : "Quel investisseur en murs êtes-vous ?"}
          </h1>
          <p className="mx-auto m-0 mt-3 max-w-[480px] text-[15px] leading-[1.6] text-ardoise">
            {p ? p.phrase : "Cinq questions pour savoir quels commerces vous correspondent."}
          </p>
        </div>

        {!fini ? (
          <div key={reponses.length} className={`${CARTE} p-6 duration-300 animate-in fade-in-0 slide-in-from-right-4 max-md:p-4`}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] uppercase tracking-[.14em] text-brume">Question {reponses.length + 1} sur {QUESTIONS.length}</span>
              {reponses.length > 0 && (
                <button type="button" onClick={() => setReponses((r) => r.slice(0, -1))} aria-label="Question précédente" title="Question précédente"
                  className="grid h-8 w-8 place-items-center rounded-full text-ardoise hover:text-encre" style={{ background: "transparent" }}>
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="mt-3 flex gap-1">
              {QUESTIONS.map((_, i) => <span key={i} className={`h-[5px] flex-1 rounded-full ${i < reponses.length ? "bg-menthe" : i === reponses.length ? "bg-menthe/45" : "bg-encre/[0.12]"}`} />)}
            </div>
            <h2 className="m-0 mt-6 text-[20px] font-normal leading-[1.35] text-encre">{q.question}</h2>
            <div className="mt-5 flex flex-col gap-2">
              {q.choix.map(([profil, texte]) => (
                <button key={texte} type="button" onClick={() => setReponses((r) => [...r, profil])}
                  className="group flex items-center justify-between gap-3 rounded-[10px] border border-trait px-4 py-3.5 text-left text-[15px] text-craie transition-colors hover:border-menthe hover:text-encre"
                  style={{ background: "transparent" }}>
                  {texte}<ArrowRight className="h-4 w-4 flex-none text-brume group-hover:text-menthe" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={`${CARTE} p-6 duration-300 animate-in fade-in-0 max-md:p-4`}>
            <p className="m-0 text-[15px] leading-[1.7] text-craie">{p.texte}</p>
            <div className="mt-5 rounded-[10px] border border-trait bg-relief px-4 py-3">
              <p className="m-0 text-[11px] uppercase tracking-[.14em] text-brume">Ce qui vous correspond</p>
              <p className="m-0 mt-1 text-[15px] text-encre">{p.cible}</p>
            </div>
            <div className="mt-5 flex flex-col gap-2">
              {Object.keys(PROFILS).map((cle) => (
                <div key={cle} className="flex items-center gap-3">
                  <span className={`w-[110px] text-[13.5px] ${cle === resultat.profil ? "text-encre" : "text-ardoise"}`}>{cle === "prudent" ? "Prudent" : cle === "rendement" ? "Rendement" : "Patrimonial"}</span>
                  <span className="flex h-[5px] flex-1 gap-1">
                    {QUESTIONS.map((_, i) => <span key={i} className={`flex-1 rounded-full ${i < resultat.scores[cle] ? (cle === resultat.profil ? "bg-menthe" : "bg-menthe/45") : "bg-encre/[0.12]"}`} />)}
                  </span>
                  <span className="w-8 text-right text-[12.5px] tabular-nums text-ardoise">{resultat.scores[cle]}/{QUESTIONS.length}</span>
                </div>
              ))}
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              <RendezVousFondateur visite={visite} qui={qui} libelle="En parler au fondateur" />
              <a href={`/VisionRetraite${k}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-trait px-3.5 text-xs text-craie hover:border-menthe hover:text-encre">Construire mon plan retraite<ArrowRight className="h-3.5 w-3.5" /></a>
              <button type="button" onClick={() => setReponses([])} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs text-ardoise hover:text-encre" style={{ background: "transparent" }}><RotateCcw className="h-3.5 w-3.5" />Refaire</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
