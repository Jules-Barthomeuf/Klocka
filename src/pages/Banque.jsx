import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Loader2, Download, ExternalLink } from "lucide-react";
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
    <div className="min-h-screen bg-[#0a0c0c] text-[#edeae5] p-4 md:p-8">
      <FeedbackWidget />
      <div className="max-w-4xl mx-auto">
        <div className="mb-8 max-md:mb-6">
          <h1 className="text-[34px] max-md:text-[26px] font-light tracking-[-0.02em] leading-[1.05] text-[#edeae5] m-0">Banque</h1>
          <p className="text-[13.5px] leading-[1.7] text-[#8b9391] mt-2 mb-0">Les présentations bancaires préparées pour vos projets.</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[#35a79b]" />
          </div>
        ) : presentations.length === 0 ? (
          <div className="border-t border-[#edeae5]/[0.35] pt-10 pb-16 text-center">
            <Landmark className="w-8 h-8 text-[#edeae5]/15 mx-auto mb-5" />
            <h2 className="text-[22px] font-light text-[#edeae5] mb-2">Aucune présentation disponible</h2>
            <p className="text-[#8b9391] text-sm mb-0">Votre conseiller vous préparera une présentation bancaire pour vos projets.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {presentations.map((pres) => {
              const coverSlide = pres.slides?.[0];
              return (
                <button
                  key={pres.id}
                  onClick={() => setViewPres(pres)}
                  className="text-left bg-[#0e100f] border border-[#edeae5]/[0.12] overflow-hidden hover:border-[#35a79b]/60 transition-colors group"
                >
                  {/* Slide preview thumbnail */}
                  <div className="relative w-full aspect-video overflow-hidden pointer-events-none">
                    <div className="absolute inset-0 origin-top-left" style={{ transform: 'scale(0.5)', width: '200%', height: '200%' }}>
                      {coverSlide ? (
                        <SlideRenderer slide={coverSlide} />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-black to-[#0a0c0c] flex items-center justify-center">
                          <Landmark className="w-12 h-12 text-[#4a4d4b]" />
                        </div>
                      )}
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                  </div>
                  {/* Info bar */}
                  <div className="p-4">
                   <p className="text-[#edeae5] font-light text-lg truncate">{pres.project_title}</p>
                   <div className="flex items-center justify-between mt-1">
                     <p className="text-[#8b9391] text-xs">{pres.slides?.length || 0} slides — {new Date(pres.created_date).toLocaleDateString('fr-FR')}</p>
                     <p className="text-[#35a79b] text-xs group-hover:underline">Voir →</p>
                   </div>
                   {pres.pptx_url && (
                     <a
                       href={pres.pptx_url}
                       target="_blank"
                       rel="noopener noreferrer"
                       onClick={(e) => e.stopPropagation()}
                       className="mt-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-[#e0c9a0]/10 border border-[#e0c9a0]/20 hover:bg-[#e0c9a0]/20 transition-colors w-fit"
                     >
                       <ExternalLink className="w-3.5 h-3.5 text-[#e0c9a0]" />
                       <span className="text-[#e0c9a0] text-xs font-medium">Ouvrir la présentation (Google Slides)</span>
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
          <DialogContent className="max-w-4xl p-0 bg-[#0a0c0c] border-[#282b2a] overflow-hidden">
            <DialogHeader className="px-6 pt-6 pb-0">
              <DialogTitle className="text-[#edeae5] font-light">{viewPres?.project_title}</DialogTitle>
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