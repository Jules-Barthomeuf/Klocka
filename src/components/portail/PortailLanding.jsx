import React from "react";
import { ArrowRight, Check, X, GraduationCap, Target, Search, FileCheck, Handshake, Building, HeadphonesIcon, BarChart3, Bell, FolderOpen, Lock, FileSearch, Play, Linkedin } from "lucide-react";

const PHOTO_MATTHIEU = "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/cca1429e0_1744719537331.jpg";
const PHOTO_PAUL = "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/9d59e1144__MGL0786-2024-12-19T11_51_45738-dsdf.jpg";
const PHOTO_COUPLE = "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/a8c20885d_Capturedecran2026-03-25a160520.png";
const LOGO_KLOCKA = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png";
const PLATFORM_SCREENSHOT = "https://media.base44.com/images/public/68f0bd18555df3520e1740ca/5a6892bea_973DA543-71EF-4DC9-B258-E5D90CD7608C.jpg";

const STATS = [
  { value: "0", label: "visites à effectuer" },
  { value: "0", label: "documents à analyser" },
  { value: "100%", label: "depuis votre canapé" },
  { value: "x10*", label: "création de richesse de votre apport", note: "*Moyenne constatée sur nos clients." },
];

const PAINS = [
  "Pas le temps de chercher, analyser et négocier des biens",
  "Peur de commettre une erreur dans l'analyse financière ou juridique",
  "Ne pas savoir comment structurer le financement pour enchaîner les opérations",
];

const COMPARE_CLASSIC = [
  "On vous apprend à chercher des biens",
  "Vous analysez seul, sans filet",
  "Vous négociez sans réseau",
  "1 deal si tout se passe bien",
];

const COMPARE_KLOCKA = [
  "Nos experts sourcing cherchent pour vous",
  "Analyse financière et juridique fournie",
  "Nous disposons des meilleurs outils de négo",
  "3 deals sourcés inclus dans l'accompagnement",
];

const SERVICES = [
  { num: "01", title: "Formation à l'immobilier commercial", icon: GraduationCap, items: [
    "Plus de 15h de formation pour maîtriser ce marché",
    "Les fondamentaux du marché de l'immobilier commercial",
    "Comment se structurer pour optimiser sa fiscalité",
    "Obtenir le meilleur financement pour son investissement et les suivants",
    "Optimiser le bail de son locataire en vue de déplafonner le loyer",
    "Des interviews format podcast avec des experts (notaire, banquier, avocat)"
  ]},
  { num: "02", title: "Définition de sa stratégie d'investissement", icon: Target, items: [
    "Accès à un simulateur dédié pour bâtir sa stratégie et projeter ses revenus",
    "Call avec un expert afin de consolider sa stratégie d'investissement",
    "Définition du type de projet ciblé en phase avec les experts en sourcing"
  ]},
  { num: "03", title: "Sourcing de deals", icon: Search, highlight: true, items: [
    "Nos experts en sourcing prospectent des opportunités en phase avec votre stratégie",
    "3 deals sourcés et analysés inclus dans l'accompagnement"
  ]},
  { num: "04", title: "Analyse financière et juridique", icon: FileCheck, items: [
    "Analyse complète du bail commercial",
    "Règlement de copropriété et PV d'assemblées générales",
    "Contrôle des quittances de loyers",
    "Chargement des deals analysés sur votre plateforme d'investissement dédiée"
  ]},
  { num: "05", title: "Négociation du deal", icon: Handshake, items: [
    "Klocka négocie pour vous le meilleur prix auprès du vendeur",
    "Optimisation de la rentabilité de l'opération"
  ]},
  { num: "06", title: "Élaboration du dossier bancaire", icon: Building, items: [
    "Rédaction de votre dossier de présentation bancaire clé en main",
    "Il ne vous reste plus qu'à le présenter à votre banquier"
  ]},
  { num: "07", title: "Mise en place de la gestion locative", icon: HeadphonesIcon, items: [
    "Call avec un expert pour reprendre sereinement la relation avec le locataire",
    "Trames types pour la gestion (quittance, indexation du loyer, relance…)",
    "Délégation totale de la gestion également possible"
  ]},
];

