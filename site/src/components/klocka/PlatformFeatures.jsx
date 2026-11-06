import { useEffect, useRef, useState } from "react";
import { IMG } from "@/lib/format";

// Initial slots: 0 top, 1 right, 2 bottom, 3 left (rotation clockwise)
const FEATURES = [
  ["Projets", "Toutes les informations au même endroit.", IMG + "4711cba5b_Screenshot2026-09-30at155228.png", 0],
  ["Simulateur", "Sécurisez votre investissement par les chiffres", IMG + "1fe297bb8_Screenshot2026-09-30at155145.png", 1],
  ["Vision", "Bâtissez sur le long terme avec notre planificateur de patrimoine", IMG + "542b5cd23_Screenshot2026-09-30at155306.png", 2],
  ["Tableau de bord", "Gardez le contrôle sur votre accompagnement et vos acquisitions", IMG + "dcdb4f551_Screenshot2026-09-30at155123.png", 3],
];
const slotStyle = (pos) => {
  const ang = (pos * Math.PI) / 2;
  const x = 50 + 50 * Math.sin(ang), y = 50 - 50 * Math.cos(ang);
  return { left: `${x}%`, top: `${y}%`, transform: `translate(-${x}%, -${y}%)` };
};

function Card({ title, desc, img, className = "", style }) {
  return (
    <div className={`rounded-[24px] bg-k-card border border-white/[0.08] p-4 flex items-center gap-4 ${className}`} style={style}>
      <img src={img} alt={title} loading="lazy" className="w-1/2 shrink-0 aspect-[3/2] object-cover object-top rounded-[16px]" />
      <div>
        <h3 className="text-[18px] text-white">{title}</h3>
        <p className="mt-1 text-[13px] leading-snug font-light text-white/80">{desc}</p>
      </div>
    </div>
  );
}

export default function PlatformFeatures() {
  const ref = useRef(null);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const update = () => {
      const r = ref.current.getBoundingClientRect();
      const p = Math.max(0, Math.min(1, -r.top / (r.height - window.innerHeight)));
      setStep(p * 2);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  const title = <h2 className="relative z-10 k-h2 !text-[clamp(28px,3vw,46px)] text-center max-w-[12ch]">Le tout sur une plateforme digitale facile d’accès</h2>;

  return (
    <>
      <section className="k-wrap k-section lg:hidden flex flex-col items-center gap-6">
        {title}
        <div className="grid sm:grid-cols-2 gap-6 w-full">
          {FEATURES.map(([t, d, img]) => <Card key={t} title={t} desc={d} img={img} />)}
        </div>
      </section>
      <section ref={ref} className="hidden lg:block relative h-[400vh]">
        <div className="sticky top-0 h-screen flex items-center k-wrap">
          <div className="relative w-full h-[min(100vh,900px)] flex items-center justify-center">
            {title}
            {FEATURES.map(([t, d, img, start]) => (
              <Card
                key={t} title={t} desc={d} img={img}
                className="absolute w-[32%]"
                style={slotStyle(start + step)}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
