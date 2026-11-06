import SiteNav from "@/components/klocka/SiteNav";
import SiteFooter from "@/components/klocka/SiteFooter";
import Hero from "@/components/klocka/Hero";
import CardCarousel3D from "@/components/klocka/CardCarousel3D";
import KeyFigures from "@/components/klocka/KeyFigures";
import LogoMarquee from "@/components/klocka/LogoMarquee";
import ScrollRevealText from "@/components/klocka/ScrollRevealText";
import CompareTable from "@/components/klocka/CompareTable";
import StepsSection from "@/components/klocka/StepsSection";
import FoundersSection from "@/components/klocka/FoundersSection";
import InterviewSection from "@/components/klocka/InterviewSection";
import CtaBlock from "@/components/klocka/CtaBlock";
import Testimonials from "@/components/klocka/Testimonials";
import PlatformFeatures from "@/components/klocka/PlatformFeatures";

export default function Home() {
  return (
    <div className="min-h-screen bg-black text-white font-body overflow-x-clip">
      <SiteNav />
      <main>
        <Hero />
        <CardCarousel3D />
        <KeyFigures />
        <LogoMarquee />
        <ScrollRevealText />
        <CompareTable />
        <ScrollRevealText paras={["L’immobilier commercial couvre un parfait équilibre entre l’effet de levier et sa gestion simplifiée tout en offrant des rendements performants."]} highlight={[[7, 9], [12, 13]]} />
        <CtaBlock>Construire ma retraite →</CtaBlock>
        <StepsSection />
        <PlatformFeatures />
        <FoundersSection />
        <CtaBlock>Parler à un expert →</CtaBlock>
        <InterviewSection />
        <Testimonials />
        <CtaBlock>Démarrer mon investissement →</CtaBlock>
        <div className="h-24" />
      </main>
      <SiteFooter />
    </div>
  );
}
