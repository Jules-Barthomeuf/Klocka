import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Search, Link2, Check, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUser } from "@/components/providers/UserProvider";
import { PROFILS } from "../components/recherche/profilsData";
import ProfilCard from "../components/recherche/ProfilCard";
import ProfilProjects from "../components/recherche/ProfilProjects";
import SyntheseRecherche from "../components/recherche/SyntheseRecherche";

export default function Recherche() {
  const [activeTab, setActiveTab] = useState("synthese");
  const activeProfil = PROFILS.find((p) => p.id === activeTab);
  const user = useUser();
  const isAdmin = user?.role === "admin";
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.origin + "/Recherche");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-2">Recherche</p>
          <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">Profils d'investissement</h1>
          <p className="text-white/30 text-sm mt-2">Critères de recherche par tranche de budget et projets correspondants.</p>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLink}
              className="mt-3 border-white/10 bg-black text-white/50 hover:text-white hover:bg-white/5 text-xs gap-2"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Link2 className="w-3.5 h-3.5" />}
              {copied ? "Lien copié" : "Copier le lien"}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          <button
            onClick={() => setActiveTab("synthese")}
            className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border"
            style={
              activeTab === "synthese"
                ? { backgroundColor: "rgba(42,157,143,0.15)", color: "#2A9D8F", borderColor: "rgba(42,157,143,0.4)" }
                : { backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.06)" }
            }
          >
            Synthèse
          </button>
          {PROFILS.map((profil) => (
            <button
              key={profil.id}
              onClick={() => setActiveTab(profil.id)}
              className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border"
              style={
                activeTab === profil.id
                  ? { backgroundColor: `${profil.color}20`, color: profil.color, borderColor: `${profil.color}50` }
                  : { backgroundColor: "transparent", color: "rgba(255,255,255,0.4)", borderColor: "rgba(255,255,255,0.06)" }
              }
            >
              {profil.label} €
            </button>
          ))}
        </div>

        {activeTab === "synthese" ? (
          <SyntheseRecherche />
        ) : (
          <>
            {/* Profil Details */}
            <Card className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl mb-8">
              <CardContent className="p-6 md:p-8">
                <ProfilCard profil={activeProfil} />
              </CardContent>
            </Card>

            {/* CTA */}
            <div className="text-center border border-white/[0.06] rounded-2xl bg-[#0A0A0A] p-6 mb-8">
              <p className="text-white/50 text-sm mb-4">Vous avez un bien correspondant à nos critères ?</p>
              <Button
                onClick={() => window.open("https://dpe3smipjxh.typeform.com/to/GD7sREFs", "_blank")}
                className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90 text-white px-6 py-2.5 gap-2"
              >
                Prendre rendez-vous
                <ArrowRight className="w-4 h-4" />
              </Button>
            </div>

            {/* Projets correspondants */}
            <div>
              <div className="flex items-center gap-3 mb-5">
                <Search className="w-4 h-4 text-white/30" />
                <h2 className="text-white text-lg font-light">Projets dans cette tranche</h2>
              </div>
              <ProfilProjects
                budgetMin={activeProfil.budgetMin}
                budgetMax={activeProfil.budgetMax}
                color={activeProfil.color}
              />
            </div>
          </>
        )}



      </div>
    </div>
  );
}