const PLATFORM = [
  { icon: BarChart3, label: "Suivi en temps réel de l'avancement de votre dossier" },
  { icon: FolderOpen, label: "Accès centralisé à tous vos documents (bail, analyse, financement, juridique)" },
  { icon: FileSearch, label: "Présentation des deals sourcés avec fiche d'analyse complète" },
  { icon: Bell, label: "Alertes et notifications à chaque étape clé du processus" },
  { icon: Lock, label: "Espace investisseur sécurisé, accessible 24h/24" },
];

const FOUNDERS = [
  {
    name: "Matthieu DEGLI INNOCENTI",
    role: "Cofondateur Klocka — Ancien banquier d'affaires, ex-Société Générale & Deloitte",
    desc: "Promoteur immobilier, banquier d'affaires et gestionnaire de fortune, Matthieu a forgé plus de 12 ans d'expérience en direction au sein de grands groupes (Société Générale, Deloitte). Depuis 2021, il est multi-entrepreneur dans l'éducation, l'investissement et l'immobilier. Il a conseillé, structuré ou financé des opérations complexes pour un volume de plus de 4,5 milliards d'euros. Il développe également une activité pour compte propre en immobilier et en business angel, en France et à l'international.",
    photo: PHOTO_PAUL,
  },
  {
    name: "Paul DE ZULUETA",
    role: "Cofondateur Klocka — Expert en sourcing immobilier commercial, 11 ans chez les leaders",
    desc: "Fort de plus de 11 ans d'expérience chez les leaders de l'immobilier commercial, Paul a développé une expertise rare : identifier les murs de commerce sous-valorisés et les signatures locatives qui transforment un investissement en actif patrimonial. Son parcours lui a permis d'analyser des centaines d'opérations et de construire une méthodologie efficace pour sécuriser des deals performants, même pour des investisseurs débutants. Cofondateur de Klocka, sa mission est de démocratiser l'accès à l'immobilier commercial — un marché plus rentable, plus stable et moins chronophage que le résidentiel.",
    photo: PHOTO_MATTHIEU,
  },
];

/* ─── Helpers ─── */
function CTAButton({ onClick, label }) {
  return (
    <div className="text-center">
      <button onClick={onClick}
        className="inline-flex items-center gap-2.5 bg-[#8fa0f2] hover:bg-[#238B7F] text-[#f2f3f5] font-bold px-10 py-4 rounded-md transition-all text-base group shadow-lg shadow-[#8fa0f2]/20">
        {label} <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
      </button>
      <p className="text-[#6a7180] text-xs mt-3 italic">Places limitées par cohorte</p>
    </div>
  );
}

function Section({ children, id, dark = true }) {
  return (
    <section id={id} className={dark ? "bg-[#000000] text-[#f2f3f5]" : "bg-[#0f1114] text-[#f2f3f5]"}>
      <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">{children}</div>
    </section>
  );
}

function Label({ children }) {
  return <p className="uppercase tracking-[0.25em] text-[11px] font-semibold mb-5 text-center text-[#8fa0f2]">{children}</p>;
}

function Title({ children }) {
  return <h2 className="text-2xl md:text-4xl font-extrabold mb-4 text-center leading-tight uppercase tracking-wide text-[#f2f3f5]">{children}</h2>;
}

function Sub({ children }) {
  return <p className="text-sm md:text-base text-center max-w-2xl mx-auto mb-10 leading-relaxed text-[#9298a6]">{children}</p>;
}

