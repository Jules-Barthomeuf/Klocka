import { useEffect, useRef, useState } from "react";
import ProjectCard from "./ProjectCard";
import { INITIAL, TITLES, CAROUSEL_IMAGES as IMAGES, randomMetrics } from "./carouselData";

const N = 12;
const STEP = 26.5;
const R = 820;
const D = 780;

export default function CardCarousel3D() {
  const [slots, setSlots] = useState(() => [...INITIAL, ...INITIAL].map((c, i) => ({ ...c, id: i })));
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const cardRefs = useRef([]);
  const st = useRef({ offset: 0, vel: 0, dragging: false, hover: false, lastX: 0, lastT: 0, resumeAt: 0, scale: 1 });

  // Animation loop: positions on an inner cylinder
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;
    let prev = performance.now();
    const tick = (now) => {
      const s = st.current;
      const dt = Math.min(now - prev, 50);
      prev = now;
      s.scale = Math.min(1.05, Math.max(0.85, window.innerWidth / 1500)) * 0.72;
      if (!s.dragging) {
        if (Math.abs(s.vel) > 0.00005) {
          s.offset += s.vel * dt;
          s.vel *= Math.pow(0.94, dt / 16);
        } else {
          s.vel = 0;
          if (!s.hover && now > s.resumeAt && !reduce) s.offset += dt / 3500;
        }
      }
      cardRefs.current.forEach((el, i) => {
        if (!el) return;
        let rel = (((i - s.offset) % N) + N) % N;
        if (rel >= N / 2) rel -= N;
        const deg = rel * STEP;
        const th = (deg * Math.PI) / 180;
        const x = R * Math.sin(th) * s.scale;
        const z = (D - R * Math.cos(th)) * s.scale;
        const a = Math.abs(deg);
        const op = a < 50 ? 1 : Math.max(0, 1 - (a - 50) / 30);
        el.style.transform = `translate(-50%,-50%) translate3d(${x}px,0,${z}px) rotateY(${-deg}deg) scale(${s.scale})`;
        el.style.opacity = op;
        el.style.visibility = op <= 0 ? "hidden" : "visible";
        el.dataset.visible = a < 55 ? "1" : "0";
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Live content changes on random visible cards
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let t;
    let titleIdx = 6;
    const recent = [];
    const loop = () => {
      t = setTimeout(() => {
        const visible = cardRefs.current
          .map((el, i) => (el && el.dataset.visible === "1" && !recent.includes(i) ? i : -1))
          .filter((i) => i >= 0);
        if (visible.length) {
          const i = visible[Math.floor(Math.random() * visible.length)];
          recent.push(i);
          if (recent.length > 4) recent.shift();
          const cur = slotsRef.current;
          const used = new Set(cur.filter((_, j) => cardRefs.current[j]?.dataset.visible === "1").map((c) => c.img));
          let pool = IMAGES.filter((im) => !used.has(im));
          if (!pool.length) pool = IMAGES.filter((im) => im !== cur[i].img);
          const next = {
            title: TITLES[titleIdx++ % TITLES.length],
            img: pool[Math.floor(Math.random() * pool.length)],
            ...randomMetrics(),
            id: cur[i].id + N,
          };
          setSlots((prev) => prev.map((p, j) => (j === i ? next : p)));
        }
        loop();
      }, 700 + Math.random() * 900);
    };
    loop();
    return () => clearTimeout(t);
  }, []);

  const onDown = (e) => {
    const s = st.current;
    s.dragging = true;
    s.vel = 0;
    s.lastX = e.clientX;
    s.lastT = performance.now();
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    const s = st.current;
    if (!s.dragging) return;
    const now = performance.now();
    const d = -(e.clientX - s.lastX) / (300 * s.scale);
    s.offset += d;
    s.vel = d / Math.max(1, now - s.lastT);
    s.lastX = e.clientX;
    s.lastT = now;
  };
  const onUp = () => {
    const s = st.current;
    if (!s.dragging) return;
    s.dragging = false;
    s.resumeAt = performance.now() + 2000;
  };

  return (
    <section
      aria-label="Exemples de projets"
      className="relative h-[560px] mt-4 overflow-hidden cursor-grab active:cursor-grabbing"
      style={{ touchAction: "pan-y" }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onPointerEnter={(e) => { if (e.pointerType === "mouse") st.current.hover = true; }}
      onPointerLeave={() => { st.current.hover = false; }}
    >
      <div className="absolute inset-0" style={{ perspective: "1200px", transformStyle: "preserve-3d" }}>
        {slots.map((data, i) => (
          <div
            key={i}
            ref={(el) => (cardRefs.current[i] = el)}
            className="absolute left-1/2 top-1/2 will-change-transform"
          >
            <ProjectCard data={data} />
          </div>
        ))}
      </div>
    </section>
  );
}
