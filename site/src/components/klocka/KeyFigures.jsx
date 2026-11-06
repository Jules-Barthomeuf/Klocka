import { useRef } from "react";
import useInView from "@/hooks/useInView";
import useCounter from "@/hooks/useCounter";
import Btn from "./Btn";

const FIGURES = [
  { value: 100, prefix: "", suffix: " %", title: "délégué", text: "Vous nous déléguez l’ensemble du processus d’acquisition de vos murs de commerce : vous n’avez qu’à décider depuis votre canapé." },
  { value: 10, prefix: "x", suffix: "", title: "sur vos fonds propres", text: "Vos 50 000 € d’apport se transforment à terme en un patrimoine immobilier valorisé à 500 000 €." },
  { value: 0, prefix: "", suffix: " €", title: "d’effort d’épargne", text: "Les loyers commerciaux couvrent la mensualité de votre crédit, ainsi que les charges, vous n’avez rien à ressortir de votre poche." },
];

function Row({ f, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { threshold: 0.3 });
  const n = useCounter(f.value, inView, 1400, index * 140);
  const delay = `${index * 140}ms`;

  return (
    <div
      ref={ref}
      className="group grid grid-cols-[5fr_6fr] gap-6 md:gap-12 items-start"
      style={{
        opacity: inView ? 1 : 0,
        transform: inView ? "none" : "translateY(34px)",
        transition: `opacity 900ms var(--k-ease) ${delay}, transform 900ms var(--k-ease) ${delay}`,
      }}
    >
      <p className="k-serif text-right leading-[0.95]" style={{ fontSize: "clamp(56px, 9vw, 150px)" }}>
        {f.prefix}{n}{f.suffix}
      </p>
      <div className="pt-[0.4em]">
        <p className="text-white font-light tracking-[-0.02em]" style={{ fontSize: "clamp(20px, 2.2vw, 32px)" }}>{f.title}</p>
        <p className="k-body mt-3 text-k-t2 max-w-[40ch] md:opacity-0 md:translate-y-2 md:group-hover:opacity-100 md:group-hover:translate-y-0 transition-all duration-500">
          {f.text}
        </p>
      </div>
    </div>
  );
}

export default function KeyFigures() {
  return (
    <section className="k-section px-[6vw]">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-10">
        {FIGURES.map((f, i) => <Row key={f.title} f={f} index={i} />)}
      </div>
      <div className="mt-16 text-center"><Btn>Lancer mon projet →</Btn></div>
    </section>
  );
}
