import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Video, FileText, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const resourceTypeIcons = {
  video: Video,
  pdf: FileText,
  article: FileText,
  guide: BookOpen,
  webinar: Video
};

const resourceTypeLabels = {
  video: "Vidéo",
  pdf: "PDF",
  article: "Article",
  guide: "Guide",
  webinar: "Webinaire"
};

export default function MandataireRessources() {
  const { data: resources = [], isLoading } = useQuery({
    queryKey: ['mandataire-resources'],
    queryFn: () => base44.entities.Resource.filter({ visible: true }, "-ordre"),
    initialData: []
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050807] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#33d6c0]"></div>
      </div>
    );
  }

  const groupedResources = resources.reduce((acc, resource) => {
    const category = resource.categorie || 'autre';
    if (!acc[category]) acc[category] = [];
    acc[category].push(resource);
    return acc;
  }, {});

  const categoryLabels = {
    acculturation: "Acculturation",
    strategie: "Stratégie",
    analyse: "Analyse",
    financement: "Financement",
    juridique: "Juridique",
    fiscalite: "Fiscalité",
    autre: "Autres"
  };

  return (
    <div className="min-h-screen bg-[#050807] text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-geist tracking-tighter text-white mb-2">
            Ressources Mandataire
          </h1>
          <div className="h-0.5 w-32 bg-[#33d6c0]"></div>
        </div>

        {Object.entries(groupedResources).map(([category, categoryResources]) => (
          <div key={category} className="mb-8">
            <h2 className="text-2xl text-white mb-4">{categoryLabels[category] || category}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {categoryResources.map((resource) => {
                const Icon = resourceTypeIcons[resource.type] || BookOpen;
                return (
                  <div key={resource.id} className="relative rounded-[1.25rem] border-[0.75px] border-gray-700 p-2">
                    <GlowingEffect spread={40} glow={true} disabled={false} proximity={64} inactiveZone={0.01} borderWidth={3} />
                    <Card 
                      className="relative bg-gradient-to-br from-gray-900/95 via-[#33d6c0]/5 to-gray-900/95 hover:opacity-90 transition-all cursor-pointer border-none"
                      onClick={() => resource.url_fichier && window.open(resource.url_fichier, '_blank')}
                    >
                      <CardContent className="p-6">
                        <div className="flex items-start gap-4 mb-4">
                          <div className="w-12 h-12 bg-[#33d6c0]/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Icon className="w-6 h-6 text-[#33d6c0]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-white font-semibold mb-1">{resource.titre}</h3>
                            <Badge className="bg-[#33d6c0]/20 text-[#33d6c0] text-xs">
                              {resourceTypeLabels[resource.type]}
                            </Badge>
                          </div>
                        </div>
                        {resource.description && (
                          <p className="text-gray-400 text-sm mb-3">{resource.description}</p>
                        )}
                        {resource.duree_minutes && (
                          <p className="text-gray-500 text-xs">{resource.duree_minutes} minutes</p>
                        )}
                        <div className="flex items-center justify-end mt-4">
                          <ExternalLink className="w-4 h-4 text-[#33d6c0]" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {resources.length === 0 && (
          <div className="text-center py-16">
            <BookOpen className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg">Aucune ressource disponible</p>
          </div>
        )}
      </div>
    </div>
  );
}