/* ─── Main Component ─── */
export default function PortailLanding({ onContinue }) {

  return (
    <div>

      {/* ═══════ SECTION 1 — HERO ═══════ */}
      <section className="bg-[#000000] text-[#f2f3f5]">
        <div className="max-w-6xl mx-auto px-6 py-16 md:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Left — Text */}
            <div>
              <div className="inline-flex items-center gap-2 bg-[#8fa0f2]/10 border border-[#8fa0f2]/30 rounded-full px-5 py-2 mb-8">
                <span className="w-2 h-2 rounded-full bg-[#8fa0f2] animate-pulse" />
                <span className="text-[#8fa0f2] text-xs font-semibold tracking-wide">3 deals sourcés inclus dans l'accompagnement</span>
              </div>

              <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#f2f3f5] leading-[1.08] mb-6 uppercase tracking-tight">
                Votre premier investissement en immobilier commercial,{" "}
                <span className="text-[#8fa0f2]">réalisé pour vous</span>, depuis votre canapé.
              </h1>

              <p className="text-[#9298a6] text-base md:text-lg leading-relaxed mb-8">
                Klocka ne vous forme pas. Klocka investit avec vous : sourcing, analyse, financement, gestion. <strong className="text-[#f2f3f5]">On s'occupe de tout.</strong>
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                {STATS.map((s, i) => (
                  <div key={i} className="bg-[#f2f3f5]/[0.03] border border-[#1f2228] rounded-md px-4 py-3 text-center">
                    <p className="text-2xl md:text-3xl font-black text-[#f2f3f5]">{s.value}</p>
                    <p className="text-[#9298a6] text-[10px] mt-0.5 uppercase tracking-wider">{s.label}</p>
                    {s.note && <p className="text-[#6a7180] text-[9px] mt-1 italic normal-case">{s.note}</p>}
                  </div>
                ))}
              </div>

              <button onClick={onContinue}
                className="inline-flex items-center gap-2.5 bg-[#8fa0f2] hover:bg-[#238B7F] text-[#f2f3f5] font-bold px-8 py-4 rounded-md transition-all text-base group shadow-lg shadow-[#8fa0f2]/20">
                Je veux investir en immobilier commercial <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <p className="text-[#6a7180] text-xs mt-3 italic">Places limitées par cohorte</p>
            </div>

            {/* Right — Image */}
            <div className="relative">
              <div className="rounded-md overflow-hidden border border-[#1f2228] shadow-2xl">
                <img src={PHOTO_COUPLE} alt="Investisseurs sereins" className="w-full h-[400px] lg:h-[480px] object-cover" />
              </div>

            </div>
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 2 — IDENTIFICATION DU PROBLÈME ═══════ */}
      <section className="bg-[#000000] text-[#f2f3f5]">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
        <p className="uppercase tracking-[0.25em] text-[11px] font-semibold mb-5 text-center text-[#8fa0f2]">Le constat</p>
        <h2 className="text-3xl md:text-5xl font-extrabold mb-4 text-center leading-tight uppercase tracking-wide text-[#f2f3f5]">
          Vous savez que l'immobilier commercial est un des meilleurs placements. <span className="text-[#8fa0f2]">Mais vous n'avez jamais franchi le cap.</span>
        </h2>
        <p className="text-base md:text-lg text-center max-w-2xl mx-auto mb-10 leading-relaxed text-[#9298a6]">
          Entre le manque de temps, la complexité du marché et la peur de faire une erreur — vous avez toujours reporté à plus tard.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-4xl mx-auto mb-14">
          {PAINS.map((p, i) => (
            <div key={i} className="relative bg-[#f2f3f5]/[0.04] border border-[#1f2228] rounded-md px-6 py-8 text-center hover:border-red-500/30 hover:shadow-lg transition-all group">
              <div className="w-14 h-14 rounded-md bg-red-500/10 flex items-center justify-center mx-auto mb-5 group-hover:bg-red-500/20 transition-colors">
                <X className="w-7 h-7 text-red-500" strokeWidth={2.5} />
              </div>
              <p className="text-[#f2f3f5] text-lg font-bold leading-snug">{p}</p>
            </div>
          ))}
        </div>

        <div className="max-w-3xl mx-auto mb-12 text-center">
          <p className="text-[#f2f3f5] text-2xl md:text-3xl font-extrabold leading-tight mb-2">
            Vous n'avez pas à tout faire seul.
          </p>
          <p className="text-[#f2f3f5] text-xl md:text-2xl font-semibold">
            C'est exactement pour cela que <span className="text-[#8fa0f2] font-bold">Klocka existe.</span>
          </p>
        </div>

        <CTAButton onClick={onContinue} label="Je délègue mon investissement à Klocka" />
        </div>
      </section>

      {/* ═══════ SECTION 3 — DIFFÉRENCIATION ═══════ */}
      <Section dark>
        <Label>Ce qui rend Klocka radicalement différent</Label>
        <Title>
          Klocka, ce n'est pas une formation. <span className="text-[#8fa0f2]">C'est votre Deal Maker.</span>
        </Title>
        <Sub>
          Cette section lève l'objection : « j'ai déjà vu des formations immobilier ».
        </Sub>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 max-w-4xl mx-auto mb-12 rounded-md overflow-hidden">
          {/* Classic - Red */}
          <div className="bg-red-500/10 border-2 border-red-500/30 p-6 md:p-8 md:rounded-l-2xl">
            <div className="flex items-center gap-2 mb-6">
              <X className="w-5 h-5 text-red-500" />
              <p className="text-red-500 text-sm font-bold uppercase tracking-wider">Accompagnement éducatif classique</p>
            </div>
            <div className="space-y-4">
              {COMPARE_CLASSIC.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <X className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <p className="text-red-200 text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
          {/* Klocka - Green */}
          <div className="bg-[#8fa0f2]/10 border border-[#8fa0f2]/25 p-6 md:p-8 md:rounded-r-2xl">
            <div className="flex items-center gap-2 mb-6">
              <Check className="w-5 h-5 text-[#8fa0f2]" />
              <p className="text-[#8fa0f2] text-xs font-bold uppercase tracking-wider">Klocka — Clé en Main</p>
            </div>
            <div className="space-y-4">
              {COMPARE_KLOCKA.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Check className="w-4 h-4 text-[#8fa0f2] mt-0.5 flex-shrink-0" />
                  <p className="text-[#f2f3f5] text-sm font-medium">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#f2f3f5]/[0.03] border border-[#1f2228] rounded-md px-6 py-5 max-w-2xl mx-auto text-center mb-12">
          <p className="text-[#f2f3f5] text-base">
            « Vous apportez votre capacité d'investissement. <span className="text-[#8fa0f2] font-bold">Nous apportons tout le reste.</span> »
          </p>
        </div>

        <CTAButton onClick={onContinue} label="Je valide mon accompagnement Klocka" />
      </Section>

      {/* ═══════ SECTION 4 — CE QUE COMPREND L'ACCOMPAGNEMENT ═══════ */}
      <section className="bg-[#000000] text-[#f2f3f5]">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <p className="uppercase tracking-[0.25em] text-[11px] font-semibold mb-4 text-center text-[#8fa0f2]">L'accompagnement</p>
          <h2 className="text-3xl md:text-5xl font-black mb-4 text-center leading-tight uppercase tracking-wide text-[#f2f3f5]">
            Un service complet, <span className="text-[#8fa0f2]">de A à Z</span>.
          </h2>
          <p className="text-base md:text-lg text-center max-w-2xl mx-auto mb-14 leading-relaxed text-[#9298a6]">Chaque module montre concrètement que vous n'avez rien à faire de plus que choisir votre deal.</p>

          {/* ── OFFRE SOCLE (1-4) ── */}
          <div className="mb-6">
            <div className="inline-flex items-center gap-2 bg-[#8fa0f2]/10 border border-[#8fa0f2]/30 rounded-full px-5 py-2 mb-6">
              <span className="w-2 h-2 rounded-full bg-[#8fa0f2]" />
              <span className="text-[#8fa0f2] text-xs font-bold uppercase tracking-wider">Offre socle — inclus dans l'accompagnement</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SERVICES.slice(0, 4).map((s) => {
                const Icon = s.icon;
                const isHighlight = s.highlight;
                return (
                  <div key={s.num} className={`rounded-md border transition-all hover:shadow-lg relative overflow-hidden ${
                    isHighlight
                      ? 'bg-[#000000] border-[#a9c5b9]/50 p-0 shadow-[0_0_30px_rgba(251,191,36,0.08)]'
                      : 'bg-[#000000] border-[#0f1114] hover:border-[#22262d] p-6'
                  }`}>
                    {isHighlight ? (
                      <div className="p-6 md:p-8 relative">
                        <div className="absolute top-4 right-4">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#a9c5b9] bg-[#a9c5b9]/10 border border-[#a9c5b9]/30 rounded-full px-3 py-1">Étape clé</span>
                        </div>
                        <div className="flex flex-col md:flex-row md:items-center gap-6">
                          <div className="flex-shrink-0">
                            <div className="w-16 h-16 rounded-md bg-[#a9c5b9]/10 border border-[#a9c5b9]/20 flex items-center justify-center">
                              <Icon className="w-8 h-8 text-[#a9c5b9]" />
                            </div>
                          </div>
                          <div className="flex-1">
                            <span className="text-[#a9c5b9]/60 text-xs font-mono font-bold block mb-1">Étape {s.num}</span>
                            <h3 className="text-[#f2f3f5] text-xl md:text-2xl font-black leading-tight mb-3">{s.title}</h3>
                            <ul className="space-y-2">
                              {s.items.map((item, j) => (
                                <li key={j} className="flex items-start gap-2.5 text-base text-[#c9cdd6] leading-relaxed">
                                  <Check className="w-5 h-5 flex-shrink-0 mt-0.5 text-[#a9c5b9]" />
                                  {item}
                                </li>
                              ))}
                            </ul>
                            <div className="mt-5 inline-flex items-center gap-2 bg-[#a9c5b9]/10 border border-[#a9c5b9]/25 rounded-full px-5 py-2">
                              <span className="text-[#a9c5b9] text-sm font-bold">3 deals inclus — différenciateur clé de l'accompagnement</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-4 mb-4">
                          <div className="w-12 h-12 rounded-md bg-[#0f1114] flex items-center justify-center flex-shrink-0">
                            <Icon className="w-6 h-6 text-[#f2f3f5]" />
                          </div>
                          <div>
                            <span className="text-[#9298a6] text-xs font-mono font-bold block">Étape {s.num}</span>
                            <h3 className="text-[#f2f3f5] text-lg font-bold leading-tight">{s.title}</h3>
                          </div>
                        </div>
                        <ul className="space-y-2.5 pl-1">
                          {s.items.map((item, j) => (
                            <li key={j} className="flex items-start gap-2.5 text-sm text-[#9298a6] leading-relaxed">
                              <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9298a6]" />
                              {item}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── OPTIONS (5-7) ── */}
          <div className="mt-12 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {SERVICES.slice(4).map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.num} className="rounded-md p-6 border bg-[#000000] border-[#0f1114] hover:border-[#22262d] transition-all hover:shadow-lg relative overflow-hidden">
                    <div className="absolute top-3 right-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#a9c5b9] bg-[#a9c5b9]/10 border border-[#a9c5b9]/20 rounded-full px-2.5 py-1">Option</span>
                    </div>
                    <div className="w-12 h-12 rounded-md bg-[#0f1114] flex items-center justify-center mb-4">
                      <Icon className="w-6 h-6 text-[#f2f3f5]" />
                    </div>
                    <span className="text-[#9298a6] text-xs font-mono font-bold block">Étape {s.num}</span>
                    <h3 className="text-[#f2f3f5] text-lg font-bold leading-tight mb-3 mt-1">{s.title}</h3>
                    <ul className="space-y-2.5">
                      {s.items.map((item, j) => (
                        <li key={j} className="flex items-start gap-2.5 text-sm text-[#9298a6] leading-relaxed">
                          <Check className="w-4 h-4 flex-shrink-0 mt-0.5 text-[#9298a6]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-14">
            <CTAButton onClick={onContinue} label="Je commence mon investissement maintenant" />
          </div>
        </div>
      </section>

      {/* ═══════ SECTION 5 — PLATEFORME ═══════ */}
      <Section dark>
        <Label>Plateforme</Label>
        <Title>
          Investissez depuis n'importe où. <span className="text-[#8fa0f2]">Tout est centralisé.</span>
        </Title>
        <Sub>Vous recevez des opportunités d'investissement analysées. Pas des devoirs à rendre.</Sub>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto mb-12">
          {PLATFORM.map((f, i) => (
            <div key={i} className="flex items-center gap-4 bg-[#f2f3f5]/[0.04] border border-[#1f2228] rounded-md px-5 py-4">
              <div className="w-10 h-10 rounded-md bg-[#8fa0f2]/10 flex items-center justify-center flex-shrink-0">
                <f.icon className="w-5 h-5 text-[#8fa0f2]" />
              </div>
              <p className="text-[#f2f3f5] text-sm font-medium">{f.label}</p>
            </div>
          ))}
        </div>

        {/* Platform screenshot */}
        <div className="max-w-3xl mx-auto rounded-md overflow-hidden border border-[#1f2228] bg-gradient-to-br from-[#000000] to-[#000000] p-3 mb-12">
          <div className="rounded-md bg-[#000000] border border-[#1f2228] overflow-hidden">
            <div className="h-7 bg-[#000000] flex items-center gap-1.5 px-3 border-b border-[#1f2228]">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#a9c5b9]/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#8fa0f2]/60" />
            </div>
            <img src="https://media.base44.com/images/public/68f0bd18555df3520e1740ca/fbcc895a0_Capturedecran2026-03-25a165004.png" alt="Plateforme Klocka" className="w-full h-[260px] md:h-[340px] object-cover" />
          </div>
        </div>

        <CTAButton onClick={onContinue} label="J'accède à la plateforme Klocka" />
      </Section>

      {/* ═══════ SECTION 6 — TÉMOIGNAGES ═══════ */}
      <Section dark={false}>
        <Label>Témoignages</Label>
        <Title>
          Ils ont investi avec <span className="text-[#8fa0f2]">Klocka</span>.
        </Title>

        {/* Video témoignage */}
        <div className="max-w-3xl mx-auto rounded-md overflow-hidden border border-[#1f2228] bg-[#000000] aspect-video mb-8">
          <iframe
            src="https://drive.google.com/file/d/11RUUz1Ec0Two6NbIWoNTXUtq4683A-sb/preview"
            className="w-full h-full"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
        </div>



        <CTAButton onClick={onContinue} label="Je rejoins les investisseurs Klocka" />
      </Section>

      {/* ═══════ SECTION 7 — FONDATEURS ═══════ */}
      <Section dark>
        <Label>Les fondateurs</Label>
        <Title>
          Deux experts au service de <span className="text-[#8fa0f2]">votre investissement.</span>
        </Title>
        <Sub>
          10 ans d'expertise dans l'immobilier commercial professionnel — entièrement mis au service de vos investissements.
        </Sub>

        <div className="space-y-6 max-w-3xl mx-auto mb-12">
          {FOUNDERS.map((f, i) => (
            <div key={i} className="bg-[#f2f3f5]/[0.03] border border-[#1f2228] rounded-md p-6 md:p-8 flex flex-col md:flex-row items-center md:items-start gap-6 hover:border-[#f2f3f5]/[0.14] transition-colors">
              <img src={f.photo} alt={f.name} className="w-28 h-28 rounded-full object-cover flex-shrink-0 border-2 border-[#8fa0f2]/20" />
              <div className="text-center md:text-left">
                <p className="text-[#f2f3f5] font-bold text-lg mb-0.5">{f.name}</p>
                <p className="text-[#8fa0f2] text-xs font-semibold uppercase tracking-wider mb-3">{f.role}</p>
                <p className="text-[#9298a6] text-sm leading-relaxed">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <CTAButton onClick={onContinue} label="Je fais confiance aux experts Klocka" />
      </Section>

      {/* ═══════ FINAL CTA ═══════ */}
      <section className="bg-[#000000] text-[#f2f3f5]">
        <div className="max-w-5xl mx-auto px-6 py-20 md:py-28">
          <div className="bg-gradient-to-br from-[#8fa0f2]/15 via-[#8fa0f2]/5 to-transparent border border-[#8fa0f2]/25 rounded-3xl p-8 md:p-14 text-center max-w-3xl mx-auto">
            <img src={LOGO_KLOCKA} alt="Klocka" className="h-10 mx-auto mb-6 object-contain" />
            <Label>Dernière étape</Label>
            <h2 className="text-2xl md:text-4xl font-black text-[#f2f3f5] mb-4 uppercase tracking-wide">
              Prêt à investir ?
            </h2>
            <p className="text-[#9298a6] text-sm md:text-base mb-8 max-w-lg mx-auto leading-relaxed">
              Pour finaliser votre inscription, consultez et acceptez nos conditions générales, puis procédez au paiement sécurisé.
            </p>
            <button onClick={onContinue}
              className="inline-flex items-center gap-2.5 bg-[#8fa0f2] hover:bg-[#238B7F] text-[#f2f3f5] font-bold px-10 py-4 rounded-md transition-all text-base group shadow-lg shadow-[#8fa0f2]/25">
              Démarrer l'accompagnement <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <p className="text-[#6a7180] text-xs mt-4 italic">Places limitées par cohorte</p>
          </div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="bg-[#000000] border-t border-[#15171b] px-6 py-8">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <img src={LOGO_KLOCKA} alt="Klocka" className="h-5 w-auto opacity-60" />
            <p className="text-[#6a7180] text-xs">© 2025 Klocka · Développeur de revenus immobiliers</p>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[#9298a6] hover:text-[#f2f3f5] text-xs transition-colors">Mentions légales</a>
            <a href="#" className="text-[#9298a6] hover:text-[#f2f3f5] text-xs transition-colors">CGV</a>
            <a href="#" className="text-[#9298a6] hover:text-[#f2f3f5] text-xs transition-colors">Confidentialité</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-[#9298a6] hover:text-[#f2f3f5] transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}