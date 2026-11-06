import SiteNav from "@/components/klocka/SiteNav";
import SiteFooter from "@/components/klocka/SiteFooter";

export default function PageShell({ title, highlight, intro, children }) {
  return (
    <div className="min-h-screen bg-black text-white font-light">
      <SiteNav />
      <main className="pt-[92px]">
        <section className="k-wrap" style={{ paddingBlock: "120px 60px" }}>
          <h1 className="k-h1 max-w-[16ch]">
            {title} {highlight && <span className="k-serif">{highlight}</span>}
          </h1>
          {intro && <p className="mt-9 max-w-[44ch] text-k-t3" style={{ fontSize: "clamp(18px, 1.6vw, 24px)", lineHeight: 1.45 }}>{intro}</p>}
        </section>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
