import React, { useState } from "react";
import { CheckCircle2, CreditCard, ExternalLink, ArrowRight, Loader2, Shield } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { CGV_SECTIONS, CGV_HEADER, RETRACTATION_PDF_URL } from "@/data/cgvContent";
import PortailLanding from "@/components/portail/PortailLanding";

const slideVariants = {
  enter: { opacity: 0, x: 28 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -28 },
};

// Liens de paiement Qonto
export const PAIEMENT_CLASSIQUE_URL = "https://pay.qonto.com/payment-links/019d207a-d9b7-7ca6-b209-8c47fb725565?resource_id=019d207a-d9b8-7cf2-987a-f5f57ddc0954";
export const PAIEMENT_2X_URL = "https://pay.qonto.com/payment-links/019f842c-6c3a-7bf8-9d6e-3c179a78ae9c?resource_id=019f842c-6c3c-7717-b6d7-41f730d51db9";

function CGVDisplay() {
  return (
    <div className="space-y-14">
      {CGV_SECTIONS.map((section, i) => {
        // Special handling for definitions article
        const isDefinitions = i === 0;
        if (isDefinitions) {
          const lines = section.content.split('\n').filter(l => l.trim());
          const intro = lines[0];
          const defs = lines.slice(1).map(line => {
            const match = line.match(/^«\s*(.+?)\s*»\s*[:\s]*(.+)$/);
            if (match) return { term: match[1], desc: match[2] };
            return null;
          }).filter(Boolean);
          return (
            <div key={i}>
              <h3 className="text-white text-base font-extrabold uppercase tracking-wide mb-6">{section.title}</h3>
              <p className="text-white/60 text-sm leading-relaxed mb-8">{intro}</p>
              <div className="space-y-5">
                {defs.map((d, j) => (
                  <div key={j} className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-1 md:gap-6">
                    <p className="text-white font-bold text-sm">« {d.term} »</p>
                    <p className="text-white/60 text-sm leading-relaxed">{d.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        }
        return (
          <div key={i}>
            <h3 className="text-white text-base font-extrabold uppercase tracking-wide mb-4">{section.title}</h3>
            <p className="text-white/60 text-sm leading-relaxed whitespace-pre-line">{section.content}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function Portail({ paiement2Fois = false }) {
  const [cgvChecked, setCgvChecked] = useState(false);
  const [etape, setEtape] = useState(1); // 1=landing, 2=cgv, 3=paiement
  const paiementUrl = paiement2Fois ? PAIEMENT_2X_URL : PAIEMENT_CLASSIQUE_URL;

  const accepterCGV = () => {
    if (!cgvChecked) return;
    setEtape(3);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-screen bg-[#050807]">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-[#16201f] bg-[#050807] sticky top-0 z-50">
        <img src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png" alt="Klocka" className="h-7 w-auto object-contain" />
        <span className="text-white/30 text-xs uppercase tracking-widest">Espace client</span>
      </nav>

      <div>
        {/* Progress dots */}
        {etape < 4 && (
          <div className="flex items-center gap-2 mb-0 justify-center py-6 bg-[#050807]">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`w-2 h-2 rounded-full transition-all ${s === etape ? 'bg-[#33d6c0] w-6' : s < etape ? 'bg-[#33d6c0]/50' : 'bg-gray-200'}`} />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* ── Étape 1 : Landing Page ── */}
          {etape === 1 && (
            <motion.div key="landing" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
              <PortailLanding onContinue={() => { setEtape(2); window.scrollTo(0, 0); }} />
            </motion.div>
          )}

          {/* ── Étape 2 : CGV ── */}
          {etape === 2 && (
            <motion.div key="cgv" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
            <div className="max-w-5xl mx-auto px-6 py-8 md:py-12">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-[#33d6c0]" />
                <p className="text-[#33d6c0] uppercase tracking-[0.3em] text-[10px] font-medium">Conditions Générales de Vente</p>
              </div>
              <h1 className="text-2xl md:text-3xl text-white tracking-tight mb-2">
                Nos conditions
              </h1>
              <div className="h-px w-12 bg-[#33d6c0] mb-6" />
              <p className="text-white/50 text-sm mb-6">
                Veuillez prendre connaissance de nos conditions générales de vente ci-dessous, puis cochez la case d'acceptation pour continuer.
              </p>

              {/* CGV Content */}
              <div className="bg-[#050807] border border-[#16201f] rounded-md p-6 md:p-10 mb-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
                <div className="text-center mb-12">
                  <h2 className="text-white text-2xl md:text-4xl font-extrabold tracking-tight mb-2">{CGV_HEADER.title}</h2>
                  <p className="text-[#33d6c0] text-sm md:text-base font-medium mb-1">{CGV_HEADER.subtitle}</p>
                  <p className="text-white/30 text-xs">{CGV_HEADER.company}</p>
                  <p className="text-white/30 text-xs">{CGV_HEADER.address} · {CGV_HEADER.rcs}</p>
                  <p className="text-white/30 text-xs">{CGV_HEADER.contact}</p>
                  <p className="text-white/20 text-xs mt-2">{CGV_HEADER.date}</p>
                </div>
                <CGVDisplay />
              </div>

              {/* Retractation PDF */}
              <div className="bg-white/[0.02] border border-[#16201f] rounded-md p-4 mb-6 flex items-start gap-3">
                <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-white/70 text-sm font-medium mb-1">Droit de rétractation</p>
                  <p className="text-white/40 text-xs leading-relaxed mb-2">
                    Conformément à l'article L.221-18 du Code de la consommation, vous disposez d'un délai de 14 jours pour exercer votre droit de rétractation.
                  </p>
                  <a
                    href={RETRACTATION_PDF_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[#33d6c0] hover:text-[#33d6c0]/80 text-xs font-medium transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Télécharger le formulaire de rétractation (PDF)
                  </a>
                </div>
              </div>

              {/* Checkbox */}
              <label className="flex items-start gap-3 cursor-pointer mb-8 group">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={cgvChecked}
                    onChange={(e) => setCgvChecked(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-5 h-5 rounded-md border-2 border-white/20 peer-checked:border-[#33d6c0] peer-checked:bg-[#33d6c0] transition-all flex items-center justify-center group-hover:border-white/30">
                    {cgvChecked && (
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-white/70 text-sm leading-relaxed">
                  J'ai lu et j'accepte les conditions générales de vente. Je reconnais avoir été informé(e) de mon droit de rétractation.
                </span>
              </label>

              <button onClick={accepterCGV} disabled={!cgvChecked}
                className="w-full flex items-center justify-center gap-2 bg-[#33d6c0] hover:bg-[#33d6c0]/90 text-white font-medium px-6 py-3.5 rounded-md transition-all disabled:opacity-30">
                Accepter et continuer <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            </motion.div>
          )}

          {/* ── Étape 3 : Paiement ── */}
          {etape === 3 && (
            <motion.div key="paiement" variants={slideVariants} initial="enter" animate="center" exit="exit" transition={{ duration: 0.3 }}>
            <div className="max-w-5xl mx-auto px-6 py-8 md:py-12">
              <p className="text-[#33d6c0] uppercase tracking-[0.3em] text-[10px] font-medium mb-3">Dernière étape</p>
              <h1 className="text-3xl md:text-4xl font-light text-white tracking-tight mb-2">
                Finalisez le paiement
              </h1>
              <div className="h-px w-12 bg-[#33d6c0] mb-6" />

              {/* Résumé de la commande */}
              <div className="bg-white/[0.02] border border-[#1c2725] rounded-md p-6 mb-6">
                <h3 className="text-white font-medium text-sm mb-4">Récapitulatif de votre commande</h3>
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">Accompagnement Immobilier Commercial</p>
                      <p className="text-white/40 text-xs mt-1">Accès Plateforme & Deals Sourcés</p>
                    </div>
                    <p className="text-white text-sm font-medium whitespace-nowrap">5 833,33 € HT</p>
                  </div>
                  <div className="border-t border-[#16201f] pt-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">Total HT</span>
                      <span className="text-white/60">5 833,33 €</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-white/40">TVA (20%)</span>
                      <span className="text-white/60">1 166,67 €</span>
                    </div>
                    <div className="flex justify-between text-sm pt-2 border-t border-[#16201f]">
                      <span className="text-white font-medium">Total TTC</span>
                      <span className="text-[#33d6c0] font-semibold text-lg">7 000,00 €</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[#16201f]">
                  <p className="text-white/30 text-xs">Inclus dans votre accompagnement :</p>
                  <ul className="mt-2 space-y-1">
                    {['Accès à la plateforme avec espace dédié', 'Ressources d\'acculturation immobilier commercial', 'Accès aux simulateurs de projet', 'Calls d\'accompagnement personnalisés', 'Sourcing de 3 deals en immobilier commercial'].map((item, i) => (
                      <li key={i} className="flex items-center gap-2 text-white/50 text-xs">
                        <CheckCircle2 className="w-3 h-3 text-[#33d6c0] flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Bouton de paiement */}
              <a href={paiementUrl}
                target="_blank" rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-3 bg-[#33d6c0] hover:bg-[#33d6c0]/90 text-white font-medium px-6 py-4 rounded-md transition-all mb-4 group">
                <CreditCard className="w-5 h-5" />
                <span>{paiement2Fois ? "Procéder au paiement — 2 × 3 500,00 €" : "Procéder au paiement — 7 000,00 €"}</span>
                <ExternalLink className="w-4 h-4 opacity-60 group-hover:opacity-100 transition-opacity" />
              </a>

              <div className="flex items-center justify-center gap-2 mb-6">
                <Shield className="w-3.5 h-3.5 text-white/20" />
                <p className="text-white/30 text-xs">Paiement sécurisé par carte bancaire via Qonto</p>
              </div>

              <div className="bg-[#33d6c0]/5 border border-[#33d6c0]/20 rounded-md p-4 flex items-start gap-3">
                <CheckCircle2 className="w-4 h-4 text-[#33d6c0] flex-shrink-0 mt-0.5" />
                <p className="text-white/50 text-xs leading-relaxed">
                  Vos conditions générales ont été acceptées. Une fois le paiement effectué, nous reviendrons vers vous très rapidement pour lancer votre accompagnement.
                </p>
              </div>
            </div>
            </motion.div>
          )}

        </AnimatePresence>

        {/* Footer - only show on non-landing steps */}
        {etape !== 1 && (
          <div className="mt-16 pt-8 border-t border-[#131c1b] text-center px-6 pb-6 bg-[#050807]">
            <p className="text-white/15 text-xs">© 2026 Klocka · Développeur de revenus immobiliers</p>
          </div>
        )}
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }
      `}</style>
    </div>
  );
}