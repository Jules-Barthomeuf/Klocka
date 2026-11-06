import { useLayoutEffect, useRef, useState } from "react";

function Metric({ value, label }) {
  return (
    <div className="px-5">
      <p className="text-[18px] text-white font-light whitespace-nowrap">{value}</p>
      <p className="mt-1 text-[9.5px] uppercase tracking-[0.11em] text-k-label whitespace-nowrap">{label}</p>
    </div>
  );
}

export default function ProjectCard({ data }) {
  const [img, setImg] = useState(data.img);
  const [dark, setDark] = useState(false);
  const [shown, setShown] = useState(data.title);
  const [p, setP] = useState(1);
  const shownRef = useRef(data.title);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) { first.current = false; return; }
    const write = (v) => { shownRef.current = v; setShown(v); };
    setP(0);
    setDark(true);
    const t1 = setTimeout(() => { setImg(data.img); setDark(false); }, 450);

    const from = shownRef.current;
    const to = data.title;
    let k = from.length;
    let timer;
    const eraseStep = 420 / Math.max(1, from.length);
    const typeStep = 620 / Math.max(1, to.length);
    const type = () => { k++; write(to.slice(0, k)); if (k < to.length) timer = setTimeout(type, typeStep); };
    const erase = () => {
      k--; write(from.slice(0, Math.max(0, k)));
      if (k > 0) timer = setTimeout(erase, eraseStep);
      else { k = 0; timer = setTimeout(type, typeStep); }
    };
    timer = setTimeout(erase, eraseStep);

    const start = performance.now();
    let raf;
    const anim = (now) => {
      const t = Math.min(1, (now - start) / 900);
      setP(1 - Math.pow(1 - t, 3));
      if (t < 1) raf = requestAnimationFrame(anim);
    };
    raf = requestAnimationFrame(anim);

    return () => { clearTimeout(t1); clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [data.id]);

  return (
    <div className="w-[380px] h-[480px] rounded-[26px] bg-k-card border border-white/[0.06] overflow-hidden flex flex-col select-none">
      <div className="relative flex-1 bg-black rounded-[26px] overflow-hidden">
        <img
          src={img}
          alt=""
          draggable={false}
          loading="eager"
          className="absolute inset-0 w-full h-full object-cover"
          style={{ opacity: dark ? 0 : 1, transition: "opacity 450ms var(--k-ease)" }}
        />
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.35) 45%, rgba(12,14,14,0.92) 100%)" }} />
        <h3 className="absolute left-6 right-6 bottom-5 text-[23px] text-white font-light min-h-[1.3em] truncate">{shown}</h3>
      </div>
      <div className="grid grid-cols-3 divide-x divide-white/10 py-5">
        <Metric value={`${Math.round(data.price * p)}K €`} label="Prix de revient" />
        <Metric value={`${(data.yld * p).toFixed(2).replace(".", ",")} %`} label="Rendement" />
        <Metric value={`${Math.round(data.surface * p)} m²`} label="Surface" />
      </div>
    </div>
  );
}
