import React, { useState } from "react";
import { ArrowRight, Linkedin, BarChart3 } from "lucide-react";
import ConnexionDialog from "@/components/auth/ConnexionDialog";

export default function Home() {
  const [connexionOuverte, setConnexionOuverte] = useState(false);
  const ouvrirConnexion = () => setConnexionOuverte(true);

  return (
    <div className="min-h-screen bg-[#050807] text-white">
      <ConnexionDialog ouvert={connexionOuverte} onClose={() => setConnexionOuverte(false)} />
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&display=swap');`}</style>

      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050807]/80 backdrop-blur-xl border-b border-[#131c1b]">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-6 md:px-12 py-4">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
            alt="Klocka"
            className="h-7 w-auto"
          />

        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-20 md:pt-40 md:pb-32 px-6 md:px-12">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">
            {/* Left */}
            <div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif" }} className="text-4xl md:text-5xl lg:text-6xl leading-[1.1] mb-4 text-white font-medium">
                Votre plateforme tout en un en <span className="text-[#33d6c0]">immobilier commercial.</span>
              </h1>
              <p className="text-[#93aca7] text-lg mb-8 max-w-xl">
                Sourcing, analyse, financement, gestion — tout est centralisé pour simplifier vos investissements.
              </p>

              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <button onClick={ouvrirConnexion} className="flex items-center gap-2 bg-[#33d6c0] hover:bg-[#33d6c0]/90 text-white font-semibold px-8 py-4 rounded-md transition-all text-base group">
                  Commencer <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
                <button onClick={ouvrirConnexion} className="flex items-center gap-2 border border-white/20 hover:border-white/40 text-white font-medium px-8 py-4 rounded-md transition-all text-base">
                  Se connecter
                </button>
              </div>

            </div>

            {/* Right - Visual */}
            <div className="relative">
              <div className="rounded-md overflow-hidden border border-[#1c2725] shadow-2xl bg-gradient-to-br from-white/[0.03] to-transparent">
                <img
                  src="https://media.base44.com/images/public/68f0bd18555df3520e1740ca/705fbe921_Capturedecran2026-03-25a160520.png"
                  alt="Investisseurs"
                  className="w-full h-[400px] md:h-[500px] object-cover"
                />
              </div>
              {/* Floating card - Rendement */}
              <div className="absolute -bottom-6 -left-6 bg-[#101715] backdrop-blur border border-white/15 rounded-md px-6 py-5 shadow-2xl">
                <p className="text-3xl font-bold text-[#33d6c0]">7–9%</p>
                <p className="text-xs text-[#93aca7] uppercase tracking-widest mt-1">Rendement moyen</p>
              </div>
              {/* Floating card - Plateforme */}
              <div className="absolute -top-4 -right-4 bg-[#101715] backdrop-blur border border-white/15 rounded-md px-4 py-3 shadow-2xl">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#33d6c0]/20 flex items-center justify-center">
                    <BarChart3 className="w-4 h-4 text-[#33d6c0]" />
                  </div>
                  <div>
                    <p className="text-white text-sm font-medium">Plateforme dédiée</p>
                    <p className="text-[#7f9995] text-xs">Suivi en temps réel</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#131c1b] px-6 md:px-12 py-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <img
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/68f0bd18555df3520e1740ca/203835f6a_Capturedecran2025-11-22a160624.png"
              alt="Klocka"
              className="h-6 w-auto opacity-60"
            />
            <p className="text-[#5e7672] text-xs">© 2026 Klocka · Développeur de revenus immobiliers</p>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[#7f9995] hover:text-white text-xs transition-colors">Mentions légales</a>
            <a href="#" className="text-[#7f9995] hover:text-white text-xs transition-colors">CGV</a>
            <a href="#" className="text-[#7f9995] hover:text-white text-xs transition-colors">Confidentialité</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-[#7f9995] hover:text-white transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}