import React from "react";
import { Linkedin } from "lucide-react";
import { ConnexionPanel } from "@/components/auth/ConnexionDialog";

// Page d'accueil : écran scindé éditorial — la promesse à gauche, l'espace de
// connexion / première connexion à droite, sans détour par une modale.
export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5] flex flex-col">
      {/* Barre de marque */}
      <nav className="border-b border-[#edeae5]/[0.08]">
        <div className="max-w-[1200px] mx-auto flex items-center px-6 md:px-10 h-[64px]">
          <span className="text-[15px] tracking-[0.36em] select-none">KLOCKA</span>
        </div>
      </nav>

      {/* Écran scindé */}
      <section className="flex-1 flex items-center px-6 md:px-10 py-14 md:py-20">
        <div className="max-w-[1200px] mx-auto w-full grid lg:grid-cols-[minmax(0,1fr)_420px] gap-14 lg:gap-24 items-center">
          {/* Gauche — la promesse */}
          <div>
            <h1 className="text-[44px] md:text-[64px] font-light tracking-[-0.03em] leading-[1.04] m-0">
              Votre liberté<br />
              <span className="text-[#7fd3c9]">commence ici.</span>
            </h1>
            <p className="text-[#8b9391] text-[15px] md:text-[16px] leading-[1.8] mt-6 mb-0 max-w-[480px]">
              L'immobilier commercial, du sourcing à la signature : analyse des dossiers,
              simulation financière, financement et suivi — tout est centralisé,
              accompagné par votre conseiller Klocka.
            </p>

            {/* Repères chiffrés */}
            <div className="flex flex-wrap border-t border-[#edeae5]/[0.35] mt-10 max-w-[520px]" style={{ fontVariantNumeric: "tabular-nums" }}>
              <div className="flex-1 min-w-[120px] py-5 pr-5">
                <div className="text-[26px] font-light text-[#7fd3c9]">7–9 %</div>
                <div className="text-[12px] text-[#8b9391] mt-1">Rendement moyen visé</div>
              </div>
              <div className="flex-1 min-w-[120px] py-5 px-5 md:border-l md:border-[#edeae5]/[0.12]">
                <div className="text-[26px] font-light text-[#edeae5]">3/6/9</div>
                <div className="text-[12px] text-[#8b9391] mt-1">Baux commerciaux sécurisés</div>
              </div>
              <div className="flex-1 min-w-[120px] py-5 pl-5 md:border-l md:border-[#edeae5]/[0.12]">
                <div className="text-[26px] font-light text-[#edeae5]">1</div>
                <div className="text-[12px] text-[#8b9391] mt-1">Conseiller dédié</div>
              </div>
            </div>
          </div>

          {/* Droite — connexion / création de compte.
              Le cadre est peint par la couche du dessous : un filet constant,
              plus un dégradé conique qui tourne lentement — la lueur blanche
              qui parcourt le bord. */}
          <div className="relative p-px overflow-hidden bg-[#edeae5]/[0.12]">
            <div
              aria-hidden="true"
              className="absolute inset-[-100%] animate-[spin_10s_linear_infinite]"
              style={{ background: "conic-gradient(rgba(237,234,229,0) 0deg, rgba(237,234,229,0) 288deg, rgba(237,234,229,0.9) 332deg, rgba(237,234,229,0) 360deg)" }}
            />
            <div className="relative bg-[#0e100f] px-8 py-8 max-md:px-5 max-md:py-6">
              <ConnexionPanel />
            </div>
          </div>
        </div>
      </section>

      {/* Pied de page */}
      <footer className="border-t border-[#edeae5]/[0.08] px-6 md:px-10 py-6">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-5">
            <span className="text-[11px] tracking-[0.3em] text-[#8b9391] select-none">KLOCKA</span>
            <p className="text-[#6b7270] text-xs m-0">© 2026 Klocka · Développeur de revenus immobiliers</p>
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[#8b9391] hover:text-[#edeae5] text-xs transition-colors">Mentions légales</a>
            <a href="#" className="text-[#8b9391] hover:text-[#edeae5] text-xs transition-colors">CGV</a>
            <a href="#" className="text-[#8b9391] hover:text-[#edeae5] text-xs transition-colors">Confidentialité</a>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="text-[#8b9391] hover:text-[#edeae5] transition-colors">
              <Linkedin className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
