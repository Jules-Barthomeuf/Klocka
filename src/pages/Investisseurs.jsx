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
    <div className="min-h-screen bg-[#000000]">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">
        {/* Header */}
        <div className="mb-8">
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#c3ddd6] mb-2">Investisseurs</p>
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#f2f3f5]">Profils investisseurs</h1>
          <p className="text-[#f2f3f5]/30 text-sm mt-2">Liste des investisseurs et leurs critères de recherche.</p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {INVESTISSEURS.map((inv) => (
            <Card key={inv.nom} className="bg-[#000000] border border-[#1f2228] rounded-md">
              <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full bg-[#96c0b8]/15 flex items-center justify-center">
                    <span className="text-sm text-[#96c0b8] font-medium">{inv.nom.charAt(0)}</span>
                  </div>
                  <p className="text-[#f2f3f5] font-medium">{inv.nom}</p>
                </div>
                <div className="space-y-2 text-sm text-[#f2f3f5]/40">
                  <div className="flex justify-between">
                    <span>Budget max</span>
                    <span className="text-[#f2f3f5]/70 font-medium">{inv.budget}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Zone</span>
                    <span className="text-[#f2f3f5]/70">{inv.zone}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>AEM</span>
                    <span className="text-[#96c0b8] font-medium">{inv.aem}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* CTA */}
        <div className="text-center border border-[#1f2228] rounded-md bg-[#000000] p-6 mt-8">
          <p className="text-[#f2f3f5]/50 text-sm mb-4">Vous avez un bien correspondant à ces critères ?</p>
          <Button
            onClick={() => window.open("https://dpe3smipjxh.typeform.com/to/GD7sREFs", "_blank")}
            className="bg-[#96c0b8] hover:bg-[#96c0b8]/90 text-[#f2f3f5] px-6 py-2.5 gap-2"
          >
            Prendre rendez-vous
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}