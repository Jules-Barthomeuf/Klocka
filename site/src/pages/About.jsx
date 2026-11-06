import Navbar from "@/components/klocka/SiteNav";
import Footer from "@/components/klocka/SiteFooter";
import FounderCard from "@/components/klocka/team/FounderCard";
import MemberCard from "@/components/klocka/team/MemberCard";
import { FOUNDERS, MEMBERS } from "@/components/klocka/team/teamData";
import { INVEST_URL } from "@/lib/format";

export default function About() {
  return (
    <div className="min-h-screen bg-black text-white font-light">
      <Navbar />
      <main className="pt-[92px]">
        <section className="max-w-[1500px] mx-auto text-left" style={{ padding: "120px 6vw 100px" }}>
          <h1 className="font-light max-w-[16ch]" style={{ fontSize: "clamp(38px, 6vw, 100px)", lineHeight: 1.02, letterSpacing: "-0.035em" }}>
            L’équipe <span className="k-serif">Klocka</span>
          </h1>
          <p className="mt-9 max-w-[40ch] text-k-t3" style={{ fontSize: "clamp(18px, 1.6vw, 24px)", lineHeight: 1.45 }}>
            Des experts de l’immobilier commercial et du financement qui accompagnent chaque investisseur, de la stratégie à la gestion du bien.
          </p>
        </section>

        <section className="max-w-[1100px] mx-auto" style={{ padding: "0 6vw 72px" }}>
          <div className="grid justify-center grid-cols-1 sm:grid-cols-[repeat(auto-fit,minmax(260px,340px))]" style={{ gap: "clamp(20px, 2.4vw, 32px)" }}>
            {FOUNDERS.map((p) => <FounderCard key={p.name} p={p} />)}
          </div>
        </section>

        <section className="max-w-[1100px] mx-auto" style={{ padding: "0 6vw 180px" }}>
          <div className="grid grid-cols-2 md:grid-cols-4 max-w-[992px] mx-auto" style={{ gap: "clamp(16px, 2vw, 24px)" }}>
            {MEMBERS.map((p) => <MemberCard key={p.name} p={p} />)}
          </div>
        </section>

        <section className="flex flex-col items-center text-center gap-10" style={{ padding: "0 6vw 200px" }}>
          <h2 className="font-light max-w-[18ch]" style={{ fontSize: "clamp(30px, 4vw, 64px)", lineHeight: 1.06, letterSpacing: "-0.035em" }}>
            Parlons de votre <span className="k-serif">projet</span>
          </h2>
          <a href={INVEST_URL} target="_blank" rel="noopener noreferrer" className="k-btn-primary">
            Investir →
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
