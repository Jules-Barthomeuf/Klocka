import LinkedInBtn from "./LinkedInBtn";
import useHoverOpen from "./useHoverOpen";

const E = "cubic-bezier(.2,.7,.2,1)";

export default function FounderCard({ p }) {
  const { open, ref, handlers } = useHoverOpen();
  return (
    <div>
      <div ref={ref} {...handlers} className="relative aspect-[3/4] rounded-[18px] overflow-hidden bg-black cursor-pointer">
        <div
          className="absolute inset-0 bg-no-repeat bg-cover"
          style={{ backgroundImage: `url(${p.image})`, backgroundPosition: p.pos, transform: open ? "scale(1.04)" : "scale(1)", transition: `transform 700ms ${E}` }}
        />
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.94) 0%, rgba(0,0,0,0.8) 45%, rgba(0,0,0,0.35) 80%, transparent 100%)", opacity: open ? 1 : 0, transition: "opacity 500ms" }}
        />
        <div
          className="absolute left-[22px] right-[22px] bottom-[22px] overflow-y-auto"
          style={{ maxHeight: "calc(100% - 44px)", opacity: open ? 1 : 0, transform: `translateY(${open ? 0 : 14}px)`, transition: `opacity 500ms, transform 600ms ${E}` }}
        >
          <p className="text-[12px] uppercase tracking-[0.13em] text-k-sage">{p.role}</p>
          <h3 className="text-[24px] mt-2 leading-[1.15] tracking-[-0.025em] font-light">{p.name}</h3>
          <p className="text-[15px] mt-[10px] leading-[1.5] text-[#e8eceb] font-light">{p.bio}</p>
        </div>
      </div>
      <LinkedInBtn href={p.linkedin} name={p.name} />
    </div>
  );
}
