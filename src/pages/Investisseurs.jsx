import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const INVESTISSEURS = [
  { nom: "Thomas PERDEROT", budget: "250 000 €", zone: "Toute la France", aem: "7%" },
  { nom: "Corinne Ayoub", budget: "600 000 €", zone: "Toute la France", aem: "7%" },
  { nom: "Axel YOKEL", budget: "1 000 000 €", zone: "Grandes villes", aem: "6%" },
  { nom: "Arthur GRIS", budget: "2 000 000 €", zone: "Enseigne nationale uniquement", aem: "7%" },
];

export default function Investisseurs() {
  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[#2A9D8F] uppercase tracking-[0.3em] text-[10px] font-medium mb-2">Investisseurs</p>
          <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">Profils investisseurs</h1>
          <p className="text-white/30 text-sm mt-2">Liste des investisseurs et leurs critères de recherche.</p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INVESTISSEURS.map((inv) => (
            <Card key={inv.nom} className="bg-[#0A0A0A] border border-white/[0.06] rounded-2xl">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-[#2A9D8F]/15 flex items-center justify-center">
                    <span className="text-sm text-[#2A9D8F] font-medium">{inv.nom.charAt(0)}</span>
                  </div>
                  <p className="text-white font-medium">{inv.nom}</p>
                </div>
                <div className="space-y-2 text-sm text-white/40">
                  <div className="flex justify-between">
                    <span>Budget max</span>
                    <span className="text-white/70 font-medium">{inv.budget}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Zone</span>
                    <span className="text-white/70">{inv.zone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AEM</span>
                    <span className="text-[#2A9D8F] font-medium">{inv.aem}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center border border-white/[0.06] rounded-2xl bg-[#0A0A0A] p-6 mt-8">
          <p className="text-white/50 text-sm mb-4">Vous avez un bien correspondant à ces critères ?</p>
          <Button
            onClick={() => window.open("https://dpe3smipjxh.typeform.com/to/GD7sREFs", "_blank")}
            className="bg-[#2A9D8F] hover:bg-[#2A9D8F]/90 text-white px-6 py-2.5 gap-2"
          >
            Prendre rendez-vous
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}