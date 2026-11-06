import { useLayoutEffect, useState } from "react";
import LinkedInBtn from "./LinkedInBtn";
import useHoverOpen from "./useHoverOpen";

function placement(el) {
  const r = el.getBoundingClientRect();
  const vw = window.innerWidth;
  const w = Math.min(380, vw - 48);
  if (vw >= 600 && vw - r.right > 400) return { top: 0, left: r.width + 14, width: w };
  if (vw >= 600 && r.left > 400) return { top: 0, left: -14 - w, width: w };
  const width = vw < 600 ? vw - 48 : w;
  const ideal = r.left + r.width / 2 - width / 2;
  const x = Math.max(24, Math.min(ideal, vw - 24 - width));
  return { top: r.height + 10, left: x - r.left, width };
}

export default function MemberCard({ p }) {
  const { open, ref, handlers } = useHoverOpen();
  const [pos, setPos] = useState({ top: 0, left: 0, width: 380 });
  const [below, setBelow] = useState(false);

  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const card = ref.current.firstChild;
    const pl = placement(card);
    setBelow(pl.top > 0);
    setPos(pl);
  }, [open]);

  return (
    <div>
      <div ref={ref} {...handlers} className="relative cursor-pointer" style={{ zIndex: open ? 30 : 1 }}>
        <div className="aspect-[3/4] rounded-[18px] overflow-hidden bg-black">
          <img
            src={p.image}
            alt={p.name}
            loading="eager"
            className="w-full h-full object-cover object-center"
            style={{ transform: open ? "scale(1.04)" : "scale(1)", transition: "transform 700ms cubic-bezier(.2,.7,.2,1)" }}
          />
        </div>
        <div
          className="absolute rounded-[20px] bg-[#0e1010] border border-white/[0.12]"
          style={{
            top: pos.top, left: pos.left, width: pos.width, padding: "26px 26px 24px",
            boxShadow: "0 30px 80px rgba(0,0,0,0.7)",
            opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none", visibility: open ? "visible" : "hidden",
            transform: `translateY(${open ? 0 : 8}px)`,
            transition: "opacity 280ms, transform 360ms cubic-bezier(.2,.7,.2,1), visibility 280ms",
          }}
          data-below={below}
        >
          <p className="text-[12px] uppercase tracking-[0.13em] text-k-sage">{p.role}</p>
          <h3 className="text-[24px] mt-2 font-light tracking-[-0.025em]">{p.name}</h3>
          <p className="text-[15px] mt-[14px] leading-[1.55] text-k-t2 font-light whitespace-pre-line">{p.bio}</p>
        </div>
      </div>
      <LinkedInBtn href={p.linkedin} name={p.name} />
    </div>
  );
}
