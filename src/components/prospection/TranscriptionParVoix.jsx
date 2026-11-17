import React, { useEffect, useRef } from "react";
import { courbe } from "@/components/haka/BarreEcoute";
import { enBlocs, niveauVisible } from "@/lib/qui-parle";

// La transcription pendant l'appel, par interlocuteur (16 nov. 2026, maquette de Jules) : « Vous » à l'accent, le nom de
// l'agent en gris, la dictée pas encore étiquetée à la suite, sans nom ; dessous, les rubans de la dictée de
// l'assistant, qui ondulent avec la voix et changent de teinte selon qui parle. Qui parle se devine au niveau du son
// (src/lib/qui-parle.js) : un clic sur le nom corrige le bloc.

/**
 * Les rubans sous la transcription. `voix` : une réf { niveau (RMS du micro), qui, simule } mise à jour hors de React.
 */
export function RubansAppel({ voix }) {
  const svg = useRef(null);
  const rubans = [useRef(null), useRef(null), useRef(null)];
  useEffect(() => {
    let amp = 0, phase = 0, avant = 0, raf = 0, teinte = "";
    const calme = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const image = (t) => {
      const dt = avant ? Math.min(0.05, (t - avant) / 1000) : 0.016;
      avant = t;
      const v = voix.current || {};
      // En essai, pas de micro : l'impulsion de chaque phrase retombe doucement.
      if (v.simule) v.niveau = (v.niveau || 0) * 0.988;
      const n = v.simule ? Math.min(1, (v.niveau || 0) * 6) : niveauVisible(v.niveau);
      amp += (n - amp) * 0.12;
      phase += dt * (1.6 + amp * 5);
      const A = calme ? 1 : 1 + amp * 14;
      rubans[0].current?.setAttribute("d", courbe(A, 2.4, phase));
      rubans[1].current?.setAttribute("d", courbe(A * 0.75, 3.3, -phase * 1.3 + 1));
      rubans[2].current?.setAttribute("d", courbe(A * 0.5, 1.7, phase * 0.8 + 2));
      const qui = v.qui === "autre" ? "autre" : "vous";
      if (qui !== teinte && svg.current) { teinte = qui; svg.current.classList.toggle("k-rubans-autre", qui === "autre"); }
      raf = requestAnimationFrame(image);
    };
    raf = requestAnimationFrame(image);
    return () => cancelAnimationFrame(raf);
    // Les réfs ne changent pas.
  }, []);
  return (
    <svg ref={svg} className="k-rubans h-10 w-full flex-none overflow-visible" viewBox="0 0 300 40" preserveAspectRatio="none" aria-hidden>
      {rubans.map((r, i) => <path key={i} ref={r} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/**
 * @param {{ lignes: Array<{cle, texte, qui}>, enCours: {texte, qui}|null, nomAutre: string,
 *   onCorriger: (cles: Array, qui: string) => void, notes: boolean, rates?: number, voix: {current: object} }} props
 */
export default function TranscriptionParVoix({ lignes, enCours = null, nomAutre, onCorriger, notes, rates = 0, voix }) {
  const zone = useRef(null);
  const colle = useRef(true);
  // La dernière phrase reste en vue, sauf si on est remonté lire.
  useEffect(() => { const el = zone.current; if (el && colle.current) el.scrollTop = el.scrollHeight; });
  // La dictée coule comme une transcription ordinaire (16 nov. 2026, Jules) : les phrases pas encore étiquetées et celle en
  // cours se suivent dans un seul paragraphe, sans nom ni « en train de parler » ; l'étiquetage les range ensuite par voix.
  const blocs = enBlocs(lignes);
  const fin = blocs.length && !blocs[blocs.length - 1].qui ? blocs.pop() : null;
  const flux = [...(fin?.textes || []), enCours?.texte || ""].filter(Boolean).join(" ");
  const nom = (qui) => (qui === "vous" ? "Vous" : qui === "autre" ? nomAutre : null);
  const etiquette = (qui, cles) => {
    const n = nom(qui);
    return n ? (
      <span className="flex">
        <button type="button" onClick={() => onCorriger(cles, qui === "vous" ? "autre" : "vous")} title={`Ce n'est pas ${qui === "vous" ? "vous" : nomAutre} ? Un clic corrige`}
          className={`p-0 text-[13.5px] transition-opacity duration-300 animate-in fade-in-0 hover:opacity-75 ${qui === "vous" ? "text-menthe" : "text-ardoise"}`} style={{ background: "transparent" }}>{n}</button>
      </span>
    ) : null;
  };
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
      {/* Plus de titre ni de « Dernière phrase reçue » (16 nov. 2026, Jules) : la transcription seule. */}
      <div ref={zone} onScroll={(e) => { const el = e.currentTarget; colle.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
        className="flex min-h-[220px] max-h-[380px] flex-col gap-4 overflow-y-auto pr-1">
        {!blocs.length && !flux && <p className="m-0 text-[14px] text-brume">{notes ? "La transcription apparaît ici au fil de la parole, avec qui parle." : "Appel sans notes : rien n'est transcrit."}</p>}
        {blocs.map((b) => (
          <div key={b.cles[0]} className="flex flex-col gap-1">
            {etiquette(b.qui, b.cles)}
            <p className="m-0 text-[15px] leading-[1.55] text-encre [text-wrap:pretty]">{b.textes.join(" ")}</p>
          </div>
        ))}
        {flux && <p className="m-0 text-[15px] leading-[1.55] text-encre [text-wrap:pretty]">{flux}</p>}
        {rates > 0 && <p className="m-0 text-[13px] text-ambre">{rates} passage{rates > 1 ? "s" : ""} pas encore transcrit{rates > 1 ? "s" : ""} : nouvel essai au raccrochage.</p>}
      </div>
      {notes && <div className="mt-auto pt-2"><RubansAppel voix={voix} /></div>}
    </div>
  );
}
