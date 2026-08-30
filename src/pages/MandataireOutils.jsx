import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ExternalLink, Calendar, Briefcase } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

export default function MandataireOutils() {
  const outils = [
    {
      nom: "Monday.com",
      description: "Gestion de projets et suivi des dossiers clients",
      url: "https://monday.com",
      icon: Calendar,
      color: "from-orange-500/20 to-red-500/10",
      iconBg: "bg-orange-500/20",
      iconColor: "text-orange-400"
    },
    {
      nom: "Equimmox",
      description: "Plateforme immobilière professionnelle",
      url: "https://equimmox.com",
      icon: Briefcase,
      color: "from-blue-500/20 to-cyan-500/10",
      iconBg: "bg-blue-500/20",
      iconColor: "text-blue-400"
    }
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-[#f2f3f5] p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-geist tracking-tighter text-[#f2f3f5] mb-2">
            Outils & Plateformes
          </h1>
          <div className="h-0.5 w-32 bg-[#96c0b8]"></div>
          <p className="text-[#9298a6] mt-4">
            Accédez rapidement à tous vos outils professionnels
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {outils.map((outil, index) => {
            const Icon = outil.icon;
            return (
              <div key={index} className="relative rounded-[1.25rem] border-[0.75px] border-[#22262d] p-2">
                <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                <Card 
                  className={`relative bg-gradient-to-br ${outil.color} hover:opacity-90 transition-all cursor-pointer border-none h-full`}
                  onClick={() => window.open(outil.url, '_blank')}
                >
                  <CardContent className="p-8">
                    <div className="flex items-start justify-between mb-6">
                      <div className={`w-16 h-16 ${outil.iconBg} rounded-md flex items-center justify-center`}>
                        <Icon className={`w-8 h-8 ${outil.iconColor}`} />
                      </div>
                      <ExternalLink className="w-5 h-5 text-[#9298a6]" />
                    </div>

                    <h3 className="text-2xl font-bold text-[#f2f3f5] mb-2">
                      {outil.nom}
                    </h3>
                    <p className="text-[#c9cdd6] text-sm">
                      {outil.description}
                    </p>

                    <div className="mt-6 pt-6 border-t border-[#22262d]">
                      <div className="flex items-center text-sm text-[#9298a6]">
                        <span>Cliquer pour accéder</span>
                        <ExternalLink className="w-4 h-4 ml-2" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}