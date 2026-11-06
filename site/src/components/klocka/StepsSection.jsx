import { useEffect, useRef, useState } from "react";
import useInView from "@/hooks/useInView";
import Btn from "./Btn";
import { IMAGES } from "./carouselData";

const STEPS = [
  ["Acculturation en immobilier commercial", "Accédez à nos ressources pour que l’immobilier commercial n’ait plus de secret pour vous."],
  ["Définition de votre stratégie d’investissement", "Nous co-construisons ensemble une feuille de route d’investissement pour construire votre retraite et vos revenus complémentaires."],
  ["Sourcing de deals exclusifs", "Nos équipes vous sourcent des deals off-market, en phase avec votre stratégie d’investissement."],
  ["Analyse financière et juridique", "Nos experts analysent des opportunités sur le volet technique, financier et juridique pour sécuriser vos investissements."],
  ["Gestion locative", "Nous vous proposons la gestion locative de votre bien en toute sérénité."],
];

export default function StepsSection() {
  const [active, setActive] = useState(0);
  const [nonce, setNonce] = useState(0);
  const ref = useRef(null);
  const visible = useInView(ref, { once: false, threshold: 0.3 });

  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), 4200);
    return () => clearTimeout(t);
  }, [active, visible, nonce]);

  const go = (i) => { setActive(i); setNonce((n) => n + 1); };

  return (
    <section id="methode" ref={ref} className="k-wrap k-section">
      <div className="grid md:grid-cols-[repeat(2,minmax(340px,1fr))] gap-12 lg:gap-20 items-center">
        <div>
          <h2 className="k-h2">5 étapes pour bâtir <span className="text-gradient">votre patrimoine.</span></h2>
          <div className="mt-12 flex flex-col gap-1">
            {STEPS.map(([title], i) => {
              const on = i === active;
              return (
                <button
                  key={title}
                  onClick={() => go(i)}
                  className={`flex items-center gap-4 px-4 py-3.5 rounded-[14px] text-left transition-colors duration-500 ${on ? "bg-white/[0.055]" : "hover:bg-white/[0.03]"}`}
                >
                  <span className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center text-[12px] transition-colors duration-500 ${on ? "border-k-sage text-k-sage" : "border-white/20 text-white/45"}`}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className={`text-[16px] transition-colors duration-500 ${on ? "text-white" : "text-white/45"}`}>{title}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="relative h-[460px] md:h-[540px] rounded-[26px] overflow-hidden bg-k-card">
          {IMAGES.slice(0, 5).map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              loading="eager"
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: i === active ? 1 : 0, transition: "opacity 900ms var(--k-ease)" }}
            />
          ))}
          <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.55) 50%, rgba(0,0,0,0.9) 100%)" }} />
          <span className="absolute top-6 right-8 text-white/25 font-light leading-none" style={{ fontSize: "clamp(90px, 10vw, 160px)" }}>
            {String(active + 1).padStart(2, "0")}
          </span>
          <div className="absolute inset-x-0 bottom-0 p-8">
            <h3 className="text-[24px] text-white font-normal">{STEPS[active][0]}</h3>
            <p className="mt-3 text-[15px] text-k-t2 max-w-[38ch]">{STEPS[active][1]}</p>
            <div className="mt-8 flex gap-2">
              {STEPS.map((_, i) => (
                <div
                  key={i}
                  className={`h-[2px] flex-1 rounded-full transition-colors duration-500 ${i === active ? "bg-k-sage" : i < active ? "bg-white/60" : "bg-white/15"}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="mt-16 text-center"><Btn>Je me lance →</Btn></div>
    </section>
  );
}
