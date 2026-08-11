import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2, Download, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUser } from "@/components/providers/UserProvider";
import SlideViewer from "@/components/banque/SlideViewer";
import SlideRenderer from "@/components/banque/SlideRenderer";
import FeedbackWidget from "@/components/FeedbackWidget";

export default function Banque() {
  const user = useUser();
  const [viewPres, setViewPres] = useState(null);

  const { data: presentations = [], isLoading } = useQuery({
    queryKey: ["my-presentations-bancaires", user?.email],
    queryFn: async () => {
      const all = await base44.entities.PresentationBancaire.filter({ client_email: user.email, statut: "publie" }, "-created_date");
      return all;
    },
    enabled: !!user?.email,
  });

  if (!user) return null;

  return (
    <div className="min-h-screen bg-black text-white p-4 md:p-8">
      <FeedbackWidget />
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-[#2A9D8F]/20 rounded-xl flex items-center justify-center">
              <Landmark className="w-5 h-5 text-[#2A9D8F]" />
            </div>
            <div>
              <h1 className="text-2xl md:text-3xl font-light text-white tracking-tight">Banque</h1>
              <p className="text-gray-500 text-sm">Vos présentations bancaires</p>
            </div>
          </div>
          <div className="h-px w-16 bg-[#2A9D8F] mt-3" />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#2A9D8F]" />
          </div>
        ) : presentations.length === 0 ? (
          <Card className="bg-[#0A0A0A] border-white/[0.06]">
            <CardContent className="py-16 text-center">
              <Landmark className="w-12 h-12 text-gray-700 mx-auto mb-4" />
              <h2 className="text-white text-lg mb-2">Aucune présentation disponible</h2>
              <p className="text-gray-500 text-sm">Votre conseiller vous préparera une présentation bancaire pour vos projets.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {presentations.map((pres) => {
              const coverSlide = pres.slides?.[0];
              return (
                <button
                  key={pres.id}
                  onClick={() => setViewPres(pres)}
                  className="text-left bg-[#0A0A0A] rounded-2xl border border-white/[0.06] overflow-hidden hover:border-[#2A9D8F]/30 transition-all group"
                >
                  {/* Slide preview thumbnail */}
                  <div className="relative w-full aspect-video overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 origin-top-left" style={{ transform: 'scale(0.5)', width: '200%', height: '200%' }}>
                      {coverSlide ? (
                        <SlideRenderer slide={coverSlide} />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-black to-gray-900 flex items-center justify-center">
                          <Landmark className="w-12 h-12 text-gray-700" />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  {/* Info bar */}
                  <div className="p-4">
                   <p className="text-white font-light text-lg truncate">{pres.project_title}</p>
                   <div className="flex items-center justify-between mt-1">
                     <p className="text-gray-500 text-xs">{pres.slides?.length || 0} slides — {new Date(pres.created_date).toLocaleDateString('fr-FR')}</p>
                     <p className="text-[#2A9D8F] text-xs group-hover:underline">Voir →</p>
                   </div>
                   {pres.pptx_url && (
                     <a
                       href={pres.pptx_url}
                       target="_blank"
                       rel="noopener noreferrer"
                       onClick={(e) => e.stopPropagation()}
                       className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 hover:bg-[#F59E0B]/20 transition-colors w-fit"
                     >
                       <ExternalLink className="w-3.5 h-3.5 text-[#F59E0B]" />
                       <span className="text-[#F59E0B] text-xs font-medium">Ouvrir la présentation (Google Slides)</span>
                     </a>
                   )}
                  </div>
                  </button>
              );
            })}
          </div>
        )}

        {/* Viewer dialog */}
        <Dialog open={!!viewPres} onOpenChange={() => setViewPres(null)}>
          <DialogContent className="max-w-4xl p-0 bg-black border-white/[0.08] overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-white font-light">{viewPres?.project_title}</DialogTitle>
            </DialogHeader>
            <div className="px-4 pb-4">
              {viewPres?.slides && (
                <SlideViewer slides={viewPres.slides} title={viewPres.project_title} />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}