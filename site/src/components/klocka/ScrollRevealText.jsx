import { useEffect, useRef, useState } from "react";
import BrushHighlight from "./BrushHighlight";

const PARAS = [
  "Klocka accompagne les cadres et entrepreneurs dans l’acquisition de murs commerciaux déjà loués, et ce, partout en France.",
];

export default function ScrollRevealText({ paras = PARAS, highlight = paras === PARAS ? [[9, 12]] : null }) {
  const WORDS = paras.map((p) => p.split(" "));
  const TOTAL = WORDS.flat().length;
  const ref = useRef(null);
  const [lit, setLit] = useState(0);

  useEffect(() => {
    const update = () => {
      const r = ref.current.getBoundingClientRect();
      const vh = window.innerHeight;
      const start = vh * 0.85;
      const end = vh * 0.4;
      const p = (start - r.top) / (r.height + start - end);
      setLit(Math.round(Math.max(0, Math.min(1, p)) * TOTAL));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [TOTAL]);

  let idx = 0;
  return (
    <section className="k-wrap pt-24 pb-10">
      <div ref={ref} className="max-w-[1150px] mx-auto text-center flex flex-col gap-[1em]">
        {WORDS.map((words, pi) => (
          <p key={pi} className="k-h2">
            {(() => {
              const offset = idx;
              const spans = words.map((w, wi) => {
                const k = idx++;
                return (
                  <span key={wi} style={{ color: k < lit ? "#fff" : "rgba(255,255,255,0.14)", transition: "color 300ms var(--k-ease)" }}>
                    {w}{wi < words.length - 1 ? " " : ""}
                  </span>
                );
              });
              if (pi !== 0 || !highlight) return spans;
              const out = [];
              let pos = 0;
              highlight.forEach(([a, b]) => {
                out.push(...spans.slice(pos, a), <BrushHighlight key={"h" + a} progress={Math.max(0, Math.min(1, (lit - offset - a) / (b + 1 - a)))}>{spans.slice(a, b + 1)}</BrushHighlight>, " ");
                pos = b + 1;
              });
              return [...out, ...spans.slice(pos)];
            })()}
          </p>
        ))}
      </div>
    </section>
  );
}
